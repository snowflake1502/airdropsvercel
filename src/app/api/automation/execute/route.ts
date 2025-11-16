/**
 * Automation Execution API
 * Executes pending automation actions with wallet signing
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { AutomationLog, AutomationConfig } from '@/lib/automation/types'
import { TransactionBuilder } from '@/lib/automation/transaction-builder'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { getServerRpcUrl } from '@/lib/env-config'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { logId, walletAddress, signedTransaction } = body

    if (!logId || !walletAddress) {
      return NextResponse.json(
        { error: 'logId and walletAddress are required' },
        { status: 400 }
      )
    }

    // Get the automation log
    const { data: log, error: logError } = await supabase
      .from('automation_logs')
      .select('*, automation_configs(*)')
      .eq('id', logId)
      .eq('user_id', user.id)
      .single()

    if (logError || !log) {
      return NextResponse.json(
        { error: 'Automation log not found' },
        { status: 404 }
      )
    }

    // Check if log is in pending status
    if (log.status !== 'pending') {
      return NextResponse.json(
        { error: `Log is not pending (current status: ${log.status})` },
        { status: 400 }
      )
    }

    // If signed transaction is provided, send it
    if (signedTransaction) {
      return await executeSignedTransaction(log, signedTransaction)
    }

    // Otherwise, build and return transaction for client-side signing
    return await buildTransactionForSigning(log, walletAddress)
  } catch (error: any) {
    console.error('Error executing automation action:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Build transaction for client-side signing
 */
async function buildTransactionForSigning(
  log: AutomationLog,
  walletAddress: string
): Promise<NextResponse> {
  try {
    const builder = new TransactionBuilder()

    const params = {
      actionType: log.action_type as 'claim_fees' | 'rebalance' | 'open_position',
      positionNftAddress: log.position_nft_address || undefined,
      positionAddress: log.position_address || undefined,
      poolAddress: log.metadata?.poolAddress || undefined,
      walletAddress,
    }

    const transaction = await builder.buildTransaction(params)

    // Serialize transaction for client-side signing
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })

    return NextResponse.json({
      success: true,
      transaction: Buffer.from(serialized).toString('base64'),
      actionType: log.action_type,
      logId: log.id,
      message: 'Transaction built successfully. Sign and send from client.',
    })
  } catch (error: any) {
    console.error('Error building transaction:', error)
    
    // Update log status to failed
    await supabase
      .from('automation_logs')
      .update({
        status: 'failed',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', log.id)

    return NextResponse.json(
      { error: `Failed to build transaction: ${error.message}` },
      { status: 500 }
    )
  }
}

/**
 * Execute signed transaction
 */
async function executeSignedTransaction(
  log: AutomationLog,
  signedTransactionBase64: string
): Promise<NextResponse> {
  try {
    const connection = new Connection(getServerRpcUrl(), 'confirmed')
    const signedTransaction = Transaction.from(
      Buffer.from(signedTransactionBase64, 'base64')
    )

    // Send transaction
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    )

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed')

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`)
    }

    // Get transaction fee
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
    })
    const fee = tx?.meta?.fee || 0
    const feeSOL = fee / 1e9
    const feeUSD = feeSOL * 190 // Rough SOL price

    // Update log with success
    await supabase
      .from('automation_logs')
      .update({
        status: 'executed',
        transaction_signature: signature,
        cost_usd: log.amount_usd + feeUSD,
        gas_fee_sol: feeSOL,
        executed_at: new Date().toISOString(),
      })
      .eq('id', log.id)

    return NextResponse.json({
      success: true,
      signature,
      message: 'Transaction executed successfully',
      logId: log.id,
    })
  } catch (error: any) {
    console.error('Error executing transaction:', error)

    // Update log status to failed
    await supabase
      .from('automation_logs')
      .update({
        status: 'failed',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', log.id)

    return NextResponse.json(
      { error: `Transaction execution failed: ${error.message}` },
      { status: 500 }
    )
  }
}

