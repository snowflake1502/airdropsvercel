import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  isOpen: boolean
  onClose: () => void
  walletAddress: string
  positionNftAddress: string
  defaultPair?: string
  onSaved: () => Promise<void> | void
}

/**
 * Allows the user to upload a Metlex P&L summary and store the extracted numbers as an override.
 * We store this override in `manual_positions` to avoid requiring new DB migrations.
 */
export default function MetlexPnLOverrideModal({
  isOpen,
  onClose,
  walletAddress,
  positionNftAddress,
  defaultPair = 'SOL-USDC',
  onSaved,
}: Props) {
  const [pairName, setPairName] = useState(defaultPair)
  const [profitUSD, setProfitUSD] = useState('1')
  const [pnlPercent, setPnlPercent] = useState('0.47')
  const [tvlUSD, setTvlUSD] = useState('268')
  const [binStep, setBinStep] = useState('4')
  const [baseFeePercent, setBaseFeePercent] = useState('0.04')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    const toNum = (v: string) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    return {
      profitUSD: toNum(profitUSD),
      pnlPercent: toNum(pnlPercent),
      tvlUSD: toNum(tvlUSD),
      binStep: toNum(binStep),
      baseFeePercent: toNum(baseFeePercent),
    }
  }, [profitUSD, pnlPercent, tvlUSD, binStep, baseFeePercent])

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

      // Optional: attempt to upload the file to Supabase Storage if bucket exists.
      // If it fails, we still store the numeric override.
      let uploadedPath: string | null = null
      if (file) {
        try {
          const path = `metlex/${user.id}/${positionNftAddress}/${Date.now()}-${file.name}`
          const { error: upErr } = await supabase.storage
            .from('position-summaries')
            .upload(path, file, { upsert: true })
          if (!upErr) uploadedPath = path
        } catch {
          // ignore (bucket may not exist)
        }
      }

      const payload = {
        user_id: user.id,
        protocol_id: null,
        position_type: 'pnl_override',
        position_data: {
          protocol: 'meteora',
          source: 'metlex',
          wallet_address: walletAddress,
          position_nft_address: positionNftAddress,
          pair_name: pairName,
          profit_usd: parsed.profitUSD,
          pnl_percent: parsed.pnlPercent,
          tvl_usd: parsed.tvlUSD,
          bin_step: parsed.binStep,
          base_fee_percent: parsed.baseFeePercent,
          file_path: uploadedPath,
          uploaded_at: new Date().toISOString(),
        },
        notes: uploadedPath
          ? 'Metlex P&L summary uploaded to storage bucket position-summaries'
          : 'Metlex P&L summary stored without file (storage bucket not configured)',
        is_active: false,
      }

      const { error: insertError } = await supabase.from('manual_positions').insert(payload)
      if (insertError) throw new Error(insertError.message)

      await onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to save override')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700/60 bg-slate-950 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Override Closed Position P&L (Metlex)</h3>
            <p className="mt-1 text-sm text-slate-400">
              Upload the Metlex summary and store the key numbers as an override.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Position: <span className="text-slate-300">{positionNftAddress}</span>
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
          <label className="block md:col-span-2">
            <span className="text-xs text-slate-400">Metlex Summary File (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
            />
            <p className="mt-1 text-xs text-slate-500">
              If you want uploads, create a Supabase Storage bucket named <span className="text-slate-300">position-summaries</span>.
            </p>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Pair</span>
            <input
              value={pairName}
              onChange={(e) => setPairName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Profit (USD)</span>
            <input
              value={profitUSD}
              onChange={(e) => setProfitUSD(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              inputMode="decimal"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">PnL %</span>
            <input
              value={pnlPercent}
              onChange={(e) => setPnlPercent(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              inputMode="decimal"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">TVL (USD)</span>
            <input
              value={tvlUSD}
              onChange={(e) => setTvlUSD(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              inputMode="decimal"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Bin Step</span>
            <input
              value={binStep}
              onChange={(e) => setBinStep(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              inputMode="numeric"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Base Fee %</span>
            <input
              value={baseFeePercent}
              onChange={(e) => setBaseFeePercent(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60"
              inputMode="decimal"
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
            disabled={saving || parsed.profitUSD === 0}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Override'}
          </button>
        </div>
      </div>
    </div>
  )
}

