import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Create Supabase client
    // Use fallback values if env vars not set (same as client-side)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mcakqykdtxlythsutgpx.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY';
    
    // Log warning if using fallback values
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn('⚠️ Using fallback Supabase credentials in API route. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel for production.');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Clearing transactions for wallet: ${walletAddress}`);

    // Delete all position transactions for this wallet
    const { error: deleteError } = await supabase
      .from('position_transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress);

    if (deleteError) {
      console.error('Error deleting transactions:', deleteError);
      return NextResponse.json(
        { error: 'Failed to clear transactions', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ Transactions cleared successfully');

    return NextResponse.json({
      success: true,
      message: 'Transactions cleared successfully',
    });
  } catch (error: any) {
    console.error('Error in clear-transactions endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}


