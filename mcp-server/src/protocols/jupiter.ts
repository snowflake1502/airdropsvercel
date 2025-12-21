/**
 * Jupiter Protocol Implementation (MCP Server)
 *
 * For the Airdrop Tracker we mainly need:
 * - recent activity evidence (swaps)
 * - JUP holdings (optional)
 *
 * Jupiter "positions" (perps, limit orders, DCA) are not exposed via free public APIs reliably.
 * So `getPositions()` returns empty and `getProtocolData()` provides practical signals.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { BaseProtocol } from './base-protocol'
import { Position, TransactionResult, ClaimFeesParams, RebalanceParams, OpenPositionParams } from '../types'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'

// Jupiter programs used as heuristics for tx detection
const JUPITER_PROGRAMS = new Set<string>([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // v4
])

export type JupiterProtocolData = {
  protocol: 'jupiter'
  walletAddress: string
  jupBalance: number
  recentSwaps: {
    last7d: number
    last30d: number
    lastTx?: string
  }
  lastUpdated: string
}

export class JupiterProtocol extends BaseProtocol {
  constructor(connection: Connection) {
    super(connection, 'jupiter')
  }

  async getPositions(_walletAddress: string): Promise<Position[]> {
    return []
  }

  async buildClaimFeesTransaction(_params: ClaimFeesParams): Promise<TransactionResult> {
    return { success: false, error: 'Jupiter claim fees not supported via MCP yet' }
  }

  async buildRebalanceTransaction(_params: RebalanceParams): Promise<TransactionResult> {
    return { success: false, error: 'Jupiter rebalance not supported via MCP yet' }
  }

  async buildOpenPositionTransaction(_params: OpenPositionParams): Promise<TransactionResult> {
    return { success: false, error: 'Jupiter open position not supported via MCP yet' }
  }

  async getProtocolData(walletAddress: string): Promise<JupiterProtocolData> {
    const owner = new PublicKey(walletAddress)

    // JUP token balance
    let jupBalance = 0
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey(TOKEN_PROGRAM),
    })
    for (const acc of tokenAccounts.value) {
      const info = (acc.account.data as any).parsed?.info
      const mint = info?.mint as string | undefined
      const uiAmount = Number(info?.tokenAmount?.uiAmount || 0)
      if (mint === JUP_MINT && uiAmount > 0) {
        jupBalance += uiAmount
      }
    }

    // Recent swap activity heuristic: scan recent signatures for Jupiter program usage
    const sigs = await this.connection.getSignaturesForAddress(owner, { limit: 100 })
    const now = Date.now()
    const sec7d = 7 * 24 * 60 * 60
    const sec30d = 30 * 24 * 60 * 60

    let last7d = 0
    let last30d = 0
    let lastTx: string | undefined

    // We avoid fetching full transactions for all signatures (costly).
    // We approximate by checking only a small number of recent txs for program IDs.
    const candidates = sigs.slice(0, 30)
    for (const s of candidates) {
      if (!s.signature || !s.blockTime) continue
      const ageSec = (now / 1000) - s.blockTime
      if (ageSec > sec30d) continue

      const tx = await this.connection.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
      })
      if (!tx) continue

      const programIds =
        (tx.transaction.message.instructions as any[])
          .map((ix) => ix?.programId?.toBase58?.() || ix?.programId?.toString?.())
          .filter(Boolean) as string[]

      const isJup = programIds.some((p) => JUPITER_PROGRAMS.has(p))
      if (!isJup) continue

      if (!lastTx) lastTx = s.signature
      if (ageSec <= sec7d) last7d += 1
      if (ageSec <= sec30d) last30d += 1
    }

    return {
      protocol: 'jupiter',
      walletAddress,
      jupBalance,
      recentSwaps: { last7d, last30d, lastTx },
      lastUpdated: new Date().toISOString(),
    }
  }
}

