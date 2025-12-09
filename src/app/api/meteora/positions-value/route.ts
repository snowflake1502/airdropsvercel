import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchMeteoraPositionsValues } from '@/lib/meteora-positions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    console.log(`🌊 Fetching Meteora positions for wallet: ${walletAddress}`)

    // Step 1: Get all position transactions from database
    const { data: transactions, error } = await supabase
      .from('position_transactions')
      .select('position_nft_address, tx_type, pool_address')
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress)
      .not('position_nft_address', 'is', null)

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        success: true,
        totalValueUSD: 0,
        totalUnclaimedFeesUSD: 0,
        positions: [],
        message: 'No Meteora positions found',
      })
    }

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

    console.log(`🌊 Found ${activePositionAddresses.length} active positions`)

    if (activePositionAddresses.length === 0) {
      return NextResponse.json({
        success: true,
        totalValueUSD: 0,
        totalUnclaimedFeesUSD: 0,
        positions: [],
        message: 'No active Meteora positions',
      })
    }

    // Step 3: Fetch real-time values from Meteora API
    const result = await fetchMeteoraPositionsValues(activePositionAddresses)

    console.log(`🌊 Fetched ${result.positions.length} positions with total value: $${result.totalValueUSD.toFixed(2)}`)

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

