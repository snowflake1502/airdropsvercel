/**
 * Jupiter API Integration
 * Detects swaps and other activities across Solana DEXs
 */

// Jupiter API endpoints
const JUPITER_API_BASE = 'https://api.jup.ag'

// Use RPC proxy in browser, or direct RPC on server
const getRpcUrl = () => {
  // In browser, use the proxy endpoint
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc`
  }
  // On server, use direct RPC
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
}

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
    const rpcUrl = getRpcUrl()
    console.log('🔗 Using RPC:', rpcUrl)
    
    const response = await fetch(rpcUrl, {
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
        const txResponse = await fetch(getRpcUrl(), {
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
  totalSwapsDetected: number
}> {
  console.log('🪐 Checking Jupiter activity for:', walletAddress)
  
  try {
    // Get recent signatures - check more transactions
    const response = await fetch(getRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 50 }]
      })
    })

    const data = await response.json()
    const signatures = data.result || []
    console.log('🪐 Found', signatures.length, 'recent signatures')

    // Check today's transactions
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTimestamp = Math.floor(todayStart.getTime() / 1000)

    const todaySignatures = signatures.filter((s: any) => 
      s.blockTime && s.blockTime >= todayTimestamp
    )
    console.log('🪐 Today signatures:', todaySignatures.length)

    // Check transactions for Jupiter activity
    let hasSwapToday = false
    let hasLimitOrderToday = false
    let hasPerpsToday = false
    let totalSwapsDetected = 0

    // Jupiter program addresses
    const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
    const JUPITER_V4 = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'
    const JUPITER_LIMIT = 'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
    const JUPITER_PERPS = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2verN'

    // Check today's transactions first (up to 10)
    for (const sig of todaySignatures.slice(0, 10)) {
      try {
        const txResponse = await fetch(getRpcUrl(), {
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
        if (!tx?.transaction?.message) {
          console.log('🪐 No transaction data for:', sig.signature.slice(0, 20))
          continue
        }

        // Get all account keys (both static and loaded)
        const accountKeys = tx.transaction.message.accountKeys || []
        const staticKeys = accountKeys.map((k: any) => typeof k === 'string' ? k : k.pubkey)
        
        // Also check instructions for program IDs
        const instructions = tx.transaction.message.instructions || []
        const programIdsFromInstructions = instructions.map((ix: any) => ix.programId).filter(Boolean)
        
        // Check inner instructions too (Jupiter often uses inner instructions)
        const innerInstructions = tx.meta?.innerInstructions || []
        const innerProgramIds = innerInstructions.flatMap((inner: any) => 
          (inner.instructions || []).map((ix: any) => ix.programId)
        ).filter(Boolean)
        
        const allProgramIds = [...new Set([...staticKeys, ...programIdsFromInstructions, ...innerProgramIds])]
        
        // Debug: Log programs found in first few transactions
        if (todaySignatures.indexOf(sig) < 3) {
          const jupiterRelated = allProgramIds.filter((p: string) => 
            p.startsWith('JUP') || p.includes('jup') || p === JUPITER_V6 || p === JUPITER_V4
          )
          console.log('🪐 TX', sig.signature.slice(0, 12), '- Programs:', allProgramIds.length, 
            jupiterRelated.length > 0 ? '- Jupiter related:' + jupiterRelated : '')
        }
        
        // Check for Jupiter v6 or v4 swap (also check for JUP prefix)
        const isJupiterSwap = allProgramIds.includes(JUPITER_V6) || 
                              allProgramIds.includes(JUPITER_V4) ||
                              allProgramIds.some((p: string) => p.startsWith('JUP'))
        if (isJupiterSwap) {
          hasSwapToday = true
          totalSwapsDetected++
          console.log('🪐 ✅ Found Jupiter swap:', sig.signature.slice(0, 20) + '...')
        }
        
        // Check for limit orders
        if (allProgramIds.includes(JUPITER_LIMIT)) {
          hasLimitOrderToday = true
          console.log('🪐 ✅ Found Jupiter limit order')
        }
        
        // Check for perps
        if (allProgramIds.includes(JUPITER_PERPS)) {
          hasPerpsToday = true
          console.log('🪐 ✅ Found Jupiter perps')
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (err) {
        console.warn('🪐 Error checking transaction:', err)
        continue
      }
    }

    console.log('🪐 Jupiter detection results:', { hasSwapToday, hasLimitOrderToday, hasPerpsToday, totalSwapsDetected })
    return { hasSwapToday, hasLimitOrderToday, hasPerpsToday, totalSwapsDetected }

  } catch (error) {
    console.error('🪐 Error checking Jupiter activity:', error)
    return { hasSwapToday: false, hasLimitOrderToday: false, hasPerpsToday: false, totalSwapsDetected: 0 }
  }
}

/**
 * Check if wallet holds any Sanctum LSTs
 */
export async function checkSanctumLST(walletAddress: string): Promise<boolean> {
  console.log('⭐ Checking Sanctum LST holdings for:', walletAddress)
  
  // Common Sanctum LST mint addresses with names
  const SANCTUM_LSTS: { [mint: string]: string } = {
    'INFp2k2GLVEA8Wvs4mEyDA1LBKHA3HfHx3X8pKNF4Qf': 'INF', // INF (infinity)
    'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'bSOL', // bSOL (Blaze)
    '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT': 'stSOL', // stSOL (Lido)
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL', // mSOL (Marinade)
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'JitoSOL', // JitoSOL
    'edge86g9cVz87xcpKpy3J77vbp4wYd9idEV562CCntt': 'edgeSOL', // edgeSOL
    'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A': 'hSOL', // hSOL
    'Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ': 'DSOL', // DSOL
    'LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X': 'laineSOL', // laineSOL
    'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v': 'jupSOL', // jupSOL
    'picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX': 'picoSOL', // picoSOL
    'Comp4ssDzXcLeu2MnLuGNNFC4cmLPMng8qWHPvzAMU1h': 'compassSOL', // compassSOL
    'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs': 'bonkSOL', // bonkSOL
  }

  try {
    const response = await fetch(getRpcUrl(), {
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
    console.log('⭐ Found', accounts.length, 'token accounts')

    // Debug: Log all token holdings
    console.log('⭐ Token holdings:')
    for (const account of accounts) {
      const mint = account.account?.data?.parsed?.info?.mint
      const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0
      const symbol = account.account?.data?.parsed?.info?.tokenAmount?.symbol
      
      if (amount > 0) {
        const lstName = SANCTUM_LSTS[mint]
        console.log(`⭐   ${lstName || 'Unknown'} (${mint?.slice(0, 8)}...): ${amount}`)
      }
      
      if (mint && mint in SANCTUM_LSTS && amount > 0) {
        console.log(`⭐ ✅ Found Sanctum LST: ${SANCTUM_LSTS[mint]}: ${amount}`)
        return true
      }
    }

    console.log('⭐ No Sanctum LSTs found in', accounts.length, 'accounts')
    console.log('⭐ Looking for these LSTs:', Object.values(SANCTUM_LSTS).join(', '))
    return false
  } catch (error) {
    console.error('⭐ Error checking Sanctum LST:', error)
    return false
  }
}

