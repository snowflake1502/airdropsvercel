'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'

export default function AnalyticsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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
    }
    checkUser()
  }, [router])

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
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            📊 Analytics
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              Coming Soon
            </span>
          </h1>
          <p className="text-slate-400 mt-1">
            Track your farming performance and airdrop probabilities
          </p>
        </div>

        {/* Coming Soon Hero */}
        <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/10 rounded-2xl border border-violet-500/20 p-12 text-center">
          <span className="text-6xl mb-6 block">📈</span>
          <h2 className="text-3xl font-bold text-white mb-3">Advanced Analytics Coming Soon</h2>
          <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
            We&apos;re building powerful analytics tools to help you track your airdrop farming performance
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
            {[
              { icon: '📊', title: 'Performance Tracking', desc: 'Track your P&L over time with detailed charts' },
              { icon: '🎯', title: 'Airdrop Probability', desc: 'Estimated chances based on your activity' },
              { icon: '💡', title: 'Smart Insights', desc: 'AI-powered recommendations to optimize returns' },
              { icon: '📅', title: 'Activity Calendar', desc: 'Visualize your farming consistency' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{feature.icon}</span>
                  <div>
                    <h3 className="text-white font-semibold">{feature.title}</h3>
                    <p className="text-slate-400 text-sm">{feature.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Activity Chart Placeholder */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Activity Trend</h3>
            <div className="h-48 flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="text-center">
                <span className="text-4xl mb-2 block opacity-50">📊</span>
                <p className="text-slate-500 text-sm">Chart coming soon</p>
              </div>
            </div>
          </div>

          {/* Airdrop Probability */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Airdrop Probability</h3>
            <div className="space-y-4">
              {[
                { name: 'Meteora', probability: 95, color: 'emerald' },
                { name: 'Jupiter', probability: 85, color: 'cyan' },
                { name: 'Sanctum', probability: 75, color: 'violet' },
                { name: 'Magic Eden', probability: 60, color: 'amber' }
              ].map((protocol) => (
                <div key={protocol.name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-slate-300">{protocol.name}</span>
                    <span className="text-sm text-slate-400">{protocol.probability}%</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div 
                      className={`bg-gradient-to-r ${
                        protocol.color === 'emerald' ? 'from-emerald-500 to-emerald-400' :
                        protocol.color === 'cyan' ? 'from-cyan-500 to-cyan-400' :
                        protocol.color === 'violet' ? 'from-violet-500 to-violet-400' :
                        'from-amber-500 to-amber-400'
                      } h-2 rounded-full transition-all`}
                      style={{ width: `${protocol.probability}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Stats */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">This Month</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-cyan-500/10 rounded-xl p-4 text-center border border-cyan-500/20">
                <p className="text-2xl font-bold text-cyan-400">0</p>
                <p className="text-slate-400 text-xs">Activities</p>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-500/20">
                <p className="text-2xl font-bold text-emerald-400">0%</p>
                <p className="text-slate-400 text-xs">Consistency</p>
              </div>
              <div className="bg-violet-500/10 rounded-xl p-4 text-center border border-violet-500/20">
                <p className="text-2xl font-bold text-violet-400">0</p>
                <p className="text-slate-400 text-xs">Protocols</p>
              </div>
            </div>
          </div>

          {/* Projected ROI */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Projected ROI</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-700/50">
                <span className="text-slate-400">Monthly Gas Costs</span>
                <span className="text-emerald-400 font-semibold">~$20-50</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/50">
                <span className="text-slate-400">Capital Deployed</span>
                <span className="text-white font-semibold">$0</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700/50">
                <span className="text-slate-400">Expected Airdrop Value</span>
                <span className="text-cyan-400 font-semibold">$5K-25K</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-white font-semibold">Projected ROI</span>
                <span className="text-emerald-400 font-bold text-lg">10,000%+</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
