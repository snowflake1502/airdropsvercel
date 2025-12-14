'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { useWallet } from '@solana/wallet-adapter-react'

interface AutomationConfig {
  auto_claim_fees: boolean
  claim_fee_threshold_usd: number
  claim_fee_interval_hours: number
  auto_rebalance: boolean
  rebalance_threshold_percent: number
  is_active: boolean
}

interface AutomationLog {
  id: string
  action_type: string
  status: string
  details: any
  created_at: string
}

interface PendingApproval {
  id: string
  action_type: string
  amount_usd: number
  position_info: any
  created_at: string
}

export default function AutomationPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AutomationConfig>({
    auto_claim_fees: true,
    claim_fee_threshold_usd: 5.00,
    claim_fee_interval_hours: 24,
    auto_rebalance: true,
    rebalance_threshold_percent: 20,
    is_active: true,
  })
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'approvals' | 'logs'>('settings')
  const router = useRouter()
  const { publicKey, connected } = useWallet()

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

  useEffect(() => {
    if (user && connected && publicKey) {
      loadAutomationConfig()
      loadAutomationLogs()
      loadPendingApprovals()
    }
  }, [user, connected, publicKey])

  const loadAutomationConfig = async () => {
    if (!user || !publicKey) return
    
    try {
      const { data, error } = await supabase
        .from('automation_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', publicKey.toBase58())
        .single()

      if (data && !error) {
        setConfig({
          auto_claim_fees: data.auto_claim_fees,
          claim_fee_threshold_usd: data.claim_fee_threshold_usd,
          claim_fee_interval_hours: data.claim_fee_interval_hours,
          auto_rebalance: data.auto_rebalance,
          rebalance_threshold_percent: data.rebalance_threshold_percent,
          is_active: data.is_active,
        })
      }
    } catch (error) {
      console.log('No automation config found, using defaults')
    }
  }

  const loadAutomationLogs = async () => {
    if (!user || !publicKey) return

    try {
      const { data } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', publicKey.toBase58())
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setLogs(data)
      }
    } catch (error) {
      console.error('Error loading automation logs:', error)
    }
  }

  const loadPendingApprovals = async () => {
    if (!user || !publicKey) return

    try {
      const { data } = await supabase
        .from('automation_approvals')
        .select('*')
        .eq('user_id', user.id)
        .eq('wallet_address', publicKey.toBase58())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (data) {
        setPendingApprovals(data)
      }
    } catch (error) {
      console.error('Error loading pending approvals:', error)
    }
  }

  const saveConfig = async () => {
    if (!user || !publicKey) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('automation_configs')
        .upsert({
          user_id: user.id,
          wallet_address: publicKey.toBase58(),
          ...config,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,wallet_address'
        })

      if (error) throw error
      alert('Automation settings saved!')
    } catch (error: any) {
      console.error('Error saving config:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleMasterSwitch = async () => {
    const newConfig = { ...config, is_active: !config.is_active }
    setConfig(newConfig)
    
    if (user && publicKey) {
      try {
        await supabase
          .from('automation_configs')
          .upsert({
            user_id: user.id,
            wallet_address: publicKey.toBase58(),
            ...newConfig,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,wallet_address'
          })
      } catch (error) {
        console.error('Error toggling automation:', error)
      }
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
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🤖 Automation
            </h1>
            <p className="text-slate-400 mt-1">
              Automate fee claims, rebalancing, and position management
            </p>
          </div>
          
          {/* Master Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">Master Toggle</span>
            <button
              onClick={toggleMasterSwitch}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                config.is_active 
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500' 
                  : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  config.is_active ? 'translate-x-7' : ''
                }`}
              />
            </button>
            <span className={`font-semibold ${config.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
              {config.is_active ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Wallet Required Notice */}
        {!connected && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-amber-400 font-medium">Wallet Not Connected</p>
                <p className="text-amber-400/70 text-sm">Connect your wallet to configure automation settings</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-800/30 rounded-xl border border-slate-700/50 w-fit">
          {[
            { key: 'settings', label: '⚙️ Settings' },
            { key: 'approvals', label: `📋 Approvals ${pendingApprovals.length > 0 ? `(${pendingApprovals.length})` : ''}` },
            { key: 'logs', label: '📜 Execution Log' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Auto-Claim Fees */}
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💰</span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Auto-Claim Fees</h3>
                    <p className="text-slate-400 text-sm">Automatically claim fees when threshold is reached</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ ...config, auto_claim_fees: !config.auto_claim_fees })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.auto_claim_fees ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.auto_claim_fees ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
              
              {config.auto_claim_fees && (
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/50">
                  <div>
                    <label className="text-slate-400 text-sm mb-2 block">Minimum Threshold (USD)</label>
                    <input
                      type="number"
                      value={config.claim_fee_threshold_usd}
                      onChange={(e) => setConfig({ ...config, claim_fee_threshold_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm mb-2 block">Cooldown (hours)</label>
                    <input
                      type="number"
                      value={config.claim_fee_interval_hours}
                      onChange={(e) => setConfig({ ...config, claim_fee_interval_hours: parseInt(e.target.value) || 24 })}
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
                      min="1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Auto-Rebalance */}
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚖️</span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Auto-Rebalance</h3>
                    <p className="text-slate-400 text-sm">Rebalance positions when they go out of range</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ ...config, auto_rebalance: !config.auto_rebalance })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    config.auto_rebalance ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.auto_rebalance ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
              
              {config.auto_rebalance && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <label className="text-slate-400 text-sm mb-2 block">Threshold (%)</label>
                  <input
                    type="number"
                    value={config.rebalance_threshold_percent}
                    onChange={(e) => setConfig({ ...config, rebalance_threshold_percent: parseFloat(e.target.value) || 20 })}
                    className="w-full max-w-xs bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500/50"
                    min="5"
                    max="100"
                  />
                  <p className="text-slate-500 text-xs mt-2">
                    Rebalance when position is more than {config.rebalance_threshold_percent}% out of range
                  </p>
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={saveConfig}
              disabled={saving || !connected}
              className="w-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}

        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <div className="space-y-4">
            {pendingApprovals.length > 0 ? (
              pendingApprovals.map((approval) => (
                <div key={approval.id} className="bg-slate-800/30 rounded-2xl border border-amber-500/20 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⏳</span>
                      <div>
                        <h3 className="text-white font-semibold">
                          {approval.action_type === 'fee_claim' ? 'Claim Fees' : 'Rebalance Position'}
                        </h3>
                        <p className="text-slate-400 text-sm">
                          Amount: ${approval.amount_usd?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          {new Date(approval.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">
                        Reject
                      </button>
                      <button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                        Approve & Sign
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-12 text-center">
                <span className="text-4xl mb-4 block">✅</span>
                <p className="text-white font-semibold mb-1">No Pending Approvals</p>
                <p className="text-slate-400 text-sm">All caught up! Check back later for new actions.</p>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
            {logs.length > 0 ? (
              <div className="divide-y divide-slate-700/50">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {log.status === 'success' ? '✅' : 
                           log.status === 'failed' ? '❌' : 
                           log.status === 'pending' ? '⏳' : '📋'}
                        </span>
                        <div>
                          <p className="text-white font-medium">
                            {log.action_type === 'fee_claim' ? 'Fee Claim' :
                             log.action_type === 'rebalance' ? 'Rebalance' : log.action_type}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                        log.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <span className="text-4xl mb-4 block">📭</span>
                <p className="text-white font-semibold mb-1">No Automation Logs Yet</p>
                <p className="text-slate-400 text-sm">Automation actions will appear here once executed</p>
              </div>
            )}
          </div>
        )}

        {/* Info Card */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl border border-cyan-500/20 p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl">💡</span>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">How Automation Works</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">•</span>
                  Automation runs every 5 minutes to check your positions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">•</span>
                  Fee claims require wallet signature for security
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">•</span>
                  Large transactions may require manual approval
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">•</span>
                  All actions are logged for your review
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}



