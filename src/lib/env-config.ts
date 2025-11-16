/**
 * Environment Configuration Helper
 * Handles reading environment variables in Next.js (both server and client)
 */

// Development-only: Try to read .env.local directly (workaround for Turbopack issue)
// NOTE: This function is server-side only and should never be called from client components
function tryReadEnvLocal(key: string): string {
  // Only run on server-side (Node.js environment)
  if (typeof window !== 'undefined') {
    // Client-side: skip this entirely
    return '';
  }
  
  if (typeof process === 'undefined' || process.env.NODE_ENV === 'production') {
    return '';
  }
  
  try {
    // Only try this in Node.js environment (server-side)
    // Use dynamic import to prevent bundling fs in client code
    if (typeof require !== 'undefined' && typeof window === 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env.local');
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
          
          const [envKey, ...valueParts] = trimmed.split('=');
          if (envKey.trim() === key) {
            const value = valueParts.join('=').trim();
            // Remove quotes if present
            return value.replace(/^["']|["']$/g, '');
          }
        }
      }
    }
  } catch (error) {
    // Silently fail - this is just a fallback
  }
  
  return '';
}

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
  
  // Development fallback: Try reading .env.local directly (server-side only)
  // Only call this on server-side to avoid fs module bundling issues
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
    const envLocalValue = tryReadEnvLocal(key);
    if (envLocalValue) return envLocalValue;
  }
  
  return fallback;
}

/**
 * Get RPC URL for client-side use
 * Returns proxy URL to keep API keys secure
 */
export function getRpcUrl(): string {
  // Client-side: Always use the proxy API route (keeps API keys secure)
  if (typeof window !== 'undefined') {
    // Use full URL for same-origin requests (required by ConnectionProvider)
    // This ensures all RPC calls go through our secure proxy
    const proxyUrl = `${window.location.origin}/api/rpc`
    return proxyUrl
  }
  
  // Server-side: Use direct Helius URL (no NEXT_PUBLIC_ prefix, keeps key secure)
  // This is used in API routes and server-side code
  const heliusRpcUrl = process.env.HELIUS_RPC_URL || 
                       process.env.SOLANA_RPC_URL ||
                       'https://api.mainnet-beta.solana.com'
  
  return heliusRpcUrl.trim()
}

/**
 * Get direct RPC URL (server-side only)
 * Use this for server-side operations that need direct RPC access
 */
export function getServerRpcUrl(): string {
  if (typeof window !== 'undefined') {
    throw new Error('getServerRpcUrl() should only be called server-side')
  }
  
  return process.env.HELIUS_RPC_URL || 
         process.env.SOLANA_RPC_URL ||
         'https://api.mainnet-beta.solana.com'
}


