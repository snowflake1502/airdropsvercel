import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  isOpen: boolean
  onClose: () => void
  walletAddress: string
  onSaved: () => Promise<void> | void
}

export default function ManualMeteoraPositionModal({
  isOpen,
  onClose,
  walletAddress,
  onSaved,
}: Props) {
  const [pairName, setPairName] = useState('SOL-USDC')
  const [valueUSD, setValueUSD] = useState('0')
  const [tokenXSymbol, setTokenXSymbol] = useState('SOL')
  const [tokenYSymbol, setTokenYSymbol] = useState('USDC')
  const [tokenXAmount, setTokenXAmount] = useState('')
  const [tokenYAmount, setTokenYAmount] = useState('')
  const [positionNftAddress, setPositionNftAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedValue = useMemo(() => {
    const n = Number(valueUSD)
    return Number.isFinite(n) ? n : 0
  }, [valueUSD])

  if (!isOpen) return null

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Not authenticated')

      const payload = {
        user_id: user.id,
        protocol_id: null,
        position_type: 'dlmm',
        position_data: {
          protocol: 'meteora',
          source: 'manual',
          wallet_address: walletAddress,
          pair_name: pairName,
          token_x_symbol: tokenXSymbol,
          token_y_symbol: tokenYSymbol,
          token_x_amount: tokenXAmount ? Number(tokenXAmount) : null,
          token_y_amount: tokenYAmount ? Number(tokenYAmount) : null,
          value_usd: parsedValue,
          position_nft_address: positionNftAddress || null,
          opened_at: new Date().toISOString(),
        },
        notes: notes || null,
        is_active: true,
      }

      const { error: insertError } = await supabase.from('manual_positions').insert(payload)
      if (insertError) throw new Error(insertError.message)

      await onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700/60 bg-slate-950 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Meteora Position (Manual)</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use this when automatic Meteora position detection is unreliable.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800/60"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-slate-400">Pair</span>
            <input
              value={pairName}
              onChange={(e) => setPairName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="SOL-USDC"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Value (USD)</span>
            <input
              value={valueUSD}
              onChange={(e) => setValueUSD(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="268"
              inputMode="decimal"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Token X Symbol</span>
            <input
              value={tokenXSymbol}
              onChange={(e) => setTokenXSymbol(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="SOL"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Token Y Symbol</span>
            <input
              value={tokenYSymbol}
              onChange={(e) => setTokenYSymbol(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="USDC"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Token X Amount (optional)</span>
            <input
              value={tokenXAmount}
              onChange={(e) => setTokenXAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Token Y Amount (optional)</span>
            <input
              value={tokenYAmount}
              onChange={(e) => setTokenYAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-xs text-slate-400">Position NFT Address (optional)</span>
            <input
              value={positionNftAddress}
              onChange={(e) => setPositionNftAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="CoaxzEh8p5YyGLc..."
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-xs text-slate-400">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              placeholder="Why this was added manually…"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || parsedValue <= 0}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Position'}
          </button>
        </div>
      </div>
    </div>
  )
}

