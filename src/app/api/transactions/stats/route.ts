import { NextRequest, NextResponse } from 'next/server'
import { transactionParser } from '@/lib/transactionParser'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/transactions/stats?walletId=xxx&protocol=xxx
 * Get transaction statistics for a wallet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletId = searchParams.get('walletId')
    const protocol = searchParams.get('protocol') || undefined

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

    // Get stats
    const stats = await transactionParser.getTransactionStats(walletId, protocol)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    console.error('Error fetching transaction stats:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}


