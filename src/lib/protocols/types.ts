// Type definitions for protocol services

export interface Position {
  protocol: string
  positionType: 'liquidity' | 'staking' | 'token' | 'nft' | 'lending'
  value: number
  valueUSD?: number
  details: Record<string, any>
  lastUpdated: Date
}

export interface Transaction {
  signature: string
  blockTime: Date
  type: string
  status: 'success' | 'failed' | 'pending'
  protocol: string
  metadata: Record<string, any>
}

export interface FarmingOpportunity {
  id: string
  protocol: string
  activityType: string
  name: string
  description: string
  pointsValue: number
  automationLevel: 'full' | 'partial' | 'manual'
  estimatedTime?: string
  requirements?: string[]
  actionUrl?: string
}

export interface AutomatedAction {
  type: string
  protocol: string
  params: Record<string, any>
  walletAddress: string
  maxGas?: number
  slippage?: number
}

export interface TransactionResult {
  success: boolean
  signature?: string
  error?: string
  message: string
}

export interface ProtocolStats {
  totalTransactions: number
  lastActivityDate?: Date
  totalVolume?: number
  activePositions: number
  farmingScore: number
}


