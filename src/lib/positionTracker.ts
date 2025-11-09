import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js'
import { getRpcUrl } from './rpc-config'

export interface TokenPosition {
  mint: string
  amount: number
  decimals: number
  uiAmount: number
  symbol?: string
  name?: string
}

export interface ProtocolPosition {
  protocol: string
  positionType: 'liquidity' | 'staking' | 'token' | 'nft'
  value: number
  details: any
}

export class PositionTracker {
  private connection: Connection | null = null
  private rpcEndpoint: string

  constructor(rpcEndpoint: string) {
    this.rpcEndpoint = rpcEndpoint
  }

  private getConnection(): Connection {
    if (!this.connection) {
      this.connection = new Connection(this.rpcEndpoint, 'confirmed')
    }
    return this.connection
  }

  /**
   * Get all SPL token accounts for a wallet
   */
  async getTokenAccounts(walletAddress: string): Promise<TokenPosition[]> {
    try {
      const publicKey = new PublicKey(walletAddress)
      const tokenAccounts = await this.getConnection().getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      )

      return tokenAccounts.value.map((account) => {
        const parsedInfo = (account.account.data as ParsedAccountData).parsed.info
        return {
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.amount,
          decimals: parsedInfo.tokenAmount.decimals,
          uiAmount: parsedInfo.tokenAmount.uiAmount,
        }
      }).filter(token => token.uiAmount > 0) // Only non-zero balances
    } catch (error) {
      console.error('Error fetching token accounts:', error)
      return []
    }
  }

  /**
   * Get SOL balance
   */
  async getSolBalance(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress)
      const balance = await this.getConnection().getBalance(publicKey)
      return balance / 1e9 // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching SOL balance:', error)
      return 0
    }
  }

  /**
   * Detect Meteora LP positions
   * Meteora LP tokens have specific characteristics
   */
  detectMeteoraPositions(tokens: TokenPosition[]): ProtocolPosition[] {
    // Meteora LP tokens typically have "DLMM" or specific naming patterns
    // This is a simplified detection - in production, you'd query Meteora's program
    const meteoraPositions: ProtocolPosition[] = []
    
    // TODO: Implement actual Meteora position detection
    // Would require querying Meteora's program accounts
    
    return meteoraPositions
  }

  /**
   * Detect Jupiter JUP token staking
   */
  detectJupiterPositions(tokens: TokenPosition[]): ProtocolPosition[] {
    const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
    const jupiterPositions: ProtocolPosition[] = []

    const jupToken = tokens.find(t => t.mint === JUP_MINT)
    if (jupToken && jupToken.uiAmount > 0) {
      jupiterPositions.push({
        protocol: 'Jupiter',
        positionType: 'token',
        value: jupToken.uiAmount,
        details: {
          token: 'JUP',
          amount: jupToken.uiAmount,
          mint: jupToken.mint
        }
      })
    }

    return jupiterPositions
  }

  /**
   * Detect Sanctum LST positions
   * Sanctum has various liquid staking tokens
   */
  detectSanctumPositions(tokens: TokenPosition[]): ProtocolPosition[] {
    // Known Sanctum LST mints
    const SANCTUM_LST_MINTS = [
      'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
      // Add more LST tokens as needed
    ]

    const sanctumPositions: ProtocolPosition[] = []

    tokens.forEach(token => {
      if (SANCTUM_LST_MINTS.includes(token.mint)) {
        sanctumPositions.push({
          protocol: 'Sanctum',
          positionType: 'staking',
          value: token.uiAmount,
          details: {
            lstToken: token.mint,
            amount: token.uiAmount,
            type: 'Liquid Staking Token'
          }
        })
      }
    })

    return sanctumPositions
  }

  /**
   * Get all protocol positions for a wallet
   */
  async getAllPositions(walletAddress: string): Promise<{
    solBalance: number
    tokens: TokenPosition[]
    protocolPositions: ProtocolPosition[]
  }> {
    const [solBalance, tokens] = await Promise.all([
      this.getSolBalance(walletAddress),
      this.getTokenAccounts(walletAddress)
    ])

    const protocolPositions = [
      ...this.detectMeteoraPositions(tokens),
      ...this.detectJupiterPositions(tokens),
      ...this.detectSanctumPositions(tokens),
    ]

    return {
      solBalance,
      tokens,
      protocolPositions
    }
  }
}

// Create a function that returns a PositionTracker instance with current RPC URL
// This ensures the RPC URL is read dynamically, not at module load time
export function getPositionTracker(): PositionTracker {
  return new PositionTracker(getRpcUrl())
}

// Export singleton for backward compatibility, but it will use dynamic RPC URL
// Note: This singleton will use the RPC URL from environment variables
let _positionTrackerInstance: PositionTracker | null = null

export const positionTracker = new Proxy({} as PositionTracker, {
  get(target, prop) {
    if (!_positionTrackerInstance) {
      _positionTrackerInstance = new PositionTracker(getRpcUrl())
    }
    const value = (_positionTrackerInstance as any)[prop]
    if (typeof value === 'function') {
      return value.bind(_positionTrackerInstance)
    }
    return value
  }
})

