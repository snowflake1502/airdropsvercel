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
 * Sanctum Protocol Service
 * Handles liquid staking token (LST) detection and management
 */
export class SanctumService extends ProtocolService {
  // Sanctum program ID
  private static readonly SANCTUM_PROGRAM =
    'SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY'

  // Known LST token mints
  private static readonly LST_MINTS: Record<string, string> = {
    J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 'JitoSOL',
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 'mSOL',
    bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: 'bSOL',
    he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A: 'hSOL',
    jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: 'jupSOL',
    picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX: 'picoSOL',
    '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': 'scnSOL',
    Comp4ssDzXcLeu2MnLuGNNFC4cmLPMng8qWHPvzAMU1h: 'compassSOL',
    DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ: 'dSOL',
    LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X: 'laineSOL',
  }

  constructor(connection: Connection) {
    super(connection, 'Sanctum', [SanctumService.SANCTUM_PROGRAM])
  }

  /**
   * Detect Sanctum LST positions
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

      // Check for LST tokens
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info
        const mint = parsedInfo.mint
        const amount = parsedInfo.tokenAmount.uiAmount

        if (amount > 0 && mint in SanctumService.LST_MINTS) {
          const lstName = SanctumService.LST_MINTS[mint]

          positions.push({
            protocol: 'Sanctum',
            positionType: 'staking',
            value: amount,
            details: {
              lstToken: lstName,
              mint: mint,
              amount: amount,
              type: 'Liquid Staking Token',
              stakingYield: this.getEstimatedAPY(lstName),
            },
            lastUpdated: new Date(),
          })
        }
      }
    } catch (error) {
      console.error('Error detecting Sanctum positions:', error)
    }

    return positions
  }

  /**
   * Get recent Sanctum transactions (staking/unstaking/swaps)
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

        // Check for LST-related transactions
        const involvesLST = this.checkIfLSTTransaction(tx)

        if (involvesLST) {
          transactions.push({
            signature: sig.signature,
            blockTime: new Date(sig.blockTime * 1000),
            type: this.classifySanctumTx(tx),
            status: sig.err ? 'failed' : 'success',
            protocol: 'Sanctum',
            metadata: {
              slot: sig.slot,
              fee: tx.meta?.fee || 0,
            },
          })
        }
      }
    } catch (error) {
      console.error('Error fetching Sanctum transactions:', error)
    }

    return transactions
  }

  /**
   * Get farming opportunities for Sanctum
   */
  async getFarmingOpportunities(): Promise<FarmingOpportunity[]> {
    return [
      {
        id: 'sanctum-stake-sol',
        protocol: 'Sanctum',
        activityType: 'stake',
        name: 'Stake SOL to LST',
        description:
          'Convert SOL to liquid staking tokens for yield while maintaining liquidity',
        pointsValue: 80,
        automationLevel: 'full',
        estimatedTime: '2-3 minutes',
        requirements: ['Minimum 0.1 SOL'],
        actionUrl: 'https://app.sanctum.so/trade',
      },
      {
        id: 'sanctum-swap-lst',
        protocol: 'Sanctum',
        activityType: 'swap',
        name: 'Rotate Between LSTs',
        description: 'Swap between different LSTs to optimize yield',
        pointsValue: 30,
        automationLevel: 'full',
        estimatedTime: '1-2 minutes',
        requirements: ['Existing LST holdings'],
        actionUrl: 'https://app.sanctum.so/trade',
      },
      {
        id: 'sanctum-unstake',
        protocol: 'Sanctum',
        activityType: 'unstake',
        name: 'Unstake LST to SOL',
        description: 'Convert liquid staking tokens back to native SOL',
        pointsValue: 20,
        automationLevel: 'full',
        estimatedTime: '2-3 minutes',
        requirements: ['LST tokens to unstake'],
        actionUrl: 'https://app.sanctum.so/trade',
      },
      {
        id: 'sanctum-infinity-pool',
        protocol: 'Sanctum',
        activityType: 'lp',
        name: 'Provide Liquidity to Infinity Pool',
        description: 'Add liquidity to Sanctum Infinity multi-LST pool',
        pointsValue: 100,
        automationLevel: 'manual',
        estimatedTime: '5-10 minutes',
        requirements: ['LST tokens', 'Understanding of IL risk'],
        actionUrl: 'https://app.sanctum.so/infinity',
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

    // Calculate total LST value
    const totalLSTValue = positions.reduce((sum, pos) => sum + pos.value, 0)

    // Calculate farming score (0-100)
    let score = 0

    // LST holdings value
    if (totalLSTValue >= 1) score += 40
    else if (totalLSTValue >= 0.1) score += 20

    // Number of different LSTs (diversification)
    score += Math.min(positions.length * 15, 30)

    // Transaction activity
    score += Math.min(transactions.length * 5, 20)

    // Recent activity bonus
    if (lastActivity) {
      const daysSinceActivity =
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceActivity < 14) score += 10
    }

    return {
      totalTransactions: transactions.length,
      lastActivityDate: lastActivity,
      totalVolume: totalLSTValue,
      activePositions: positions.length,
      farmingScore: Math.min(score, 100),
    }
  }

  /**
   * Execute automated staking action
   */
  async executeAutomatedAction(
    action: AutomatedAction
  ): Promise<TransactionResult> {
    if (action.type === 'stake' || action.type === 'swap') {
      // TODO: Implement Sanctum staking/swapping via their SDK
      return {
        success: false,
        error: 'Sanctum automation not yet implemented',
        message: 'Use app.sanctum.so for manual LST operations',
      }
    }

    return {
      success: false,
      error: 'Unsupported action type',
      message: `Action type ${action.type} is not supported for Sanctum`,
    }
  }

  /**
   * Get estimated APY for LST (placeholder)
   */
  private getEstimatedAPY(lstName: string): number {
    // Placeholder APYs - in production, fetch from Sanctum API
    const apyMap: Record<string, number> = {
      JitoSOL: 7.2,
      mSOL: 6.8,
      bSOL: 6.5,
      hSOL: 7.0,
      jupSOL: 6.9,
      picoSOL: 7.1,
      scnSOL: 6.7,
      compassSOL: 6.6,
      dSOL: 6.8,
      laineSOL: 7.0,
    }

    return apyMap[lstName] || 7.0
  }

  /**
   * Check if transaction involves LST tokens
   */
  private checkIfLSTTransaction(tx: any): boolean {
    if (!tx.meta || !tx.meta.postTokenBalances) return false

    // Check if any LST mints are involved
    const mints = [
      ...tx.meta.preTokenBalances,
      ...tx.meta.postTokenBalances,
    ].map((balance: any) => balance.mint)

    return mints.some((mint: string) => mint in SanctumService.LST_MINTS)
  }

  /**
   * Classify Sanctum transaction type
   */
  private classifySanctumTx(tx: any): string {
    // Simple classification based on token balance changes
    if (!tx.meta) return 'unknown'

    const preBalances = tx.meta.preTokenBalances || []
    const postBalances = tx.meta.postTokenBalances || []

    // If SOL decreased and LST increased = stake
    // If LST decreased and SOL increased = unstake
    // If LST changed to different LST = swap

    return 'lst_operation'
  }

  /**
   * Get LST diversification score
   */
  async getDiversificationScore(walletAddress: string): Promise<number> {
    const positions = await this.detectPositions(walletAddress)
    
    // Score based on number of different LSTs held
    const uniqueLSTs = new Set(positions.map((p) => p.details.lstToken))
    
    if (uniqueLSTs.size >= 3) return 100
    if (uniqueLSTs.size === 2) return 70
    if (uniqueLSTs.size === 1) return 40
    return 0
  }

  /**
   * Check airdrop eligibility for Sanctum
   */
  async checkAirdropEligibility(walletAddress: string): Promise<{
    eligible: boolean
    reasons: string[]
    score: number
  }> {
    const [stats, positions, diversificationScore] = await Promise.all([
      this.getProtocolStats(walletAddress),
      this.detectPositions(walletAddress),
      this.getDiversificationScore(walletAddress),
    ])

    const reasons: string[] = []
    let eligible = true

    // Check LST holdings
    if (positions.length === 0) {
      eligible = false
      reasons.push('No LST holdings detected')
    } else {
      const totalValue = positions.reduce((sum, p) => sum + p.value, 0)
      reasons.push(`✓ Holds ${totalValue.toFixed(4)} SOL in LSTs`)
      
      if (positions.length > 1) {
        reasons.push(`✓ Diversified across ${positions.length} LSTs`)
      }
    }

    // Check staking duration (if we have historical data)
    if (stats.lastActivityDate) {
      const daysSinceActivity =
        (Date.now() - stats.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysSinceActivity < 14) {
        reasons.push('✓ Recent staking activity')
      }
    }

    if (eligible) {
      reasons.push(`Farming score: ${stats.farmingScore}/100`)
      reasons.push(`Diversification score: ${diversificationScore}/100`)
    }

    return {
      eligible,
      reasons,
      score: (stats.farmingScore + diversificationScore) / 2,
    }
  }
}


