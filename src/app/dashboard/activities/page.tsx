'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import WalletManager from '@/components/WalletManager'
import { protocolManager } from '@/lib/protocols'

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
      
      // Load farming opportunities
      loadFarmingOpportunities()
    }
    checkUser()
  }, [router])

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

        {/* Recommendations Section */}
        {selectedWallet && (
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              All Farming Opportunities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {farmingOpportunities.map((opp, idx) => (
                <div key={idx} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-xs font-medium text-indigo-600">
                        {opp.protocol}
                      </span>
                      <h3 className="text-base font-semibold text-gray-900 mt-1">
                        {opp.name}
                      </h3>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {opp.automationLevel}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {opp.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{opp.estimatedTime}</span>
                    <span className="text-green-600 font-medium">
                      +{opp.pointsValue} points
                    </span>
                  </div>
                  {opp.actionUrl && (
                    <a
                      href={opp.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block w-full text-center px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      Start Activity →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

