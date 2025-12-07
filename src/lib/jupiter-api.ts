/**
 * Jupiter API Integration
 * Detects swaps and other activities across Solana DEXs
 */

// Jupiter API endpoints
const JUPITER_API_BASE = 'https://api.jup.ag'
const HELIUS_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

interface SwapTransaction {
  signature: string
  timestamp: number
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  fee: number
}

interface JupiterActivityStatus {
  swapsToday: number
  swapsThisWeek: number
  totalSwaps: number
  lastSwapTimestamp: number | null
  hasLimitOrdersToday: boolean
  hasPerpsActivityToday: boolean
  recentSwaps: SwapTransaction[]
}

// Check if timestamp is today
const isToday = (timestamp: number): boolean => {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

// Check if timestamp is this week
const isThisWeek = (timestamp: number): boolean => {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return date >= startOfWeek
}

/**
 * Fetch recent transactions for a wallet and detect Jupiter swaps
 * Uses Helius enhanced transaction API for better parsing
 */
export async function getJupiterActivity(walletAddress: string): Promise<JupiterActivityStatus> {
  const defaultStatus: JupiterActivityStatus = {
    swapsToday: 0,
    swapsThisWeek: 0,
    totalSwaps: 0,
    lastSwapTimestamp: null,
    hasLimitOrdersToday: false,
    hasPerpsActivityToday: false,
    recentSwaps: [],
  }

  try {
    // Use Helius parsed transaction history if available
    const response = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
          { limit: 100 } // Get last 100 transactions
        ]
      })
    })

    if (!response.ok) {
      console.error('Failed to fetch transactions')
      return defaultStatus
    }

    const data = await response.json()
    const signatures = data.result || []

    // Fetch transaction details to identify Jupiter swaps
    const swapSignatures: SwapTransaction[] = []
    let swapsToday = 0
    let swapsThisWeek = 0

    // Jupiter program IDs
    const JUPITER_PROGRAMS = [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter v4
      'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph', // Jupiter v3
      'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo', // Jupiter v2
    ]

    // Jupiter Limit Order program
    const JUPITER_LIMIT_ORDER = 'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
    
    // Jupiter Perps program
    const JUPITER_PERPS = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2verN'

    // Check each transaction
    for (const sig of signatures.slice(0, 50)) { // Check first 50 for performance
      try {
        const txResponse = await fetch(HELIUS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              sig.signature,
              { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
            ]
          })
        })

        const txData = await txResponse.json()
        const tx = txData.result

        if (!tx || !tx.transaction) continue

        const accountKeys = tx.transaction.message.accountKeys || []
        const programIds = accountKeys.map((k: any) => k.pubkey || k)

        // Check for Jupiter swap
        const isJupiterSwap = JUPITER_PROGRAMS.some(p => programIds.includes(p))
        const isLimitOrder = programIds.includes(JUPITER_LIMIT_ORDER)
        const isPerps = programIds.includes(JUPITER_PERPS)

        const blockTime = tx.blockTime || sig.blockTime

        if (isJupiterSwap) {
          swapSignatures.push({
            signature: sig.signature,
            timestamp: blockTime,
            inputMint: '',
            outputMint: '',
            inputAmount: 0,
            outputAmount: 0,
            fee: 0,
          })

          if (isToday(blockTime)) {
            swapsToday++
          }
          if (isThisWeek(blockTime)) {
            swapsThisWeek++
          }
        }

        if (isLimitOrder && isToday(blockTime)) {
          defaultStatus.hasLimitOrdersToday = true
        }

        if (isPerps && isToday(blockTime)) {
          defaultStatus.hasPerpsActivityToday = true
        }

        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50))

      } catch (err) {
        // Skip failed transaction fetch
        continue
      }
    }

    return {
      ...defaultStatus,
      swapsToday,
      swapsThisWeek,
      totalSwaps: swapSignatures.length,
      lastSwapTimestamp: swapSignatures[0]?.timestamp || null,
      recentSwaps: swapSignatures.slice(0, 10),
    }

  } catch (error) {
    console.error('Error fetching Jupiter activity:', error)
    return defaultStatus
  }
}

/**
 * Quick check for Jupiter swaps using simpler approach
 * Faster but less detailed
 */
export async function quickCheckJupiterSwaps(walletAddress: string): Promise<{
  hasSwapToday: boolean
  hasLimitOrderToday: boolean
  hasPerpsToday: boolean
}> {
  try {
    // Get recent signatures
    const response = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 20 }]
      })
    })

    const data = await response.json()
    const signatures = data.result || []

    // Check today's transactions
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTimestamp = Math.floor(todayStart.getTime() / 1000)

    const todaySignatures = signatures.filter((s: any) => 
      s.blockTime && s.blockTime >= todayTimestamp
    )

    if (todaySignatures.length === 0) {
      return { hasSwapToday: false, hasLimitOrderToday: false, hasPerpsToday: false }
    }

    // Check a few transactions for Jupiter activity
    let hasSwapToday = false
    let hasLimitOrderToday = false
    let hasPerpsToday = false

    for (const sig of todaySignatures.slice(0, 5)) {
      try {
        const txResponse = await fetch(HELIUS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
          })
        })

        const txData = await txResponse.json()
        const tx = txData.result
        if (!tx?.transaction?.message?.accountKeys) continue

        const programIds = tx.transaction.message.accountKeys.map((k: any) => k.pubkey || k)

        // Jupiter swap programs
        if (programIds.some((p: string) => p.startsWith('JUP'))) {
          hasSwapToday = true
        }
        // Limit orders
        if (programIds.includes('jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu')) {
          hasLimitOrderToday = true
        }
        // Perps
        if (programIds.includes('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2verN')) {
          hasPerpsToday = true
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      } catch {
        continue
      }
    }

    return { hasSwapToday, hasLimitOrderToday, hasPerpsToday }

  } catch (error) {
    console.error('Error checking Jupiter activity:', error)
    return { hasSwapToday: false, hasLimitOrderToday: false, hasPerpsToday: false }
  }
}

/**
 * Check if wallet holds any Sanctum LSTs
 */
export async function checkSanctumLST(walletAddress: string): Promise<boolean> {
  // Common Sanctum LST mint addresses
  const SANCTUM_LSTS = [
    'INFwEDuiLRSGdRfiHAKvxqwg1J3CfLFsLWK3rTAJkNB', // INF
    'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
    '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT', // stSOL (Lido)
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL (Marinade)
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
    'edge86g9cVz87xcpKpy3J77vbp4wYd9idEV562CCntt', // edgeSOL
    'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A', // hSOL
    'Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ',  // DSOL
  ]

  try {
    const response = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    })

    const data = await response.json()
    const accounts = data.result?.value || []

    // Check if any account holds a Sanctum LST
    for (const account of accounts) {
      const mint = account.account?.data?.parsed?.info?.mint
      const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0
      
      if (mint && SANCTUM_LSTS.includes(mint) && amount > 0) {
        return true
      }
    }

    return false
  } catch (error) {
    console.error('Error checking Sanctum LST:', error)
    return false
  }
}

