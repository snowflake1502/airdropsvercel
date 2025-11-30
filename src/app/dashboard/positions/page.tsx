'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import WalletManager from '@/components/WalletManager'
import PositionTracker from '@/components/PositionTracker'
import { protocolManager, Position } from '@/lib/protocols'
import { positionTracker } from '@/lib/positionTracker'

export default function PositionsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<string>('')
  const [solBalance, setSolBalance] = useState(0)
  const [positions, setPositions] = useState<Position[]>([])
  const [farmingScore, setFarmingScore] = useState(0)
  const [manualPositions, setManualPositions] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [walletSyncAddress, setWalletSyncAddress] = useState('')
  const [walletSyncing, setWalletSyncing] = useState(false)
  const [walletSyncResult, setWalletSyncResult] = useState<any>(null)
  const [transactionHistory, setTransactionHistory] = useState<any[]>([])
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)
      setLoading(false)
      
      // Load manual positions
      loadManualPositions(user.id)
      
      // Load most recent wallet's transaction history
      loadMostRecentTransactionHistory(user.id)
    }
    checkUser()
  }, [router])

  // Sync Meteora position automatically
  const syncMeteoraPosition = async (positionAddress: string) => {
    setSyncing(true)
    setSyncError('')
    
    try {
      const response = await fetch('/api/meteora/sync-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionAddress }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to fetch position')
      }

      if (data.position) {
        // Get protocol ID for Meteora
        const { data: protocol } = await supabase
          .from('protocols')
          .select('id')
          .eq('slug', 'meteora')
          .single()

        if (!protocol) {
          throw new Error('Meteora protocol not found in database')
        }

        const position = data.position
        
        // Check if position is out of range (APR = 0 means no active earnings)
        const isOutOfRange = position.metrics.feeAPR24h === 0 && position.totalValueUSD === 0
        
        // Prepare position data with auto-fetched values
        let positionData: any = {
          pool_address: position.poolAddress,
          position_address: position.positionAddress,
          position_id: `${position.tokenX.symbol}-${position.tokenY.symbol}`,
          token_x_symbol: position.tokenX.symbol,
          token_y_symbol: position.tokenY.symbol,
          token_x_price: position.tokenX.price,
          token_y_price: position.tokenY.price,
          fee_apr_24h: position.metrics.feeAPR24h,
          fee_apy_24h: position.metrics.feeAPY24h,
          total_fees_claimed_usd: position.unclaimedFees.totalClaimedUSD,
          status: isOutOfRange ? 'out_of_range' : 'active',
        }

        // If we have liquidity data from API (in range positions)
        if (position.totalValueUSD > 0) {
          positionData = {
            ...positionData,
            sol_amount: position.tokenX.amount.toString(),
            sol_usd: (position.tokenX.amount * position.tokenX.price).toFixed(2),
            usdc_amount: position.tokenY.amount.toString(),
            total_usd: position.totalValueUSD.toFixed(2),
            unclaimed_fees: position.unclaimedFees.tokenX > 0 || position.unclaimedFees.tokenY > 0
              ? `${position.unclaimedFees.tokenX.toFixed(6)} ${position.tokenX.symbol} + ${position.unclaimedFees.tokenY.toFixed(2)} ${position.tokenY.symbol}`
              : 'None',
          }
        } else {
          // Position is out of range - prompt for manual amounts
          const manualAmounts = prompt(
            `⚠️ Position is OUT OF RANGE (0% APR)\n\n` +
            `✅ Auto-fetched:\n` +
            `• Pool: ${position.tokenX.symbol}-${position.tokenY.symbol}\n` +
            `• Fees Claimed: $${position.unclaimedFees.totalClaimedUSD.toFixed(2)}\n` +
            `• Current Price: $${position.tokenX.price.toFixed(2)}\n\n` +
            `📝 Please enter your current liquidity from Meteora:\n\n` +
            `Format: SOL_amount,USDC_amount,days_active\n` +
            `Example: 0.634089,167.74,8\n\n` +
            `(days_active = how many days ago you opened this position)\n` +
            `(Or leave blank to save with $0 value)`
          )

          if (manualAmounts && manualAmounts.trim()) {
            const parts = manualAmounts.split(',').map(s => s.trim())
            const solAmount = parseFloat(parts[0])
            const usdcAmount = parseFloat(parts[1])
            const daysAgo = parts[2] ? parseInt(parts[2]) : 0
            
            if (!isNaN(solAmount) && !isNaN(usdcAmount)) {
              const solUsd = solAmount * position.tokenX.price
              const totalUsd = solUsd + usdcAmount
              
              // Calculate the actual position opening date
              const openedDate = new Date()
              if (daysAgo > 0) {
                openedDate.setDate(openedDate.getDate() - daysAgo)
              }
              
              positionData = {
                ...positionData,
                sol_amount: solAmount.toString(),
                sol_usd: solUsd.toFixed(2),
                usdc_amount: usdcAmount.toString(),
                total_usd: totalUsd.toFixed(2),
                unclaimed_fees: 'Check on Meteora',
                position_opened_at: openedDate.toISOString(),
              }
            }
          } else {
            // Save with $0 value
            positionData = {
              ...positionData,
              sol_amount: '0',
              sol_usd: '0',
              usdc_amount: '0',
              total_usd: '0',
              unclaimed_fees: `$${position.unclaimedFees.totalClaimedUSD.toFixed(2)} claimed so far`,
            }
          }
        }

        // Check if position already exists
        const { data: existing } = await supabase
          .from('manual_positions')
          .select('id')
          .eq('user_id', user?.id)
          .eq('protocol_id', protocol.id)
          .eq('position_data->>position_address', position.positionAddress)
          .single()

        if (existing) {
          // Update existing position
          await supabase
            .from('manual_positions')
            .update({
              position_data: positionData,
              is_active: true, // Re-activate position when re-syncing
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        } else {
          // Insert new position
          await supabase
            .from('manual_positions')
            .insert({
              user_id: user?.id,
              protocol_id: protocol.id,
              position_type: 'meteora',
              position_data: positionData,
              is_active: true,
            })
        }

        // Reload positions
        if (user) {
          await loadManualPositions(user.id)
        }

        // Show success message with status
        const statusMsg = isOutOfRange 
          ? '⚠️ OUT OF RANGE - Not earning fees'
          : '✅ ACTIVE - Earning fees'
        alert(
          `✅ Successfully synced Meteora position!\n\n` +
          `Status: ${statusMsg}\n` +
          `Value: $${positionData.total_usd}\n` +
          `APR: ${position.metrics.feeAPR24h.toFixed(2)}%\n` +
          `Fees Claimed: $${position.unclaimedFees.totalClaimedUSD.toFixed(2)}`
        )
      } else {
        alert('Position not found.')
      }
    } catch (error: any) {
      console.error('Sync error:', error)
      setSyncError(error.message || 'Failed to sync positions')
      alert(`❌ Error: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // Load manually tracked positions
  const loadManualPositions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('manual_positions')
        .select(`
          *,
          protocols (name, slug)
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setManualPositions(data || [])
    } catch (error) {
      console.error('Error loading manual positions:', error)
    }
  }

  // Sync entire wallet for Meteora transactions
  const syncWallet = async () => {
    if (!walletSyncAddress) {
      alert('Please enter a wallet address')
      return
    }

    setWalletSyncing(true)
    setWalletSyncResult(null)
    setSyncError('')

    try {
      // Get auth session for API call
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated. Please log in again.')
      }

      const response = await fetch('/api/wallet/sync-meteora', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ walletAddress: walletSyncAddress }),
      })

      // Read response as text first to handle non-JSON responses
      const responseText = await response.text()
      const contentType = response.headers.get('content-type') || ''

      // Parse JSON response with proper error handling
      let data: any
      try {
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Empty response from server')
        }
        
        // Check content type
        if (!contentType.includes('application/json')) {
          // Check if it's HTML error page
          if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
            throw new Error(`Server returned HTML instead of JSON (likely error page). Status: ${response.status}. This usually means the API route timed out or there's a server error. Check Vercel logs.`)
          }
          throw new Error(`Server returned non-JSON response (${contentType}). Status: ${response.status}. Response preview: ${responseText.substring(0, 300)}`)
        }

        data = JSON.parse(responseText)
      } catch (parseError: any) {
        console.error('❌ JSON parse error:', parseError.message)
        console.error('❌ Response text (first 500 chars):', responseText.substring(0, 500))
        // Check if it's HTML
        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
          throw new Error(`Server returned HTML instead of JSON (likely error page). Status: ${response.status}. This usually means the API route timed out or there's a server error. Check Vercel logs.`)
        }
        throw new Error(`Failed to parse server response as JSON: ${parseError.message}. Status: ${response.status}. Response preview: ${responseText.substring(0, 300)}`)
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || `Failed to sync wallet: ${response.status} ${response.statusText}`)
      }

      setWalletSyncResult(data)
      
      // Reload transaction history and manual positions
      if (user) {
        await loadTransactionHistory(user.id, walletSyncAddress)
        await loadManualPositions(user.id) // Refresh positions with updated data
      }

      // Show success message
      alert(
        `✅ Wallet Sync Complete!\n\n` +
        `Scanned: ${data.stats.totalTransactions} transactions\n` +
        `Found: ${data.stats.meteoraTransactions} Meteora transactions\n` +
        `Positions Opened: ${data.stats.positionsFound}\n` +
        `Fee Claims: ${data.stats.feeClaimsFound}\n` +
        `Positions Closed: ${data.stats.positionsClosedFound}\n\n` +
        `All transactions are now tracked automatically!`
      )
    } catch (error: any) {
      console.error('Error syncing wallet:', error)
      setSyncError(error.message)
      alert(`❌ Sync failed: ${error.message}`)
    } finally {
      setWalletSyncing(false)
    }
  }

  // Clear old transactions and re-sync with fixed parser
  const clearAndResync = async () => {
    if (!walletSyncAddress) {
      alert('Please enter a wallet address')
      return
    }

    const confirmed = confirm(
      '⚠️ This will delete all existing transaction history for this wallet and re-scan from scratch.\n\n' +
      'This is recommended if you see misclassified transactions (e.g., position opens showing as closes).\n\n' +
      'Continue?'
    )

    if (!confirmed) return

    setWalletSyncing(true)
    setWalletSyncResult(null)
    setSyncError('')

    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated. Please log in again.')
      }

      // Step 1: Clear old transactions
      console.log('Clearing old transactions...')
      const clearResponse = await fetch('/api/wallet/clear-transactions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ walletAddress: walletSyncAddress }),
      })

      // Read response as text first to handle non-JSON responses
      const clearResponseText = await clearResponse.text()
      const clearContentType = clearResponse.headers.get('content-type') || ''

      if (!clearResponse.ok) {
        // Try to parse error response
        let clearData: any
        try {
          if (clearResponseText && clearContentType.includes('application/json')) {
            clearData = JSON.parse(clearResponseText)
          } else {
            // Non-JSON error response
            if (clearResponseText.trim().startsWith('<!DOCTYPE') || clearResponseText.trim().startsWith('<html')) {
              throw new Error(`Server returned HTML error page. Status: ${clearResponse.status}. Check Vercel logs.`)
            }
            throw new Error(`Server error: ${clearResponse.status} ${clearResponse.statusText}. Response: ${clearResponseText.substring(0, 200)}`)
          }
        } catch (parseError: any) {
          throw new Error(`Failed to clear transactions: ${clearResponse.status} ${clearResponse.statusText}. ${parseError.message}`)
        }
        throw new Error(clearData.details || clearData.error || 'Failed to clear transactions')
      }

      // Parse success response
      let clearData: any
      try {
        if (!clearResponseText || clearResponseText.trim().length === 0) {
          throw new Error('Empty response from server')
        }
        if (!clearContentType.includes('application/json')) {
          if (clearResponseText.trim().startsWith('<!DOCTYPE') || clearResponseText.trim().startsWith('<html')) {
            throw new Error('Server returned HTML instead of JSON (likely error page). Check Vercel deployment logs.')
          }
          throw new Error(`Server returned non-JSON response (${clearContentType})`)
        }
        clearData = JSON.parse(clearResponseText)
      } catch (parseError: any) {
        console.error('Error parsing clear-transactions response:', parseError)
        console.error('Response text:', clearResponseText.substring(0, 300))
        throw new Error(`Failed to parse server response: ${parseError.message}`)
      }

      console.log('✅ Old transactions cleared')

      // Step 2: Re-sync with fixed parser
      console.log('Re-scanning wallet...')
      const syncResponse = await fetch('/api/wallet/sync-meteora', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ walletAddress: walletSyncAddress }),
      })

      // Read response as text first to handle non-JSON responses
      const syncResponseText = await syncResponse.text()
      const syncContentType = syncResponse.headers.get('content-type') || ''

      // Parse JSON response with proper error handling
      let data: any
      try {
        if (!syncResponseText || syncResponseText.trim().length === 0) {
          throw new Error('Empty response from server')
        }
        
        // Check content type
        if (!syncContentType.includes('application/json')) {
          // Check if it's HTML error page
          if (syncResponseText.trim().startsWith('<!DOCTYPE') || syncResponseText.trim().startsWith('<html')) {
            throw new Error(`Server returned HTML instead of JSON (likely error page). Status: ${syncResponse.status}. This usually means the API route timed out or there's a server error. Check Vercel logs.`)
          }
          throw new Error(`Server returned non-JSON response (${syncContentType}). Status: ${syncResponse.status}. Response preview: ${syncResponseText.substring(0, 300)}`)
        }

        data = JSON.parse(syncResponseText)
      } catch (parseError: any) {
        console.error('❌ JSON parse error:', parseError.message)
        console.error('❌ Response text (first 500 chars):', syncResponseText.substring(0, 500))
        // Check if it's HTML
        if (syncResponseText.trim().startsWith('<!DOCTYPE') || syncResponseText.trim().startsWith('<html')) {
          throw new Error(`Server returned HTML instead of JSON (likely error page). Status: ${syncResponse.status}. This usually means the API route timed out or there's a server error. Check Vercel logs.`)
        }
        throw new Error(`Failed to parse server response as JSON: ${parseError.message}. Status: ${syncResponse.status}. Response preview: ${syncResponseText.substring(0, 300)}`)
      }

      if (!syncResponse.ok) {
        throw new Error(data.details || data.error || `Failed to sync wallet: ${syncResponse.status} ${syncResponse.statusText}`)
      }

      setWalletSyncResult(data)
      
      // Reload transaction history and manual positions
      if (user) {
        await loadTransactionHistory(user.id, walletSyncAddress)
        await loadManualPositions(user.id)
      }

      // Show success message
      alert(
        `✅ Clear & Re-sync Complete!\n\n` +
        `Scanned: ${data.stats.totalTransactions} transactions\n` +
        `Found: ${data.stats.meteoraTransactions} Meteora transactions\n` +
        `Positions Opened: ${data.stats.positionsFound}\n` +
        `Fee Claims: ${data.stats.feeClaimsFound}\n` +
        `Positions Closed: ${data.stats.positionsClosedFound}\n\n` +
        `All transactions have been re-classified with the updated parser!`
      )
    } catch (error: any) {
      console.error('Error in clear & re-sync:', error)
      setSyncError(error.message)
      alert(`❌ Clear & Re-sync failed: ${error.message}`)
    } finally {
      setWalletSyncing(false)
    }
  }

  // Load transaction history for the most recently synced wallet
  const loadMostRecentTransactionHistory = async (userId: string) => {
    try {
      // Get the most recent transaction to find the wallet address
      const { data: recentTx, error: recentError } = await supabase
        .from('position_transactions')
        .select('wallet_address')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (recentError) throw recentError
      
      if (recentTx && recentTx.length > 0) {
        const walletAddr = recentTx[0].wallet_address
        setWalletSyncAddress(walletAddr) // Set the wallet address in the input field
        await loadTransactionHistory(userId, walletAddr)
      }
    } catch (error) {
      console.error('Error loading most recent transaction history:', error)
    }
  }

  // Load transaction history from database
  const loadTransactionHistory = async (userId: string, walletAddress: string) => {
    try {
      const { data, error } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress)
        .order('block_time', { ascending: false })

      if (error) throw error
      setTransactionHistory(data || [])
    } catch (error) {
      console.error('Error loading transaction history:', error)
    }
  }

  // Fetch positions when wallet is selected
  useEffect(() => {
    const fetchPositions = async () => {
      if (!selectedWallet) {
        setSolBalance(0)
        setPositions([])
        setFarmingScore(0)
        return
      }

      setLoadingPositions(true)
      try {
        // Fetch SOL balance
        const balance = await positionTracker.getSolBalance(selectedWallet)
        setSolBalance(balance)

        // Fetch positions from all protocols
        const allPositions = await protocolManager.getAllPositions(selectedWallet)
        setPositions(allPositions)

        // Calculate overall farming score
        const score = await protocolManager.getOverallFarmingScore(selectedWallet)
        setFarmingScore(score)
      } catch (error) {
        console.error('Error fetching positions:', error)
      } finally {
        setLoadingPositions(false)
      }
    }

    fetchPositions()
  }, [selectedWallet])

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
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Portfolio Positions</h1>
          <p className="mt-1 text-sm text-gray-600">
            Monitor your liquidity, staking, and farming positions across all protocols
          </p>
        </div>

        {/* WALLET-BASED AUTO TRACKING - MAIN FEATURE */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border-2 border-green-300 shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                🎯 Automatic Wallet Tracking
                <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  RECOMMENDED
                </span>
              </h2>
              <p className="mt-2 text-base text-gray-700">
                Enter your wallet address <strong>once</strong> to automatically scan and track ALL Meteora transactions:
              </p>
              <ul className="mt-2 ml-4 space-y-1 text-sm text-gray-600 list-disc">
                <li>Position opens (with exact amounts and timing)</li>
                <li>Fee claims (track all claimed rewards)</li>
                <li>Position closes (complete history)</li>
                <li>Rebalances (monitor adjustments)</li>
              </ul>
              
              <div className="mt-4 bg-white border border-green-200 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={walletSyncAddress}
                    onChange={(e) => setWalletSyncAddress(e.target.value)}
                    placeholder="Enter your Solana wallet address"
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm text-black placeholder-gray-500 bg-white"
                    style={{ color: '#000000' }}
                  />
                  <button
                    onClick={syncWallet}
                    disabled={walletSyncing || !walletSyncAddress}
                    className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold whitespace-nowrap shadow-md hover:shadow-lg"
                  >
                    {walletSyncing ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Scanning Blockchain...
                      </span>
                    ) : (
                      '🚀 Scan & Track Everything'
                    )}
                  </button>
                  <button
                    onClick={clearAndResync}
                    disabled={walletSyncing || !walletSyncAddress}
                    className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold whitespace-nowrap shadow-md hover:shadow-lg"
                    title="Clear old transactions and re-scan with fixed parser"
                  >
                    {walletSyncing ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      '🔄 Clear & Re-sync'
                    )}
                  </button>
                </div>
                
                {syncError && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                    ❌ {syncError}
                  </div>
                )}
                
                {walletSyncResult && (
                  <div className="mt-4 bg-green-50 border border-green-300 rounded-lg p-4">
                    <h4 className="font-bold text-green-900 mb-2">✅ Sync Successful!</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div className="bg-white rounded p-2 text-center">
                        <div className="text-2xl font-bold text-gray-900">{walletSyncResult.stats.totalTransactions}</div>
                        <div className="text-xs text-gray-600">Total Scanned</div>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <div className="text-2xl font-bold text-green-600">{walletSyncResult.stats.meteoraTransactions}</div>
                        <div className="text-xs text-gray-600">Meteora TXs</div>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <div className="text-2xl font-bold text-blue-600">{walletSyncResult.stats.positionsFound}</div>
                        <div className="text-xs text-gray-600">Positions Opened</div>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <div className="text-2xl font-bold text-purple-600">{walletSyncResult.stats.feeClaimsFound}</div>
                        <div className="text-xs text-gray-600">Fee Claims</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
                <strong>💡 Pro Tip:</strong> Use your main farming wallet address. The scanner will automatically detect and categorize all Meteora DLMM transactions. No manual input needed!
              </div>
            </div>
          </div>
        </div>

        {/* Airdrop Farming Analytics */}
        {transactionHistory.length > 0 && (() => {
          // Calculate farming analytics
          const sortedTxs = [...transactionHistory].sort((a, b) => a.block_time - b.block_time)
          const firstTx = sortedTxs[0]
          const farmingStartDate = new Date(firstTx.block_time * 1000)
          const daysFarming = Math.floor((Date.now() - farmingStartDate.getTime()) / (1000 * 60 * 60 * 24))
          
          // Calculate P&L in USD (correct way!)
          const positionOpens = transactionHistory.filter(tx => tx.tx_type === 'position_open')
          const positionCloses = transactionHistory.filter(tx => tx.tx_type === 'position_close')
          const feeClaims = transactionHistory.filter(tx => tx.tx_type === 'fee_claim')
          
          // DEBUG: Log all transactions
          console.log(`\n📊 TOTAL TRANSACTIONS: ${transactionHistory.length}`)
          console.log(`  Position Opens: ${positionOpens.length}`)
          console.log(`  Fee Claims: ${feeClaims.length}`)
          console.log(`  Position Closes: ${positionCloses.length}`)
          
          // Total USD invested (use total_usd from position opens)
          const totalInvestedUSD = positionOpens.reduce((sum, tx) => {
            const usdValue = parseFloat(tx.total_usd) || 0
            return sum + Math.abs(usdValue)
          }, 0)
          
          // Total USD withdrawn (use total_usd from position closes)
          const totalWithdrawnUSD = positionCloses.reduce((sum, tx) => {
            const usdValue = parseFloat(tx.total_usd) || 0
            return sum + Math.abs(usdValue)
          }, 0)
          
          // Total fees claimed in USD
          const totalFeesClaimedUSD = feeClaims.reduce((sum, tx) => {
            const usdValue = parseFloat(tx.total_usd) || 0
            return sum + Math.abs(usdValue)
          }, 0)
          
          console.log(`\n💰 OVERALL TOTALS:`)
          console.log(`  Total Invested: $${totalInvestedUSD.toFixed(2)}`)
          console.log(`  Total Fees: $${totalFeesClaimedUSD.toFixed(2)}`)
          console.log(`  Total Withdrawn: $${totalWithdrawnUSD.toFixed(2)}`)
          
          // Current position value - check both manual_positions and transaction history
          let currentPositionValueUSD = 0
          
          // First, try to get from manual_positions
          const activeManualPosition = manualPositions.find(p => p.is_active && p.protocols?.name === 'Meteora')
          if (activeManualPosition) {
            currentPositionValueUSD = parseFloat(activeManualPosition.position_data?.total_usd || '0')
            console.log(`  Current Position Value (from manual): $${currentPositionValueUSD.toFixed(2)}`)
          } else {
            // If not in manual_positions, check transaction history for active positions
            // An active position is one that was opened but never closed
            const openedPositions = new Set(positionOpens.map(tx => tx.position_nft_address).filter(Boolean))
            const closedPositions = new Set(positionCloses.map(tx => tx.position_nft_address).filter(Boolean))
            const activePositionAddresses = Array.from(openedPositions).filter(addr => !closedPositions.has(addr))
            
            if (activePositionAddresses.length > 0) {
              // For active positions, estimate current value from the last open transaction
              // In a real scenario, we'd fetch from Meteora API, but for now use the open transaction value
              activePositionAddresses.forEach(posAddr => {
                const lastOpenTx = positionOpens
                  .filter(tx => tx.position_nft_address === posAddr)
                  .sort((a, b) => b.block_time - a.block_time)[0]
                if (lastOpenTx) {
                  // Use initial investment value as current value estimate
                  // Note: In production, this should be fetched from Meteora API for accurate current value
                  // For now, using initial investment prevents showing -100% loss
                  const openValue = parseFloat(lastOpenTx.total_usd || '0')
                  currentPositionValueUSD += openValue
                }
              })
              console.log(`  Current Position Value (from transactions): $${currentPositionValueUSD.toFixed(2)}`)
              console.log(`  Active Positions: ${activePositionAddresses.length}`)
            }
          }
          
          // P&L in USD = (Current Value + Total Withdrawn + Total Fees) - Total Invested
          const profitLossUSD = (currentPositionValueUSD + totalWithdrawnUSD + totalFeesClaimedUSD) - totalInvestedUSD
          const profitLossPercent = totalInvestedUSD > 0 ? (profitLossUSD / totalInvestedUSD) * 100 : 0
          
          console.log(`  Current Position Value: $${currentPositionValueUSD.toFixed(2)}`)
          console.log(`  P&L: $${profitLossUSD.toFixed(2)} (${profitLossPercent.toFixed(2)}%)`)
          
          // Group transactions by position for detailed breakdown
          const positionGroups = new Map()
          transactionHistory.forEach(tx => {
            const posAddr = tx.position_nft_address || 'unknown'
            if (!positionGroups.has(posAddr)) {
              positionGroups.set(posAddr, [])
            }
            positionGroups.get(posAddr).push(tx)
          })
          
          // Calculate P&L for each position
          const positionPnLs = Array.from(positionGroups.entries()).map(([posAddr, txs]) => {
            const sortedPosTxs = txs.sort((a: any, b: any) => a.block_time - b.block_time)
            const openTx = sortedPosTxs.find((t: any) => t.tx_type === 'position_open')
            const closeTx = sortedPosTxs.find((t: any) => t.tx_type === 'position_close')
            const feeTxs = sortedPosTxs.filter((t: any) => t.tx_type === 'fee_claim')
            
            const invested = openTx ? Math.abs(parseFloat(openTx.total_usd) || 0) : 0
            const withdrawn = closeTx ? Math.abs(parseFloat(closeTx.total_usd) || 0) : 0
            const fees = feeTxs.reduce((sum: number, tx: any) => sum + Math.abs(parseFloat(tx.total_usd) || 0), 0)
            
            const isActive = !closeTx
            // Get current value: first try manual_positions, then estimate from transactions
            let currentValue = 0
            if (isActive) {
              // Check manual_positions first
              const manualPos = manualPositions.find(p => 
                p.is_active && 
                p.protocols?.name === 'Meteora' &&
                p.position_data?.position_address === posAddr
              )
              if (manualPos) {
                currentValue = parseFloat(manualPos.position_data?.total_usd || '0')
              } else if (openTx) {
                // Estimate: initial investment + fees earned (simplified - real value would come from API)
                const openValue = parseFloat(openTx.total_usd || '0')
                const positionFees = feeTxs.reduce((sum: number, tx: any) => sum + parseFloat(tx.total_usd || '0'), 0)
                // For now, use initial value (in production, fetch real-time value from Meteora API)
                currentValue = openValue
              }
            }
            
            const pnl = (currentValue + withdrawn + fees) - invested
            const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0
            
            return {
              address: posAddr,
              tokens: openTx ? `${openTx.token_x_symbol || 'Token'}-${openTx.token_y_symbol || 'Token'}` : 'Unknown Pool',
              openDate: openTx ? new Date(openTx.block_time * 1000) : null,
              closeDate: closeTx ? new Date(closeTx.block_time * 1000) : null,
              invested,
              withdrawn,
              fees,
              currentValue,
              pnl,
              pnlPercent,
              isActive,
              transactions: sortedPosTxs
            }
          }).sort((a, b) => (b.openDate?.getTime() || 0) - (a.openDate?.getTime() || 0))
          
          // Check position status - use manual_positions or transaction history
          const activeManualPos = manualPositions.find(p => p.is_active && p.protocols?.name === 'Meteora')
          const hasActivePositionFromTx = positionPnLs.some(pos => pos.isActive)
          const hasActivePosition = !!activeManualPos || hasActivePositionFromTx
          
          // Check if position is out of range (from manual_positions if available)
          const isOutOfRange = activeManualPos 
            ? (activeManualPos.position_data?.status === 'out_of_range' || 
               activeManualPos.position_data?.fee_apr_24h === '0.00%')
            : false // Can't determine from transaction history alone
          
          // Generate recommendations
          const recommendations = []
          if (!hasActivePosition) {
            recommendations.push({
              icon: '🆕',
              title: 'Open a New Position',
              description: 'You don\'t have any active positions. Open a new DLMM position to resume farming.',
              priority: 'high'
            })
          } else if (isOutOfRange) {
            recommendations.push({
              icon: '⚠️',
              title: 'Rebalance Your Position',
              description: 'Your position is out of range and not earning fees. Consider closing and opening a new position at current market price.',
              priority: 'high'
            })
          } else {
            recommendations.push({
              icon: '✅',
              title: 'Position is Active',
              description: 'Keep monitoring your position and claim fees periodically to show consistent activity.',
              priority: 'medium'
            })
          }
          
          if (daysFarming < 30) {
            recommendations.push({
              icon: '📅',
              title: 'Maintain Long-Term Position',
              description: 'Airdrops favor long-term liquidity providers. Try to keep positions active for 30+ days.',
              priority: 'medium'
            })
          }
          
          if (feeClaims.length === 0) {
            recommendations.push({
              icon: '💰',
              title: 'Claim Your First Fees',
              description: 'Claiming fees shows active management and increases airdrop eligibility.',
              priority: 'low'
            })
          }
          
          return (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow-xl p-8 border-2 border-purple-200 mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                📊 Meteora Airdrop Farming Analytics
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Farming Start Date */}
                <div className="bg-white rounded-lg p-5 shadow-md border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2">📅 Farming Since</div>
                  <div className="text-2xl font-bold text-gray-900">{farmingStartDate.toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 mt-1">{daysFarming} days active</div>
                </div>
                
                {/* Overall P&L */}
                <div className="bg-white rounded-lg p-5 shadow-md border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2">💰 Overall P&L</div>
                  <div className={`text-2xl font-bold ${profitLossUSD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitLossUSD >= 0 ? '+' : ''}${profitLossUSD.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {profitLossUSD >= 0 ? '+' : ''}{profitLossPercent.toFixed(1)}%
                  </div>
                </div>
                
                {/* Position Status */}
                <div className="bg-white rounded-lg p-5 shadow-md border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2">🎯 Position Status</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {hasActivePosition ? (isOutOfRange ? '⚠️ Out of Range' : '✅ Active') : '❌ No Position'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {hasActivePosition ? `$${currentPositionValueUSD.toFixed(2)}` : 'Open a position'}
                  </div>
                </div>
                
                {/* Activity Score */}
                <div className="bg-white rounded-lg p-5 shadow-md border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2">⭐ Activity Score</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.min(100, (positionOpens.length * 20) + (feeClaims.length * 15) + Math.min(daysFarming * 2, 40))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {positionOpens.length} opens, {feeClaims.length} claims
                  </div>
                </div>
              </div>
              
              {/* Detailed Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-white rounded-lg p-5 shadow-md border border-gray-200">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Total Invested</div>
                  <div className="text-lg font-semibold text-gray-900">${totalInvestedUSD.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Total Withdrawn</div>
                  <div className="text-lg font-semibold text-gray-900">${totalWithdrawnUSD.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Total Fees Claimed</div>
                  <div className="text-lg font-semibold text-green-600">${totalFeesClaimedUSD.toFixed(2)}</div>
                </div>
              </div>
              
              {/* Recommendations */}
              <div className="space-y-3">
                <h4 className="text-lg font-bold text-gray-900 mb-3">💡 Next Actions to Maximize Airdrop Potential</h4>
                {recommendations.map((rec, idx) => (
                  <div 
                    key={idx}
                    className={`p-4 rounded-lg border-l-4 ${
                      rec.priority === 'high' ? 'bg-red-50 border-red-500' :
                      rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                      'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{rec.icon}</div>
                      <div>
                        <div className="font-bold text-gray-900">{rec.title}</div>
                        <div className="text-sm text-gray-700 mt-1">{rec.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Per-Position Breakdown */}
              <div className="mt-8">
                <h4 className="text-lg font-bold text-gray-900 mb-4">📋 Position-by-Position Breakdown</h4>
                <div className="space-y-3">
                  {positionPnLs.map((pos, idx) => (
                    <div key={pos.address} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                      {/* Position Header - Clickable */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedPosition(expandedPosition === pos.address ? null : pos.address)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="text-2xl">{pos.isActive ? '✅' : '🔒'}</div>
                            <div>
                              <div className="font-bold text-gray-900">{pos.tokens}</div>
                              <div className="text-xs text-gray-500">
                                {pos.isActive ? 'Active' : 'Closed'} • Opened {pos.openDate?.toLocaleDateString()}
                                {pos.closeDate && ` • Closed ${pos.closeDate.toLocaleDateString()}`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="text-xs text-gray-600">Position P&L</div>
                              <div className={`text-lg font-bold ${pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {pos.pnl >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                              </div>
                            </div>
                            <div className="text-gray-400">
                              {expandedPosition === pos.address ? '▼' : '▶'}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedPosition === pos.address && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-gray-600 mb-1">💰 Deposit</div>
                              <div className="text-sm font-semibold text-gray-900">${pos.invested.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">💸 Withdraw</div>
                              <div className="text-sm font-semibold text-gray-900">${pos.withdrawn.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">🎁 Fees/Rewards</div>
                              <div className="text-sm font-semibold text-green-600">${pos.fees.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">📊 Current Value</div>
                              <div className="text-sm font-semibold text-blue-600">${pos.currentValue.toFixed(2)}</div>
                            </div>
                          </div>
                          
                          {/* Transaction Timeline - Detailed Breakdown */}
                          <div className="mt-4">
                            <div className="text-xs font-semibold text-gray-700 mb-2">Transaction History:</div>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                              {pos.transactions.map((tx, txIdx) => {
                                const date = new Date(tx.block_time * 1000)
                                const txTypeEmoji = {
                                  position_open: '🆕',
                                  fee_claim: '💰',
                                  position_close: '🔒',
                                  rebalance: '🔄',
                                }[tx.tx_type] || '📝'
                                
                                const txTypeLabel = {
                                  position_open: 'Deposit',
                                  fee_claim: 'Claim Fee',
                                  position_close: 'Withdraw',
                                  rebalance: 'Rebalance',
                                }[tx.tx_type] || 'Transaction'
                                
                                // Parse token amounts
                                const solAmount = tx.token_x_symbol === 'SOL' ? parseFloat(tx.token_x_amount || '0') : 
                                                  tx.token_y_symbol === 'SOL' ? parseFloat(tx.token_y_amount || '0') : 0
                                const usdcAmount = tx.token_x_symbol === 'USDC' ? parseFloat(tx.token_x_amount || '0') : 
                                                   tx.token_y_symbol === 'USDC' ? parseFloat(tx.token_y_amount || '0') : 0
                                
                                // Calculate USD values (rough estimate based on current prices)
                                const solPriceEstimate = 190 // Update with real-time price if available
                                const solUSD = solAmount * solPriceEstimate
                                const usdcUSD = usdcAmount
                                
                                return (
                                  <div key={txIdx} className="bg-white p-3 rounded border border-gray-200">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xl">{txTypeEmoji}</span>
                                        <div>
                                          <div className="text-sm font-bold text-gray-900">{txTypeLabel}</div>
                                          <div className="text-xs text-gray-500">{date.toLocaleDateString('en-US', { 
                                            weekday: 'short', 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric', 
                                            hour: '2-digit', 
                                            minute: '2-digit', 
                                            second: '2-digit' 
                                          })}</div>
                                        </div>
                                      </div>
                                      <a 
                                        href={`https://solscan.io/tx/${tx.signature}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline"
                                      >
                                        View Tx →
                                      </a>
                                    </div>
                                    
                                    {/* Token Breakdown */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {solAmount !== 0 && (
                                        <div className="bg-gray-50 rounded p-2">
                                          <div className="text-gray-600 mb-1">SOL</div>
                                          <div className="font-semibold text-gray-900">
                                            {solAmount.toFixed(4)} SOL
                                          </div>
                                          <div className="text-gray-500">${solUSD.toFixed(2)}</div>
                                        </div>
                                      )}
                                      {usdcAmount !== 0 && (
                                        <div className="bg-gray-50 rounded p-2">
                                          <div className="text-gray-600 mb-1">USDC</div>
                                          <div className="font-semibold text-gray-900">
                                            {usdcAmount.toFixed(2)} USDC
                                          </div>
                                          <div className="text-gray-500">${usdcUSD.toFixed(2)}</div>
                                        </div>
                                      )}
                                      {solAmount === 0 && usdcAmount === 0 && (
                                        <div className="col-span-2 bg-gray-50 rounded p-2 text-center text-gray-500">
                                          No token changes detected
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          
                          {/* Position Summary - Detailed Token Breakdown */}
                          <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                            <div className="text-sm font-bold text-gray-900 mb-3">📊 Your Profit and Loss</div>
                            
                            {(() => {
                              // Calculate totals by token type
                              let totalSOLFees = 0, totalUSDCFees = 0
                              let totalSOLDeposit = 0, totalUSDCDeposit = 0
                              let totalSOLWithdraw = 0, totalUSDCWithdraw = 0
                              
                              pos.transactions.forEach(tx => {
                                const solAmount = tx.token_x_symbol === 'SOL' ? parseFloat(tx.token_x_amount || '0') : 
                                                  tx.token_y_symbol === 'SOL' ? parseFloat(tx.token_y_amount || '0') : 0
                                const usdcAmount = tx.token_x_symbol === 'USDC' ? parseFloat(tx.token_x_amount || '0') : 
                                                   tx.token_y_symbol === 'USDC' ? parseFloat(tx.token_y_amount || '0') : 0
                                
                                if (tx.tx_type === 'position_open') {
                                  totalSOLDeposit += solAmount
                                  totalUSDCDeposit += usdcAmount
                                } else if (tx.tx_type === 'fee_claim') {
                                  totalSOLFees += solAmount
                                  totalUSDCFees += usdcAmount
                                } else if (tx.tx_type === 'position_close') {
                                  totalSOLWithdraw += solAmount
                                  totalUSDCWithdraw += usdcAmount
                                }
                              })
                              
                              const solPrice = 190
                              const totalDepositUSD = (totalSOLDeposit * solPrice) + totalUSDCDeposit
                              const totalFeesUSD = (totalSOLFees * solPrice) + totalUSDCFees
                              const totalWithdrawUSD = (totalSOLWithdraw * solPrice) + totalUSDCWithdraw
                              const profitUSD = totalWithdrawUSD + totalFeesUSD - totalDepositUSD
                              const profitPercent = totalDepositUSD > 0 ? (profitUSD / totalDepositUSD) * 100 : 0
                              
                              return (
                                <div className="space-y-3 text-xs">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white rounded p-2">
                                      <div className="text-gray-600 mb-1">Total Deposit</div>
                                      <div className="font-bold text-gray-900">${totalDepositUSD.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-white rounded p-2">
                                      <div className="text-gray-600 mb-1">Total Fees/Rewards</div>
                                      <div className="font-bold text-green-600">${totalFeesUSD.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-white rounded p-2">
                                      <div className="text-gray-600 mb-1">Total Withdraw</div>
                                      <div className="font-bold text-blue-600">${totalWithdrawUSD.toFixed(2)}</div>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-white rounded p-3 border-2 border-blue-300">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="text-gray-600 mb-1">Profit/Loss</div>
                                        <div className={`text-2xl font-bold ${profitUSD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {profitUSD >= 0 ? '+' : ''}${profitUSD.toFixed(2)}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-gray-600 mb-1">Percentage</div>
                                        <div className={`text-xl font-bold ${profitUSD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white rounded p-2">
                                      <div className="text-gray-600 mb-1">Total SOL Fees</div>
                                      <div className="font-semibold text-gray-900">{totalSOLFees.toFixed(4)} SOL</div>
                                    </div>
                                    <div className="bg-white rounded p-2">
                                      <div className="text-gray-600 mb-1">Total USDC Fees</div>
                                      <div className="font-semibold text-gray-900">{totalUSDCFees.toFixed(2)} USDC</div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Transaction History Timeline */}
        {transactionHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              📜 Complete Transaction History
              <span className="text-sm font-normal text-gray-600">({transactionHistory.length} transactions)</span>
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transactionHistory.map((tx) => {
                const date = new Date(tx.block_time * 1000)
                const txTypeEmoji = {
                  position_open: '🆕',
                  fee_claim: '💰',
                  position_close: '🔒',
                  rebalance: '🔄',
                  unknown: '❓',
                }[tx.tx_type] || '📝'
                
                const txTypeLabel = {
                  position_open: 'Position Opened',
                  fee_claim: 'Fee Claimed',
                  position_close: 'Position Closed',
                  rebalance: 'Rebalance',
                  unknown: 'Unknown',
                }[tx.tx_type] || 'Transaction'
                
                return (
                  <div
                    key={tx.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{txTypeEmoji}</span>
                          <div>
                            <h4 className="font-bold text-gray-900">{txTypeLabel}</h4>
                            <p className="text-xs text-gray-500">{date.toLocaleString()}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                          {tx.token_x_symbol && tx.token_x_amount && (
                            <div className="bg-gray-50 rounded p-2">
                              <span className="text-gray-600">Token X:</span>
                              <div className="font-semibold text-gray-900">
                                {parseFloat(tx.token_x_amount).toFixed(6)} {tx.token_x_symbol}
                              </div>
                            </div>
                          )}
                          {tx.token_y_symbol && tx.token_y_amount && (
                            <div className="bg-gray-50 rounded p-2">
                              <span className="text-gray-600">Token Y:</span>
                              <div className="font-semibold text-gray-900">
                                {parseFloat(tx.token_y_amount).toFixed(2)} {tx.token_y_symbol}
                              </div>
                            </div>
                          )}
                          {tx.sol_change && tx.sol_change !== 0 && (
                            <div className="bg-gray-50 rounded p-2">
                              <span className="text-gray-600">SOL Change:</span>
                              <div className={`font-semibold ${tx.sol_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.sol_change > 0 ? '+' : ''}{parseFloat(tx.sol_change).toFixed(6)} SOL
                              </div>
                            </div>
                          )}
                          {tx.total_usd && (
                            <div className="bg-gray-50 rounded p-2">
                              <span className="text-gray-600">USD Value:</span>
                              <div className="font-semibold text-gray-900">
                                ${parseFloat(tx.total_usd).toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <a
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors text-xs font-medium"
                      >
                        View on Solscan →
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Auto-Sync from Meteora */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                🚀 Auto-Fetch Meteora Position
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Enter your Meteora position address to automatically fetch all position details with real-time data
              </p>
              
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                <strong>💡 How to find your Position Address:</strong>
                <ol className="ml-4 mt-2 space-y-1 list-decimal">
                  <li>Go to <a href="https://app.meteora.ag/dlmm" target="_blank" rel="noopener noreferrer" className="underline">Meteora app</a> → Portfolio</li>
                  <li>Click on your DLMM position</li>
                  <li>Look for "Position Address" or copy from the browser inspector</li>
                  <li>Or use the Pool Address from URL (e.g., HTvjzsfX3yU6BUodCjZ5vZkUrAxMDTrBs3CJaq43ashR)</li>
                </ol>
              </div>
              
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  id="position-sync-input"
                  placeholder="Enter Position Address or Pool Address"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('position-sync-input') as HTMLInputElement
                    if (input?.value) {
                      syncMeteoraPosition(input.value.trim())
                    } else {
                      alert('Please enter a position address')
                    }
                  }}
                  disabled={syncing}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap"
                >
                  {syncing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Fetching...
                    </span>
                  ) : (
                    '🔄 Fetch Position'
                  )}
                </button>
              </div>
              
              {syncError && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  ❌ {syncError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Position Tracker - Direct Protocol Tracking */}
        {user && (
          <PositionTracker 
            userId={user.id} 
            onPositionAdded={() => user && loadManualPositions(user.id)}
          />
        )}

        {/* Manual Positions Display */}
        {manualPositions.length > 0 && (
          <div className="space-y-6">
            {manualPositions.map((position) => {
              // Calculate duration - use position_opened_at if available, otherwise fall back to created_at
              const openedDate = position.position_data.position_opened_at 
                ? new Date(position.position_data.position_opened_at)
                : new Date(position.created_at)
              
              const daysActive = Math.floor(
                (Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24)
              )
              // Use total_usd if available, otherwise calculate from SOL amount
              const currentValue = parseFloat(position.position_data.total_usd || position.position_data.amount || '0')
              const solAmount = parseFloat(position.position_data.sol_amount || position.position_data.amount || '0')
              const usdcAmount = parseFloat(position.position_data.usdc_amount || '0')
              const unclaimedFees = position.position_data.unclaimed_fees || 'Check on protocol'
              
              // Dynamic recommendations based on position
              const getRecommendations = () => {
                const recs = []
                const status = position.position_data.status || 'unknown'
                const apr24h = parseFloat(position.position_data.fee_apr_24h || '0')
                const feesClaimedUsd = parseFloat(position.position_data.total_fees_claimed_usd || '0')
                
                // OUT OF RANGE - Critical action needed
                if (status === 'out_of_range' || (apr24h === 0 && currentValue > 0)) {
                  recs.push({ 
                    priority: 'critical', 
                    text: '⚠️ POSITION OUT OF RANGE - Your liquidity is not earning fees! Take action now to maximize airdrop farming.' 
                  })
                  recs.push({ 
                    priority: 'action', 
                    text: `🔄 Option 1: Adjust Range - Rebalance your position to current market price ($${position.position_data.token_x_price || 'N/A'} SOL)` 
                  })
                  recs.push({ 
                    priority: 'action', 
                    text: '🔄 Option 2: Close & Reopen - Exit current position and open new one with active range (better for farming)' 
                  })
                  recs.push({ 
                    priority: 'action', 
                    text: '⏳ Option 3: Wait it Out - Only if you expect price to return to your range soon (risk: missed farming time)' 
                  })
                  if (feesClaimedUsd > 0) {
                    recs.push({ 
                      priority: 'success', 
                      text: `✅ Historical Value: You've earned $${feesClaimedUsd.toFixed(2)} in fees before going out of range - this counts for airdrops!` 
                    })
                  }
                }
                
                // ACTIVE POSITION - Duration-based recommendations
                if (status === 'active' || apr24h > 0) {
                  recs.push({ 
                    priority: 'success', 
                    text: `✅ ACTIVE POSITION - Earning ${apr24h.toFixed(2)}% APR! Keep it active for maximum airdrop eligibility.` 
                  })
                  
                  if (daysActive < 7) {
                    recs.push({ priority: 'high', text: `Keep position active for ${7 - daysActive} more days to reach 7-day minimum for airdrops` })
                  }
                  if (daysActive >= 7 && daysActive < 30) {
                    recs.push({ priority: 'medium', text: `Great start! Aim for 30+ days for optimal airdrop eligibility (${30 - daysActive} days to go)` })
                  }
                  if (daysActive >= 30) {
                    recs.push({ priority: 'success', text: '🎉 Excellent! You\'ve passed the 30-day mark. Consider increasing position size or adding another pool.' })
                  }
                  
                  // Weekly claim reminder
                  if (daysActive > 0 && daysActive % 7 === 0) {
                    recs.push({ priority: 'action', text: '⏰ Weekly Check-in: Claim accumulated fees to show active position management!' })
                  }
                }
                
                // SIZE-BASED RECOMMENDATIONS (for all positions)
                if (currentValue < 50 && currentValue > 0) {
                  recs.push({ priority: 'medium', text: `💰 Small position (<$50): Focus on duration. Keep active for 60+ days to compensate for size.` })
                } else if (currentValue < 100 && currentValue > 0) {
                  recs.push({ priority: 'medium', text: `Consider increasing position to $100+ for better visibility (currently $${currentValue.toFixed(2)})` })
                } else if (currentValue >= 500) {
                  recs.push({ priority: 'success', text: `🐋 Whale position! You're likely in top 5% of LPs. Maintain this consistently.` })
                }
                
                return recs
              }

              const recommendations = getRecommendations()

              return (
                <div key={position.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  {/* Position Header */}
                  <div className={`p-6 text-white ${
                    position.position_data.status === 'out_of_range' 
                      ? 'bg-gradient-to-r from-orange-600 to-red-600' 
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold">{position.protocols?.name || position.position_type}</h2>
                          {position.position_data.status === 'out_of_range' ? (
                            <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                              ⚠️ OUT OF RANGE
                            </span>
                          ) : position.position_data.fee_apr_24h > 0 ? (
                            <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                              ✓ ACTIVE
                            </span>
                          ) : null}
                        </div>
                        <p className={`text-sm mt-1 ${
                          position.position_data.status === 'out_of_range' ? 'text-orange-100' : 'text-indigo-100'
                        }`}>
                          {position.position_type.toUpperCase()} Position
                          {position.position_data.fee_apr_24h > 0 && ` • ${parseFloat(position.position_data.fee_apr_24h || '0').toFixed(2)}% APR`}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('Remove this position from tracking?')) {
                            await supabase
                              .from('manual_positions')
                              .update({ is_active: false })
                              .eq('id', position.id)
                            if (user) loadManualPositions(user.id)
                          }
                        }}
                        className="text-white hover:text-red-200 text-sm px-3 py-1 border border-white rounded"
                      >
                        Remove
                      </button>
                    </div>
                    
                    {/* Live Metrics */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                      <div className="bg-white rounded-lg p-3 shadow-md">
                        <div className="text-xs font-semibold text-gray-600">Current Value</div>
                        <div className="text-2xl font-bold mt-1 text-gray-900">${currentValue.toFixed(2)}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {solAmount > 0 && `${solAmount.toFixed(4)} SOL`}
                          {solAmount > 0 && usdcAmount > 0 && ' + '}
                          {usdcAmount > 0 && `${usdcAmount.toFixed(2)} USDC`}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 shadow-md">
                        <div className="text-xs font-semibold text-gray-600">Duration</div>
                        <div className="text-2xl font-bold mt-1 text-gray-900">{daysActive}</div>
                        <div className="text-xs text-gray-600 mt-1">days active</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 shadow-md">
                        <div className="text-xs font-semibold text-gray-600">Unclaimed Fees</div>
                        <div className="text-sm font-bold mt-1 text-gray-900">{unclaimedFees}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          <a href={`https://app.meteora.ag/dlmm/${position.position_data.pool_address}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 transition-colors">
                            Claim Now →
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Position Details */}
                  <div className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Position Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(position.position_data as Record<string, any>).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="font-medium text-gray-700">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-gray-900 break-all text-right ml-2">
                            {key === 'pool_address' ? `${String(value).slice(0, 8)}...${String(value).slice(-8)}` : String(value)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="font-medium text-gray-700">Added:</span>
                        <span className="text-gray-900">{new Date(position.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations & Insights */}
                  {recommendations.length > 0 && (
                    <div className="px-6 pb-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Recommendations for Your Position</h3>
                      <div className="space-y-2">
                        {recommendations.map((rec, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border-l-4 ${
                              rec.priority === 'critical'
                                ? 'bg-red-100 border-red-600 text-red-900 font-bold animate-pulse'
                                : rec.priority === 'high'
                                ? 'bg-red-50 border-red-500 text-red-900'
                                : rec.priority === 'success'
                                ? 'bg-green-50 border-green-500 text-green-900'
                                : rec.priority === 'action'
                                ? 'bg-blue-50 border-blue-500 text-blue-900'
                                : 'bg-yellow-50 border-yellow-500 text-yellow-900'
                            }`}
                          >
                            <p className="text-sm font-medium">{rec.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contextual Pro Tips */}
                  <div className="px-6 pb-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">💡 Pro Tips for Your ${currentValue.toFixed(0)} Position</h3>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 space-y-3">
                      {currentValue < 100 && (
                        <div className="flex items-start">
                          <span className="text-purple-600 mr-2">💰</span>
                          <p className="text-sm text-gray-700">
                            <strong>Small Position Strategy:</strong> Focus on consistency. Keep this position active for 30+ days and consider adding $20-50 monthly to grow it gradually.
                          </p>
                        </div>
                      )}
                      {currentValue >= 100 && currentValue < 500 && (
                        <div className="flex items-start">
                          <span className="text-purple-600 mr-2">🎯</span>
                          <p className="text-sm text-gray-700">
                            <strong>Mid-Size Position:</strong> You're in a good spot! Claim fees weekly to show active management. Consider opening a 2nd position in another Meteora pool to diversify.
                          </p>
                        </div>
                      )}
                      {currentValue >= 500 && (
                        <div className="flex items-start">
                          <span className="text-purple-600 mr-2">🚀</span>
                          <p className="text-sm text-gray-700">
                            <strong>Whale Territory:</strong> Your position size puts you in the top tier! Focus on range optimization and fee maximization. Consider splitting across 3+ pools.
                          </p>
                        </div>
                      )}
                      <div className="flex items-start">
                        <span className="text-purple-600 mr-2">⏰</span>
                        <p className="text-sm text-gray-700">
                          <strong>Timing:</strong> Claim your ${(currentValue * 0.05).toFixed(2)} estimated unclaimed fees every {currentValue < 200 ? '2 weeks' : 'week'} to show active engagement.
                        </p>
                      </div>
                      <div className="flex items-start">
                        <span className="text-purple-600 mr-2">📈</span>
                        <p className="text-sm text-gray-700">
                          <strong>Next Milestone:</strong> {daysActive < 30 ? `Reach 30 days (${30 - daysActive} days to go)` : currentValue < 500 ? 'Grow position to $500' : 'Open 2nd position in different pool'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Educational Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Why Position is Great for Airdrops */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="text-2xl mr-2">✅</span>
                  Why Your Position is Great for Airdrops
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="text-green-600 mr-2 mt-0.5">✓</span>
                    <span><strong>Active DLMM Position:</strong> You're providing liquidity in {manualPositions[0]?.protocols?.name || 'the protocol'}'s main product</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 mr-2 mt-0.5">✓</span>
                    <span><strong>Real Engagement:</strong> Your position shows genuine protocol usage</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 mr-2 mt-0.5">✓</span>
                    <span><strong>Major Trading Pair:</strong> More volume = better airdrop eligibility</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 mr-2 mt-0.5">✓</span>
                    <span><strong>Fee Generation:</strong> Shows position has been active over time</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 mr-2 mt-0.5">✓</span>
                    <span><strong>Commitment:</strong> Keeping liquidity locked demonstrates long-term support</span>
                  </li>
                </ul>
              </div>

              {/* Pro Tips */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="text-2xl mr-2">💡</span>
                  Pro Tips for Airdrop Farming
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span><strong>Claim Fees Regularly:</strong> Shows active position management (claim weekly/monthly)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span><strong>Track Unclaimed Fees:</strong> Visit Meteora to see and claim pending rewards</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span><strong>Adjust Range:</strong> Rebalance your position occasionally to stay in range</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span><strong>Multiple Pools:</strong> Consider opening positions in 2-3 different pools</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span><strong>Stay Active:</strong> Don't just set and forget - show ongoing engagement</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* What to Track */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">📊</span>
                For Airdrop Farming, Track These Metrics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white bg-opacity-60 rounded-lg p-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Duration</h4>
                  <p className="text-gray-600">
                    How long you keep this position active. Aim for 30+ days minimum for airdrops.
                  </p>
                </div>
                <div className="bg-white bg-opacity-60 rounded-lg p-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Total Fees Earned</h4>
                  <p className="text-gray-600">
                    Track cumulative fees over time. Higher fees = more active position = better eligibility.
                  </p>
                </div>
                <div className="bg-white bg-opacity-60 rounded-lg p-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Position Adjustments</h4>
                  <p className="text-gray-600">
                    Any rebalancing or range updates. Shows you're actively managing your liquidity.
                  </p>
                </div>
              </div>
              <div className="mt-4 bg-purple-100 rounded-lg p-3 text-sm text-purple-900">
                <strong>💰 Current Position Value:</strong> Visit <a href={`https://app.meteora.ag/dlmm/${manualPositions[0]?.position_data.pool_address || ''}`} target="_blank" rel="noopener noreferrer" className="underline">Meteora</a> to check your current value, fees earned, and claim rewards!
              </div>
            </div>
          </div>
        )}

        {/* Wallet Manager (Optional - for balance checking) */}
        <details className="bg-gray-50 rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Optional: Connect Wallet for Balance Checking
          </summary>
          <div className="mt-4">
            <WalletManager
              onWalletSelect={setSelectedWallet}
              selectedWallet={selectedWallet}
            />
          </div>
        </details>

        {/* Portfolio Stats */}
        {selectedWallet && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600">SOL Balance</div>
              <div className="text-3xl font-bold text-purple-600 mt-2">
                {loadingPositions ? '...' : solBalance.toFixed(4)}
              </div>
              <div className="text-xs text-gray-500 mt-1">SOL</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600">Protocol Positions</div>
              <div className="text-3xl font-bold text-green-600 mt-2">
                {loadingPositions ? '...' : positions.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Active positions</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600">Protocols Active</div>
              <div className="text-3xl font-bold text-blue-600 mt-2">
                {loadingPositions
                  ? '...'
                  : new Set(positions.map((p) => p.protocol)).size}
              </div>
              <div className="text-xs text-gray-500 mt-1">Different protocols</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600">Farming Score</div>
              <div className="text-3xl font-bold text-indigo-600 mt-2">
                {loadingPositions ? '...' : farmingScore}
              </div>
              <div className="text-xs text-gray-500 mt-1">Out of 100</div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!selectedWallet ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">👆</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Select a Wallet to Track
              </h3>
              <p className="text-gray-600 mb-4">
                Add a wallet manually or connect your Phantom/Solflare wallet to get started
              </p>
            </div>
          </div>
        ) : loadingPositions ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading positions from all protocols...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Protocol Positions by Protocol */}
            {positions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['Meteora', 'Jupiter', 'Sanctum', 'Magic Eden'].map((protocolName) => {
                  const protocolPositions = positions.filter(
                    (p) => p.protocol === protocolName
                  )
                  
                  if (protocolPositions.length === 0) return null

                  return (
                    <div key={protocolName} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {protocolName}
                        </h3>
                        <span className="text-sm text-gray-500">
                          {protocolPositions.length} position{protocolPositions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {protocolPositions.map((position, index) => (
                          <div
                            key={index}
                            className="border border-gray-200 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-gray-600 capitalize">
                                  {position.positionType}
                                </p>
                                {position.details.token && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {position.details.token}
                                  </p>
                                )}
                                {position.details.lstToken && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {position.details.lstToken}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">
                                  {position.value.toFixed(4)}
                                </div>
                                {position.details.stakingYield && (
                                  <div className="text-xs text-green-600">
                                    {position.details.stakingYield}% APY
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No Positions Found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    This wallet doesn't have any active positions on tracked protocols
                  </p>
                  <p className="text-sm text-gray-500">
                    Start farming on Meteora, Jupiter, Sanctum, or Magic Eden to see positions here
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

