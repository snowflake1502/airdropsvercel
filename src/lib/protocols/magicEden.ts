import { Connection, PublicKey } from '@solana/web3.js'
import { ProtocolService } from './protocolBase'
import {
  Position,
  Transaction,
  FarmingOpportunity,
  AutomatedAction,
  TransactionResult,
  ProtocolStats,
} from './types'

/**
 * Magic Eden Protocol Service
 * Handles NFT marketplace activity tracking
 */
export class MagicEdenService extends ProtocolService {
  // Magic Eden program IDs
  private static readonly MAGIC_EDEN_V2 =
    'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K'
  private static readonly MAGIC_EDEN_V1 =
    'MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8'

  constructor(connection: Connection) {
    super(connection, 'Magic Eden', [
      MagicEdenService.MAGIC_EDEN_V2,
      MagicEdenService.MAGIC_EDEN_V1,
    ])
  }

  /**
   * Detect NFT holdings (via Metaplex)
   */
  async detectPositions(walletAddress: string): Promise<Position[]> {
    const positions: Position[] = []

    try {
      const publicKey = new PublicKey(walletAddress)

      // Get all token accounts
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: new PublicKey(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
          ),
        }
      )

      // Filter for NFTs (amount = 1, decimals = 0)
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info
        const amount = parsedInfo.tokenAmount.amount
        const decimals = parsedInfo.tokenAmount.decimals

