'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PositionTrackerProps {
  userId: string
  onPositionAdded?: () => void
}

export default function PositionTracker({ userId, onPositionAdded }: PositionTrackerProps) {
  const [selectedProtocol, setSelectedProtocol] = useState<string>('')
  const [positionData, setPositionData] = useState<any>({})
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const protocols = [
    {
      slug: 'meteora',
      name: 'Meteora',
      fields: [
        { key: 'pool_address', label: 'Pool Address', placeholder: 'HTvjzsfX3y...', required: true },
        { key: 'position_id', label: 'Position ID / Name', placeholder: 'SOL-USDC-Pool', required: false },
        { key: 'sol_amount', label: 'SOL Amount', placeholder: '0.634089', type: 'number', required: false },
        { key: 'sol_usd', label: 'SOL Value ($)', placeholder: '118.05', type: 'number', required: false },
        { key: 'usdc_amount', label: 'USDC Amount', placeholder: '167.74', type: 'number', required: false },
        { key: 'total_usd', label: 'Total Position Value ($)', placeholder: '285.79', type: 'number', required: true },
        { key: 'unclaimed_fees', label: 'Unclaimed Fees (optional)', placeholder: '0.043 SOL + 8.16 USDC', required: false },
      ],
      instructions: 'Find your position on Meteora app → Portfolio → Click your DLMM pool. Copy pool address from URL and enter Current Balance amounts.'
    },
    {
      slug: 'jupiter',
      name: 'Jupiter',
      fields: [
        { key: 'jup_amount', label: 'JUP Token Amount', placeholder: '100', type: 'number', required: false },
        { key: 'staking_position', label: 'Staking Position ID (if staked)', placeholder: 'Position ID from vote.jup.ag', required: false },
        { key: 'weekly_volume', label: 'Approx Weekly Swap Volume ($)', placeholder: '500', type: 'number', required: false },
      ],
      instructions: 'Track your JUP holdings and staking positions'
    },
    {
      slug: 'sanctum',
      name: 'Sanctum',
      fields: [
        { key: 'lst_type', label: 'LST Token Type', placeholder: 'JitoSOL, mSOL, bSOL, etc.', required: true },
        { key: 'amount', label: 'LST Amount', placeholder: '1.5', type: 'number', required: true },
        { key: 'infinity_pool', label: 'Infinity Pool Position (Y/N)', placeholder: 'Y or N', required: false },
      ],
      instructions: 'Track your liquid staking token holdings'
    },
    {
      slug: 'magic-eden',
      name: 'Magic Eden',
      fields: [
        { key: 'collection_name', label: 'NFT Collection', placeholder: 'Mad Lads, Tensorians, etc.', required: true },
        { key: 'nft_count', label: 'Number of NFTs Held', placeholder: '2', type: 'number', required: true },
        { key: 'monthly_trades', label: 'Trades This Month', placeholder: '5', type: 'number', required: false },
      ],
      instructions: 'Track your NFT holdings and trading activity'
    },
  ]

  const selectedProtocolData = protocols.find(p => p.slug === selectedProtocol)

  const handleFieldChange = (key: string, value: string) => {
    setPositionData({ ...positionData, [key]: value })
  }

  const handleAddPosition = async () => {
    setError('')
    setAdding(true)

    try {
      // Get protocol ID
      const { data: protocol } = await supabase
        .from('protocols')
        .select('id')
        .eq('slug', selectedProtocol)
        .single()

      if (!protocol) {
        setError('Protocol not found')
        setAdding(false)
        return
      }

      // Store in manual_positions table
      const { error: insertError } = await supabase
        .from('manual_positions')
        .insert({
          user_id: userId,
          protocol_id: protocol.id,
          position_type: selectedProtocol,
          position_data: positionData,
          is_active: true,
        })

      if (insertError) throw insertError

      // Reset form
      setPositionData({})
      setSelectedProtocol('')
      setShowForm(false)
      
      if (onPositionAdded) onPositionAdded()
      
      alert('Position added successfully! ✅')
    } catch (err: any) {
      setError(err.message || 'Failed to add position')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Track Protocol Positions
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Position'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="space-y-4">
            {/* Protocol Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Protocol *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {protocols.map((protocol) => (
                  <button
                    key={protocol.slug}
                    onClick={() => {
                      setSelectedProtocol(protocol.slug)
                      setPositionData({})
                    }}
                    className={`p-3 border-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedProtocol === protocol.slug
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {protocol.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Protocol-Specific Fields */}
            {selectedProtocolData && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>How to find:</strong> {selectedProtocolData.instructions}
                  </p>
                </div>

                {selectedProtocolData.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label} {field.required && '*'}
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={positionData[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleAddPosition}
                  disabled={adding || !selectedProtocol}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {adding ? 'Adding Position...' : 'Add Position to Track'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Why Track Positions Directly?
          </h4>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>✅ More reliable than wallet scanning</li>
            <li>✅ Track exact positions that matter for airdrops</li>
            <li>✅ No RPC limits or connection issues</li>
            <li>✅ Manual control over what's tracked</li>
            <li>✅ Works even if wallet is not connected</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

