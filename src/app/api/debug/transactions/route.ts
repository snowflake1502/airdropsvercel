import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('wallet');
  
  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  // Use fallback values if env vars not set (same as other API routes)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mcakqykdtxlythsutgpx.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY';
  
  // Log warning if using fallback values
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Using fallback Supabase credentials in debug API route.');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from('position_transactions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('block_time', { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Group by position NFT address
  const positionGroups: Record<string, any[]> = {};
  
  data.forEach(tx => {
    const posAddr = tx.position_nft_address || 'unknown';
    if (!positionGroups[posAddr]) {
      positionGroups[posAddr] = [];
    }
    positionGroups[posAddr].push(tx);
  });
  
  // Calculate summaries
  const summary = Object.entries(positionGroups).map(([posAddr, txs]) => {
    let totalDeposit = 0, totalFees = 0, totalWithdraw = 0;
    let depositSOL = 0, depositUSDC = 0;
    let feeSOL = 0, feeUSDC = 0;
    let withdrawSOL = 0, withdrawUSDC = 0;
    
    txs.forEach(tx => {
      const solAmount = tx.token_x_symbol === 'SOL' ? parseFloat(tx.token_x_amount || '0') : 
                        tx.token_y_symbol === 'SOL' ? parseFloat(tx.token_y_amount || '0') : 0;
      const usdcAmount = tx.token_x_symbol === 'USDC' ? parseFloat(tx.token_x_amount || '0') : 
                         tx.token_y_symbol === 'USDC' ? parseFloat(tx.token_y_amount || '0') : 0;
      const usd = parseFloat(tx.total_usd || '0');
      
      if (tx.tx_type === 'position_open') {
        totalDeposit += usd;
        depositSOL += solAmount;
        depositUSDC += usdcAmount;
      } else if (tx.tx_type === 'fee_claim') {
        totalFees += usd;
        feeSOL += solAmount;
        feeUSDC += usdcAmount;
      } else if (tx.tx_type === 'position_close') {
        totalWithdraw += usd;
        withdrawSOL += solAmount;
        withdrawUSDC += usdcAmount;
      }
    });
    
    const openDate = txs.find(t => t.tx_type === 'position_open')?.block_time;
    const closeDate = txs.find(t => t.tx_type === 'position_close')?.block_time;
    
    return {
      positionAddress: posAddr,
      openDate: openDate ? new Date(openDate * 1000).toLocaleString() : 'N/A',
      closeDate: closeDate ? new Date(closeDate * 1000).toLocaleString() : 'Still Open',
      transactionCount: txs.length,
      deposit: {
        sol: depositSOL,
        usdc: depositUSDC,
        usd: totalDeposit
      },
      fees: {
        sol: feeSOL,
        usdc: feeUSDC,
        usd: totalFees
      },
      withdraw: {
        sol: withdrawSOL,
        usdc: withdrawUSDC,
        usd: totalWithdraw
      },
      pnl: totalWithdraw + totalFees - totalDeposit,
      transactions: txs.map(t => ({
        type: t.tx_type,
        date: new Date(t.block_time * 1000).toLocaleString(),
        signature: t.signature,
        tokenX: `${t.token_x_amount || '0'} ${t.token_x_symbol || 'N/A'}`,
        tokenY: `${t.token_y_amount || '0'} ${t.token_y_symbol || 'N/A'}`,
        usd: parseFloat(t.total_usd || '0').toFixed(2)
      }))
    };
  });
  
  return NextResponse.json({
    wallet: walletAddress,
    totalTransactions: data.length,
    positionCount: Object.keys(positionGroups).length,
    positions: summary
  }, { status: 200 });
}


