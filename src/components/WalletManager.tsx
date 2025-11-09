'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { supabase } from '@/lib/supabase'

interface TrackedWallet {
  id: string
  wallet_address: string
  nickname: string | null
  is_connected: boolean
  created_at: string
}

interface WalletManagerProps {
  onWalletSelect?: (walletAddress: string) => void
  selectedWallet?: string
}

export default function WalletManager({
  onWalletSelect,
  selectedWallet,
}: WalletManagerProps) {
  const { publicKey, connected } = useWallet()
  const [wallets, setWallets] = useState<TrackedWallet[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddWallet, setShowAddWallet] = useState(false)
  const [newWalletAddress, setNewWalletAddress] = useState('')
  const [newWalletNickname, setNewWalletNickname] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  // Fetch tracked wallets
  useEffect(() => {
    fetchWallets()
  }, [])

  // Auto-add connected wallet (only when wallets are loaded)
  useEffect(() => {
    if (connected && publicKey && !loading && wallets.length >= 0) {
      // Small delay to ensure wallets are loaded first
      const timer = setTimeout(() => {
        addConnectedWallet(publicKey.toBase58())
      }, 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, loading])

  const fetchWallets = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('tracked_wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setWallets(data || [])
    } catch (err) {
      console.error('Error fetching wallets:', err)
    } finally {
      setLoading(false)
    }
  }

  const addConnectedWallet = async (address: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        console.log('No user found, skipping wallet addition')
        return
      }

      // Check if wallet already exists
      const existing = wallets.find((w) => w.wallet_address === address)
      if (existing) {
        // Update to mark as connected (only if not already connected)
        if (!existing.is_connected) {
          const { error: updateError } = await supabase
            .from('tracked_wallets')
            .update({ is_connected: true })
            .eq('id', existing.id)
          
          if (updateError) {
            console.error('Error updating wallet connection status:', updateError)
            return
          }
          fetchWallets()
        }
        return
      }

      // Add new connected wallet
      const { data, error } = await supabase
        .from('tracked_wallets')
        .insert({
          user_id: user.id,
          wallet_address: address,
          nickname: 'Connected Wallet',
          is_connected: true,
        })
        .select()

      if (error) {
        // Check if it's a unique constraint violation (wallet already exists)
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          console.log('Wallet already exists, updating connection status')
          // Try to update instead
          const { error: updateError } = await supabase
            .from('tracked_wallets')
            .update({ is_connected: true })
            .eq('user_id', user.id)
            .eq('wallet_address', address)
          
          if (updateError) {
            console.error('Error updating existing wallet:', updateError)
          } else {
            fetchWallets()
          }
          return
        }
        throw error
      }

      if (data) {
        console.log('✅ Connected wallet added successfully')
        fetchWallets()
      }
    } catch (err: any) {
      // Only log if it's not a silent/expected error
      if (err?.code !== '23505' && err?.message !== 'duplicate') {
        console.error('Error adding connected wallet:', {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          error: err
        })
      }
    }
  }

  const addManualWallet = async () => {
    setError('')
    setAdding(true)

    try {
      // Validate wallet address
      try {
        new PublicKey(newWalletAddress)
      } catch {
        setError('Invalid Solana wallet address')
        setAdding(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Please log in first')
        setAdding(false)
        return
      }

      // Check if wallet already exists
      const existing = wallets.find((w) => w.wallet_address === newWalletAddress)
      if (existing) {
        setError('This wallet is already tracked')
        setAdding(false)
        return
      }

      // Add wallet
      const { error } = await supabase.from('tracked_wallets').insert({
        user_id: user.id,
        wallet_address: newWalletAddress,
        nickname: newWalletNickname || null,
        is_connected: false,
      })

      if (error) throw error

      // Reset form
      setNewWalletAddress('')
      setNewWalletNickname('')
      setShowAddWallet(false)
      fetchWallets()
    } catch (err: any) {
      setError(err.message || 'Failed to add wallet')
    } finally {
      setAdding(false)
    }
  }

  const deleteWallet = async (walletId: string) => {
    if (!confirm('Are you sure you want to stop tracking this wallet?')) return

    try {
      const { error } = await supabase
        .from('tracked_wallets')
        .delete()
        .eq('id', walletId)

      if (error) throw error
      fetchWallets()
    } catch (err) {
      console.error('Error deleting wallet:', err)
    }
  }

  const updateNickname = async (walletId: string, newNickname: string) => {
    try {
      const { error } = await supabase
        .from('tracked_wallets')
        .update({ nickname: newNickname })
        .eq('id', walletId)

      if (error) throw error
      fetchWallets()
    } catch (err) {
      console.error('Error updating nickname:', err)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="animate-pulse flex items-center space-x-2">
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Tracked Wallets ({wallets.length})
          </h3>
          <button
            onClick={() => setShowAddWallet(!showAddWallet)}
            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showAddWallet ? 'Cancel' : '+ Add Wallet'}
          </button>
        </div>
      </div>

      {/* Add Wallet Form */}
      {showAddWallet && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wallet Address *
              </label>
              <input
                type="text"
                value={newWalletAddress}
                onChange={(e) => setNewWalletAddress(e.target.value)}
                placeholder="Enter Solana wallet address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nickname (optional)
              </label>
              <input
                type="text"
                value={newWalletNickname}
                onChange={(e) => setNewWalletNickname(e.target.value)}
                placeholder="e.g., Main Wallet, Trading Wallet"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
            <button
              onClick={addManualWallet}
              disabled={adding || !newWalletAddress}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {adding ? 'Adding...' : 'Track This Wallet'}
            </button>
          </div>
        </div>
      )}

      {/* Wallet List */}
      <div className="divide-y divide-gray-200">
        {wallets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">👛</div>
            <p className="text-sm">No wallets tracked yet</p>
            <p className="text-xs mt-1">
              Add a wallet manually or connect your Phantom/Solflare wallet
            </p>
          </div>
        ) : (
          wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                selectedWallet === wallet.wallet_address ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
              }`}
              onClick={() => onWalletSelect?.(wallet.wallet_address)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    {wallet.is_connected && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Connected
                      </span>
                    )}
                    {wallet.nickname && (
                      <span className="text-sm font-medium text-gray-900">
                        {wallet.nickname}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-gray-600 truncate">
                    {wallet.wallet_address}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Added {new Date(wallet.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const newNickname = prompt(
                        'Enter new nickname:',
                        wallet.nickname || ''
                      )
                      if (newNickname !== null) {
                        updateNickname(wallet.id, newNickname)
                      }
                    }}
                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Edit nickname"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteWallet(wallet.id)
                    }}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete wallet"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Footer */}
      {connected && publicKey && (
        <div className="p-3 bg-blue-50 border-t border-blue-100">
          <div className="flex items-start space-x-2">
            <svg
              className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-xs text-blue-800">
              Your connected wallet has been automatically added to tracking.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}


