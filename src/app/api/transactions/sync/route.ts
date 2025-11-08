import { NextRequest, NextResponse } from 'next/server'
import { transactionParser } from '@/lib/transactionParser'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/transactions/sync
 * Sync transactions for a wallet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, walletId, limit = 100 } = body

    if (!walletAddress || !walletId) {
      return NextResponse.json(
        { error: 'walletAddress and walletId are required' },
        { status: 400 }
      )
    }

    // Verify wallet belongs to authenticated user
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

    // Sync transactions
    const synced = await transactionParser.syncWalletTransactions(
      walletAddress,
      walletId,
      limit
    )

    return NextResponse.json({
      success: true,
      synced,
      message: `Synced ${synced} new transactions`,
    })
  } catch (error: any) {
    console.error('Error syncing transactions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync transactions' },
      { status: 500 }
    )
  }
}


