/**
 * MCP Client Wrapper for Dashboard
 * Provides easy interface to interact with the MCP server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'path'

// Types - duplicated here to avoid circular dependencies
// In production, these would be in a shared package
export interface ClaimFeesParams {
  protocol: 'meteora' | 'jupiter' | 'sanctum'
  positionNftAddress: string
  walletAddress: string
}

export interface RebalanceParams {
  protocol: 'meteora' | 'jupiter' | 'sanctum'
  positionNftAddress: string
  positionAddress: string
  walletAddress: string
}

export interface OpenPositionParams {
  protocol: 'meteora' | 'jupiter' | 'sanctum'
  poolAddress: string
  walletAddress: string
  amountTokenX: number
  amountTokenY: number
  tokenXMint: string
  tokenYMint: string
}

export interface GetPositionsParams {
  protocol: 'meteora' | 'jupiter' | 'sanctum' | 'all'
  walletAddress: string
}

export interface GetProtocolDataParams {
  protocol: 'meteora' | 'jupiter' | 'sanctum'
  walletAddress: string
}

export interface TransactionResult {
  success: boolean
  signature?: string
  error?: string
  transaction?: string // Base64 encoded transaction
}

export interface Position {
  protocol: string
  positionNftAddress: string
  positionAddress: string
  poolAddress: string
  tokenX: {
    mint: string
    symbol: string
    amount: number
    price: number
  }
  tokenY: {
    mint: string
    symbol: string
    amount: number
    price: number
  }
  totalValueUSD: number
  unclaimedFeesUSD: number
  isOutOfRange: boolean
  feeAPR24h: number
}

export class MCPClient {
  private client: Client | null = null
  private connected: boolean = false

  /**
   * Connect to MCP server
   */
  async connect(serverPath: string = 'node', serverArgs: string[] = ['mcp-server/dist/index.js']): Promise<void> {
    if (this.connected) {
      return
    }

    try {
      // Use path relative to project root
      const serverFullPath = join(process.cwd(), 'mcp-server', 'dist', 'index.js')
      
      const transport = new StdioClientTransport({
        command: serverPath,
        args: [serverFullPath],
      })

      this.client = new Client(
        {
          name: 'airdrop-dashboard',
          version: '0.1.0',
        },
        {
          capabilities: {},
        }
      )

      await this.client.connect(transport)
      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to MCP server: ${error.message}`)
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.close()
      this.connected = false
    }
  }

  /**
   * Claim fees from a position
   */
  async claimFees(params: ClaimFeesParams): Promise<TransactionResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.client.callTool({
      name: 'claim_fees',
      arguments: params,
    })

    if (result.isError) {
      return {
        success: false,
        error: result.content[0]?.text || 'Unknown error',
      }
    }

    return JSON.parse(result.content[0]?.text || '{}')
  }

  /**
   * Rebalance a position
   */
  async rebalancePosition(params: RebalanceParams): Promise<TransactionResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.client.callTool({
      name: 'rebalance_position',
      arguments: params,
    })

    if (result.isError) {
      return {
        success: false,
        error: result.content[0]?.text || 'Unknown error',
      }
    }

    return JSON.parse(result.content[0]?.text || '{}')
  }

  /**
   * Open a new position
   */
  async openPosition(params: OpenPositionParams): Promise<TransactionResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.client.callTool({
      name: 'open_position',
      arguments: params,
    })

    if (result.isError) {
      return {
        success: false,
        error: result.content[0]?.text || 'Unknown error',
      }
    }

    return JSON.parse(result.content[0]?.text || '{}')
  }

  /**
   * Get positions for a wallet
   */
  async getPositions(params: GetPositionsParams): Promise<Position[]> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.client.callTool({
      name: 'get_positions',
      arguments: params,
    })

    if (result.isError) {
      throw new Error(result.content[0]?.text || 'Unknown error')
    }

    return JSON.parse(result.content[0]?.text || '[]')
  }

  /**
   * Get protocol-level data (holdings/activity) for a wallet
   */
  async getProtocolData(params: GetProtocolDataParams): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const result = await this.client.callTool({
      name: 'get_protocol_data',
      arguments: params,
    })

    if (result.isError) {
      throw new Error(result.content[0]?.text || 'Unknown error')
    }

    return JSON.parse(result.content[0]?.text || '{}')
  }
}

// Singleton instance
let mcpClientInstance: MCPClient | null = null

/**
 * Get or create MCP client instance
 * Handles connection errors gracefully
 */
export async function getMCPClient(): Promise<MCPClient> {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient()
    try {
      // Connect to MCP server
      // In production, you might want to configure the server path
      await mcpClientInstance.connect()
    } catch (error: any) {
      // Log error but don't throw - allows graceful degradation
      console.warn('Failed to connect to MCP server:', error.message)
      console.warn('MCP server features will be unavailable. Ensure the server is running.')
      // Return client anyway - methods will handle connection errors
    }
  }
  return mcpClientInstance
}

