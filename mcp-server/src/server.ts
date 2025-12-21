/**
 * MCP Server Implementation
 * Exposes crypto protocol integrations as MCP tools and resources
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { ProtocolRegistry } from './protocols/index.js'
import { ClaimFeesParams, RebalanceParams, OpenPositionParams, GetPositionsParams } from './types.js'

export class CryptoProtocolMCPServer {
  private server: Server
  private protocolRegistry: ProtocolRegistry

  constructor(rpcUrl: string) {
    this.server = new Server(
      {
        name: 'crypto-protocol-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.protocolRegistry = new ProtocolRegistry(rpcUrl)
    this.setupHandlers()
  }

  /**
   * Setup MCP tool and resource handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_protocol_data',
            description:
              'Get protocol-level data (holdings/activity) for a wallet. This is the preferred read API for the dashboard.',
            inputSchema: {
              type: 'object',
              properties: {
                protocol: {
                  type: 'string',
                  enum: ['meteora', 'jupiter', 'sanctum'],
                  description: 'Protocol name',
                },
                walletAddress: {
                  type: 'string',
                  description: 'Wallet address',
                },
              },
              required: ['protocol', 'walletAddress'],
            },
          },
          {
            name: 'claim_fees',
            description: 'Build transaction to claim unclaimed fees from a liquidity position',
            inputSchema: {
              type: 'object',
              properties: {
                protocol: {
                  type: 'string',
                  enum: ['meteora', 'jupiter', 'sanctum'],
                  description: 'Protocol name',
                },
                positionNftAddress: {
                  type: 'string',
                  description: 'Position NFT address',
                },
                walletAddress: {
                  type: 'string',
                  description: 'Wallet address',
                },
              },
              required: ['protocol', 'positionNftAddress', 'walletAddress'],
            },
          },
          {
            name: 'rebalance_position',
            description: 'Build transaction to rebalance an out-of-range liquidity position',
            inputSchema: {
              type: 'object',
              properties: {
                protocol: {
                  type: 'string',
                  enum: ['meteora', 'jupiter', 'sanctum'],
                  description: 'Protocol name',
                },
                positionNftAddress: {
                  type: 'string',
                  description: 'Position NFT address',
                },
                positionAddress: {
                  type: 'string',
                  description: 'Position account address',
                },
                walletAddress: {
                  type: 'string',
                  description: 'Wallet address',
                },
              },
              required: ['protocol', 'positionNftAddress', 'positionAddress', 'walletAddress'],
            },
          },
          {
            name: 'open_position',
            description: 'Build transaction to open a new liquidity position',
            inputSchema: {
              type: 'object',
              properties: {
                protocol: {
                  type: 'string',
                  enum: ['meteora', 'jupiter', 'sanctum'],
                  description: 'Protocol name',
                },
                poolAddress: {
                  type: 'string',
                  description: 'Pool address',
                },
                walletAddress: {
                  type: 'string',
                  description: 'Wallet address',
                },
                amountTokenX: {
                  type: 'number',
                  description: 'Amount of token X',
                },
                amountTokenY: {
                  type: 'number',
                  description: 'Amount of token Y',
                },
                tokenXMint: {
                  type: 'string',
                  description: 'Token X mint address',
                },
                tokenYMint: {
                  type: 'string',
                  description: 'Token Y mint address',
                },
              },
              required: ['protocol', 'poolAddress', 'walletAddress', 'amountTokenX', 'amountTokenY', 'tokenXMint', 'tokenYMint'],
            },
          },
          {
            name: 'get_positions',
            description: 'Get all active positions for a wallet',
            inputSchema: {
              type: 'object',
              properties: {
                protocol: {
                  type: 'string',
                  enum: ['meteora', 'jupiter', 'sanctum', 'all'],
                  description: 'Protocol name or "all" for all protocols',
                },
                walletAddress: {
                  type: 'string',
                  description: 'Wallet address',
                },
              },
              required: ['protocol', 'walletAddress'],
            },
          },
        ],
      }
    })

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params
      // MCP can omit arguments; keep runtime-safe default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args: any = request.params.arguments ?? {}

      try {
        switch (name) {
          case 'claim_fees': {
            const protocol = this.protocolRegistry.getProtocol(args.protocol as string)
            if (!protocol) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Protocol ${args.protocol} not found. Available: ${this.protocolRegistry.getProtocolNames().join(', ')}`,
                  },
                ],
                isError: true,
              }
            }

            const result = await protocol.buildClaimFeesTransaction({
              protocol: args.protocol as 'meteora' | 'jupiter' | 'sanctum',
              positionNftAddress: args.positionNftAddress as string,
              walletAddress: args.walletAddress as string,
            })

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case 'rebalance_position': {
            const protocol = this.protocolRegistry.getProtocol(args.protocol as string)
            if (!protocol) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Protocol ${args.protocol} not found. Available: ${this.protocolRegistry.getProtocolNames().join(', ')}`,
                  },
                ],
                isError: true,
              }
            }

            const result = await protocol.buildRebalanceTransaction({
              protocol: args.protocol as 'meteora' | 'jupiter' | 'sanctum',
              positionNftAddress: args.positionNftAddress as string,
              positionAddress: args.positionAddress as string,
              walletAddress: args.walletAddress as string,
            })

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case 'open_position': {
            const protocol = this.protocolRegistry.getProtocol(args.protocol as string)
            if (!protocol) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Protocol ${args.protocol} not found. Available: ${this.protocolRegistry.getProtocolNames().join(', ')}`,
                  },
                ],
                isError: true,
              }
            }

            const result = await protocol.buildOpenPositionTransaction({
              protocol: args.protocol as 'meteora' | 'jupiter' | 'sanctum',
              poolAddress: args.poolAddress as string,
              walletAddress: args.walletAddress as string,
              amountTokenX: args.amountTokenX as number,
              amountTokenY: args.amountTokenY as number,
              tokenXMint: args.tokenXMint as string,
              tokenYMint: args.tokenYMint as string,
            })

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case 'get_positions': {
            const protocolName = args.protocol as string
            let positions = []

            if (protocolName === 'all') {
              // Get positions from all protocols
              for (const protocol of this.protocolRegistry.getAllProtocols()) {
                try {
                  const protocolPositions = await protocol.getPositions(args.walletAddress as string)
                  positions.push(...protocolPositions)
                } catch (error: any) {
                  console.error(`Error fetching positions from ${protocol.getName()}:`, error)
                }
              }
            } else {
              const protocol = this.protocolRegistry.getProtocol(protocolName)
              if (!protocol) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Protocol ${protocolName} not found. Available: ${this.protocolRegistry.getProtocolNames().join(', ')}`,
                    },
                  ],
                  isError: true,
                }
              }
              positions = await protocol.getPositions(args.walletAddress as string)
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(positions, null, 2),
                },
              ],
            }
          }

          case 'get_protocol_data': {
            const protocolName = (args as any).protocol as string
            const protocol = this.protocolRegistry.getProtocol(protocolName)
            if (!protocol) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Protocol ${protocolName} not found. Available: ${this.protocolRegistry.getProtocolNames().join(', ')}`,
                  },
                ],
                isError: true,
              }
            }

            // Protocol-level data is optional; return structured "not supported" if missing.
            const maybeProvider = protocol as any
            if (typeof maybeProvider.getProtocolData !== 'function') {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        protocol: protocolName,
                        walletAddress: (args as any).walletAddress,
                        supported: false,
                        error: 'Protocol does not implement getProtocolData()',
                      },
                      null,
                      2
                    ),
                  },
                ],
              }
            }

            const data = await maybeProvider.getProtocolData((args as any).walletAddress)
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2),
                },
              ],
            }
          }

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            }
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`,
            },
          ],
          isError: true,
        }
      }
    })

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'protocol://meteora/positions',
            name: 'Meteora Positions',
            description: 'Get all Meteora positions for a wallet',
            mimeType: 'application/json',
          },
          {
            uri: 'protocol://meteora/pools',
            name: 'Meteora Pools',
            description: 'Get available Meteora pools',
            mimeType: 'application/json',
          },
        ],
      }
    })

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      // TODO: Implement resource reading
      // For now, return placeholder
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ message: 'Resource reading not yet implemented' }, null, 2),
          },
        ],
      }
    })
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Crypto Protocol MCP Server started')
  }
}

