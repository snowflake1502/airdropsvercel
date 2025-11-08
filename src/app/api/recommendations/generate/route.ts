import { NextRequest, NextResponse } from 'next/server'
import { recommendationEngine } from '@/lib/recommendationEngine'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/recommendations/generate
 * Generate personalized farming recommendations for a wallet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, walletId } = body

    if (!walletAddress || !walletId) {
      return NextResponse.json(
        { error: 'walletAddress and walletId are required' },
        { status: 400 }
      )
    }

    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify wallet ownership
    const { data: wallet, error: walletError } = await supabase
      .from('tracked_wallets')
      .select('id')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found or access denied' },
        { status: 404 }
      )
    }

    // Generate recommendations
    const recommendations = await recommendationEngine.generateRecommendations(
      walletAddress,
      walletId
    )

    // Store in database
    await recommendationEngine.storeRecommendations(
      user.id,
      walletId,
      recommendations
    )

    return NextResponse.json({
      success: true,
      count: recommendations.length,
      recommendations,
    })
  } catch (error: any) {
    console.error('Error generating recommendations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/recommendations/generate?walletId=xxx
 * Get stored recommendations for a wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletId = searchParams.get('walletId')

    if (!walletId) {
      return NextResponse.json(
        { error: 'walletId is required' },
        { status: 400 }
      )
    }

    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get recommendations
    const recommendations = await recommendationEngine.getStoredRecommendations(
      user.id,
      walletId
    )

    return NextResponse.json({
      success: true,
      count: recommendations.length,
      recommendations,
    })
  } catch (error: any) {
    console.error('Error fetching recommendations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recommendations' },
      { status: 500 }
    )
  }
}


