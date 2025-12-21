import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMCPClient } from '@/lib/mcp-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'

const JUPITER_PROGRAMS = new Set<string>([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
])

const SANCTUM_LSTS: Record<string, { symbol: string; solRate?: number }> = {
  '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': { symbol: 'INF', solRate: 1.38 },
  INFp2k2GLVEA8Wvs4mEyDA1LBKHA3HfHx3X8pKNF4Qf: { symbol: 'INF', solRate: 1.38 },
}

function getRpcUrl(): string {
  return (
    process.env.HELIUS_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com'
  )
}

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

async function fallbackProtocolData(protocol: string, walletAddress: string) {
  const connection = new Connection(getRpcUrl(), 'confirmed')
  const owner = new PublicKey(walletAddress)

  if (protocol === 'sanctum') {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey(TOKEN_PROGRAM),
    })
    const holdings: any[] = []
    for (const acc of tokenAccounts.value) {
      const info = (acc.account.data as any).parsed?.info
      const mint = info?.mint as string | undefined
      const uiAmount = Number(info?.tokenAmount?.uiAmount || 0)
      if (!mint || uiAmount <= 0) continue
      const lst = SANCTUM_LSTS[mint]
      if (!lst) continue
      holdings.push({
        mint,
        symbol: lst.symbol,
        amount: uiAmount,
        solEquivalent: lst.solRate ? uiAmount * lst.solRate : undefined,
      })
    }
    return { protocol: 'sanctum', walletAddress, holdings, lastUpdated: new Date().toISOString(), supported: true }
  }

  if (protocol === 'jupiter') {
    // JUP balance
    let jupBalance = 0
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey(TOKEN_PROGRAM),
    })
    for (const acc of tokenAccounts.value) {
      const info = (acc.account.data as any).parsed?.info
      const mint = info?.mint as string | undefined
      const uiAmount = Number(info?.tokenAmount?.uiAmount || 0)
      if (mint === JUP_MINT && uiAmount > 0) jupBalance += uiAmount
    }

    // Recent swap heuristic
    const sigs = await connection.getSignaturesForAddress(owner, { limit: 100 })
    const now = Date.now()
    const sec7d = 7 * 24 * 60 * 60
    const sec30d = 30 * 24 * 60 * 60

    let last7d = 0
    let last30d = 0
    let lastTx: string | undefined
    let lastTxBlockTime: number | null = null

    const candidates = sigs.slice(0, 30)
    for (const s of candidates) {
      if (!s.signature || !s.blockTime) continue
      const ageSec = (now / 1000) - s.blockTime
      if (ageSec > sec30d) continue

      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
      if (!tx) continue

      // Jupiter is frequently invoked via inner instructions. To avoid false negatives,
      // collect program IDs from:
      // - top-level instructions
      // - inner instructions
      // - account keys (sometimes the program shows up only there in parsed formats)
      const topLevelProgramIds =
        (tx.transaction.message.instructions as any[])
          .map((ix) => ix?.programId?.toBase58?.() || ix?.programId?.toString?.())
          .filter(Boolean) as string[]

      const innerProgramIds =
        (tx.meta?.innerInstructions || [])
          .flatMap((inner: any) => (inner?.instructions || []).map((ix: any) => ix?.programId?.toBase58?.() || ix?.programId?.toString?.()))
          .filter(Boolean) as string[]

      const accountKeys =
        (tx.transaction.message.accountKeys as any[] | undefined)?.map((k: any) => k?.pubkey?.toBase58?.() || k?.pubkey?.toString?.() || (typeof k === 'string' ? k : undefined)).filter(Boolean) as string[]

      const allProgramIds = Array.from(new Set([...topLevelProgramIds, ...innerProgramIds, ...accountKeys]))

      const isJup =
        allProgramIds.some((p) => JUPITER_PROGRAMS.has(p)) ||
        allProgramIds.some((p) => typeof p === 'string' && p.startsWith('JUP'))
      if (!isJup) continue

      if (!lastTx) {
        lastTx = s.signature
        lastTxBlockTime = s.blockTime
      }
      if (ageSec <= sec7d) last7d += 1
      if (ageSec <= sec30d) last30d += 1
    }

    return {
      protocol: 'jupiter',
      walletAddress,
      jupBalance,
      recentSwaps: { last7d, last30d, lastTx, lastTxBlockTime },
      lastUpdated: new Date().toISOString(),
      supported: true,
    }
  }

  // Meteora: keep as unsupported for now (manual entry path is preferred)
  return { protocol, walletAddress, supported: false, error: 'No fallback implemented for this protocol' }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const protocol = (searchParams.get('protocol') || '').toLowerCase()
    const walletAddress = searchParams.get('walletAddress') || ''

    if (!['meteora', 'jupiter', 'sanctum'].includes(protocol)) {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
    }
    if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid walletAddress' }, { status: 400 })
    }

    // Try MCP first (works in local/node environments where spawning is allowed)
    try {
      const client = await getMCPClient()
      const data = await client.getProtocolData({ protocol: protocol as any, walletAddress })
      return NextResponse.json({ source: 'mcp', data })
    } catch (err: any) {
      // Fallback to direct RPC-based method
      const data = await fallbackProtocolData(protocol, walletAddress)
      return NextResponse.json({ source: 'fallback', data, mcpError: err?.message })
    }
  } catch (error: any) {
    console.error('Error in /api/mcp/protocol-data:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

