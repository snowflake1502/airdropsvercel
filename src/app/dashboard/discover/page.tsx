'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import Link from 'next/link'

interface AirdropOpportunity {
  id: string
  name: string
  protocol: string
  description: string
  minInvestment: number
  estimatedValue: string
  estimatedDate: string
  potential: 'confirmed' | 'high' | 'medium' | 'low'
  requirements: string[]
  website: string
  isActive?: boolean
}

const opportunities: AirdropOpportunity[] = [
  {
    id: 'meteora',
    name: 'Meteora DLMM',
    protocol: 'Meteora',
    description: 'Provide liquidity to Dynamic Liquidity Market Maker pools. Confirmed airdrop for active liquidity providers.',
    minInvestment: 50,
    estimatedValue: '$500 - $2,000',
    estimatedDate: 'Q1 2025',
    potential: 'confirmed',
    requirements: [
      'Provide liquidity for 30+ days',
      'Minimum $50 liquidity',
      'Active position management',
    ],
    website: 'https://meteora.ag',
  },
  {
    id: 'jupiter',
    name: 'Jupiter Perpetuals',
    protocol: 'Jupiter',
    description: 'Trade perpetuals or provide liquidity on Jupiter. High potential for airdrop based on trading volume.',
    minInvestment: 100,
    estimatedValue: '$1,000 - $5,000',
    estimatedDate: 'Q2 2025',
    potential: 'high',
    requirements: [
      'Active trading activity',
      'Provide JLP liquidity',
      'Use limit orders',
    ],
    website: 'https://jup.ag',
  },
  {
    id: 'sanctum',
    name: 'Sanctum LST Staking',
    protocol: 'Sanctum',
    description: 'Stake SOL in Sanctum Liquid Staking Tokens. Long-term staking significantly increases airdrop potential.',
    minInvestment: 200,
    estimatedValue: '$500 - $3,000',
    estimatedDate: 'Q2-Q3 2025',
    potential: 'high',
    requirements: [
      'Stake for 90+ days',
      'Hold multiple LST types',
      'Participate in governance',
    ],
    website: 'https://sanctum.so',
  },
  {
    id: 'drift',
    name: 'Drift Protocol',
    protocol: 'Drift',
    description: 'Trade perpetuals or provide liquidity on Drift. Active users get priority in airdrop distribution.',
    minInvestment: 150,
    estimatedValue: '$800 - $4,000',
    estimatedDate: 'Q2-Q3 2025',
    potential: 'high',
    requirements: [
      'Trade perpetuals regularly',
      'Provide insurance fund liquidity',
      'Maintain trading streak',
    ],
    website: 'https://drift.trade',
  },
  {
    id: 'magiceden',
    name: 'Magic Eden Trading',
    protocol: 'Magic Eden',
    description: 'Trade NFTs on Magic Eden. Volume and frequency matter for potential airdrop qualification.',
    minInvestment: 50,
    estimatedValue: '$200 - $1,000',
    estimatedDate: 'TBD',
    potential: 'medium',
    requirements: [
      'Regular NFT trading',
      'List NFTs for sale',
      'Use across multiple chains',
    ],
    website: 'https://magiceden.io',
  },
  {
    id: 'kamino',
    name: 'Kamino Finance',
    protocol: 'Kamino',
    description: 'Lend or borrow on Kamino. Higher TVL positions get better airdrop allocation.',
    minInvestment: 100,
    estimatedValue: '$300 - $1,500',
    estimatedDate: 'TBD',
    potential: 'medium',
    requirements: [
      'Lend assets on Kamino',
      'Borrow against collateral',
      'Maintain position for 30+ days',
    ],
    website: 'https://kamino.finance',
  },
]

