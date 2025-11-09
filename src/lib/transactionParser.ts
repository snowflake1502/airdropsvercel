import { Connection, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js'
import { supabase } from './supabase'

/**
 * Transaction Parser
 * Parses Solana transactions and stores them in database
 */

interface ParsedTransaction {
  signature: string
  walletId: string
  protocolId?: string
  activityId?: string
  txType: string
  blockTime: Date
  status: 'success' | 'failed' | 'pending'
  metadata: Record<string, any>
}

// Known program IDs for protocols
const PROTOCOL_PROGRAM_IDS: Record<string, string[]> = {
  meteora: [
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    'DLMM3DgeuhSzGSuBQnGSiH8LGQUgwAv8qLWGPtABV8r',
  ],
  jupiter: [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  ],
  sanctum: ['SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY'],
  'magic-eden': [
    'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
    'MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8',
  ],
}

export class TransactionParser {
  private connection: Connection

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, 'confirmed')
  }

  /**
   * Sync transactions for a wallet
   * Fetches recent transactions and stores in database
   */
  async syncWalletTransactions(
    walletAddress: string,
    walletId: string,
    limit: number = 100
  ): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress)

      // Get transaction signatures
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit }
      )

      let synced = 0

      for (const sig of signatures) {
        // Check if transaction already exists
        const { data: existing } = await supabase
          .from('user_transactions')
          .select('signature')
          .eq('tx_signature', sig.signature)
          .single()

        if (existing) continue // Skip if already synced

        // Get full transaction
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })

        if (!tx) continue

        // Parse and store
        const parsed = await this.parseTransaction(tx, sig.signature, walletId)
        if (parsed) {
          await this.storeTransaction(parsed)
          synced++
        }
      }

      return synced
    } catch (error) {
      console.error('Error syncing transactions:', error)
      return 0
    }
  }

  /**
   * Parse a single transaction
   */
  private async parseTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    walletId: string
  ): Promise<ParsedTransaction | null> {
    try {
      if (!tx.blockTime) return null

      // Get protocol from instructions
      const programIds = tx.transaction.message.instructions
        .map((ix: any) => ix.programId?.toBase58())
        .filter(Boolean)

      const protocol = this.identifyProtocol(programIds)
      const protocolId = protocol ? await this.getProtocolId(protocol) : undefined

      // Determine transaction type
      const txType = this.classifyTransaction(tx, protocol)

      return {
        signature,
        walletId,
        protocolId,
        txType,
        blockTime: new Date(tx.blockTime * 1000),
        status: tx.meta?.err ? 'failed' : 'success',
        metadata: {
          slot: tx.slot,
          fee: tx.meta?.fee || 0,
          programIds,
          logMessages: tx.meta?.logMessages?.slice(0, 10) || [], // Store first 10 logs
        },
      }
    } catch (error) {
      console.error('Error parsing transaction:', error)
      return null
    }
  }

  /**
   * Identify which protocol a transaction belongs to
   */
  private identifyProtocol(programIds: string[]): string | null {
    for (const [protocol, ids] of Object.entries(PROTOCOL_PROGRAM_IDS)) {
      if (ids.some((id) => programIds.includes(id))) {
        return protocol
      }
    }
    return null
  }

  /**
   * Get protocol ID from database
   */
  private async getProtocolId(protocolSlug: string): Promise<string | undefined> {
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('id')
        .eq('slug', protocolSlug)
        .single()

      if (error || !data) return undefined
      return data.id
    } catch {
      return undefined
    }
  }

  /**
   * Classify transaction type based on instructions
   */
  private classifyTransaction(
    tx: ParsedTransactionWithMeta,
    protocol: string | null
  ): string {
    if (!protocol) return 'unknown'

    const instructionCount = tx.transaction.message.instructions.length

    // Simple heuristics - can be improved with actual instruction parsing
    if (protocol === 'jupiter') {
      return 'swap'
    } else if (protocol === 'meteora') {
      if (instructionCount <= 2) return 'swap'
      if (instructionCount >= 4) return 'add_liquidity'
      return 'meteora_action'
    } else if (protocol === 'sanctum') {
      return 'stake_lst'
    } else if (protocol === 'magic-eden') {
      return 'nft_trade'
    }

    return 'unknown'
  }

  /**
   * Store parsed transaction in database
   */
  private async storeTransaction(parsed: ParsedTransaction): Promise<boolean> {
    try {
      const { error } = await supabase.from('user_transactions').insert({
        wallet_id: parsed.walletId,
        protocol_id: parsed.protocolId,
        activity_id: parsed.activityId,
        tx_signature: parsed.signature,
        tx_type: parsed.txType,
        block_time: parsed.blockTime.toISOString(),
        status: parsed.status,
        metadata: parsed.metadata,
      })

      if (error) {
        console.error('Error storing transaction:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error storing transaction:', error)
      return false
    }
  }

  /**
   * Get transactions for a wallet from database
   */
  async getWalletTransactions(
    walletId: string,
    limit: number = 50,
    protocolSlug?: string
  ) {
    try {
      let query = supabase
        .from('user_transactions')
        .select(
          `
          *,
          protocols (name, slug)
        `
        )
        .eq('wallet_id', walletId)
        .order('block_time', { ascending: false })
        .limit(limit)

      if (protocolSlug) {
        query = query.eq('protocols.slug', protocolSlug)
      }

      const { data, error } = await query

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching transactions:', error)
      return []
    }
  }

  /**
   * Get transaction statistics for a wallet
   */
  async getTransactionStats(walletId: string, protocolSlug?: string) {
    try {
      let query = supabase
        .from('user_transactions')
        .select('tx_type, status, block_time')
        .eq('wallet_id', walletId)

      if (protocolSlug) {
        const protocolId = await this.getProtocolId(protocolSlug)
        if (protocolId) {
          query = query.eq('protocol_id', protocolId)
        }
      }

      const { data, error } = await query

      if (error) throw error

      const now = new Date()
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      return {
        total: data?.length || 0,
        last7Days:
          data?.filter((tx) => new Date(tx.block_time) > last7Days).length || 0,
        last30Days:
          data?.filter((tx) => new Date(tx.block_time) > last30Days).length ||
          0,
        successful:
          data?.filter((tx) => tx.status === 'success').length || 0,
        failed: data?.filter((tx) => tx.status === 'failed').length || 0,
        byType: this.groupByType(data || []),
      }
    } catch (error) {
      console.error('Error fetching transaction stats:', error)
      return null
    }
  }

  private groupByType(transactions: any[]): Record<string, number> {
    const grouped: Record<string, number> = {}
    transactions.forEach((tx) => {
      grouped[tx.tx_type] = (grouped[tx.tx_type] || 0) + 1
    })
    return grouped
  }

  /**
   * Get last sync time for a wallet
   */
  async getLastSyncTime(walletId: string): Promise<Date | null> {
    try {
      const { data, error } = await supabase
        .from('user_transactions')
        .select('parsed_at')
        .eq('wallet_id', walletId)
        .order('parsed_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return null
      return new Date(data.parsed_at)
    } catch {
      return null
    }
  }
}

// Create singleton instance
export const transactionParser = new TransactionParser(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com'
)


