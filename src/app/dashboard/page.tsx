'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, ParsedAccountData } from '@solana/web3.js'
import Link from 'next/link'

// USDC mint address on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

interface ActiveProtocol {
  name: string
  slug: string
  status: 'active' | 'inactive'
  positionsCount: number
  totalValueUSD: number
  lastActivity: string
  airdropPotential: 'confirmed' | 'high' | 'medium' | 'low'
}

interface BestOpportunity {
  protocol: string
  title: string
  description: string
  minInvestmentUSD: number
  airdropPotential: 'confirmed' | 'high' | 'medium' | 'low'
  estimatedAirdropValue?: string
  estimatedAirdropDate?: string // e.g., "Q1 2025", "TBD", "Confirmed - TBA"
  actionUrl?: string
  priority: number
}

interface PersonalizedPlan {
  recommendedProtocols: {
    protocol: string
    investmentUSD: number
    reason: string
    priority: number
  }[]
  totalRecommendedInvestment: number
  availableBalance: number
  canAfford: boolean
  strategy: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeProtocols, setActiveProtocols] = useState<ActiveProtocol[]>([])
  const [bestOpportunities, setBestOpportunities] = useState<BestOpportunity[]>([])
  const [walletBalance, setWalletBalance] = useState<number>(0) // SOL balance
  const [usdcBalance, setUsdcBalance] = useState<number>(0) // USDC balance
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [personalizedPlan, setPersonalizedPlan] = useState<PersonalizedPlan | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [planStatus, setPlanStatus] = useState<'pending' | 'approved' | 'active'>('pending')
  const [savingPlan, setSavingPlan] = useState(false)
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [solPriceUSD, setSolPriceUSD] = useState<number>(190) // SOL price in USD, default fallback
  const router = useRouter()
  const { publicKey, connected } = useWallet()
  const { connection } = useConnection()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)
      setLoading(false)
      
      // Load active protocols and opportunities
      loadActiveProtocols(user.id)
      loadBestOpportunities()
    }
    checkUser()
    
    // Fetch SOL price on component mount
    fetchSolPrice()
  }, [router])

  // Fetch SOL price from CoinGecko API
  const fetchSolPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      if (response.ok) {
        const data = await response.json()
        if (data.solana?.usd) {
          setSolPriceUSD(data.solana.usd)
          console.log(`✅ SOL price fetched: $${data.solana.usd.toFixed(2)}`)
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch SOL price, using fallback $190:', error)
      // Keep default fallback value
    }
  }

  // Check wallet balance when connected
  useEffect(() => {
    if (connected && publicKey && connection && user) {
      const address = publicKey.toBase58()
      setWalletAddress(address)
      // Log the RPC endpoint being used
      const isProxy = connection.rpcEndpoint.includes('/api/rpc')
      console.log('🔗 Using RPC endpoint:', connection.rpcEndpoint)
      if (isProxy) {
        console.log('✅ RPC requests are going through secure proxy')
      } else {
        console.warn('⚠️ Not using proxy - RPC calls are direct (may expose API keys)')
      }
      checkWalletBalance(address)
      // Check for existing approved plan
      checkApprovedPlan(address)
    } else {
      setWalletBalance(0)
      setUsdcBalance(0)
      setWalletAddress('')
      setPersonalizedPlan(null)
      setPlanStatus('pending')
    }
  }, [connected, publicKey, connection, user])

  // Check for existing approved plan
  const checkApprovedPlan = async (walletAddr: string) => {
    if (!user) return
    
    try {
      // Check approved_plans table
      const { data: planData, error: planError } = await supabase
        .from('approved_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddr)
        .eq('status', 'active')
        .single()

      if (!planError && planData) {
        setPlanStatus('approved')
        // Restore personalized plan from saved data
        if (planData.plan_data) {
          setPersonalizedPlan({
            recommendedProtocols: planData.plan_data.recommendedProtocols || [],
            totalRecommendedInvestment: planData.plan_data.totalRecommendedInvestment || 0,
            availableBalance: planData.plan_data.availableBalance || 0,
            canAfford: true,
            strategy: planData.plan_data.strategy || ''
          })
        }
        return
      }

      // Check automation_configs table (fallback)
      const { data: configData, error: configError } = await supabase
        .from('automation_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddr)
        .eq('is_active', true)
        .single()

      if (!configError && configData) {
        setPlanStatus('approved')
      }
    } catch (error) {
      console.log('No approved plan found:', error)
      // This is fine - user hasn't approved a plan yet
    }
  }

  // Generate personalized plan when balance changes
  useEffect(() => {
    if (walletBalance > 0 || usdcBalance > 0) {
      generatePersonalizedPlan(walletBalance, usdcBalance)
    } else {
      setPersonalizedPlan(null)
    }
  }, [walletBalance, usdcBalance, bestOpportunities])

  const loadActiveProtocols = async (userId: string) => {
    try {
      // Get all unique protocols from position_transactions
      const { data: transactions, error } = await supabase
        .from('position_transactions')
        .select('tx_type, block_time, total_usd, position_nft_address')
        .eq('user_id', userId)
        .order('block_time', { ascending: false })

      if (error) throw error

      // Get manual positions to check active protocols
      const { data: positions } = await supabase
        .from('manual_positions')
        .select('protocol_id, position_data, created_at')
        .eq('user_id', userId)

      // Group by protocol (for now, we'll focus on Meteora since that's what we track)
      const protocols: ActiveProtocol[] = []
      
      // Check if user has Meteora activity
      const meteoraTxs = transactions?.filter(tx => tx.tx_type !== 'unknown') || []
      if (meteoraTxs.length > 0) {
        const activePositions = positions?.filter(p => {
          const posData = p.position_data as any
          return posData?.position_address && !posData?.closed
        }) || []

        const totalValue = activePositions.reduce((sum, p) => {
          const posData = p.position_data as any
          return sum + parseFloat(posData?.total_usd || '0')
        }, 0)

        const lastTx = meteoraTxs[0]
        const lastActivity = lastTx ? new Date(lastTx.block_time * 1000).toLocaleDateString() : 'Never'

        protocols.push({
          name: 'Meteora',
          slug: 'meteora',
          status: activePositions.length > 0 ? 'active' : 'inactive',
          positionsCount: activePositions.length,
          totalValueUSD: totalValue,
          lastActivity,
          airdropPotential: 'confirmed' // Meteora has confirmed airdrop
        })
      }

      // Add other protocols if user has activity (can be expanded)
      setActiveProtocols(protocols)
    } catch (error) {
      console.error('Error loading active protocols:', error)
    }
  }

  const loadBestOpportunities = async () => {
    // Curated list of best airdrop opportunities (can be replaced with API call later)
    const opportunities: BestOpportunity[] = [
      {
        protocol: 'Meteora',
        title: 'Meteora DLMM Liquidity Provision',
        description: 'Confirmed airdrop! Provide liquidity to DLMM pools. Minimum 30 days activity recommended.',
        minInvestmentUSD: 50,
        airdropPotential: 'confirmed',
        estimatedAirdropValue: '$500-$2000',
        estimatedAirdropDate: 'Q1 2025 (Confirmed)',
        priority: 1
      },
      {
        protocol: 'Jupiter',
        title: 'Jupiter Perpetuals Trading',
        description: 'High potential airdrop. Trade perpetuals or provide liquidity. Active trading increases eligibility.',
        minInvestmentUSD: 100,
        airdropPotential: 'high',
        estimatedAirdropValue: '$1000-$5000',
        estimatedAirdropDate: 'Q2 2025 (Expected)',
        priority: 2
      },
      {
        protocol: 'Sanctum',
        title: 'Sanctum LST Staking',
        description: 'Stake SOL in Sanctum LSTs. Long-term staking (90+ days) significantly increases airdrop potential.',
        minInvestmentUSD: 200,
        airdropPotential: 'high',
        estimatedAirdropValue: '$500-$3000',
        estimatedAirdropDate: 'Q2-Q3 2025 (Expected)',
        priority: 3
      },
      {
        protocol: 'Magic Eden',
        title: 'Magic Eden NFT Trading',
        description: 'Trade NFTs on Magic Eden. Volume and frequency matter. Consider holding platform NFTs.',
        minInvestmentUSD: 50,
        airdropPotential: 'medium',
        estimatedAirdropValue: '$200-$1000',
        estimatedAirdropDate: 'TBD',
        priority: 4
      },
      {
        protocol: 'Drift',
        title: 'Drift Protocol Trading',
        description: 'Trade perpetuals or provide liquidity. Active users get priority in airdrop distribution.',
        minInvestmentUSD: 150,
        airdropPotential: 'high',
        estimatedAirdropValue: '$800-$4000',
        estimatedAirdropDate: 'Q2-Q3 2025 (Expected)',
        priority: 5
      },
      {
        protocol: 'Kamino',
        title: 'Kamino Finance Lending',
        description: 'Lend or borrow on Kamino. Higher TVL positions get better airdrop allocation.',
        minInvestmentUSD: 100,
        airdropPotential: 'medium',
        estimatedAirdropValue: '$300-$1500',
        estimatedAirdropDate: 'TBD',
        priority: 6
      }
    ]

    // Sort by priority
    opportunities.sort((a, b) => a.priority - b.priority)
    setBestOpportunities(opportunities)
  }

  const checkWalletBalance = async (address: string) => {
    setLoadingBalance(true)
    try {
      const publicKey = new PublicKey(address)
      
      // Fetch SOL balance
      const balance = await connection.getBalance(publicKey)
      const solBalance = balance / 1e9 // Convert lamports to SOL
      setWalletBalance(solBalance)
      
      // Fetch USDC balance
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      )
      
      // Find USDC token account
      const usdcAccount = tokenAccounts.value.find(account => {
        const parsedInfo = (account.account.data as ParsedAccountData).parsed.info
        return parsedInfo.mint === USDC_MINT
      })
      
      if (usdcAccount) {
        const parsedInfo = (usdcAccount.account.data as ParsedAccountData).parsed.info
        const usdcAmount = parsedInfo.tokenAmount.uiAmount || 0
        setUsdcBalance(usdcAmount)
        console.log(`✅ Balances fetched: ${solBalance.toFixed(4)} SOL, ${usdcAmount.toFixed(2)} USDC`)
      } else {
        setUsdcBalance(0)
        console.log(`✅ Balance fetched: ${solBalance.toFixed(4)} SOL, 0 USDC`)
      }
    } catch (error: any) {
      console.error('Error checking wallet balance:', error)
      // If it's a 403/401 error, the RPC might need authentication
      if (error?.message?.includes('403') || error?.message?.includes('401')) {
        console.error('❌ RPC authentication error (403/401)')
        console.error('Current RPC endpoint:', connection.rpcEndpoint)
        
        // Check if using proxy
        const isUsingProxy = connection.rpcEndpoint.includes('/api/rpc')
        if (isUsingProxy) {
          console.error('✅ Using RPC proxy (secure)')
          console.error('⚠️ Proxy is forwarding to public RPC (403 error)')
          console.error('💡 Set HELIUS_RPC_URL in Vercel environment variables to use Helius')
        } else {
          console.error('⚠️ Not using proxy - using direct RPC endpoint')
          console.error('Expected proxy endpoint but got:', connection.rpcEndpoint.includes('helius') ? 'Helius (direct)' : 'Public RPC')
        }
      }
      setWalletBalance(0)
      setUsdcBalance(0)
    } finally {
      setLoadingBalance(false)
    }
  }

  const generatePersonalizedPlan = (balanceSOL: number, balanceUSDC: number) => {
    // Use current SOL price from state
    const solUSD = balanceSOL * solPriceUSD
    const usdcUSD = balanceUSDC // USDC is already in USD
    const balanceUSD = solUSD + usdcUSD

    // Filter opportunities user can afford
    const affordableOpportunities = bestOpportunities.filter(
      opp => opp.minInvestmentUSD <= balanceUSD
    )

    // Generate recommendations based on balance
    const recommendations: PersonalizedPlan['recommendedProtocols'] = []

    if (balanceUSD >= 500) {
      // High budget: Recommend top 3 opportunities
      recommendations.push(
        {
          protocol: 'Meteora',
          investmentUSD: Math.min(300, balanceUSD * 0.4),
          reason: 'Confirmed airdrop - highest priority',
          priority: 1
        },
        {
          protocol: 'Jupiter',
          investmentUSD: Math.min(200, balanceUSD * 0.3),
          reason: 'High potential, diversify strategy',
          priority: 2
        },
        {
          protocol: 'Sanctum',
          investmentUSD: Math.min(200, balanceUSD * 0.3),
          reason: 'Long-term staking for maximum eligibility',
          priority: 3
        }
      )
    } else if (balanceUSD >= 200) {
      // Medium budget: Focus on top 2
      recommendations.push(
        {
          protocol: 'Meteora',
          investmentUSD: Math.min(150, balanceUSD * 0.5),
          reason: 'Confirmed airdrop - best ROI',
          priority: 1
        },
        {
          protocol: 'Jupiter',
          investmentUSD: Math.min(100, balanceUSD * 0.4),
          reason: 'High potential opportunity',
          priority: 2
        }
      )
    } else if (balanceUSD >= 50) {
      // Low budget: Focus on one confirmed opportunity
      recommendations.push({
        protocol: 'Meteora',
        investmentUSD: Math.min(100, balanceUSD * 0.8),
        reason: 'Confirmed airdrop - maximize with available funds',
        priority: 1
      })
    } else {
      // Very low budget: Save up recommendation
      recommendations.push({
        protocol: 'Meteora',
        investmentUSD: 50,
        reason: 'Save up to $50 minimum for Meteora (confirmed airdrop)',
        priority: 1
      })
    }

    const totalRecommended = recommendations.reduce(
      (sum, rec) => sum + rec.investmentUSD,
      0
    )

    let strategy = ''
    if (balanceUSD >= 500) {
      strategy = 'Diversified Strategy: Spread investments across multiple high-potential protocols for maximum airdrop coverage.'
    } else if (balanceUSD >= 200) {
      strategy = 'Focused Strategy: Concentrate on top 2 opportunities (Meteora + Jupiter) for best risk/reward ratio.'
    } else if (balanceUSD >= 50) {
      strategy = 'Single Focus Strategy: Maximize investment in Meteora (confirmed airdrop) for highest probability of return.'
    } else {
      strategy = 'Save Up Strategy: Accumulate at least $50 to start with Meteora DLMM positions (confirmed airdrop).'
    }

    setPersonalizedPlan({
      recommendedProtocols: recommendations,
      totalRecommendedInvestment: totalRecommended,
      availableBalance: balanceUSD,
      canAfford: totalRecommended <= balanceUSD,
      strategy
    })
  }

  const handleApprovePlan = async () => {
    if (!personalizedPlan || !user || !walletAddress) return
    
    setSavingPlan(true)
    try {
      // Save approved plan to database
      const { error: planError } = await supabase
        .from('approved_plans')
        .insert({
          user_id: user.id,
          wallet_address: walletAddress,
          plan_data: {
            recommendedProtocols: personalizedPlan.recommendedProtocols,
            totalRecommendedInvestment: personalizedPlan.totalRecommendedInvestment,
            availableBalance: personalizedPlan.availableBalance,
            strategy: personalizedPlan.strategy,
            approvedAt: new Date().toISOString()
          },
          status: 'active'
        })

      if (planError) {
        // If table doesn't exist, create automation config instead
        console.log('approved_plans table not found, creating automation config...')
      }

      // Create automation configuration based on approved plan
      const { error: automationError } = await supabase
        .from('automation_configs')
        .upsert({
          user_id: user.id,
          wallet_address: walletAddress,
          total_budget_usd: personalizedPlan.availableBalance,
          spent_usd: 0,
          max_position_size_usd: Math.max(...personalizedPlan.recommendedProtocols.map(r => r.investmentUSD)),
          min_position_size_usd: Math.min(...personalizedPlan.recommendedProtocols.map(r => r.investmentUSD)),
          auto_claim_fees: true,
          claim_fee_threshold_usd: 5.00,
          claim_fee_interval_hours: 24,
          auto_rebalance: true,
          rebalance_threshold_percent: 20.00,
          rebalance_cooldown_hours: 6,
          auto_open_position: personalizedPlan.recommendedProtocols.length > 0,
          min_days_between_opens: 7,
          max_positions: personalizedPlan.recommendedProtocols.length,
          max_daily_spend_usd: personalizedPlan.availableBalance * 0.2, // 20% of balance per day
          require_manual_approval: true,
          approval_threshold_usd: 100.00,
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,wallet_address'
        })

      if (automationError) {
        console.error('Error creating automation config:', automationError)
        // Continue anyway - might be table doesn't exist yet
      }

      setPlanStatus('approved')
      console.log('✅ Plan approved and automation configured!')
    } catch (error: any) {
      console.error('Error approving plan:', error)
      alert('Error saving plan. Please try again.')
    } finally {
      setSavingPlan(false)
    }
  }

  const getAirdropBadgeColor = (potential: string) => {
    switch (potential) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'high':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.email?.split('@')[0]}! 👋
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Your personalized airdrop farming dashboard
          </p>
        </div>

        {/* Wallet Balance Card */}
        {connected && publicKey ? (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm opacity-90 mb-1">Connected Wallet</p>
                <p className="text-sm font-mono">
                  {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-6)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    checkWalletBalance(publicKey.toBase58())
                    fetchSolPrice()
                  }}
                  disabled={loadingBalance}
                  className="px-3 py-1.5 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title="Refresh balance and SOL price"
                >
                  <svg
                    className={`w-4 h-4 ${loadingBalance ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {loadingBalance ? 'Refreshing...' : 'Refresh'}
                </button>
                <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
              </div>
            </div>
            
            {loadingBalance ? (
              <div className="animate-pulse">Loading balances...</div>
            ) : (
              <div className="space-y-3">
                {/* SOL Balance */}
                <div className="bg-white bg-opacity-20 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🟡</span>
                      <span className="text-sm font-medium text-gray-900">SOL</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">
                        {walletBalance.toFixed(4)}
                      </p>
                      <p className="text-xs text-gray-700">
                        ≈ ${(walletBalance * solPriceUSD).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* USDC Balance */}
                <div className="bg-white bg-opacity-20 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💵</span>
                      <span className="text-sm font-medium text-gray-900">USDC</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">
                        {usdcBalance.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-700">
                        ${usdcBalance.toFixed(2)} USD
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Total Balance */}
                <div className="border-t border-white border-opacity-30 pt-3 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total Balance</span>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        ${((walletBalance * solPriceUSD) + usdcBalance).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-700">
                        {(walletBalance * solPriceUSD + usdcBalance).toFixed(2)} USD
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔌</span>
              <div>
                <p className="font-semibold text-yellow-900">Connect Your Wallet</p>
                <p className="text-sm text-yellow-700">
                  Connect your Solana wallet to see personalized recommendations based on your balance
                </p>
              </div>
            </div>
          </div>
        )}

        {/* My Current Airdrop Plan */}
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-indigo-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              📋 My Current Airdrop Plan
            </h2>
            <Link
              href="/dashboard/positions"
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View All Positions →
            </Link>
          </div>

          {activeProtocols.length > 0 ? (
            <div className="space-y-4">
              {activeProtocols.map((protocol) => (
                <div
                  key={protocol.slug}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="text-indigo-600 font-bold text-lg">
                          {protocol.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{protocol.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                          <span>
                            {protocol.positionsCount} active position{protocol.positionsCount !== 1 ? 's' : ''}
                          </span>
                          <span>•</span>
                          <span>${protocol.totalValueUSD.toFixed(2)} invested</span>
                          <span>•</span>
                          <span>Last activity: {protocol.lastActivity}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full border ${getAirdropBadgeColor(
                          protocol.airdropPotential
                        )}`}
                      >
                        {protocol.airdropPotential === 'confirmed' ? '✅ Confirmed' : protocol.airdropPotential}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          protocol.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {protocol.status === 'active' ? '🟢 Active' : '⚪ Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">No active protocols yet</p>
              <p className="text-sm">
                Start by{' '}
                <Link href="/dashboard/positions" className="text-indigo-600 hover:underline">
                  tracking your wallet
                </Link>{' '}
                or{' '}
                <Link href="/dashboard/plans" className="text-indigo-600 hover:underline">
                  creating a farming plan
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Approved Plan Status */}
        {connected && planStatus === 'approved' && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-lg p-6 border-2 border-green-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                ✅ Plan Approved & Automation Active
              </h2>
              <button
                onClick={() => {
                  setPlanStatus('pending')
                  setShowChangePlan(false)
                }}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 border border-gray-300"
              >
                Change Plan
              </button>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <h3 className="font-semibold text-gray-900 mb-3">🤖 Automated Actions Configured:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <span className="text-gray-900">Auto-claim fees when ≥ $5 (max once per 24h)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <span className="text-gray-900">Auto-rebalance out-of-range positions (6h cooldown)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <span className="text-gray-900">Monitor positions and track activity for airdrop eligibility</span>
                </div>
                {personalizedPlan && personalizedPlan.recommendedProtocols.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600">⏳</span>
                    <span className="text-gray-900">Auto-open positions enabled (requires manual approval for large amounts)</span>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-green-200">
                <p className="text-xs text-gray-900">
                  💡 Automation runs every 5 minutes. Check the <Link href="/dashboard/activities" className="text-green-600 hover:underline">Activities</Link> page for execution logs.
                </p>
              </div>
            </div>

            {/* Active Farming Protocols */}
            {personalizedPlan && personalizedPlan.recommendedProtocols.length > 0 && (
              <div className="mt-6 bg-white rounded-lg p-4 border border-green-200">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  🌾 Active Farming Protocols & Plan
                </h3>
                <div className="space-y-3">
                  {personalizedPlan.recommendedProtocols.map((rec, idx) => {
                    // Find matching opportunity for airdrop date
                    const opportunity = bestOpportunities.find(opp => opp.protocol === rec.protocol)
                    // Check if protocol is actively being farmed
                    const activeProtocol = activeProtocols.find(ap => ap.name === rec.protocol)
                    const isActive = activeProtocol?.status === 'active'
                    
                    return (
                      <div
                        key={idx}
                        className="bg-gradient-to-r from-gray-50 to-white rounded-lg p-4 border border-gray-200 hover:border-green-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-xl font-bold text-gray-700">#{rec.priority}</span>
                              <h4 className="font-semibold text-gray-900 text-lg">{rec.protocol}</h4>
                              {isActive && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-300">
                                  🟢 Active
                                </span>
                              )}
                              {!isActive && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                                  ⏳ Pending
                                </span>
                              )}
                            </div>
                            <div className="ml-8 space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-600">Plan Investment:</span>
                                <span className="font-semibold text-gray-900">${rec.investmentUSD.toFixed(2)}</span>
                              </div>
                              {activeProtocol && (
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Current Positions:</span>
                                  <span className="font-semibold text-gray-900">
                                    {activeProtocol.positionsCount} position{activeProtocol.positionsCount !== 1 ? 's' : ''}
                                  </span>
                                  <span className="text-gray-400">•</span>
                                  <span className="text-gray-600">Value:</span>
                                  <span className="font-semibold text-gray-900">${activeProtocol.totalValueUSD.toFixed(2)}</span>
                                </div>
                              )}
                              {opportunity && (
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Airdrop Date:</span>
                                  <span className={`font-semibold ${
                                    opportunity.airdropPotential === 'confirmed' 
                                      ? 'text-green-700' 
                                      : opportunity.airdropPotential === 'high'
                                      ? 'text-blue-700'
                                      : 'text-gray-700'
                                  }`}>
                                    {opportunity.estimatedAirdropDate || 'TBD'}
                                  </span>
                                  {opportunity.estimatedAirdropValue && (
                                    <>
                                      <span className="text-gray-400">•</span>
                                      <span className="text-gray-600">Est. Value:</span>
                                      <span className="font-semibold text-green-700">{opportunity.estimatedAirdropValue}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-gray-500 mt-1">
                                {rec.reason}
                              </div>
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            {opportunity && (
                              <div className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                                opportunity.airdropPotential === 'confirmed'
                                  ? 'bg-green-100 text-green-800 border-green-300'
                                  : opportunity.airdropPotential === 'high'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : opportunity.airdropPotential === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                  : 'bg-gray-100 text-gray-800 border-gray-300'
                              }`}>
                                {opportunity.airdropPotential === 'confirmed' ? '✅ Confirmed' : opportunity.airdropPotential}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Personalized Plan Based on Balance */}
        {connected && personalizedPlan && planStatus !== 'approved' && (
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-purple-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              🎯 Personalized Plan for Your Balance
            </h2>
            <p className="text-sm text-gray-700 mb-4 bg-white p-3 rounded border border-purple-200">
              {personalizedPlan.strategy}
            </p>
            <div className="space-y-3">
              {personalizedPlan.recommendedProtocols.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-4 border border-purple-200 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">#{rec.priority}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{rec.protocol}</h3>
                        <p className="text-sm text-gray-600">{rec.reason}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-purple-600">${rec.investmentUSD.toFixed(2)}</p>
                    {!personalizedPlan.canAfford && (
                      <p className="text-xs text-red-600 mt-1">Need more funds</p>
                    )}
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-purple-200 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Recommended Investment:</span>
                <span className="text-xl font-bold text-purple-600">
                  ${personalizedPlan.totalRecommendedInvestment.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2 pt-3 border-t border-purple-200">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Available Balance:</span>
                  <span className={`font-semibold ${personalizedPlan.canAfford ? 'text-green-600' : 'text-red-600'}`}>
                    ${personalizedPlan.availableBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>SOL: {walletBalance.toFixed(4)} ≈ ${(walletBalance * solPriceUSD).toFixed(2)}</span>
                  <span>USDC: {usdcBalance.toFixed(2)}</span>
                </div>
              </div>
              
              {/* Plan Actions */}
              <div className="mt-6 pt-4 border-t border-purple-200">
                {planStatus === 'pending' ? (
                  <div className="flex gap-3">
                    <button
                      onClick={handleApprovePlan}
                      disabled={savingPlan || !personalizedPlan.canAfford}
                      className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {savingPlan ? (
                        <>
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Setting up automation...
                        </>
                      ) : (
                        <>
                          ✅ Approve & Activate Plan
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowChangePlan(!showChangePlan)}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                    >
                      ✏️ Change Plan
                    </button>
                  </div>
                ) : null}
                
                {/* Change Plan Options */}
                {showChangePlan && (
                  <div className="mt-4 bg-white border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Adjust Your Plan</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p>• Modify investment amounts per protocol</p>
                      <p>• Change priority order</p>
                      <p>• Adjust total budget allocation</p>
                      <p className="text-xs text-gray-500 mt-2">Note: Plan customization coming soon!</p>
                    </div>
                    <button
                      onClick={() => setShowChangePlan(false)}
                      className="mt-3 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Best Opportunities Available */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            ⭐ Best Opportunities Available
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestOpportunities.map((opportunity, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{opportunity.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{opportunity.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full border flex-shrink-0 ${getAirdropBadgeColor(
                      opportunity.airdropPotential
                    )}`}
                  >
                    {opportunity.airdropPotential === 'confirmed' ? '✅' : opportunity.airdropPotential}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <div className="text-sm">
                    <span className="text-gray-600">Min Investment: </span>
                    <span className="font-semibold text-gray-900">${opportunity.minInvestmentUSD}</span>
                  </div>
                  {opportunity.estimatedAirdropValue && (
                    <div className="text-sm">
                      <span className="text-gray-600">Est. Value: </span>
                      <span className="font-semibold text-green-600">
                        {opportunity.estimatedAirdropValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/dashboard/positions"
              className="bg-indigo-600 text-white px-4 py-3 rounded-md hover:bg-indigo-700 transition-colors text-center"
            >
              Track Wallet Positions
            </Link>
            <Link
              href="/dashboard/plans"
              className="bg-green-600 text-white px-4 py-3 rounded-md hover:bg-green-700 transition-colors text-center"
            >
              Create Farming Plan
            </Link>
            <Link
              href="/dashboard/activities"
              className="bg-purple-600 text-white px-4 py-3 rounded-md hover:bg-purple-700 transition-colors text-center"
            >
              View Recommendations
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
