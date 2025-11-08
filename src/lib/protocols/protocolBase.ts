import { Connection, PublicKey } from '@solana/web3.js'
import {
  Position,
  Transaction,
  FarmingOpportunity,
  AutomatedAction,
  TransactionResult,
  ProtocolStats,
} from './types'

/**
 * Base class for all protocol services
 * Each protocol (Meteora, Jupiter, Sanctum, Magic Eden) extends this
 */
export abstract class ProtocolService {
  protected connection: Connection
  protected protocolName: string
  protected programIds: string[]

  constructor(
    connection: Connection,
    protocolName: string,
    programIds: string[]
  ) {
    this.connection = connection
    this.protocolName = protocolName
    this.programIds = programIds
  }

  /**
   * Detect active positions for a wallet in this protocol
   */
  abstract detectPositions(walletAddress: string): Promise<Position[]>

  /**
   * Get recent transactions for a wallet on this protocol
   */
  abstract getRecentTransactions(
    walletAddress: string,
    days: number
  ): Promise<Transaction[]>

  /**
   * Get available farming opportunities for this protocol
   */
  abstract getFarmingOpportunities(): Promise<FarmingOpportunity[]>

  /**
   * Get protocol-specific statistics for a wallet
   */
  abstract getProtocolStats(walletAddress: string): Promise<ProtocolStats>

  /**
   * Execute an automated action (if supported)
   */
  abstract executeAutomatedAction(
    action: AutomatedAction
  ): Promise<TransactionResult>

  /**
   * Check if wallet has recent activity on this protocol
   */
  async hasRecentActivity(
    walletAddress: string,
    days: number = 7
  ): Promise<boolean> {
    const transactions = await this.getRecentTransactions(walletAddress, days)
    return transactions.length > 0
  }

  /**
   * Get protocol name
   */
  getProtocolName(): string {
    return this.protocolName
  }

  /**
   * Get program IDs for this protocol
   */
  getProgramIds(): string[] {
    return this.programIds
  }

  /**
   * Helper: Check if a transaction involves this protocol's programs
   */
  protected isProtocolTransaction(programIds: string[]): boolean {
    return this.programIds.some((id) =>
      programIds.some(
        (txProgramId) => txProgramId.toLowerCase() === id.toLowerCase()
      )
    )
  }

  /**
   * Helper: Convert lamports to SOL
   */
  protected lamportsToSol(lamports: number): number {
    return lamports / 1e9
  }

  /**
   * Helper: Convert SOL to lamports
   */
  protected solToLamports(sol: number): number {
    return Math.floor(sol * 1e9)
  }

  /**
   * Helper: Format public key safely
   */
  protected formatPublicKey(key: string | PublicKey): string {
    if (typeof key === 'string') return key
    return key.toBase58()
  }
}


