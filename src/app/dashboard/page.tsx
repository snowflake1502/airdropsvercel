'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, ParsedAccountData } from '@solana/web3.js'
import Link from 'next/link'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

interface PortfolioStats {
  totalValueUSD: number
  solBalance: number
  usdcBalance: number
  activePositions: number
  totalPnL: number
  pendingAirdrops: number
  unclaimedFees: number
}

interface RecentActivity {
  id: string
  type: string
  description: string
  amount: string
  timestamp: Date
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PortfolioStats>({
    totalValueUSD: 0,
    solBalance: 0,
    usdcBalance: 0,
    activePositions: 0,
    totalPnL: 0,
    pendingAirdrops: 3,
    unclaimedFees: 0,
  })
  const [solPriceUSD, setSolPriceUSD] = useState(190)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
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
      fetchSolPrice()
      loadRecentActivity(user.id)
    }
    checkUser()
  }, [router])

  useEffect(() => {
    if (connected && publicKey && connection && user) {
      fetchPortfolioStats()
    }
  }, [connected, publicKey, connection, user, solPriceUSD])

  const fetchSolPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      if (response.ok) {
        const data = await response.json()
        if (data.solana?.usd) {
          setSolPriceUSD(data.solana.usd)
        }
      }
    } catch (error) {
      console.warn('Failed to fetch SOL price, using fallback')
    }
  }

  const fetchPortfolioStats = async () => {
    if (!publicKey || !user) return
    setLoadingStats(true)
    
    try {
      // Fetch SOL balance
      const balance = await connection.getBalance(publicKey)
      const solBalance = balance / 1e9

      // Fetch USDC balance
      let usdcBalance = 0
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        )
        const usdcAccount = tokenAccounts.value.find(account => {
          const parsedInfo = (account.account.data as ParsedAccountData).parsed.info
          return parsedInfo.mint === USDC_MINT
        })
        if (usdcAccount) {
          usdcBalance = (usdcAccount.account.data as ParsedAccountData).parsed.info.tokenAmount.uiAmount || 0
        }
      } catch (e) {
        console.error('Error fetching USDC:', e)
      }

      // Get active positions count and P&L from database
      const walletAddress = publicKey.toBase58()
      const { data: positions } = await supabase
        .from('manual_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const { data: transactions } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)

      // Calculate P&L
      const opens = transactions?.filter(tx => tx.tx_type === 'position_open') || []
      const closes = transactions?.filter(tx => tx.tx_type === 'position_close') || []
      const fees = transactions?.filter(tx => tx.tx_type === 'fee_claim') || []

      const totalInvested = opens.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)
      const totalWithdrawn = closes.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)
      const totalFees = fees.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)

      // Current position value estimation
      const openedPositions = new Set(opens.map(tx => tx.position_nft_address).filter(Boolean))
      const closedPositions = new Set(closes.map(tx => tx.position_nft_address).filter(Boolean))
      const activePositionAddresses = Array.from(openedPositions).filter(addr => !closedPositions.has(addr))

      let currentPositionValue = 0
      activePositionAddresses.forEach(posAddr => {
        const lastOpenTx = opens
          .filter(tx => tx.position_nft_address === posAddr)
          .sort((a, b) => (b?.block_time || 0) - (a?.block_time || 0))[0]
        if (lastOpenTx) {
          currentPositionValue += parseFloat(lastOpenTx.total_usd || '0')
        }
      })

      const totalPnL = (currentPositionValue + totalWithdrawn + totalFees) - totalInvested
      const totalValueUSD = (solBalance * solPriceUSD) + usdcBalance

      setStats({
        totalValueUSD,
        solBalance,
        usdcBalance,
        activePositions: activePositionAddresses.length,
        totalPnL,
        pendingAirdrops: 3, // Meteora, Jupiter, Sanctum
        unclaimedFees: totalFees,
      })
    } catch (error) {
      console.error('Error fetching portfolio stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const loadRecentActivity = async (userId: string) => {
    try {
      const { data: transactions } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('block_time', { ascending: false })
        .limit(5)

      if (transactions) {
        setRecentActivity(transactions.map(tx => ({
          id: tx.id,
          type: tx.tx_type,
          description: tx.tx_type === 'position_open' ? 'Position Opened' :
                      tx.tx_type === 'position_close' ? 'Position Closed' :
                      tx.tx_type === 'fee_claim' ? 'Fees Claimed' : 'Transaction',
          amount: `$${Math.abs(parseFloat(tx.total_usd) || 0).toFixed(2)}`,
          timestamp: new Date(tx.block_time * 1000),
        })))
      }
    } catch (error) {
      console.error('Error loading recent activity:', error)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-cyan-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back! 👋
            </h1>
            <p className="text-slate-400 mt-1">
              Here&apos;s your airdrop farming overview
            </p>
          </div>
          {connected && (
            <button
              onClick={fetchPortfolioStats}
              disabled={loadingStats}
              className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border border-slate-700/50"
            >
              <svg className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>

        {/* Portfolio Overview Card */}
        {connected && publicKey ? (
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Value */}
              <div className="md:col-span-2">
                <p className="text-slate-400 text-sm font-medium mb-1">Total Portfolio Value</p>
                <p className="text-4xl font-bold text-white">
                  ${stats.totalValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-1.5">
                    <span className="text-lg">🟡</span>
                    <span className="text-slate-300 text-sm font-medium">{stats.solBalance.toFixed(4)} SOL</span>
                    <span className="text-slate-500 text-xs">(${(stats.solBalance * solPriceUSD).toFixed(2)})</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-1.5">
                    <span className="text-lg">💵</span>
                    <span className="text-slate-300 text-sm font-medium">{stats.usdcBalance.toFixed(2)} USDC</span>
                  </div>
                </div>
              </div>

              {/* P&L */}
              <div className="flex flex-col justify-center">
                <p className="text-slate-400 text-sm font-medium mb-1">Total P&L</p>
                <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)} USD
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-cyan-500/10 to-violet-500/10 rounded-2xl border border-cyan-500/20 p-8 text-center">
            <span className="text-4xl mb-4 block">🔌</span>
            <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
            <p className="text-slate-400">Connect your Solana wallet to see your portfolio overview</p>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/portfolio" className="bg-slate-800/30 hover:bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">💎</span>
              <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-white">{stats.activePositions}</p>
            <p className="text-slate-400 text-sm">Active Positions</p>
          </Link>

          <Link href="/dashboard/discover" className="bg-slate-800/30 hover:bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🎯</span>
              <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-white">{stats.pendingAirdrops}</p>
            <p className="text-slate-400 text-sm">Pending Airdrops</p>
          </Link>

          <Link href="/dashboard/automation" className="bg-slate-800/30 hover:bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🤖</span>
              <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-emerald-400">Active</p>
            <p className="text-slate-400 text-sm">Automation Status</p>
          </Link>

          <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">💰</span>
            </div>
            <p className="text-2xl font-bold text-white">${stats.unclaimedFees.toFixed(2)}</p>
            <p className="text-slate-400 text-sm">Total Fees Earned</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Opportunity */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-2xl border border-emerald-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                🔥 Top Opportunity
              </h2>
              <Link href="/dashboard/discover" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View All →
              </Link>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Meteora DLMM</h3>
                  <p className="text-slate-400 text-sm">Provide liquidity to DLMM pools</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/30">
                  ✅ CONFIRMED
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm mb-4">
                <span className="text-slate-400">Est. Value: <span className="text-emerald-400 font-semibold">$500-2000</span></span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400">Q1 2025</span>
              </div>
              <Link 
                href="/dashboard/discover"
                className="block w-full text-center bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                Start Farming →
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                📊 Recent Activity
              </h2>
              <Link href="/dashboard/portfolio" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View All →
              </Link>
            </div>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {activity.type === 'position_open' ? '📈' : 
                         activity.type === 'position_close' ? '📉' : 
                         activity.type === 'fee_claim' ? '💰' : '📋'}
                      </span>
                      <div>
                        <p className="text-slate-200 text-sm font-medium">{activity.description}</p>
                        <p className="text-slate-500 text-xs">
                          {activity.timestamp.toLocaleDateString()} at {activity.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className="text-slate-300 font-medium">{activity.amount}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="text-3xl mb-2 block">📭</span>
                <p className="text-slate-400 text-sm">No recent activity</p>
                <p className="text-slate-500 text-xs mt-1">Start farming to see your transactions here</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/dashboard/portfolio"
              className="flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 transition-all group"
            >
              <span className="text-2xl">💎</span>
              <div>
                <p className="text-white font-medium group-hover:text-cyan-400 transition-colors">View Portfolio</p>
                <p className="text-slate-400 text-sm">Track positions & sync wallet</p>
              </div>
            </Link>
            <Link
              href="/dashboard/discover"
              className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-500/10 to-violet-500/5 rounded-xl border border-violet-500/20 hover:border-violet-500/40 transition-all group"
            >
              <span className="text-2xl">🎯</span>
              <div>
                <p className="text-white font-medium group-hover:text-violet-400 transition-colors">Discover Airdrops</p>
                <p className="text-slate-400 text-sm">Find new opportunities</p>
              </div>
            </Link>
            <Link
              href="/dashboard/automation"
              className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all group"
            >
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-white font-medium group-hover:text-emerald-400 transition-colors">Setup Automation</p>
                <p className="text-slate-400 text-sm">Auto-claim fees & rebalance</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
