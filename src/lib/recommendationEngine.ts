import { supabase } from './supabase'
import { protocolManager } from './protocols'
import { transactionParser } from './transactionParser'

/**
 * Recommendation Engine
 * Analyzes wallet activity and generates personalized farming suggestions
 */

export interface Recommendation {
  id: string
  protocol: string
  protocolSlug: string
  title: string
  description: string
  priority: number // 1-100, higher = more important
  type: 'missing_activity' | 'optimization' | 'new_opportunity'
  actionItems: string[]
  estimatedTime?: string
  potentialPoints?: number
  expiresAt?: Date
}

export class RecommendationEngine {
  /**
   * Generate recommendations for a wallet
   */
  async generateRecommendations(
    walletAddress: string,
    walletId: string
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []

    try {
      // Get current positions
      const positions = await protocolManager.getAllPositions(walletAddress)

      // Get transaction history
      const transactions = await transactionParser.getWalletTransactions(
        walletId,
        100
      )

      // Get protocol stats
      const stats = await protocolManager.getAllProtocolStats(walletAddress)

      // Generate protocol-specific recommendations
      for (const [protocolSlug, protocolStats] of stats.entries()) {
        const protocolRecommendations = await this.getProtocolRecommendations(
          protocolSlug,
          protocolStats,
          positions,
          transactions
        )
        recommendations.push(...protocolRecommendations)
      }

      // Add general recommendations
      const generalRecs = await this.getGeneralRecommendations(
        positions,
        transactions
      )
      recommendations.push(...generalRecs)

      // Sort by priority
      recommendations.sort((a, b) => b.priority - a.priority)

      return recommendations.slice(0, 10) // Return top 10
    } catch (error) {
      console.error('Error generating recommendations:', error)
      return []
    }
  }

