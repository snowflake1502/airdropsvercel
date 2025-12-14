# Release Notes v1.2.0 - Portfolio Value & P&L Tracking

**Release Date:** December 7, 2025  
**Tag:** `v1.2.0`  
**Commit:** `8c13c6f`

## 🎯 Overview

This release delivers accurate portfolio value tracking that matches Jupiter Portfolio, along with enhanced P&L calculations and gamified daily task tracking.

## ✨ New Features

### Portfolio Value Calculation
- **Total Portfolio Value** now includes all assets:
  - 🟡 Native SOL balance
  - 💵 USDC balance
  - ⭐ Sanctum LST holdings (INF, mSOL, JitoSOL, etc.)
  - 🌊 Meteora LP position value

### Meteora LP Value Estimation
- Calculates net value per NFT position: `deposits - withdrawals`
- Accurately tracks active positions only
- Shows LP value badge in portfolio overview

### Sanctum LST Support
- Proper INF token detection (mint: `5oVNBeEE...`)
- Exchange rate support (INF = 1.38x SOL)
- Multiple LST support with varying rates:
  - INF: 1.38x
  - mSOL: 1.12x
  - JitoSOL: 1.10x
  - bSOL: 1.08x
  - And 20+ more LSTs

### P&L Display Options
- Toggle between **USD** and **SOL** P&L display
- Set custom **Initial Investment** (default: 5 SOL)
- Calculates: `Current Total SOL Equivalent - Initial Investment`

### Multi-Protocol Detection
- **Jupiter**: Detects swaps via Jupiter v2-v6 and aggregated DEXs (Raydium, Orca, Fluxbeam, etc.)
- **Sanctum**: Detects LST holdings and staking positions
- **Meteora**: Tracks DLMM LP positions from transaction history

### Gamified Daily Tasks
- Auto-detection of completed activities
- Manual task completion toggle
- Database persistence (Supabase `daily_tasks` table)
- Protocol progress tracking with points
- Weekly activity summary

### Active Positions by Protocol
- Shows breakdown: Meteora LP, Sanctum LST, Jupiter orders
- Visual protocol icons in dashboard

## 🐛 Bug Fixes

- Fixed Meteora LP double-counting (was summing all deposits instead of net value)
- Fixed INF token label (was showing as "scnSOL")
- Fixed authentication errors in sync endpoints
- Fixed task reset after wallet sync

## 📊 Console Logging

Enhanced debug output:
```
🌊 NFT abc123...: deposits=$500, withdrawals=$100, net=$400
🌊 Total Meteora LP value: 400.00
⭐ INF: 0.72 × 1.38 = 0.9967 SOL
📊 Position calculation: { totalOpens: 3, totalCloses: 2, activePositions: 1, ... }
```

## 🔄 How to Restore This Checkpoint

If you need to rollback to this version:

```bash
# View all tags
git tag -l

# Checkout this release
git checkout v1.2.0

# Or reset to this release (WARNING: discards newer changes)
git reset --hard v1.2.0
```

## 📁 Key Files Modified

- `src/app/dashboard/page.tsx` - Portfolio stats calculation
- `src/lib/jupiter-api.ts` - Multi-protocol detection
- `src/components/AirdropQuest.tsx` - Gamified tasks
- `src/lib/task-storage.ts` - Task persistence

## 🗄️ Database Requirements

Requires `daily_tasks` table in Supabase:
```sql
CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  wallet_address TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_date DATE NOT NULL,
  protocol TEXT NOT NULL,
  task_name TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_address, task_id, task_date)
);
```

## 📝 Notes

- Portfolio value may differ slightly from Jupiter due to:
  - RPC caching delays
  - LP value is estimated from transaction history (not real-time pool state)
  - Exchange rates are approximate (updated periodically)

---

**Previous Release:** v1.1.0 (Meteora Tracking)  
**Next Planned:** v1.3.0 (Real-time LP value via Meteora API)



