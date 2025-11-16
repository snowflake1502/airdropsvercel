/**
 * RPC Proxy Client
 * Custom Connection wrapper that routes RPC calls through our secure proxy
 */

import { Connection, ConnectionConfig } from '@solana/web3.js'

/**
 * Create a Connection that uses the RPC proxy API route
 * This keeps API keys secure (server-side only)
 */
export function createProxyConnection(config?: ConnectionConfig): Connection {
  // Use the proxy API route for client-side
  const proxyUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/rpc`
    : '/api/rpc'
  
  // Create connection with custom fetch that routes through proxy
  return new Connection(proxyUrl, 'confirmed', {
    ...config,
    fetch: async (url: string, options?: RequestInit) => {
      // Route all RPC requests through our proxy
      const proxyEndpoint = typeof window !== 'undefined'
        ? `${window.location.origin}/api/rpc`
        : '/api/rpc'
      
      // Forward the request to our proxy
      const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: options?.body,
      })
      
      return response
    },
  })
}

