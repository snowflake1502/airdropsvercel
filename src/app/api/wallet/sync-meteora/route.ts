/**
 * API Route: Sync Meteora Wallet
 * 
 * Scans a wallet address for all Meteora DLMM transactions
 * Parses and stores them in the database for comprehensive position tracking
 * 
 * POST /api/wallet/sync-meteora
 * Body: { walletAddress: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getSignaturesForAddress,
  getTransactionsBatch,
} from '@/lib/solana-rpc';
import {
  parseMeteoraTransactions,
  isMeteoraDLMMTransaction,
  type ParsedMeteoraTransaction,
} from '@/lib/meteora-transaction-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Validate wallet address format (basic check)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    console.log(`Starting Meteora sync for wallet: ${walletAddress}`);

    // Get authorization header from request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - No auth token provided' }, { status: 401 });
    }

    // Create Supabase client with the auth token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mcakqykdtxlythsutgpx.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY';
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlFromEnv: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyFromEnv: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('Invalid auth token');
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }
    
    console.log(`Authenticated user: ${user.id}`);

    // Step 1: Fetch all transaction signatures for the wallet
    console.log('Fetching transaction signatures...');
    const signatures = await getSignaturesForAddress(walletAddress, 1000);
    console.log(`Found ${signatures.length} total transactions`);

    if (signatures.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No transactions found for this wallet',
        stats: {
          totalTransactions: 0,
          meteoraTransactions: 0,
          positionsFound: 0,
          feeClaimsFound: 0,
        },
      });
    }

    // Step 2: Fetch full transaction details in batches
    // Process first 50 transactions (Helius can handle this easily)
    // Can be increased further with paid RPC tier
    const txLimit = Math.min(50, signatures.length);
    const signaturestoFetch = signatures.slice(0, txLimit).map((s) => s.signature);

    console.log(`Fetching details for ${signaturestoFetch.length} transactions...`);
    console.log('⏱️  Using 500ms delay between requests...');
    const transactions = await getTransactionsBatch(signaturestoFetch, 500); // 500ms = 2 req/sec (safe for Helius free tier)

    // Step 3: Filter for Meteora transactions
    const meteoraTransactions = transactions.filter((tx) =>
      tx ? isMeteoraDLMMTransaction(tx) : false
    );
    console.log(`Found ${meteoraTransactions.length} Meteora transactions`);

    if (meteoraTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Meteora transactions found for this wallet',
        stats: {
          totalTransactions: txLimit,
          meteoraTransactions: 0,
          positionsFound: 0,
          feeClaimsFound: 0,
        },
      });
    }

    // Step 4: Parse Meteora transactions
    console.log('Parsing Meteora transactions...');
    const parsedTransactions = await parseMeteoraTransactions(
      meteoraTransactions,
      meteoraTransactions.map((_, index) => signaturestoFetch[transactions.indexOf(_)]),
      walletAddress
    );

    console.log(`Successfully parsed ${parsedTransactions.length} transactions`);

    // Step 5: Store in database
    console.log('Storing transactions in database...');
    const stored: ParsedMeteoraTransaction[] = [];
    const errors: string[] = [];

    for (const tx of parsedTransactions) {
      try {
        // Check if transaction already exists
        const { data: existing } = await supabase
          .from('position_transactions')
          .select('id')
          .eq('signature', tx.signature)
          .single();

        if (existing) {
          console.log(`Transaction ${tx.signature} already exists, skipping`);
          continue; // Skip if already stored
        }

        // Insert new transaction
        const { error: insertError } = await supabase
          .from('position_transactions')
          .insert({
            user_id: user.id,
            wallet_address: walletAddress,
            signature: tx.signature,
            block_time: tx.blockTime,
            slot: tx.slot,
            tx_type: tx.type,
            position_nft_address: tx.positionNftAddress,
            pool_address: tx.poolAddress,
            token_x_mint: tx.tokenX?.mint || null,
            token_y_mint: tx.tokenY?.mint || null,
            token_x_amount: tx.tokenX?.amount || null,
            token_y_amount: tx.tokenY?.amount || null,
            token_x_symbol: tx.tokenX?.symbol || null,
            token_y_symbol: tx.tokenY?.symbol || null,
            token_x_usd: tx.tokenX?.valueUSD || null,
            token_y_usd: tx.tokenY?.valueUSD || null,
            total_usd: tx.totalValueUSD,
            sol_change: tx.solChange,
            status: tx.success ? 'success' : 'failed',
            error_message: tx.errorMessage,
            raw_transaction_data: tx.rawTransaction,
          });

        if (insertError) {
          console.error(`Error inserting transaction ${tx.signature}:`, insertError);
          errors.push(`${tx.signature}: ${insertError.message}`);
        } else {
          stored.push(tx);
        }
      } catch (error: any) {
        console.error(`Error processing transaction ${tx.signature}:`, error);
        errors.push(`${tx.signature}: ${error.message}`);
      }
    }

    // Step 6: Calculate statistics
    const stats = {
      totalTransactions: txLimit,
      meteoraTransactions: parsedTransactions.length,
      transactionsStored: stored.length,
      positionsFound: stored.filter((tx) => tx.type === 'position_open').length,
      feeClaimsFound: stored.filter((tx) => tx.type === 'fee_claim').length,
      positionsClosedFound: stored.filter((tx) => tx.type === 'position_close')
        .length,
    };

      console.log('Sync completed successfully:', stats);

    // Step 7: Update manual positions based on transaction history
    console.log('Updating manual positions from transaction history...');
    try {
      // Find position close transactions
      const closeTransactions = stored.filter(tx => tx.type === 'position_close');
      
      for (const closeTx of closeTransactions) {
        if (closeTx.positionNftAddress) {
          // Mark manual position as inactive if it was closed
          await supabase
            .from('manual_positions')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('position_data->>position_address', closeTx.positionNftAddress);
          
          console.log(`Marked position ${closeTx.positionNftAddress} as closed`);
        }
      }
      
      // Find position open transactions and update position_opened_at
      const openTransactions = stored.filter(tx => tx.type === 'position_open');
      
      for (const openTx of openTransactions) {
        if (openTx.positionNftAddress) {
          const openDate = new Date(openTx.blockTime * 1000).toISOString();
          
          // Fetch current position data
          const { data: existingPositions } = await supabase
            .from('manual_positions')
            .select('position_data')
            .eq('user_id', user.id)
            .eq('position_data->>position_address', openTx.positionNftAddress);
          
          if (existingPositions && existingPositions.length > 0) {
            const currentData = existingPositions[0].position_data;
            const updatedData = {
              ...currentData,
              position_opened_at: openDate
            };
            
            await supabase
              .from('manual_positions')
              .update({
                position_data: updatedData,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id)
              .eq('position_data->>position_address', openTx.positionNftAddress);
            
            console.log(`✅ Updated position ${openTx.positionNftAddress} open date to ${openDate}`);
          }
        }
      }
    } catch (updateError) {
      console.error('Error updating manual positions:', updateError);
      // Don't fail the whole sync if this fails
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${stored.length} Meteora transactions`,
      stats,
      transactions: stored.map((tx) => ({
        signature: tx.signature,
        type: tx.type,
        blockTime: tx.blockTime,
        tokenX: tx.tokenX?.symbol,
        tokenY: tx.tokenY?.symbol,
        solChange: tx.solChange,
      })),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error syncing wallet:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync wallet',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

