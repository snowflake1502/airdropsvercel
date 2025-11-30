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
    // Ensure we always return JSON, even if request parsing fails
    let walletAddress: string;
    let txLimit: number = 15; // Default to 15 transactions (7.5 seconds with 500ms delay)
    try {
      const body = await request.json();
      walletAddress = body.walletAddress;
      // Allow override of transaction limit (max 50 for safety)
      if (body.limit && typeof body.limit === 'number') {
        txLimit = Math.min(Math.max(1, body.limit), 50); // Clamp between 1 and 50
      }
    } catch (parseError: any) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseError.message },
        { status: 400 }
      );
    }

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
    // SECURITY: Require environment variables - no hardcoded fallbacks
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Missing Supabase environment variables' },
        { status: 500 }
      );
    }
    
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
    // Process transactions (default: 15, configurable up to 50)
    // 15 transactions × 500ms = 7.5 seconds (safe for Vercel free tier)
    // Can be increased via limit parameter for users with Pro tier
    const actualLimit = Math.min(txLimit, signatures.length);
    const signaturestoFetch = signatures.slice(0, actualLimit).map((s) => s.signature);

    console.log(`Fetching details for ${signaturestoFetch.length} transactions (limit: ${txLimit})...`);
    console.log(`⏱️  Using 500ms delay between requests (estimated time: ${(signaturestoFetch.length * 500) / 1000}s)...`);
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
          totalTransactions: actualLimit,
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
      totalTransactions: actualLimit,
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

