/**
 * Sanctum Protocol Implementation (MCP Server)
 *
 * Purpose:
 * - Provide protocol-level data needed by the Airdrop Tracker.
 * - For now we expose LST holdings (e.g. INF) as "protocol data".
 *
 * Note:
 * - MCP server `Position` type is LP-centric. For Sanctum we usually don't have LP positions.
 * - We therefore return `getPositions()` as empty and provide `getProtocolData()` for useful data.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { BaseProtocol } from './base-protocol'
import { Position, TransactionResult, ClaimFeesParams, RebalanceParams, OpenPositionParams } from '../types'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

// Minimal LST registry (extend as needed)
const SANCTUM_LSTS: Record<string, { symbol: string; solRate?: number }> = {
  // INF / Infinity (commonly used by this app)
  '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': { symbol: 'INF', solRate: 1.38 },
  INFp2k2GLVEA8Wvs4mEyDA1LBKHA3HfHx3X8pKNF4Qf: { symbol: 'INF', solRate: 1.38 },
  // Common LSTs
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: { symbol: 'bSOL' },
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT': { symbol: 'stSOL' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL' },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JitoSOL' },
}

export type SanctumHolding = {
  mint: string
  symbol: string
  amount: number
  solEquivalent?: number
}

export type SanctumProtocolData = {
  protocol: 'sanctum'
  walletAddress: string
  holdings: SanctumHolding[]
  lastUpdated: string
}

export class SanctumProtocol extends BaseProtocol {
  constructor(connection: Connection) {
    super(connection, 'sanctum')
  }

  /**
   * Sanctum does not expose LP-like "positions" in most cases (LSTs are holdings).
   * Return empty for now; use getProtocolData instead.
   */
  async getPositions(_walletAddress: string): Promise<Position[]> {
    return []
  }

  async buildClaimFeesTransaction(_params: ClaimFeesParams): Promise<TransactionResult> {
    return { success: false, error: 'Sanctum claim fees not supported via MCP yet' }
  }

  async buildRebalanceTransaction(_params: RebalanceParams): Promise<TransactionResult> {
    return { success: false, error: 'Sanctum rebalance not supported via MCP yet' }
  }

  async buildOpenPositionTransaction(_params: OpenPositionParams): Promise<TransactionResult> {
    return { success: false, error: 'Sanctum open position not supported via MCP yet' }
  }

  /**
   * Protocol-level data used by the dashboard.
   */
  async getProtocolData(walletAddress: string): Promise<SanctumProtocolData> {
    const owner = new PublicKey(walletAddress)
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey(TOKEN_PROGRAM),
    })

    const holdings: SanctumHolding[] = []
    for (const acc of tokenAccounts.value) {
      const info = (acc.account.data as any).parsed?.info
      const mint = info?.mint as string | undefined
      const uiAmount = Number(info?.tokenAmount?.uiAmount || 0)
      if (!mint || uiAmount <= 0) continue

      const lst = SANCTUM_LSTS[mint]
      if (!lst) continue

      holdings.push({
        mint,
        symbol: lst.symbol,
        amount: uiAmount,
        solEquivalent: lst.solRate ? uiAmount * lst.solRate : undefined,
      })
    }

    return {
      protocol: 'sanctum',
      walletAddress,
      holdings,
      lastUpdated: new Date().toISOString(),
    }
  }
}