  /**
   * Get protocol-specific recommendations
   */
  private async getProtocolRecommendations(
    protocolSlug: string,
    stats: any,
    positions: any[],
    transactions: any[]
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []
    const protocolPositions = positions.filter(
      (p) => p.protocol.toLowerCase() === protocolSlug
    )

    // Check last activity
    const daysSinceActivity = stats.lastActivityDate
      ? (Date.now() - stats.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999

    // Meteora recommendations
    if (protocolSlug === 'meteora') {
      if (protocolPositions.length === 0) {
        recommendations.push({
          id: `meteora-start`,
          protocol: 'Meteora',
          protocolSlug: 'meteora',
          title: 'Start Farming on Meteora',
          description:
            'Meteora has confirmed airdrops. Add liquidity to DLMM pools to start earning.',
          priority: 90,
          type: 'new_opportunity',
          actionItems: [
            'Visit Meteora app',
            'Choose a DLMM pool (SOL-USDC recommended)',
            'Add at least 0.1 SOL liquidity',
            'Monitor for 7+ days',
          ],
          estimatedTime: '10 minutes',
          potentialPoints: 50,
        })
      }

      if (daysSinceActivity > 7 && protocolPositions.length > 0) {
        recommendations.push({
          id: `meteora-reactivate`,
          protocol: 'Meteora',
          protocolSlug: 'meteora',
          title: 'Reactivate Meteora Position',
          description:
            'No activity in 7+ days. Consider rebalancing or adding liquidity.',
          priority: 70,
          type: 'optimization',
          actionItems: [
            'Check current positions',
            'Rebalance if needed',
            'Consider adding to positions',
          ],
          estimatedTime: '5 minutes',
          potentialPoints: 15,
        })
      }
    }

    // Jupiter recommendations
    if (protocolSlug === 'jupiter') {
      const last7DaysTxs = transactions.filter(
        (tx: any) =>
          tx.protocols?.slug === 'jupiter' &&
          Date.now() - new Date(tx.block_time).getTime() < 7 * 24 * 60 * 60 * 1000
      ).length

      if (last7DaysTxs < 3) {
        recommendations.push({
          id: `jupiter-swap-more`,
          protocol: 'Jupiter',
          protocolSlug: 'jupiter',
          title: 'Increase Jupiter Trading Activity',
          description:
            'Aim for 3+ swaps per week to maximize airdrop eligibility.',
          priority: 75,
          type: 'missing_activity',
          actionItems: [
            'Make 3-5 small swaps this week',
            'Recommended: $10-$50 per swap',
            'Try different token pairs',
          ],
          estimatedTime: '2 minutes per swap',
          potentialPoints: 20,
        })
      }

      const jupPosition = protocolPositions.find(
        (p) => p.details?.token === 'JUP'
      )
      if (!jupPosition || jupPosition.value < 10) {
        recommendations.push({
          id: `jupiter-buy-jup`,
          protocol: 'Jupiter',
          protocolSlug: 'jupiter',
          title: 'Acquire JUP Tokens',
          description:
            'Holding JUP tokens significantly improves airdrop chances.',
          priority: 85,
          type: 'optimization',
          actionItems: [
            'Buy at least 10 JUP tokens',
            'Consider staking for governance',
            'Hold for 30+ days',
          ],
          estimatedTime: '5 minutes',
          potentialPoints: 100,
        })
      }
    }

    // Sanctum recommendations
    if (protocolSlug === 'sanctum') {
      if (protocolPositions.length === 0) {
        recommendations.push({
          id: `sanctum-start`,
          protocol: 'Sanctum',
          protocolSlug: 'sanctum',
          title: 'Start Liquid Staking',
          description:
            'Stake SOL for LSTs to earn yield while supporting the network.',
          priority: 80,
          type: 'new_opportunity',
          actionItems: [
            'Visit Sanctum app',
            'Stake at least 0.1 SOL',
            'Choose LST (JitoSOL, mSOL, or bSOL)',
            'Hold for 14+ days',
          ],
          estimatedTime: '3 minutes',
          potentialPoints: 80,
        })
      }

      if (protocolPositions.length === 1) {
        recommendations.push({
          id: `sanctum-diversify`,
          protocol: 'Sanctum',
          protocolSlug: 'sanctum',
          title: 'Diversify LST Holdings',
          description: 'Hold multiple LST types to maximize airdrop potential.',
          priority: 60,
          type: 'optimization',
          actionItems: [
            'Swap some LST to different type',
            'Aim for 2-3 different LSTs',
            'Spread risk across validators',
          ],
          estimatedTime: '2 minutes',
          potentialPoints: 30,
        })
      }
    }

    // Magic Eden recommendations
    if (protocolSlug === 'magiceden') {
      const last30DaysTxs = transactions.filter(
        (tx: any) =>
          tx.protocols?.slug === 'magic-eden' &&
          Date.now() - new Date(tx.block_time).getTime() <
            30 * 24 * 60 * 60 * 1000
      ).length

      if (last30DaysTxs === 0) {
        recommendations.push({
          id: `magic-eden-start`,
          protocol: 'Magic Eden',
          protocolSlug: 'magic-eden',
          title: 'Start NFT Trading Activity',
          description:
            'Magic Eden has potential for airdrops. Start with small trades.',
          priority: 55,
          type: 'missing_activity',
          actionItems: [
            'Browse verified collections',
            'Buy 1-2 affordable NFTs',
            'List an NFT for sale',
            'Make offers on collections',
          ],
          estimatedTime: '10 minutes',
          potentialPoints: 60,
        })
      }
    }

    return recommendations
  }

  /**
   * Get general recommendations
   */
  private async getGeneralRecommendations(
    positions: any[],
    transactions: any[]
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []

    // Check protocol diversity
    const activeProtocols = new Set(positions.map((p) => p.protocol))

    if (activeProtocols.size < 2) {
      recommendations.push({
        id: 'diversify-protocols',
        protocol: 'General',
        protocolSlug: 'general',
        title: 'Diversify Across Protocols',
        description:
          'Being active on multiple protocols increases overall airdrop potential.',
        priority: 95,
        type: 'optimization',
        actionItems: [
          'Target at least 3 different protocols',
          'Start with high-priority protocols (Meteora, Jupiter)',
          'Maintain consistent activity',
        ],
        estimatedTime: '30 minutes total',
        potentialPoints: 150,
      })
    }

    // Check transaction frequency
    const last7DaysTxs = transactions.filter(
      (tx: any) =>
        Date.now() - new Date(tx.block_time).getTime() < 7 * 24 * 60 * 60 * 1000
    ).length

    if (last7DaysTxs === 0) {
      recommendations.push({
        id: 'increase-activity',
        protocol: 'General',
        protocolSlug: 'general',
        title: 'Increase Overall Activity',
        description: 'No transactions in the last 7 days. Stay consistent!',
        priority: 100,
        type: 'missing_activity',
        actionItems: [
          'Make at least 1 transaction per week',
          'Set reminders for farming tasks',
          'Join protocol Discord for updates',
        ],
        estimatedTime: 'Ongoing',
        potentialPoints: 50,
      })
    }

    // Check consistency
    const uniqueDays = new Set(
      transactions.map((tx: any) =>
        new Date(tx.block_time).toISOString().split('T')[0]
      )
    )

    if (uniqueDays.size >= 15) {
      // Positive recommendation!
      recommendations.push({
        id: 'great-consistency',
        protocol: 'General',
        protocolSlug: 'general',
        title: '🎉 Excellent Consistency!',
        description:
          "You've been active on 15+ different days. Keep it up!",
        priority: 50,
        type: 'optimization',
        actionItems: [
          'Maintain this consistency',
          'Consider increasing transaction size',
          'Explore new protocols',
        ],
        estimatedTime: 'Ongoing',
        potentialPoints: 0,
      })
    }

    return recommendations
  }

  /**
   * Store recommendations in database
   */
  async storeRecommendations(
    userId: string,
    walletId: string,
    recommendations: Recommendation[]
  ): Promise<void> {
    try {
      // Get protocol IDs
      const { data: protocols } = await supabase
        .from('protocols')
        .select('id, slug')

      const protocolMap = new Map(
        protocols?.map((p) => [p.slug, p.id]) || []
      )

      // Delete old recommendations for this wallet
      await supabase
        .from('farming_recommendations')
        .delete()
        .eq('wallet_id', walletId)
        .eq('completed', false)

      // Insert new recommendations
      const inserts = recommendations.map((rec) => ({
        user_id: userId,
        wallet_id: walletId,
        protocol_id: protocolMap.get(rec.protocolSlug),
        recommendation_type: rec.type,
        priority: rec.priority,
        title: rec.title,
        description: rec.description,
        action_items: { items: rec.actionItems, points: rec.potentialPoints },
        expires_at: rec.expiresAt?.toISOString(),
      }))

      const { error } = await supabase
        .from('farming_recommendations')
        .insert(inserts)

      if (error) throw error
    } catch (error) {
      console.error('Error storing recommendations:', error)
    }
  }

  /**
   * Get stored recommendations from database
   */
  async getStoredRecommendations(userId: string, walletId: string) {
    try {
      const { data, error } = await supabase
        .from('farming_recommendations')
        .select(
          `
          *,
          protocols (name, slug)
        `
        )
        .eq('user_id', userId)
        .eq('wallet_id', walletId)
        .eq('completed', false)
        .order('priority', { ascending: false })
        .limit(10)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching recommendations:', error)
      return []
    }
  }

  /**
   * Mark recommendation as completed
   */
  async completeRecommendation(recommendationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('farming_recommendations')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', recommendationId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error completing recommendation:', error)
      return false
    }
  }
}

// Create singleton instance
export const recommendationEngine = new RecommendationEngine()


