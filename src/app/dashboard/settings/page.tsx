'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { useWallet } from '@solana/wallet-adapter-react'

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { publicKey, connected, disconnect } = useWallet()

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

  const handleSignOut = async () => {
    if (connected) {
      await disconnect()
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
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
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            ⚙️ Settings
          </h1>
          <p className="text-slate-400 mt-1">
            Manage your account and preferences
          </p>
        </div>

        {/* Account Information */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            👤 Account Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Email Address</label>
              <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white">
                {user?.email || 'Not available'}
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Account Created</label>
              <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        {/* Connected Wallet */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            👛 Connected Wallet
          </h2>
          {connected && publicKey ? (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-2">Wallet Address</label>
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white font-mono text-sm break-all">
                  {publicKey.toBase58()}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-medium transition-colors"
              >
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 text-center">
              <span className="text-3xl mb-2 block">🔌</span>
              <p className="text-slate-400 text-sm">No wallet connected</p>
              <p className="text-slate-500 text-xs mt-1">Connect your wallet using the button in the header</p>
            </div>
          )}
        </div>

        {/* Preferences */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            🎨 Preferences
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
              <div>
                <p className="text-white font-medium">Dark Mode</p>
                <p className="text-slate-500 text-sm">Always enabled for better experience</p>
              </div>
              <div className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium border border-emerald-500/30">
                Always On
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
              <div>
                <p className="text-white font-medium">Email Notifications</p>
                <p className="text-slate-500 text-sm">Get notified about important updates</p>
              </div>
              <span className="px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg text-sm">Coming Soon</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-white font-medium">Auto-refresh Data</p>
                <p className="text-slate-500 text-sm">Automatically refresh portfolio data</p>
              </div>
              <span className="px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg text-sm">Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-500/5 rounded-2xl border border-red-500/20 p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            ⚠️ Danger Zone
          </h2>
          <div className="space-y-4">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors border border-slate-700/50"
            >
              Sign Out
            </button>
            <button
              className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium transition-colors border border-red-500/20"
            >
              Delete Account
            </button>
          </div>
        </div>

        {/* Support */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl border border-cyan-500/20 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Need Help?</h2>
          <p className="text-slate-400 text-sm mb-4">
            Have questions about airdrop farming or need technical support?
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors border border-slate-700/50"
            >
              Twitter ↗
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors border border-slate-700/50"
            >
              Discord ↗
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
