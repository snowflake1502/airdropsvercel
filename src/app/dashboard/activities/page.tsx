'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import WalletManager from '@/components/WalletManager'
import { protocolManager } from '@/lib/protocols'
import { AutomationLog, AutomationApproval } from '@/lib/automation/types'
import { useWallet } from '@solana/wallet-adapter-react'
import { useExecuteAction } from '@/lib/automation/use-execute-action'

interface Recommendation {
  id: string
  protocol: string
  title: string
  description: string
  priority: number
  type: string
  action_items: any
  protocols?: {
    name: string
    slug: string
  }
}

export default function ActivitiesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedWallet, setSelectedWallet] = useState<string>('')
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [farmingOpportunities, setFarmingOpportunities] = useState<any[]>([])
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<AutomationApproval[]>([])
  const [loadingAutomation, setLoadingAutomation] = useState(false)
  const [activeTab, setActiveTab] = useState<'recommendations' | 'automation'>('recommendations')
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null)
  const [syncingWallet, setSyncingWallet] = useState(false)
  const [currentPositions, setCurrentPositions] = useState<any[]>([])
  const [automationConfig, setAutomationConfig] = useState<any>(null)
  const [automationStatus, setAutomationStatus] = useState<any[]>([])
  const router = useRouter()
  const { publicKey, connected } = useWallet()
  const { executeAction, isExecuting, error: executeError, canExecute } = useExecuteAction()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)
      setLoading(false)
      
      // Load farming opportunities
      loadFarmingOpportunities()
    }
    checkUser()
  }, [router])

  // Load automation logs and approvals when wallet is selected
  useEffect(() => {
    if (selectedWallet && user) {
      loadAutomationData(selectedWallet)
    }
  }, [selectedWallet, user])

  // Load automation status for current positions
  const loadAutomationStatus = async (walletAddress: string, positions: any[]) => {
    if (!user) return

    try {
      // Get automation config
      const { data: config } = await supabase
        .from('automation_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)
        .single()

      if (!config) {
        setAutomationConfig(null)
        setAutomationStatus([])
        return
      }

      setAutomationConfig(config)

      // Get last fee claim times for cooldown check
      const { data: lastClaims } = await supabase
        .from('position_transactions')
        .select('position_nft_address, block_time')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)
        .eq('tx_type', 'fee_claim')
        .order('block_time', { ascending: false })

      const lastClaimMap = new Map<string, number>()
      lastClaims?.forEach((claim: any) => {
        if (claim.position_nft_address && !lastClaimMap.has(claim.position_nft_address)) {
          lastClaimMap.set(claim.position_nft_address, claim.block_time)
        }
      })

      // Calculate automation status for each position
      const statuses: any[] = []

      for (const position of positions) {
        const unclaimedFeesUSD = position.unclaimedFees?.usd || 0
        const feeAPR = position.metrics?.feeAPR24h || 0
        const isOutOfRange = feeAPR === 0
        const lastClaimTime = lastClaimMap.get(position.nftAddress || '')

        // Check cooldown for fee claims
        let feeClaimCooldownRemaining = 0
        if (lastClaimTime) {
          const cooldownMs = config.claim_fee_interval_hours * 60 * 60 * 1000
          const timeSinceClaim = Date.now() - (lastClaimTime * 1000)
          feeClaimCooldownRemaining = Math.max(0, cooldownMs - timeSinceClaim)
        }

        // Check fee claim status
        const feeClaimStatus = {
          enabled: config.auto_claim_fees,
          canClaim: unclaimedFeesUSD >= config.claim_fee_threshold_usd && feeClaimCooldownRemaining === 0,
          pending: unclaimedFeesUSD > 0 && unclaimedFeesUSD < config.claim_fee_threshold_usd,
          onCooldown: feeClaimCooldownRemaining > 0,
          threshold: config.claim_fee_threshold_usd,
          current: unclaimedFeesUSD,
          remaining: Math.max(0, config.claim_fee_threshold_usd - unclaimedFeesUSD),
          cooldownHours: feeClaimCooldownRemaining > 0 ? (feeClaimCooldownRemaining / (60 * 60 * 1000)).toFixed(1) : 0,
        }

        // Check rebalance status
        const rebalanceStatus = {
          enabled: config.auto_rebalance,
          needed: isOutOfRange,
          pending: isOutOfRange && position.totalValueUSD > 10,
          threshold: config.rebalance_threshold_percent,
        }

        statuses.push({
          position,
          feeClaim: feeClaimStatus,
          rebalance: rebalanceStatus,
        })
      }

      setAutomationStatus(statuses)
    } catch (error) {
      console.error('Error loading automation status:', error)
    }
  }

  // Load farming opportunities from all protocols
  const loadFarmingOpportunities = async () => {
    try {
      const opportunities = await protocolManager.getAllFarmingOpportunities()
      setFarmingOpportunities(opportunities)
    } catch (error) {
      console.error('Error loading opportunities:', error)
    }
  }

  // Handle wallet selection
  const handleWalletSelect = async (address: string) => {
    setSelectedWallet(address)
    
    // Get wallet ID
    try {
      const { data } = await supabase
        .from('tracked_wallets')
        .select('id')
        .eq('wallet_address', address)
        .single()
      
      if (data) {
        setSelectedWalletId(data.id)
        loadRecommendations(data.id, address)
      }
    } catch (error) {
      console.error('Error getting wallet ID:', error)
    }
  }

  // Load recommendations for wallet
  const loadRecommendations = async (walletId: string, address: string) => {
    setLoadingRecs(true)
    try {
      // Try to get stored recommendations first
      const { data: stored } = await supabase
        .from('farming_recommendations')
        .select(`
          *,
          protocols (name, slug)
        `)
        .eq('wallet_id', walletId)
        .eq('completed', false)
        .order('priority', { ascending: false })
        .limit(10)

      if (stored && stored.length > 0) {
        setRecommendations(stored)
      } else {
        // Generate new recommendations if none exist
        await generateRecommendations(walletId, address)
      }
    } catch (error) {
      console.error('Error loading recommendations:', error)
    } finally {
      setLoadingRecs(false)
    }
  }

  // Generate new recommendations
  const generateRecommendations = async (walletId: string, address: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/recommendations/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ walletAddress: address, walletId }),
      })

      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Error generating recommendations:', error)
    }
  }

  // Mark recommendation as complete
  const completeRecommendation = async (recId: string) => {
    try {
      await supabase
        .from('farming_recommendations')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', recId)

      // Remove from UI
      setRecommendations(recs => recs.filter(r => r.id !== recId))
    } catch (error) {
      console.error('Error completing recommendation:', error)
    }
  }

  // Load automation logs and approvals
  const loadAutomationData = async (walletAddress: string) => {
    if (!user) return

    setLoadingAutomation(true)
    try {
      // Get automation config for this wallet
      const { data: config } = await supabase
        .from('automation_configs')
        .select('id')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)
        .single()

      if (config) {
        // Load automation logs
        const { data: logs } = await supabase
          .from('automation_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('config_id', config.id)
          .order('created_at', { ascending: false })
          .limit(50)

        setAutomationLogs((logs || []) as AutomationLog[])

        // Load pending approvals
        const { data: approvals } = await supabase
          .from('automation_approvals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })

        setPendingApprovals((approvals || []) as AutomationApproval[])
      }
    } catch (error) {
      console.error('Error loading automation data:', error)
    } finally {
      setLoadingAutomation(false)
    }
  }

  // Handle approval action
  const handleApproval = async (approvalId: string, action: 'approve' | 'reject', reason?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/automation/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ approvalId, action, reason }),
      })

      if (response.ok) {
        // Reload automation data
        if (selectedWallet) {
          loadAutomationData(selectedWallet)
        }
      }
    } catch (error) {
      console.error('Error processing approval:', error)
    }
  }

  // Run automation manually
  const runAutomation = async () => {
    if (!selectedWallet) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/automation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ walletAddress: selectedWallet }),
      })

      if (response.ok) {
        const result = await response.json()
        alert(`Automation run completed. Actions executed: ${result.actionsExecuted}, Pending approvals: ${result.actionsPendingApproval}`)
        // Reload automation data
        loadAutomationData(selectedWallet)
      }
    } catch (error) {
      console.error('Error running automation:', error)
    }
  }

  // Sync wallet and fetch current positions
  const syncWalletAndFetchPositions = async () => {
    const walletAddress = publicKey?.toBase58()
    
    if (!walletAddress || !user) {
      if (!connected) {
        alert('Please connect your wallet first')
      } else {
        alert('Please log in to sync positions')
      }
      return
    }

    setSyncingWallet(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Please log in again')
        return
      }

      // Step 1: Sync wallet transactions
      const syncResponse = await fetch('/api/wallet/sync-meteora', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ walletAddress }),
      })

      // Check if response is ok and content-type is JSON
      const contentType = syncResponse.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await syncResponse.text()
        throw new Error(`Invalid response format: ${text.substring(0, 200)}`)
      }

      let syncData
      try {
        syncData = await syncResponse.json()
      } catch (parseError: any) {
        const text = await syncResponse.text()
        throw new Error(`Failed to parse response: ${parseError.message}. Response: ${text.substring(0, 200)}`)
      }

      if (!syncResponse.ok) {
        throw new Error(syncData.error || `Failed to sync wallet: ${syncResponse.status} ${syncResponse.statusText}`)
      }

      // Step 2: Fetch current positions from database
      const { data: transactions, error } = await supabase
        .from('position_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)
        .eq('tx_type', 'position_open')
        .order('block_time', { ascending: false })

      if (error) {
        console.error('❌ Error fetching transactions:', error)
        throw error
      }

      console.log(`📊 Found ${transactions?.length || 0} position_open transactions`)

      // Step 3: Group by position_nft_address and fetch current details
      const positionGroups = new Map<string, any>()
      
      transactions?.forEach((tx: any) => {
        if (tx.position_nft_address && !positionGroups.has(tx.position_nft_address)) {
          positionGroups.set(tx.position_nft_address, tx)
          console.log(`📍 Found position NFT: ${tx.position_nft_address}`)
        }
      })

      console.log(`📦 Grouped into ${positionGroups.size} unique positions`)

      // Step 4: Check which positions have close transactions (but verify with Meteora API)
      const { data: closedTxs } = await supabase
        .from('position_transactions')
        .select('position_nft_address, block_time')
        .eq('user_id', user.id)
        .eq('wallet_address', walletAddress)
        .eq('tx_type', 'position_close')
        .order('block_time', { ascending: false })

      // Create a map of close times per position
      const positionCloseTimes = new Map<string, number>()
      closedTxs?.forEach((tx: any) => {
        if (tx.position_nft_address && !positionCloseTimes.has(tx.position_nft_address)) {
          positionCloseTimes.set(tx.position_nft_address, tx.block_time)
        }
      })
      console.log(`🚫 Found ${positionCloseTimes.size} positions with close transactions`)

      // Step 5: Fetch current position details from Meteora API
      // We'll verify with Meteora API if position is actually active, even if DB says closed
      const activePositions: any[] = []
      
      console.log(`🔄 Processing ${positionGroups.size} positions...`)
      
      for (const [nftAddress, openTx] of positionGroups.entries()) {
        const hasCloseTx = positionCloseTimes.has(nftAddress)
        const closeTime = positionCloseTimes.get(nftAddress)
        const openTime = openTx.block_time
        
        // If there's a close transaction, check if it happened before the open (reopened position)
        // Or verify with Meteora API if position is still active
        if (hasCloseTx && closeTime && closeTime > openTime) {
          console.log(`⚠️ Position ${nftAddress} has close transaction after open. Checking Meteora API to verify...`)
        }

        console.log(`🔍 Fetching position details for: ${nftAddress}`)

        try {
          // Try to fetch position details using NFT address (position NFT address)
          // The Meteora API accepts position NFT address
          const positionResponse = await fetch('/api/meteora/sync-positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionAddress: nftAddress }),
          })

          console.log(`📡 API response status for ${nftAddress}:`, positionResponse.status)

          if (positionResponse.ok) {
            const positionData = await positionResponse.json()
            console.log(`📦 Position data received:`, positionData)
            
            if (positionData.position) {
              // Position exists on Meteora - it's active regardless of DB close status
              const position = {
                ...positionData.position,
                nftAddress,
                positionAddress: positionData.position.positionAddress,
                openedAt: new Date(openTx.block_time * 1000).toLocaleString(),
              }
              activePositions.push(position)
              console.log(`✅ Position is ACTIVE on Meteora (added):`, {
                nftAddress,
                poolAddress: position.poolAddress,
                totalValueUSD: position.totalValueUSD,
                tokenX: position.tokenX?.symbol,
                tokenY: position.tokenY?.symbol,
                unclaimedFeesUSD: position.unclaimedFees?.usd,
                hasCloseTxInDB: hasCloseTx ? '⚠️ DB says closed but Meteora says active' : '✅ No close tx in DB'
              })
            } else {
              console.warn(`⚠️ No position data in response for ${nftAddress}`, positionData)
              // If Meteora doesn't have it and DB says closed, skip it
              if (hasCloseTx) {
                console.log(`⏭️ Skipping ${nftAddress} - closed in DB and not found on Meteora`)
              }
            }
          } else {
            const errorData = await positionResponse.json().catch(() => ({}))
            const errorMessage = errorData.error || errorData.message || JSON.stringify(errorData)
            console.warn(`⚠️ Meteora API failed for ${nftAddress}:`, errorMessage)
            
            // If API returns 404/not found and DB says closed, skip it
            if (positionResponse.status === 404 && hasCloseTx) {
              console.log(`⏭️ Skipping ${nftAddress} - 404 from Meteora and closed in DB`)
              continue
            }
            
            // Otherwise, add fallback position data (might be temporary API issue)
            // Determine prices based on token symbols/mints from transaction data
            const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            const SOL_MINT = 'So11111111111111111111111111111111111111112'
            
            const tokenXMint = openTx.token_x_mint
            const tokenYMint = openTx.token_y_mint
            const tokenXSymbol = openTx.token_x_symbol || 'Unknown'
            const tokenYSymbol = openTx.token_y_symbol || 'Unknown'
            
            // Determine prices based on mint addresses or symbols
            let tokenXPrice = 1
            let tokenYPrice = 1
            
            if (tokenXMint === USDC_MINT || tokenXSymbol.toUpperCase() === 'USDC') {
              tokenXPrice = 1 // USDC is $1
            } else if (tokenXMint === SOL_MINT || tokenXSymbol.toUpperCase() === 'SOL') {
              tokenXPrice = 190 // SOL price (approximate)
            }
            
            if (tokenYMint === USDC_MINT || tokenYSymbol.toUpperCase() === 'USDC') {
              tokenYPrice = 1 // USDC is $1
            } else if (tokenYMint === SOL_MINT || tokenYSymbol.toUpperCase() === 'SOL') {
              tokenYPrice = 190 // SOL price (approximate)
            }
            
            const fallbackPosition = {
              nftAddress,
              poolAddress: openTx.pool_address,
              tokenX: { 
                symbol: tokenXSymbol,
                mint: tokenXMint,
                amount: openTx.token_x_amount || 0, 
                price: tokenXPrice
              },
              tokenY: { 
                symbol: tokenYSymbol,
                mint: tokenYMint,
                amount: openTx.token_y_amount || 0, 
                price: tokenYPrice
              },
              totalValueUSD: openTx.total_usd || 0,
              unclaimedFees: { usd: 0, tokenX: 0, tokenY: 0, totalClaimedUSD: 0 },
              metrics: { feeAPR24h: 0 },
              openedAt: new Date(openTx.block_time * 1000).toLocaleString(),
            }
            activePositions.push(fallbackPosition)
            console.log(`📝 Added fallback position data (API error but position might exist):`, {
              ...fallbackPosition,
              tokenXPrice,
              tokenYPrice,
              calculatedUSD: (fallbackPosition.tokenX.amount * tokenXPrice) + (fallbackPosition.tokenY.amount * tokenYPrice)
            })
          }
        } catch (error: any) {
          console.error(`❌ Exception fetching position ${nftAddress}:`, error)
          
          // Add fallback position with correct price detection
          const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
          const SOL_MINT = 'So11111111111111111111111111111111111111112'
          
          const tokenXMint = openTx.token_x_mint
          const tokenYMint = openTx.token_y_mint
          const tokenXSymbol = openTx.token_x_symbol || 'Unknown'
          const tokenYSymbol = openTx.token_y_symbol || 'Unknown'
          
          let tokenXPrice = 1
          let tokenYPrice = 1
          
          if (tokenXMint === USDC_MINT || tokenXSymbol.toUpperCase() === 'USDC') {
            tokenXPrice = 1
          } else if (tokenXMint === SOL_MINT || tokenXSymbol.toUpperCase() === 'SOL') {
            tokenXPrice = 190
          }
          
          if (tokenYMint === USDC_MINT || tokenYSymbol.toUpperCase() === 'USDC') {
            tokenYPrice = 1
          } else if (tokenYMint === SOL_MINT || tokenYSymbol.toUpperCase() === 'SOL') {
            tokenYPrice = 190
          }
          
          activePositions.push({
            nftAddress,
            poolAddress: openTx.pool_address,
            tokenX: { 
              symbol: tokenXSymbol,
              mint: tokenXMint,
              amount: openTx.token_x_amount || 0, 
              price: tokenXPrice 
            },
            tokenY: { 
              symbol: tokenYSymbol,
              mint: tokenYMint,
              amount: openTx.token_y_amount || 0, 
              price: tokenYPrice 
            },
            totalValueUSD: openTx.total_usd || 0,
            unclaimedFees: { usd: 0, tokenX: 0, tokenY: 0, totalClaimedUSD: 0 },
            metrics: { feeAPR24h: 0 },
            openedAt: new Date(openTx.block_time * 1000).toLocaleString(),
          })
        }
      }

      console.log(`🎯 Final active positions count: ${activePositions.length}`)

      setCurrentPositions(activePositions)
      console.log('✅ Synced positions:', activePositions)

      // Load automation config and status
      if (user && activePositions.length > 0) {
        await loadAutomationStatus(walletAddress, activePositions)
      }
      
      alert(
        `✅ Sync Complete!\n\n` +
        `Found ${syncData.stats?.meteoraTransactions || 0} Meteora transactions\n` +
        `Active Positions: ${activePositions.length}\n` +
        `Positions Opened: ${syncData.stats?.positionsFound || 0}\n\n` +
        `${activePositions.length > 0 ? 'Position details will appear in the opportunity cards below!' : 'No active positions found.'}`
      )
    } catch (error: any) {
      console.error('Error syncing wallet:', error)
      alert(`❌ Sync failed: ${error.message}`)
    } finally {
      setSyncingWallet(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'bg-red-100 text-red-800 border-red-200'
    if (priority >= 60) return 'bg-orange-100 text-orange-800 border-orange-200'
    return 'bg-blue-100 text-blue-800 border-blue-200'
  }

  const getPriorityLabel = (priority: number) => {
    if (priority >= 80) return 'High Priority'
    if (priority >= 60) return 'Medium'
    return 'Low Priority'
  }

  const getAutomationLevelTooltip = (level: 'full' | 'partial' | 'manual') => {
    switch (level) {
      case 'full':
        return '✅ Full Tracking: All transactions are automatically detected and tracked on-chain. You still need to execute swaps manually on the protocol website, but the system will automatically log and track them for airdrop eligibility.'
      case 'partial':
        return '⚠️ Partial Tracking: Activity can be tracked automatically after you perform it, but setup requires manual steps. The system monitors results automatically once positions are created.'
      case 'manual':
        return '📝 Manual Only: This activity must be performed manually on the protocol website. Results may be tracked after completion if you sync your wallet.'
      default:
        return ''
    }
  }

  const getAutomationLevelColor = (level: 'full' | 'partial' | 'manual') => {
    switch (level) {
      case 'full':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'manual':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Farming Activities</h1>
          <p className="mt-1 text-sm text-gray-600">
            Personalized recommendations to maximize your airdrop farming
          </p>
        </div>

        {/* Wallet Selector */}
        <WalletManager
          onWalletSelect={handleWalletSelect}
          selectedWallet={selectedWallet}
        />

        {/* Tab Navigation */}
        {selectedWallet && (
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('recommendations')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'recommendations'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Recommendations
              </button>
              <button
                onClick={() => setActiveTab('automation')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'automation'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Automation Activity
                {pendingApprovals.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                    {pendingApprovals.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        )}

        {/* Automation Tab */}
        {selectedWallet && activeTab === 'automation' && (
          <div className="space-y-6">
            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  ⏳ Pending Approvals ({pendingApprovals.length})
                </h2>
                <div className="space-y-4">
                  {pendingApprovals.map((approval) => (
                    <div
                      key={approval.id}
                      className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg shadow p-6"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {approval.action_type.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-600">
                              ${approval.estimated_cost_usd.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">
                            {approval.details?.reason || 'Action requires your approval'}
                          </p>
                          {approval.details?.positionInfo && (
                            <div className="text-xs text-gray-600 space-y-1">
                              <div>Position Value: ${approval.details.positionInfo.total_usd?.toFixed(2)}</div>
                              {approval.details.positionInfo.unclaimed_fees_usd > 0 && (
                                <div>Unclaimed Fees: ${approval.details.positionInfo.unclaimed_fees_usd.toFixed(2)}</div>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-2">
                            Expires: {new Date(approval.expires_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleApproval(approval.id, 'approve')}
                            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproval(approval.id, 'reject', 'Rejected by user')}
                            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Automation Logs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Automation Logs
                </h2>
                <button
                  onClick={runAutomation}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Run Automation Now
                </button>
              </div>

              {loadingAutomation ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading automation logs...</p>
                  </div>
                </div>
              ) : automationLogs.length > 0 ? (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Tip:</strong> Execute buttons appear for pending actions. Connect your wallet to execute transactions.
                    {!connected && (
                      <span className="block mt-1 text-xs text-blue-600">
                        ⚠️ Wallet not connected. Connect your wallet to see Execute buttons.
                      </span>
                    )}
                  </p>
                </div>
              ) : null}
              {automationLogs.length > 0 ? (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cost
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Details
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {automationLogs.map((log) => {
                        // Debug: Log each log to see its status
                        if (process.env.NODE_ENV === 'development') {
                          console.log('Automation log:', {
                            id: log.id,
                            status: log.status,
                            actionType: log.action_type,
                            hasTransaction: !!log.transaction_signature,
                            metadata: log.metadata,
                            canShowExecute: (log.status === 'pending' || log.status === 'approved') && !log.transaction_signature
                          })
                        }
                        return (
                        <tr key={log.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.action_type.replace('_', ' ')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                log.status === 'executed'
                                  ? 'bg-green-100 text-green-800'
                                  : log.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : log.status === 'pending' || log.status === 'approved'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${log.cost_usd.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {log.transaction_signature ? (
                              <a
                                href={`https://solscan.io/tx/${log.transaction_signature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                View Tx
                              </a>
                            ) : (
                              <span>{log.metadata?.reason || '-'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {(log.status === 'pending' || log.status === 'approved') && !log.transaction_signature ? (
                              <button
                                onClick={async () => {
                                  if (!canExecute) {
                                    alert('Please connect your wallet first to execute this action.')
                                    return
                                  }
                                  const result = await executeAction(log.id)
                                  if (result.success) {
                                    alert(`Transaction executed successfully!\nSignature: ${result.signature}\n\nView on Solscan: https://solscan.io/tx/${result.signature}`)
                                    // Reload automation logs
                                    if (selectedWallet) {
                                      await loadAutomationData(selectedWallet)
                                    }
                                  } else {
                                    alert(`Failed to execute: ${result.error}`)
                                  }
                                }}
                                disabled={isExecuting || !canExecute}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                  isExecuting || !canExecute
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                                }`}
                                title={!canExecute ? 'Connect your wallet to execute' : 'Execute this action'}
                              >
                                {isExecuting ? '⏳ Executing...' : '▶ Execute'}
                              </button>
                            ) : log.status === 'executed' && log.transaction_signature ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-green-600 font-medium">✓ Executed</span>
                                <a
                                  href={`https://solscan.io/tx/${log.transaction_signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                                >
                                  View Tx
                                </a>
                              </div>
                            ) : log.status === 'failed' ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-red-600 font-medium">✗ Failed</span>
                                {log.error_message && (
                                  <span className="text-xs text-gray-500" title={log.error_message}>
                                    {log.error_message.substring(0, 30)}...
                                  </span>
                                )}
                              </div>
                            ) : log.metadata?.requiresApproval ? (
                              <span className="text-xs text-yellow-600 font-medium">⏳ Approval Required</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">🤖</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Automation Activity Yet
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Automation logs will appear here once you approve a plan and automation runs.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recommendations Section */}
        {selectedWallet && activeTab === 'recommendations' && (
          <>
            {loadingRecs ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Analyzing your activity and generating recommendations...</p>
                </div>
              </div>
            ) : recommendations.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Your Personalized Recommendations ({recommendations.length})
                  </h2>
                  <button
                    onClick={() => generateRecommendations(selectedWalletId, selectedWallet)}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Refresh Recommendations
                  </button>
                </div>

                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-600"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {getPriorityLabel(rec.priority)}
                          </span>
                          {rec.protocols && (
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {rec.protocols.name}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {rec.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          {rec.description}
                        </p>
                        {rec.action_items && rec.action_items.items && (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">
                              Action Steps:
                            </h4>
                            <ul className="space-y-2">
                              {rec.action_items.items.map((item: string, idx: number) => (
                                <li key={idx} className="text-sm text-gray-700 flex items-start">
                                  <span className="text-indigo-600 mr-2">•</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                            {rec.action_items.points > 0 && (
                              <div className="mt-3 text-sm text-gray-600">
                                <span className="font-medium text-green-600">
                                  +{rec.action_items.points} potential points
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => completeRecommendation(rec.id)}
                        className="ml-4 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Mark Complete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🎉</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    All Caught Up!
                  </h3>
                  <p className="text-gray-600 mb-4">
                    No new recommendations at this time. Keep up the great work!
                  </p>
                  <button
                    onClick={() => generateRecommendations(selectedWalletId, selectedWallet)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Generate New Recommendations
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* All Farming Opportunities */}
        {!selectedWallet && farmingOpportunities.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                All Farming Opportunities
              </h2>
              {connected && publicKey ? (
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600 font-mono">
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                  </div>
                  <button
                    onClick={syncWalletAndFetchPositions}
                    disabled={syncingWallet}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {syncingWallet ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Syncing...
                      </span>
                    ) : (
                      '🔄 Sync Positions'
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  Connect wallet to sync positions
                </div>
              )}
            </div>

            {/* Current Active Positions */}
            {currentPositions.length > 0 && (
              <div className="mb-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>✅</span> Active DLMM Positions ({currentPositions.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentPositions.map((position, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {position.tokenX?.symbol}-{position.tokenY?.symbol}
                          </h4>
                          <p className="text-xs text-gray-500">Opened: {position.openedAt}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          position.metrics?.feeAPR24h > 0 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {position.metrics?.feeAPR24h > 0 ? 'Active' : 'Out of Range'}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Position Value:</span>
                          <span className="font-semibold text-gray-900">
                            ${position.totalValueUSD?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Token X ({position.tokenX?.symbol}):</span>
                          <span className="font-medium text-gray-900">
                            {position.tokenX?.amount?.toFixed(4) || '0'} (${((position.tokenX?.amount || 0) * (position.tokenX?.price || 0)).toFixed(2)})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Token Y ({position.tokenY?.symbol}):</span>
                          <span className="font-medium text-gray-900">
                            {position.tokenY?.amount?.toFixed(2) || '0'} (${((position.tokenY?.amount || 0) * (position.tokenY?.price || 0)).toFixed(2)})
                          </span>
                        </div>
                        {position.unclaimedFees?.usd > 0 && (
                          <div className="flex justify-between pt-2 border-t">
                            <span className="text-gray-600">Unclaimed Fees:</span>
                            <span className="font-semibold text-green-600">
                              ${position.unclaimedFees?.usd?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                        )}
                        {position.metrics?.feeAPR24h > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">24h APR:</span>
                            <span className="font-medium text-green-600">
                              {position.metrics?.feeAPR24h?.toFixed(2) || '0'}%
                            </span>
                          </div>
                        )}
                        <div className="pt-2">
                          <a
                            href={`https://app.meteora.ag/dlmm/${position.poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                          >
                            View on Meteora →
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {farmingOpportunities.map((opp, idx) => {
                // Check if this opportunity has an active position
                let activePosition: any = null
                
                // Match Meteora DLMM liquidity opportunities
                if (opp.id === 'meteora-add-lp' && opp.protocol === 'Meteora') {
                  // Use the first active Meteora position (all Meteora DLMM positions match this opportunity)
                  if (currentPositions.length > 0) {
                    activePosition = currentPositions[0]
                    console.log('Found active position for meteora-add-lp:', {
                      ...activePosition,
                      tokenX: {
                        symbol: activePosition.tokenX?.symbol,
                        amount: activePosition.tokenX?.amount,
                        price: activePosition.tokenX?.price,
                        calculatedUSD: (activePosition.tokenX?.amount || 0) * (activePosition.tokenX?.price || 0)
                      },
                      tokenY: {
                        symbol: activePosition.tokenY?.symbol,
                        amount: activePosition.tokenY?.amount,
                        price: activePosition.tokenY?.price,
                        calculatedUSD: (activePosition.tokenY?.amount || 0) * (activePosition.tokenY?.price || 0)
                      }
                    })
                  }
                }

                const isActive = !!activePosition && currentPositions.length > 0
                
                // Debug log
                if (opp.id === 'meteora-add-lp') {
                  console.log('Meteora Add LP opportunity:', {
                    oppId: opp.id,
                    currentPositionsCount: currentPositions.length,
                    activePosition: !!activePosition,
                    isActive
                  })
                }

                return (
                  <div 
                    key={idx} 
                    className={`rounded-lg shadow p-6 transition-all ${
                      isActive 
                        ? 'bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300' 
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-indigo-600">
                            {opp.protocol}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-green-500 text-white rounded-full">
                              ✅ ACTIVE
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 mt-1">
                          {opp.name}
                        </h3>
                      </div>
                      <div className="relative">
                        <span
                          className={`text-xs px-2 py-1 rounded border cursor-help ${getAutomationLevelColor(opp.automationLevel)}`}
                          onMouseEnter={() => setTooltipVisible(opp.id)}
                          onMouseLeave={() => setTooltipVisible(null)}
                        >
                          {opp.automationLevel}
                        </span>
                        {tooltipVisible === opp.id && (
                          <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                            <div className="font-semibold mb-1 capitalize">{opp.automationLevel} Automation</div>
                            <div>{getAutomationLevelTooltip(opp.automationLevel)}</div>
                            <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {opp.description}
                    </p>

                    {/* Active Position Data - Matching Meteora Display */}
                    {isActive && activePosition && currentPositions.length > 0 && (
                      <div className="mb-3 space-y-3">
                        {/* Position Summary Card */}
                        <div className="p-4 bg-white rounded-lg border border-green-200">
                          <div className="space-y-3 text-sm">
                            {/* Total Liquidity */}
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                              <span className="text-gray-600 font-medium">Total Liquidity:</span>
                              <span className="font-bold text-lg text-gray-900">
                                ${activePosition.totalValueUSD?.toFixed(2) || '0.00'}
                              </span>
                            </div>

                            {/* Fees Earned */}
                            {activePosition.unclaimedFees?.totalClaimedUSD > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">Fees Earned (Claimed):</span>
                                <span className="font-semibold text-green-600">
                                  ${activePosition.unclaimedFees?.totalClaimedUSD?.toFixed(2) || '0.00'}
                                </span>
                              </div>
                            )}

                            {/* Current Balance */}
                            <div className="pt-2 border-t border-gray-100">
                              <div className="text-xs text-gray-500 mb-1">Current Balance:</div>
                              <div className="space-y-1">
                                {activePosition.tokenX?.amount > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      {activePosition.tokenX?.amount?.toFixed(4) || '0'} {activePosition.tokenX?.symbol}
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      (${((activePosition.tokenX?.amount || 0) * (activePosition.tokenX?.price || 0)).toFixed(2)})
                                    </span>
                                  </div>
                                )}
                                {activePosition.tokenY?.amount > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">
                                      {activePosition.tokenY?.amount?.toFixed(2) || '0'} {activePosition.tokenY?.symbol}
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      (${((activePosition.tokenY?.amount || 0) * (activePosition.tokenY?.price || 0)).toFixed(2)})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Unclaimed Fees */}
                            {activePosition.unclaimedFees?.usd > 0 && (
                              <div className="pt-2 border-t border-gray-100">
                                <div className="text-xs text-gray-500 mb-1">Your Unclaimed Swap Fee:</div>
                                <div className="space-y-1">
                                  {activePosition.unclaimedFees?.tokenX > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">
                                        {activePosition.unclaimedFees?.tokenX?.toFixed(6) || '0'} {activePosition.tokenX?.symbol}
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        (${((activePosition.unclaimedFees?.tokenX || 0) * (activePosition.tokenX?.price || 0)).toFixed(2)})
                                      </span>
                                    </div>
                                  )}
                                  {activePosition.unclaimedFees?.tokenY > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">
                                        {activePosition.unclaimedFees?.tokenY?.toFixed(4) || '0'} {activePosition.tokenY?.symbol}
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        (${((activePosition.unclaimedFees?.tokenY || 0) * (activePosition.tokenY?.price || 1)).toFixed(2)})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Pool Info */}
                            <div className="pt-2 border-t border-gray-100">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Pool:</span>
                                <span className="font-medium text-gray-900">
                                  {activePosition.tokenX?.symbol}-{activePosition.tokenY?.symbol}
                                </span>
                              </div>
                              {activePosition.metrics?.feeAPR24h > 0 && (
                                <div className="flex justify-between mt-1">
                                  <span className="text-gray-600">24h Fee APR:</span>
                                  <span className="font-medium text-green-600">
                                    {activePosition.metrics?.feeAPR24h?.toFixed(2) || '0'}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Automation Status */}
                        {automationStatus && automationStatus.length > 0 && activePosition && (() => {
                          const status = automationStatus.find((s: any) => 
                            s.position.poolAddress === activePosition.poolAddress
                          )
                          if (!status) return null

                          return (
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="text-xs font-semibold text-blue-900 mb-2">🤖 Automation Status</div>
                              <div className="space-y-2 text-xs">
                                {/* Fee Claim Status */}
                                {status.feeClaim.enabled && (
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900">Auto-Claim Fees</div>
                                      {status.feeClaim.canClaim ? (
                                        <div className="text-green-600 mt-0.5">
                                          ✅ Ready to claim (${status.feeClaim.current.toFixed(2)})
                                        </div>
                                      ) : status.feeClaim.onCooldown ? (
                                        <div className="text-blue-600 mt-0.5">
                                          ⏸️ On cooldown: {status.feeClaim.cooldownHours}h remaining
                                        </div>
                                      ) : status.feeClaim.pending ? (
                                        <div className="text-yellow-600 mt-0.5">
                                          ⏳ Pending: ${status.feeClaim.current.toFixed(2)} / ${status.feeClaim.threshold.toFixed(2)} (${status.feeClaim.remaining.toFixed(2)} until threshold)
                                        </div>
                                      ) : (
                                        <div className="text-gray-500 mt-0.5">No fees to claim</div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Rebalance Status */}
                                {status.rebalance.enabled && (
                                  <div className="flex items-start justify-between pt-2 border-t border-blue-200">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900">Auto-Rebalance</div>
                                      {status.rebalance.needed ? (
                                        <div className="text-orange-600 mt-0.5">
                                          ⚠️ Position out of range - rebalance needed
                                        </div>
                                      ) : (
                                        <div className="text-green-600 mt-0.5">✅ Position in range</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                      <span>{opp.estimatedTime}</span>
                      <span className="text-green-600 font-medium">
                        +{opp.pointsValue} points
                      </span>
                    </div>
                    {opp.actionUrl && (
                      <div className="mt-3">
                        <a
                          href={opp.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block w-full text-center px-4 py-2 text-sm rounded-lg transition-colors ${
                            isActive
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          {isActive 
                            ? 'Manage Position →'
                            : opp.automationLevel === 'full' 
                            ? 'Go to Protocol →' 
                            : opp.automationLevel === 'partial'
                            ? 'Go to Protocol →'
                            : 'Start Activity →'}
                        </a>
                        {opp.automationLevel === 'full' && !isActive && (
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            💡 After swapping, sync your wallet to automatically track the transaction
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Automation Activities Summary */}
            {automationStatus && automationStatus.length > 0 && automationConfig && (
              <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>🤖</span> Automation Activities Status
                </h3>
                <div className="space-y-4">
                  {automationStatus.map((status: any, idx: number) => (
                    <div key={idx} className="bg-white rounded-lg p-4 border border-purple-200">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {status.position.tokenX?.symbol}-{status.position.tokenY?.symbol} Position
                          </h4>
                          <p className="text-xs text-gray-500">Pool: {status.position.poolAddress?.slice(0, 8)}...{status.position.poolAddress?.slice(-6)}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          status.position.metrics?.feeAPR24h > 0 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {status.position.metrics?.feeAPR24h > 0 ? 'Active' : 'Out of Range'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Auto-Claim Fees */}
                        {status.feeClaim.enabled && (
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900">💰 Auto-Claim Fees</span>
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                status.feeClaim.canClaim 
                                  ? 'bg-green-100 text-green-800' 
                                  : status.feeClaim.pending || status.feeClaim.onCooldown
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {status.feeClaim.canClaim ? 'ACTIVE' : status.feeClaim.pending || status.feeClaim.onCooldown ? 'PENDING' : 'INACTIVE'}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              {status.feeClaim.canClaim ? (
                                <div className="space-y-2">
                                  <div className="text-green-600 font-medium">
                                    ✅ Ready to execute - ${status.feeClaim.current.toFixed(2)} meets ${status.feeClaim.threshold.toFixed(2)} threshold
                                  </div>
                                  <button
                                    onClick={async () => {
                                      if (!canExecute) {
                                        alert('Please connect your wallet first to execute fee claim.')
                                        return
                                      }
                                      
                                      // Find the pending fee claim log for this position
                                      const claimLog = automationLogs.find(
                                        log => 
                                          log.action_type === 'claim_fees' &&
                                          log.status === 'pending' &&
                                          log.position_nft_address === status.position.nftAddress &&
                                          !log.transaction_signature
                                      )
                                      
                                      if (!claimLog) {
                                        // If no log exists, run automation to create one, then execute
                                        alert('No pending fee claim log found. Running automation to create one...')
                                        await runAutomation()
                                        // Wait a moment for log to be created
                                        setTimeout(async () => {
                                          await loadAutomationData(selectedWallet)
                                          const newLog = automationLogs.find(
                                            log => 
                                              log.action_type === 'claim_fees' &&
                                              log.status === 'pending' &&
                                              log.position_nft_address === status.position.nftAddress
                                          )
                                          if (newLog) {
                                            const result = await executeAction(newLog.id)
                                            if (result.success) {
                                              alert(`Fee claim executed successfully!\nSignature: ${result.signature}`)
                                              await loadAutomationData(selectedWallet)
                                            } else {
                                              alert(`Failed to execute: ${result.error}`)
                                            }
                                          } else {
                                            alert('Please check the Automation Activity tab for the fee claim log.')
                                            setActiveTab('automation')
                                          }
                                        }, 2000)
                                        return
                                      }
                                      
                                      // Execute the found log
                                      const result = await executeAction(claimLog.id)
                                      if (result.success) {
                                        alert(`Fee claim executed successfully!\nSignature: ${result.signature}\n\nView on Solscan: https://solscan.io/tx/${result.signature}`)
                                        await loadAutomationData(selectedWallet)
                                      } else {
                                        alert(`Failed to execute fee claim: ${result.error}`)
                                      }
                                    }}
                                    disabled={isExecuting || !canExecute}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                      isExecuting || !canExecute
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                                  >
                                    {isExecuting ? '⏳ Executing...' : '▶ Execute Claim'}
                                  </button>
                                </div>
                              ) : status.feeClaim.onCooldown ? (
                                <div className="text-blue-600">
                                  ⏸️ On cooldown: {status.feeClaim.cooldownHours}h remaining (max once per {automationConfig.claim_fee_interval_hours}h)
                                </div>
                              ) : status.feeClaim.pending ? (
                                <div className="text-yellow-600">
                                  ⏳ Pending: Current ${status.feeClaim.current.toFixed(2)}, need ${status.feeClaim.remaining.toFixed(2)} more until ${status.feeClaim.threshold.toFixed(2)} threshold
                                </div>
                              ) : (
                                <div className="text-gray-500">No unclaimed fees</div>
                              )}
                              <div className="text-gray-500 mt-1">
                                Threshold: ${status.feeClaim.threshold.toFixed(2)} | Cooldown: {automationConfig.claim_fee_interval_hours}h
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Auto-Rebalance */}
                        {status.rebalance.enabled && (
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900">⚖️ Auto-Rebalance</span>
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                status.rebalance.pending 
                                  ? 'bg-orange-100 text-orange-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {status.rebalance.pending ? 'PENDING' : 'ACTIVE'}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              {status.rebalance.pending ? (
                                <div className="space-y-2">
                                  <div className="text-orange-600 font-medium">
                                    ⚠️ Position out of range - rebalance ready to execute
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={async () => {
                                        if (!canExecute) {
                                          alert('Please connect your wallet first to execute rebalance.')
                                          return
                                        }
                                        
                                        // Find the pending rebalance log for this position
                                        const rebalanceLog = automationLogs.find(
                                          log => 
                                            log.action_type === 'rebalance' &&
                                            log.status === 'pending' &&
                                            log.position_nft_address === status.position.nftAddress &&
                                            !log.transaction_signature
                                        )
                                        
                                        if (!rebalanceLog) {
                                          // If no log exists, run automation to create one, then execute
                                          alert('No pending rebalance log found. Running automation to create one...')
                                          await runAutomation()
                                          // Wait a moment for log to be created
                                          setTimeout(async () => {
                                            await loadAutomationData(selectedWallet)
                                            const newLog = automationLogs.find(
                                              log => 
                                                log.action_type === 'rebalance' &&
                                                log.status === 'pending' &&
                                                log.position_nft_address === status.position.nftAddress
                                            )
                                            if (newLog) {
                                              const result = await executeAction(newLog.id)
                                              if (result.success) {
                                                alert(`Rebalance executed successfully!\nSignature: ${result.signature}`)
                                                await loadAutomationData(selectedWallet)
                                              } else {
                                                alert(`Failed to execute: ${result.error}`)
                                              }
                                            } else {
                                              alert('Please check the Automation Activity tab for the rebalance log.')
                                              setActiveTab('automation')
                                            }
                                          }, 2000)
                                          return
                                        }
                                        
                                        // Execute the found log
                                        const result = await executeAction(rebalanceLog.id)
                                        if (result.success) {
                                          alert(`Rebalance executed successfully!\nSignature: ${result.signature}\n\nView on Solscan: https://solscan.io/tx/${result.signature}`)
                                          await loadAutomationData(selectedWallet)
                                        } else {
                                          alert(`Failed to execute rebalance: ${result.error}`)
                                        }
                                      }}
                                      disabled={isExecuting || !canExecute}
                                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                        isExecuting || !canExecute
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                          : 'bg-orange-600 text-white hover:bg-orange-700'
                                      }`}
                                    >
                                      {isExecuting ? '⏳ Executing...' : '▶ Execute Rebalance'}
                                    </button>
                                    {!canExecute && (
                                      <span className="text-gray-500 text-xs">
                                        Connect wallet to execute
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-green-600">
                                  ✅ Position in range - no rebalance needed
                                </div>
                              )}
                              <div className="text-gray-500 mt-1">
                                Threshold: {status.rebalance.threshold}% | Cooldown: {automationConfig.rebalance_cooldown_hours}h
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

