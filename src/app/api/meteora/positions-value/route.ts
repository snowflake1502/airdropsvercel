import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchMeteoraPositionsByWallet, fetchMeteoraPositionsValues } from '@/lib/meteora-positions'

/**
 * GET /api/meteora/positions-value
 * Fetches real-time Meteora LP position values for a wallet
 * 
 * Query params:
 * - walletAddress: The wallet address to fetch positions for
 * - userId: The user ID in the database
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')
    const userId = searchParams.get('userId')

    if (!walletAddress || !userId) {
      return NextResponse.json(
        { error: 'walletAddress and userId are required' },
        { status: 400 }
      )
    }

    // Get authorization header from request (for RLS)
    const authHeader = request.headers.get('authorization')
    
    // Create Supabase client - use auth header if available for RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = authHeader 
      ? createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
        })
      : createClient(supabaseUrl, supabaseKey)

    // #region agent log
    // List ALL env var names (not values) to debug what's available
    const allEnvKeys = Object.keys(process.env).filter(k => 
      k.includes('JUPITER') || k.includes('SUPABASE') || k.includes('HELIUS') || k.includes('API') || k.includes('SHYFT')
    );
    console.log('[DEBUG-ENV] Environment check:', JSON.stringify({
      hasJupiterKey: !!process.env.JUPITER_API_KEY,
      jupiterKeyLength: process.env.JUPITER_API_KEY?.length || 0,
      hasShyftKey: !!process.env.SHYFT_API_KEY,
      shyftKeyLength: process.env.SHYFT_API_KEY?.length || 0,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasHeliusRpc: !!process.env.HELIUS_RPC_URL,
      nodeEnv: process.env.NODE_ENV,
      relevantEnvKeys: allEnvKeys,
    }));
    // #endregion

    console.log(`🌊 Fetching Meteora positions for wallet: ${walletAddress} (auth: ${authHeader ? 'yes' : 'no'})`)

    // Try database-first approach (like before), then fallback to wallet-based query
    // Step 1: Get position transactions from database
    const { data: transactions, error } = await supabase
      .from('position_transactions')
      .select('position_nft_address, tx_type, pool_address')
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress)
      .not('position_nft_address', 'is', null)

    // #region agent log
    console.log('[DEBUG-DB] Database query result:', JSON.stringify({error: error?.message, transactionCount: transactions?.length, userId, walletAddress}));
    // #endregion

    let result

    if (!error && transactions && transactions.length > 0) {
      // Step 2: Determine active positions (opens - closes)
      const nftOpenCounts = new Map<string, number>()
      const nftCloseCounts = new Map<string, number>()

      transactions.forEach((tx) => {
        if (tx.position_nft_address) {
          if (tx.tx_type === 'position_open') {
            nftOpenCounts.set(
              tx.position_nft_address,
              (nftOpenCounts.get(tx.position_nft_address) || 0) + 1
            )
          } else if (tx.tx_type === 'position_close') {
            nftCloseCounts.set(
              tx.position_nft_address,
              (nftCloseCounts.get(tx.position_nft_address) || 0) + 1
            )
          }
        }
      })

      // Get active position addresses
      const activePositionAddresses: string[] = []
      nftOpenCounts.forEach((openCount, nftAddr) => {
        const closeCount = nftCloseCounts.get(nftAddr) || 0
        if (openCount > closeCount) {
          activePositionAddresses.push(nftAddr)
        }
      })

      // #region agent log
      console.log('[DEBUG-DB] Active positions from DB:', JSON.stringify({count: activePositionAddresses.length, addresses: activePositionAddresses}));
      // #endregion

      if (activePositionAddresses.length > 0) {
        // Try fetching by stored position addresses first (old approach)
        console.log(`🌊 Trying database approach: ${activePositionAddresses.length} stored positions`)
        result = await fetchMeteoraPositionsValues(activePositionAddresses)
        
        // #region agent log
        console.log('[DEBUG-DB] Database approach result:', JSON.stringify({positionsFound: result.positions.length, totalValue: result.totalValueUSD, errors: result.errors}));
        // #endregion
        
        // If database approach returned 0 positions, fallback to wallet-based query
        // Also check if stored addresses might be pool addresses - try querying those pools directly
        if (result.positions.length === 0 || result.totalValueUSD === 0) {
          console.log(`🌊 Database approach returned 0 positions, trying stored addresses as pool addresses`)
          
          // Try treating stored addresses as pool addresses and query user positions in those pools
          const poolAddresses = transactions
            .map(tx => tx.pool_address || tx.position_nft_address)
            .filter((addr, index, arr) => addr && arr.indexOf(addr) === index) // unique
          
          if (poolAddresses.length > 0) {
            console.log(`🌊 Trying ${poolAddresses.length} stored pool addresses`)
            // Use wallet-based query but prioritize these pools
            result = await fetchMeteoraPositionsByWallet(walletAddress)
          } else {
            console.log(`🌊 Falling back to wallet-based query`)
            result = await fetchMeteoraPositionsByWallet(walletAddress)
          }
        }
      } else {
        // No active positions in DB, use wallet-based query
        console.log(`🌊 No active positions in DB, using wallet-based query`)
        result = await fetchMeteoraPositionsByWallet(walletAddress)
      }
    } else {
      // No transactions in DB, use wallet-based query
      console.log(`🌊 No transactions in DB, using wallet-based query`)
      result = await fetchMeteoraPositionsByWallet(walletAddress)
    }

    console.log(`🌊 Fetched ${result.positions.length} positions with total value: $${result.totalValueUSD.toFixed(2)}`)

    // #region agent log
    console.log('[DEBUG-FINAL] API result:', JSON.stringify({totalValueUSD:result.totalValueUSD,totalUnclaimedFeesUSD:result.totalUnclaimedFeesUSD,positionsCount:result.positions.length,positions:result.positions.map(p=>({addr:p.positionAddress,pair:p.pairName,valueUSD:p.totalValueUSD,fees:p.unclaimedFeesUSD}))}));
    // #endregion

    return NextResponse.json({
      success: true,
      totalValueUSD: result.totalValueUSD,
      totalUnclaimedFeesUSD: result.totalUnclaimedFeesUSD,
      positions: result.positions,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (error: any) {
    console.error('Error fetching Meteora positions value:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch positions',
        details: error.message,
      },
      { status: 500 }
    )
  }
}



