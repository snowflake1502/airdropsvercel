/**
 * Environment Configuration Helper
 * Handles reading environment variables in Next.js (both server and client)
 */

export function getEnvVar(key: string, fallback: string = ''): string {
  // Server-side: process.env is available
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value) return value;
  }
  
  // Client-side: Check window.__NEXT_DATA__ (Next.js exposes env vars here)
  if (typeof window !== 'undefined') {
    const nextData = (window as any).__NEXT_DATA__;
    if (nextData?.env?.[key]) {
      return nextData.env[key];
    }
  }
  
  return fallback;
}

export function getRpcUrl(): string {
  // Try multiple ways to get the RPC URL
  let rpcUrl = getEnvVar('NEXT_PUBLIC_SOLANA_RPC_URL') || 
               getEnvVar('SOLANA_RPC_URL') || '';
  
  // If still not found, try direct process.env access (for server-side)
  if (!rpcUrl && typeof process !== 'undefined' && process.env) {
    rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
             process.env.SOLANA_RPC_URL || '';
  }
  
  // Fallback to Helius URL directly if env var not found (temporary workaround)
  // TODO: Remove this once env vars are working correctly
  if (!rpcUrl || rpcUrl === 'https://api.mainnet-beta.solana.com') {
    // Use Helius RPC directly (from .env.local)
    rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=201675f6-a0a5-41b0-8206-c5d1f81fc8f2';
    if (typeof window !== 'undefined') {
      console.warn('⚠️ Using hardcoded Helius RPC (env var not found)');
    }
  }
  
  if (typeof window !== 'undefined') {
    console.log('🔗 RPC URL Config:', {
      source: getEnvVar('NEXT_PUBLIC_SOLANA_RPC_URL') ? 'NEXT_PUBLIC_SOLANA_RPC_URL' : 
              getEnvVar('SOLANA_RPC_URL') ? 'SOLANA_RPC_URL' : 
              (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOLANA_RPC_URL) ? 'process.env' : 'hardcoded',
      isHelius: rpcUrl.includes('helius'),
      url: rpcUrl.substring(0, 60) + '...'
    });
  }
  
  return rpcUrl.trim();
}