        // NFTs typically have amount = 1 and decimals = 0
        if (amount === '1' && decimals === 0) {
          positions.push({
            protocol: 'Magic Eden',
            positionType: 'nft',
            value: 1,
            details: {
              mint: parsedInfo.mint,
              type: 'NFT',
              // TODO: Fetch metadata from Metaplex
              // This would include name, image, collection, etc.
            },
            lastUpdated: new Date(),
          })
        }
      }
    } catch (error) {
      console.error('Error detecting NFT positions:', error)
    }

    return positions
  }

  /**
   * Get recent Magic Eden transactions
   */
  async getRecentTransactions(
    walletAddress: string,
    days: number = 7
  ): Promise<Transaction[]> {
    const transactions: Transaction[] = []

    try {
      const publicKey = new PublicKey(walletAddress)

      // Get transaction signatures
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 100 }
      )

      // Filter by date
      const cutoffTime = Date.now() / 1000 - days * 24 * 60 * 60

      for (const sig of signatures) {
        if (!sig.blockTime || sig.blockTime < cutoffTime) continue

        // Get full transaction details
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })

        if (!tx || !tx.transaction) continue

        // Check if transaction involves Magic Eden programs
        const programIds = tx.transaction.message.instructions
          .map((ix: any) => ix.programId?.toBase58())
          .filter(Boolean)

        if (this.isProtocolTransaction(programIds)) {
          transactions.push({
            signature: sig.signature,
            blockTime: new Date(sig.blockTime * 1000),
            type: this.classifyNFTTx(tx),
            status: sig.err ? 'failed' : 'success',
            protocol: 'Magic Eden',
            metadata: {
              slot: sig.slot,
              fee: tx.meta?.fee || 0,
            },
          })
        }
      }
    } catch (error) {
      console.error('Error fetching Magic Eden transactions:', error)
    }

    return transactions
  }

  /**
   * Get farming opportunities for Magic Eden
   */
  async getFarmingOpportunities(): Promise<FarmingOpportunity[]> {
    return [
      {
        id: 'magic-eden-buy-nft',
        protocol: 'Magic Eden',
        activityType: 'nft_trade',
        name: 'Buy NFT on Magic Eden',
        description:
          'Purchase NFTs from verified collections for potential airdrops',
        pointsValue: 60,
        automationLevel: 'manual',
        estimatedTime: '5-10 minutes',
        requirements: [
          'Minimum 0.01 SOL',
          'Research collection beforehand',
        ],
        actionUrl: 'https://magiceden.io/marketplace',
      },
      {
        id: 'magic-eden-list-nft',
        protocol: 'Magic Eden',
        activityType: 'nft_trade',
        name: 'List NFT for Sale',
        description: 'Create listings for your NFTs on the marketplace',
        pointsValue: 25,
        automationLevel: 'manual',
        estimatedTime: '2-3 minutes',
        requirements: ['NFT to list', 'Listing price strategy'],
        actionUrl: 'https://magiceden.io/my-items',
      },
      {
        id: 'magic-eden-make-offer',
        protocol: 'Magic Eden',
        activityType: 'nft_trade',
        name: 'Make Collection Offer',
        description: 'Place collection-wide offers for NFTs',
        pointsValue: 30,
        automationLevel: 'manual',
        estimatedTime: '3-5 minutes',
        requirements: ['SOL for offer', 'Collection to bid on'],
        actionUrl: 'https://magiceden.io/marketplace',
      },
      {
        id: 'magic-eden-mint',
        protocol: 'Magic Eden',
        activityType: 'nft_trade',
        name: 'Mint from Launchpad',
        description: 'Participate in new NFT mints via Magic Eden Launchpad',
        pointsValue: 80,
        automationLevel: 'manual',
        estimatedTime: '5-10 minutes',
        requirements: ['SOL for mint', 'Active launchpad mint'],
        actionUrl: 'https://magiceden.io/launchpad',
      },
    ]
  }

  /**
   * Get protocol statistics for a wallet
   */
  async getProtocolStats(walletAddress: string): Promise<ProtocolStats> {
    const [positions, transactions] = await Promise.all([
      this.detectPositions(walletAddress),
      this.getRecentTransactions(walletAddress, 30),
    ])

    const lastActivity =
      transactions.length > 0 ? transactions[0].blockTime : undefined

    // Calculate farming score (0-100)
    let score = 0

    // NFT holdings
    if (positions.length >= 5) score += 30
    else if (positions.length >= 1) score += 15

    // Trading activity
    const trades = transactions.filter(
      (tx) => tx.type === 'buy' || tx.type === 'sell'
    )
    score += Math.min(trades.length * 10, 40)

    // Listing activity
    const listings = transactions.filter((tx) => tx.type === 'list')
    score += Math.min(listings.length * 5, 20)

    // Recent activity bonus
    if (lastActivity) {
      const daysSinceActivity =
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceActivity < 7) score += 10
    }

    return {
      totalTransactions: transactions.length,
      lastActivityDate: lastActivity,
      activePositions: positions.length,
      farmingScore: Math.min(score, 100),
    }
  }

  /**
   * Execute automated action (not supported for NFTs)
   */
  async executeAutomatedAction(
    action: AutomatedAction
  ): Promise<TransactionResult> {
    return {
      success: false,
      error: 'NFT trading automation not supported',
      message:
        'NFT trading requires manual review. Use magiceden.io for trading.',
    }
  }

  /**
   * Classify NFT transaction type
   */
  private classifyNFTTx(tx: any): string {
    // Check instruction count and patterns
    const instructions = tx.transaction.message.instructions

    // Simple heuristics - in production, parse instruction data
    if (instructions.length <= 3) return 'list'
    if (instructions.length >= 5) return 'buy'

    return 'nft_activity'
  }

  /**
   * Get NFT trading statistics
   */
  async getTradingStats(walletAddress: string): Promise<{
    totalNFTs: number
    totalBuys: number
    totalSells: number
    totalListings: number
    last30Days: number
  }> {
    const [positions, transactions] = await Promise.all([
      this.detectPositions(walletAddress),
      this.getRecentTransactions(walletAddress, 30),
    ])

    const buys = transactions.filter((tx) => tx.type === 'buy').length
    const sells = transactions.filter((tx) => tx.type === 'sell').length
    const listings = transactions.filter((tx) => tx.type === 'list').length

    return {
      totalNFTs: positions.length,
      totalBuys: buys,
      totalSells: sells,
      totalListings: listings,
      last30Days: transactions.length,
    }
  }

  /**
   * Check airdrop eligibility for Magic Eden
   */
  async checkAirdropEligibility(walletAddress: string): Promise<{
    eligible: boolean
    reasons: string[]
    score: number
  }> {
    const [stats, tradingStats] = await Promise.all([
      this.getProtocolStats(walletAddress),
      this.getTradingStats(walletAddress),
    ])

    const reasons: string[] = []
    let eligible = true

    // Check NFT holdings
    if (tradingStats.totalNFTs === 0) {
      reasons.push('No NFTs held currently')
    } else {
      reasons.push(`✓ Holds ${tradingStats.totalNFTs} NFTs`)
    }

    // Check trading activity
    if (tradingStats.totalBuys === 0 && tradingStats.totalSells === 0) {
      eligible = false
      reasons.push('No buying or selling activity')
    } else {
      reasons.push(
        `✓ ${tradingStats.totalBuys} buys, ${tradingStats.totalSells} sells`
      )
    }

    // Check listing activity
    if (tradingStats.totalListings > 0) {
      reasons.push(`✓ Created ${tradingStats.totalListings} listings`)
    } else {
      reasons.push('Consider listing NFTs to show activity')
    }

    // Recent activity
    if (tradingStats.last30Days === 0) {
      reasons.push('No activity in last 30 days')
    } else {
      reasons.push(`✓ ${tradingStats.last30Days} actions in last 30 days`)
    }

    if (eligible) {
      reasons.push(`Farming score: ${stats.farmingScore}/100`)
    }

    return {
      eligible,
      reasons,
      score: stats.farmingScore,
    }
  }

  /**
   * Get collection diversity score
   */
  async getCollectionDiversity(walletAddress: string): Promise<number> {
    const positions = await this.detectPositions(walletAddress)
    
    // In production, fetch collection data and count unique collections
    // For now, simple scoring based on NFT count
    if (positions.length >= 10) return 100
    if (positions.length >= 5) return 70
    if (positions.length >= 3) return 50
    if (positions.length >= 1) return 25
    return 0
  }
}