export default function DiscoverPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'high' | 'medium' | 'low'>('all')
  const [activeProtocols, setActiveProtocols] = useState<string[]>([])
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
      loadActiveProtocols(user.id)
    }
    checkUser()
  }, [router])

  const loadActiveProtocols = async (userId: string) => {
    try {
      const { data: positions } = await supabase
        .from('manual_positions')
        .select('protocols(slug)')
        .eq('user_id', userId)
        .eq('is_active', true)

      const { data: transactions } = await supabase
        .from('position_transactions')
        .select('tx_type')
        .eq('user_id', userId)

      const activeList: string[] = []
      if (transactions && transactions.length > 0) {
        activeList.push('meteora') // If they have transactions, they're using Meteora
      }
      setActiveProtocols(activeList)
    } catch (error) {
      console.error('Error loading active protocols:', error)
    }
  }

  const filteredOpportunities = opportunities.filter(opp => {
    if (filter === 'all') return true
    return opp.potential === filter
  })

  const getPotentialBadge = (potential: string) => {
    switch (potential) {
      case 'confirmed':
        return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: '✅ Confirmed' }
      case 'high':
        return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', label: '🔵 High' }
      case 'medium':
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: '🟡 Medium' }
      case 'low':
        return { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', label: '⚪ Low' }
      default:
        return { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', label: potential }
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

  const confirmedCount = opportunities.filter(o => o.potential === 'confirmed').length
  const highCount = opportunities.filter(o => o.potential === 'high').length
  const mediumCount = opportunities.filter(o => o.potential === 'medium').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🎯 Discover Airdrops
          </h1>
          <p className="text-slate-400 mt-1">
            Find and start farming the best airdrop opportunities on Solana
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
            <p className="text-3xl font-bold text-white">{opportunities.length}</p>
            <p className="text-slate-400 text-sm">Total Opportunities</p>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
            <p className="text-3xl font-bold text-emerald-400">{confirmedCount}</p>
            <p className="text-emerald-400/70 text-sm">Confirmed Airdrops</p>
          </div>
          <div className="bg-cyan-500/10 rounded-xl p-4 border border-cyan-500/20">
            <p className="text-3xl font-bold text-cyan-400">{highCount}</p>
            <p className="text-cyan-400/70 text-sm">High Potential</p>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
            <p className="text-3xl font-bold text-amber-400">{mediumCount}</p>
            <p className="text-amber-400/70 text-sm">Medium Potential</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-800/30 rounded-xl border border-slate-700/50 w-fit">
          {[
            { key: 'all', label: 'All', count: opportunities.length },
            { key: 'confirmed', label: 'Confirmed', count: confirmedCount },
            { key: 'high', label: 'High', count: highCount },
            { key: 'medium', label: 'Medium', count: mediumCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === tab.key
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Opportunities Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredOpportunities.map((opp) => {
            const badge = getPotentialBadge(opp.potential)
            const isActive = activeProtocols.includes(opp.id)
            
            return (
              <div
                key={opp.id}
                className={`bg-slate-800/30 rounded-2xl border transition-all hover:border-slate-600/50 ${
                  isActive ? 'border-cyan-500/30 ring-1 ring-cyan-500/20' : 'border-slate-700/50'
                }`}
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center text-xl font-bold text-white">
                        {opp.protocol.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{opp.name}</h3>
                        <p className="text-slate-400 text-sm">{opp.protocol}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-3 py-1 ${badge.bg} ${badge.text} text-xs font-semibold rounded-full border ${badge.border}`}>
                        {badge.label}
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded-full border border-cyan-500/30">
                          🟢 Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-slate-300 text-sm mb-4 line-clamp-2">
                    {opp.description}
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-slate-500 text-xs">Min Investment</p>
                      <p className="text-white font-semibold">${opp.minInvestment}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Est. Value</p>
                      <p className="text-emerald-400 font-semibold">{opp.estimatedValue}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Est. Date</p>
                      <p className="text-white font-semibold">{opp.estimatedDate}</p>
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="mb-4">
                    <p className="text-slate-500 text-xs mb-2">Requirements:</p>
                    <ul className="space-y-1">
                      {opp.requirements.slice(0, 2).map((req, idx) => (
                        <li key={idx} className="text-slate-400 text-xs flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          {req}
                        </li>
                      ))}
                      {opp.requirements.length > 2 && (
                        <li className="text-slate-500 text-xs">
                          +{opp.requirements.length - 2} more requirements
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <a
                      href={opp.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                    >
                      {isActive ? 'Continue Farming →' : 'Start Farming →'}
                    </a>
                    <Link
                      href="/dashboard/portfolio"
                      className="px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
                    >
                      Track
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Empty State */}
        {filteredOpportunities.length === 0 && (
          <div className="text-center py-12">
            <span className="text-4xl mb-4 block">🔍</span>
            <p className="text-slate-400">No opportunities found for this filter</p>
            <button
              onClick={() => setFilter('all')}
              className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm"
            >
              Show all opportunities
            </button>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-gradient-to-r from-violet-500/10 to-cyan-500/10 rounded-2xl border border-violet-500/20 p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl">💡</span>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">How to Maximize Airdrop Rewards</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">1.</span>
                  Focus on confirmed airdrops first (highest ROI probability)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">2.</span>
                  Maintain consistent activity over time (30+ days recommended)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">3.</span>
                  Diversify across 2-3 protocols to maximize chances
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">4.</span>
                  Use automation to claim fees and manage positions efficiently
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

