// Protocol Services Export
export { ProtocolService } from './protocolBase'
export { MeteoraService } from './meteora'
export { JupiterService } from './jupiter'
export { SanctumService } from './sanctum'
export { MagicEdenService } from './magicEden'

export type {
  Position,
  Transaction,
  FarmingOpportunity,
  AutomatedAction,
  TransactionResult,
  ProtocolStats,
} from './types'

// Protocol Service Factory
import { Connection } from '@solana/web3.js'
import { MeteoraService } from './meteora'
import { JupiterService } from './jupiter'
import { SanctumService } from './sanctum'
import { MagicEdenService } from './magicEden'
import { ProtocolService } from './protocolBase'

export class ProtocolManager {
  private connection: Connection
  private services: Map<string, ProtocolService>

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, 'confirmed')
    this.services = new Map()

    // Initialize all protocol services
    this.services.set('meteora', new MeteoraService(this.connection))
    this.services.set('jupiter', new JupiterService(this.connection))
    this.services.set('sanctum', new SanctumService(this.connection))
    this.services.set('magiceden', new MagicEdenService(this.connection))
  }

  /**
   * Get a specific protocol service
   */
  getService(protocol: string): ProtocolService | undefined {
    return this.services.get(protocol.toLowerCase())
  }

  /**
   * Get all protocol services
   */
  getAllServices(): ProtocolService[] {
    return Array.from(this.services.values())
  }

  /**
   * Get all protocols as array of names
   */
  getProtocolNames(): string[] {
    return Array.from(this.services.keys())
  }

  /**
   * Get positions across all protocols
   */
  async getAllPositions(walletAddress: string) {
    const allPositions = []

    for (const service of this.services.values()) {
      try {
        const positions = await service.detectPositions(walletAddress)
        allPositions.push(...positions)
      } catch (error) {
        console.error(
          `Error fetching positions for ${service.getProtocolName()}:`,
          error
        )
      }
    }

    return allPositions
  }

  /**
   * Get transactions across all protocols
   */
  async getAllTransactions(walletAddress: string, days: number = 7) {
    const allTransactions = []

    for (const service of this.services.values()) {
      try {
        const transactions = await service.getRecentTransactions(
          walletAddress,
          days
        )
        allTransactions.push(...transactions)
      } catch (error) {
        console.error(
          `Error fetching transactions for ${service.getProtocolName()}:`,
          error
        )
      }
    }

    // Sort by date (most recent first)
    return allTransactions.sort(
      (a, b) => b.blockTime.getTime() - a.blockTime.getTime()
    )
  }

  /**
   * Get farming opportunities across all protocols
   */
  async getAllFarmingOpportunities() {
    const allOpportunities = []

    for (const service of this.services.values()) {
      try {
        const opportunities = await service.getFarmingOpportunities()
        allOpportunities.push(...opportunities)
      } catch (error) {
        console.error(
          `Error fetching opportunities for ${service.getProtocolName()}:`,
          error
        )
      }
    }

    return allOpportunities
  }

  /**
   * Get stats across all protocols
   */
  async getAllProtocolStats(walletAddress: string) {
    const stats = new Map()

    for (const [name, service] of this.services.entries()) {
      try {
        const protocolStats = await service.getProtocolStats(walletAddress)
        stats.set(name, protocolStats)
      } catch (error) {
        console.error(`Error fetching stats for ${name}:`, error)
      }
    }

    return stats
  }

  /**
   * Calculate overall farming score
   */
  async getOverallFarmingScore(walletAddress: string): Promise<number> {
    const allStats = await this.getAllProtocolStats(walletAddress)
    
    if (allStats.size === 0) return 0

    // Average all protocol scores
    const scores = Array.from(allStats.values()).map(
      (stat) => stat.farmingScore
    )
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length

    return Math.round(avgScore)
  }
}

// Create singleton instance
export const protocolManager = new ProtocolManager(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    'https://solana-mainnet.rpc.extrnode.com'
)


