'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, ParsedAccountData } from '@solana/web3.js'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

interface Transaction {
  id: string
  tx_type: string
  sol_change: number
  usdc_change: number
  total_usd: string
  block_time: number
  signature: string
  position_nft_address: string
}

interface Position {
  id: string
  position_address: string
  pool_name: string
  token_x: string
  token_y: string
  value_usd: number
  unclaimed_fees: number
  apr_24h: number
  is_in_range: boolean
  opened_at: Date
}

export default function PortfolioPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [solBalance, setSolBalance] = useState(0)
  const [usdcBalance, setUsdcBalance] = useState(0)
  const [solPriceUSD, setSolPriceUSD] = useState(190)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'opens' | 'closes' | 'fees'>('all')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [loadingBalances, setLoadingBalances] = useState(false)
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
    }
    checkUser()
  }, [router])

  useEffect(() => {
    if (user && connected && publicKey) {
      fetchBalances()
      loadTransactions()
      loadPositions()
    }
  }, [user, connected, publicKey])

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
      console.warn('Failed to fetch SOL price')
    }
  }

  const fetchBalances = async () => {
    if (!publicKey) return
    setLoadingBalances(true)

    try {
      const balance = await connection.getBalance(publicKey)
      setSolBalance(balance / 1e9)

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      )
      
      const usdcAccount = tokenAccounts.value.find(account => {
        const parsedInfo = (account.account.data as ParsedAccountData).parsed.info
        return parsedInfo.mint === USDC_MINT
      })
      
      if (usdcAccount) {
        setUsdcBalance((usdcAccount.account.data as ParsedAccountData).parsed.info.tokenAmount.uiAmount || 0)
      }
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setLoadingBalances(false)
    }
  }

  const loadTransactions = async () => {
    if (!user || !publicKey) return

    try {
      const { data, error } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', publicKey.toBase58())
        .order('block_time', { ascending: false })

      if (data && !error) {
        setTransactions(data)
      }
    } catch (error) {
      console.error('Error loading transactions:', error)
    }
  }

  const loadPositions = async () => {
    if (!user || !publicKey) return

    try {
      const { data: txData } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', publicKey.toBase58())

      if (!txData) return

      // Calculate active positions from transactions
      const opens = txData.filter(tx => tx.tx_type === 'position_open')
      const closes = txData.filter(tx => tx.tx_type === 'position_close')

      const openedPositions = new Set(opens.map(tx => tx.position_nft_address).filter(Boolean))
      const closedPositions = new Set(closes.map(tx => tx.position_nft_address).filter(Boolean))
      const activePositionAddresses = Array.from(openedPositions).filter(addr => !closedPositions.has(addr))

      const activePositions: Position[] = activePositionAddresses.map(addr => {
        const openTx = opens
          .filter(tx => tx.position_nft_address === addr)
          .sort((a, b) => (b?.block_time || 0) - (a?.block_time || 0))[0]
        
        return {
          id: addr,
          position_address: addr,
          pool_name: openTx?.position_data?.pool_name || 'SOL-USDC',
          token_x: 'SOL',
          token_y: 'USDC',
          value_usd: parseFloat(openTx?.total_usd || '0'),
          unclaimed_fees: 0,
          apr_24h: 0,
          is_in_range: true,
          opened_at: new Date(openTx?.block_time * 1000 || Date.now()),
        }
      })

      setPositions(activePositions)
    } catch (error) {
      console.error('Error loading positions:', error)
    }
  }

  const syncWallet = async () => {
    if (!publicKey || !user) return
    setSyncing(true)
    setSyncStatus('Scanning wallet for Meteora transactions...')

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.')
      }

      const response = await fetch('/api/wallet/sync-meteora', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          walletAddress: publicKey.toBase58(),
          limit: 30,
          delayMs: 300
        }),
      })

      const responseText = await response.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch {
        throw new Error('Invalid response from server')
      }

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }

      setSyncStatus(`Found ${data.meteoraTransactions || 0} Meteora transactions`)
      
      // Reload data
      await loadTransactions()
      await loadPositions()
      await fetchBalances()
      
      setTimeout(() => setSyncStatus(''), 3000)
    } catch (error: any) {
      console.error('Sync error:', error)
      setSyncStatus(`Error: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const clearAndResync = async () => {
    if (!publicKey || !user) return
    if (!confirm('This will clear all transaction history and re-scan your wallet. Continue?')) return

    setSyncing(true)
    setSyncStatus('Clearing old data...')

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.')
      }

      const clearResponse = await fetch('/api/wallet/clear-transactions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      })

      if (!clearResponse.ok) {
        const errorText = await clearResponse.text()
        throw new Error(`Clear failed: ${errorText}`)
      }

      setSyncStatus('Re-scanning wallet...')
      await syncWallet()
    } catch (error: any) {
      console.error('Clear & resync error:', error)
      setSyncStatus(`Error: ${error.message}`)
      setSyncing(false)
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    if (historyFilter === 'all') return true
    if (historyFilter === 'opens') return tx.tx_type === 'position_open'
    if (historyFilter === 'closes') return tx.tx_type === 'position_close'
    if (historyFilter === 'fees') return tx.tx_type === 'fee_claim'
    return true
  })

  // Calculate P&L
  const totalInvested = transactions
    .filter(tx => tx.tx_type === 'position_open')
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)
  
  const totalWithdrawn = transactions
    .filter(tx => tx.tx_type === 'position_close')
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)
  
  const totalFees = transactions
    .filter(tx => tx.tx_type === 'fee_claim')
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)

  const currentPositionValue = positions.reduce((sum, pos) => sum + pos.value_usd, 0)
  const totalPnL = (currentPositionValue + totalWithdrawn + totalFees) - totalInvested
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-cyan-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    )
  }

  const totalValueUSD = (solBalance * solPriceUSD) + usdcBalance

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              💎 Portfolio
            </h1>
            <p className="text-slate-400 mt-1">
              Track your positions, balances, and transaction history
            </p>
          </div>
          
          {connected && (
            <div className="flex items-center gap-3">
              <button
                onClick={fetchBalances}
                disabled={loadingBalances}
                className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 rounded-xl text-sm font-medium transition-all border border-slate-700/50"
              >
                {loadingBalances ? '↻' : '↻'} Refresh
              </button>
              <button
                onClick={syncWallet}
                disabled={syncing}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : '🔄 Sync Wallet'}
              </button>
            </div>
          )}
        </div>

        {/* Sync Status */}
        {syncStatus && (
          <div className={`p-4 rounded-xl border ${
            syncStatus.includes('Error') 
              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
              : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
          }`}>
            {syncStatus}
          </div>
        )}

        {/* Wallet Not Connected */}
        {!connected && (
          <div className="bg-gradient-to-br from-cyan-500/10 to-violet-500/10 rounded-2xl border border-cyan-500/20 p-8 text-center">
            <span className="text-4xl mb-4 block">🔌</span>
            <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
            <p className="text-slate-400">Connect your Solana wallet to view your portfolio</p>
          </div>
        )}

        {connected && (
          <>
            {/* Wallet Balances Card */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                👛 Wallet Balances
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* SOL */}
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🟡</span>
                    <span className="text-slate-400 text-sm">SOL</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{solBalance.toFixed(4)}</p>
                  <p className="text-slate-400 text-sm">${(solBalance * solPriceUSD).toFixed(2)}</p>
                </div>
                
                {/* USDC */}
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">💵</span>
                    <span className="text-slate-400 text-sm">USDC</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{usdcBalance.toFixed(2)}</p>
                  <p className="text-slate-400 text-sm">${usdcBalance.toFixed(2)}</p>
                </div>
                
                {/* Total */}
                <div className="bg-gradient-to-br from-cyan-500/10 to-violet-500/10 rounded-xl p-4 border border-cyan-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">💰</span>
                    <span className="text-slate-400 text-sm">Total Value</span>
                  </div>
                  <p className="text-2xl font-bold text-white">${totalValueUSD.toFixed(2)}</p>
                  <p className="text-slate-400 text-sm">@ ${solPriceUSD.toFixed(2)}/SOL</p>
                </div>
              </div>
            </div>

            {/* P&L Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1">Total Invested</p>
                <p className="text-xl font-bold text-white">${totalInvested.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1">Total Withdrawn</p>
                <p className="text-xl font-bold text-white">${totalWithdrawn.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1">Fees Earned</p>
                <p className="text-xl font-bold text-emerald-400">${totalFees.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1">Current Position</p>
                <p className="text-xl font-bold text-white">${currentPositionValue.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-4 border ${totalPnL >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <p className="text-slate-400 text-xs mb-1">Total P&L</p>
                <p className={`text-xl font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} ({pnlPercent.toFixed(1)}%)
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-800/30 rounded-xl border border-slate-700/50 w-fit">
              <button
                onClick={() => setActiveTab('positions')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'positions'
                    ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                💎 Positions ({positions.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                📜 History ({transactions.length})
              </button>
            </div>

            {/* Positions Tab */}
            {activeTab === 'positions' && (
              <div className="space-y-4">
                {positions.length > 0 ? (
                  positions.map((position) => (
                    <div key={position.id} className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center">
                            <span className="text-xl">💎</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">{position.pool_name}</h3>
                            <p className="text-slate-400 text-sm">Meteora DLMM</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            position.is_in_range 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {position.is_in_range ? '● In Range' : '○ Out of Range'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-slate-500 text-xs">Value</p>
                          <p className="text-white font-semibold">${position.value_usd.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Unclaimed Fees</p>
                          <p className="text-emerald-400 font-semibold">${position.unclaimed_fees.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">24h APR</p>
                          <p className="text-white font-semibold">{position.apr_24h.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Opened</p>
                          <p className="text-white font-semibold">{position.opened_at.toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700/50">
                        <button className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl text-sm font-medium transition-colors">
                          Claim Fees
                        </button>
                        <a
                          href={`https://app.meteora.ag/dlmm`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                        >
                          View on Meteora ↗
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-12 text-center">
                    <span className="text-4xl mb-4 block">📭</span>
                    <p className="text-white font-semibold mb-1">No Active Positions</p>
                    <p className="text-slate-400 text-sm mb-4">Sync your wallet or start farming to see positions here</p>
                    <button
                      onClick={syncWallet}
                      disabled={syncing}
                      className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {syncing ? 'Syncing...' : '🔄 Sync Wallet'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {/* History Filter */}
                <div className="flex items-center gap-2">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'opens', label: 'Opens' },
                    { key: 'closes', label: 'Closes' },
                    { key: 'fees', label: 'Fees' },
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setHistoryFilter(filter.key as any)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        historyFilter === filter.key
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    onClick={clearAndResync}
                    disabled={syncing}
                    className="px-3 py-1.5 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                  >
                    Clear & Re-sync
                  </button>
                </div>

                {/* Transaction List */}
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
                  {filteredTransactions.length > 0 ? (
                    <div className="divide-y divide-slate-700/50">
                      {filteredTransactions.map((tx) => (
                        <div key={tx.id} className="p-4 hover:bg-slate-800/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">
                                {tx.tx_type === 'position_open' ? '📈' : 
                                 tx.tx_type === 'position_close' ? '📉' : 
                                 tx.tx_type === 'fee_claim' ? '💰' : '📋'}
                              </span>
                              <div>
                                <p className="text-white font-medium">
                                  {tx.tx_type === 'position_open' ? 'Position Opened' :
                                   tx.tx_type === 'position_close' ? 'Position Closed' :
                                   tx.tx_type === 'fee_claim' ? 'Fees Claimed' : tx.tx_type}
                                </p>
                                <p className="text-slate-500 text-xs">
                                  {new Date(tx.block_time * 1000).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${
                                tx.tx_type === 'position_open' ? 'text-red-400' :
                                tx.tx_type === 'position_close' || tx.tx_type === 'fee_claim' ? 'text-emerald-400' : 'text-white'
                              }`}>
                                {tx.tx_type === 'position_open' ? '-' : '+'}${Math.abs(parseFloat(tx.total_usd) || 0).toFixed(2)}
                              </p>
                              <a
                                href={`https://solscan.io/tx/${tx.signature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 text-xs"
                              >
                                View on Solscan ↗
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center">
                      <span className="text-4xl mb-4 block">📭</span>
                      <p className="text-white font-semibold mb-1">No Transactions Found</p>
                      <p className="text-slate-400 text-sm">Sync your wallet to load transaction history</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

