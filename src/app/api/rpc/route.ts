/**
 * Solana RPC Proxy API
 * Proxies RPC requests to Helius (or other RPC provider) server-side
 * Keeps API keys secure (not exposed to browser)
 * 
 * Compatible with Solana JSON-RPC 2.0 format
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get Helius RPC URL from server-side environment variable (no NEXT_PUBLIC_ prefix)
    const heliusRpcUrl = process.env.HELIUS_RPC_URL || 
                        process.env.SOLANA_RPC_URL ||
                        'https://api.mainnet-beta.solana.com'

    // Get the RPC request body from client
    // Solana Connection sends JSON-RPC 2.0 format
    const body = await request.json()

    // Forward the request to Helius/Solana RPC
    const response = await fetch(heliusRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text()
      console.error('RPC Error:', response.status, errorText)
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: {
            code: response.status,
            message: `RPC request failed: ${errorText}`,
          },
          id: body.id || null,
        },
        { status: response.status }
      )
    }

    // Get the response data (should be JSON-RPC 2.0 format)
    const data = await response.json()

    // Return the response to client (preserve JSON-RPC format)
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error: any) {
    console.error('RPC Proxy Error:', error)
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `RPC Proxy Error: ${error.message}`,
        },
        id: null,
      },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS (if needed)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// Handle GET requests (for health checks)
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Solana RPC Proxy is running',
    rpcProvider: process.env.HELIUS_RPC_URL ? 'Helius' : 'Public Solana RPC',
  })
}

