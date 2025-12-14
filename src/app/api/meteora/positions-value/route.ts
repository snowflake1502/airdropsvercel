import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchMeteoraPositionsByWallet } from '@/lib/meteora-positions'

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
      k.includes('JUPITER') || k.includes('SUPABASE') || k.includes('HELIUS') || k.includes('API')
    );
    console.log('[DEBUG-ENV] Environment check:', JSON.stringify({
      hasJupiterKey: !!process.env.JUPITER_API_KEY,
      jupiterKeyLength: process.env.JUPITER_API_KEY?.length || 0,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      relevantEnvKeys: allEnvKeys,
    }));
    // #endregion

    console.log(`🌊 Fetching Meteora positions for wallet: ${walletAddress} (auth: ${authHeader ? 'yes' : 'no'})`)

    // Query Meteora API directly by wallet address - more reliable than stored position addresses
    const result = await fetchMeteoraPositionsByWallet(walletAddress)

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



