import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js'
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
 * Jupiter Protocol Service
 * Handles swap aggregation, limit orders, DCA, and JUP staking
 */
export class JupiterService extends ProtocolService {
  // Jupiter program IDs
  private static readonly JUPITER_V6_PROGRAM =
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
  private static readonly JUPITER_V4_PROGRAM =
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'
  private static readonly JUP_TOKEN_MINT =
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'

  constructor(connection: Connection) {
    super(connection, 'Jupiter', [
      JupiterService.JUPITER_V6_PROGRAM,
      JupiterService.JUPITER_V4_PROGRAM,
    ])
  }

  /**
   * Detect Jupiter positions (JUP token holdings, staked JUP)
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

      // Check for JUP token holdings
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info
        const mint = parsedInfo.mint
        const amount = parsedInfo.tokenAmount.uiAmount

        if (mint === JupiterService.JUP_TOKEN_MINT && amount > 0) {
          positions.push({
            protocol: 'Jupiter',
            positionType: 'token',
            value: amount,
            details: {
              token: 'JUP',
              mint: mint,
              amount: amount,
              isStaked: false, // TODO: Check if staked
            },
            lastUpdated: new Date(),
          })
        }
      }

      // TODO: Check for staked JUP positions
      // This requires querying Jupiter's staking program

    } catch (error) {
      console.error('Error detecting Jupiter positions:', error)
    }

    return positions
  }

  /**
   * Get recent Jupiter transactions (swaps, limit orders, etc.)
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

        // Check if transaction involves Jupiter programs
        const programIds = tx.transaction.message.instructions
          .map((ix: any) => ix.programId?.toBase58())
          .filter(Boolean)

        if (this.isProtocolTransaction(programIds)) {
          transactions.push({
            signature: sig.signature,
            blockTime: new Date(sig.blockTime * 1000),
            type: 'swap',
            status: sig.err ? 'failed' : 'success',
            protocol: 'Jupiter',
            metadata: {
              slot: sig.slot,
              fee: tx.meta?.fee || 0,
            },
          })
        }
      }
    } catch (error) {
      console.error('Error fetching Jupiter transactions:', error)
    }

    return transactions
  }

  /**
   * Get farming opportunities for Jupiter
   */
  async getFarmingOpportunities(): Promise<FarmingOpportunity[]> {
    return [
      {
        id: 'jupiter-swap',
        protocol: 'Jupiter',
        activityType: 'swap',
        name: 'Swap via Jupiter Aggregator',
        description:
          'Execute token swaps using Jupiter DEX aggregator for best prices',
        pointsValue: 20,
        automationLevel: 'full',
        estimatedTime: '1-2 minutes',
        requirements: ['Minimum $5 swap value'],
        actionUrl: 'https://jup.ag/swap',
      },
      {
        id: 'jupiter-stake-jup',
        protocol: 'Jupiter',
        activityType: 'stake',
        name: 'Stake JUP Tokens',
        description:
          'Stake JUP tokens for governance rights and potential rewards',
        pointsValue: 100,
        automationLevel: 'partial',
        estimatedTime: '3-5 minutes',
        requirements: ['Minimum 10 JUP tokens', '30-day lock period'],
        actionUrl: 'https://vote.jup.ag',
      },
      {
        id: 'jupiter-limit-order',
        protocol: 'Jupiter',
        activityType: 'swap',
        name: 'Create Limit Order',
        description: 'Set up limit orders for automated trading',
        pointsValue: 30,
        automationLevel: 'manual',
        estimatedTime: '2-3 minutes',
        requirements: ['Tokens to trade', 'Target price'],
        actionUrl: 'https://jup.ag/limit',
      },
      {
        id: 'jupiter-dca',
        protocol: 'Jupiter',
        activityType: 'swap',
        name: 'Set Up DCA Strategy',
        description:
          'Dollar-cost average into tokens with automated recurring buys',
        pointsValue: 50,
        automationLevel: 'partial',
        estimatedTime: '5 minutes',
        requirements: ['SOL or USDC for DCA'],
        actionUrl: 'https://jup.ag/dca',
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
    
    // JUP token holdings
    const jupPosition = positions.find((p) => p.details.token === 'JUP')
    if (jupPosition) {
      if (jupPosition.value >= 10) score += 30 // Significant JUP holder
      else if (jupPosition.value >= 1) score += 15 // Some JUP
    }

    // Transaction frequency
    score += Math.min(transactions.length * 3, 50) // Up to 50 points

    // Recent activity bonus
    if (lastActivity) {
      const daysSinceActivity =
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceActivity < 7) score += 20
    }

    return {
      totalTransactions: transactions.length,
      lastActivityDate: lastActivity,
      activePositions: positions.length,
      farmingScore: Math.min(score, 100),
    }
  }

  /**
   * Execute automated swap via Jupiter
   */
  async executeAutomatedAction(
    action: AutomatedAction
  ): Promise<TransactionResult> {
    if (action.type === 'swap') {
      // TODO: Implement Jupiter swap via their API
      // https://station.jup.ag/docs/apis/swap-api
      return {
        success: false,
        error: 'Jupiter swap automation not yet implemented',
        message:
          'Jupiter API integration coming soon. Use jup.ag for manual swaps.',
      }
    }

    return {
      success: false,
      error: 'Unsupported action type',
      message: `Action type ${action.type} is not supported for Jupiter`,
    }
  }

  /**
   * Check swap history statistics
   */
  async getSwapStats(walletAddress: string): Promise<{
    totalSwaps: number
    last7Days: number
    last30Days: number
    uniqueDays: number
  }> {
    const transactions = await this.getRecentTransactions(walletAddress, 90)

    const swaps = transactions.filter((tx) => tx.type === 'swap')
    const last7Days = swaps.filter(
      (tx) => Date.now() - tx.blockTime.getTime() < 7 * 24 * 60 * 60 * 1000
    ).length
    const last30Days = swaps.filter(
      (tx) => Date.now() - tx.blockTime.getTime() < 30 * 24 * 60 * 60 * 1000
    ).length

    // Count unique days with swaps
    const uniqueDaysSet = new Set(
      swaps.map((tx) => tx.blockTime.toISOString().split('T')[0])
    )

    return {
      totalSwaps: swaps.length,
      last7Days,
      last30Days,
      uniqueDays: uniqueDaysSet.size,
    }
  }

  /**
   * Check if wallet meets Jupiter airdrop criteria
   */
  async checkAirdropEligibility(walletAddress: string): Promise<{
    eligible: boolean
    reasons: string[]
    score: number
  }> {
    const [stats, swapStats, positions] = await Promise.all([
      this.getProtocolStats(walletAddress),
      this.getSwapStats(walletAddress),
      this.detectPositions(walletAddress),
    ])

    const reasons: string[] = []
    let eligible = true

    // Check swap frequency
    if (swapStats.last30Days < 3) {
      eligible = false
      reasons.push('Minimum 3 swaps per month recommended')
    } else {
      reasons.push(`✓ ${swapStats.last30Days} swaps in last 30 days`)
    }

    // Check JUP holdings
    const jupPosition = positions.find((p) => p.details.token === 'JUP')
    if (!jupPosition || jupPosition.value < 1) {
      reasons.push('Consider acquiring JUP tokens')
    } else {
      reasons.push(`✓ Holds ${jupPosition.value.toFixed(2)} JUP`)
    }

    // Check consistency
    if (swapStats.uniqueDays >= 5) {
      reasons.push(`✓ Active on ${swapStats.uniqueDays} different days`)
    }

    if (eligible) {
      reasons.push(`Overall farming score: ${stats.farmingScore}/100`)
    }

    return {
      eligible,
      reasons,
      score: stats.farmingScore,
    }
  }
}


