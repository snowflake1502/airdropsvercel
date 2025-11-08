# RPC Configuration Guide

## Current Issue: Rate Limiting

Your wallet sync is hitting rate limits because:
1. **Helius Free Tier** has strict limits (~10-20 requests/second)
2. We're fetching 50 transactions at once

## Solution: Switch to Public RPC

### Option 1: Use Free Public Solana RPC (Recommended for now)

**Update your `.env.local` file:**

```env
# Comment out or remove the Helius RPC
# NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=201675f6-a0a5-41b0-8206-c5d1f81fc8f2

# Use public Solana RPC (free, but slower)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

**Pros:**
- ✅ Completely free
- ✅ Works reliably with our new 1-second delay
- ✅ No API key needed

**Cons:**
- ⏱️ Slower (1 second between requests = 50 transactions takes ~50 seconds)
- 🚫 May still hit rate limits if scanning very large wallets

### Option 2: Upgrade Helius (For Production)

If you need faster scanning, upgrade to Helius paid plan:

**Plans:**
- Free: 10 req/sec ($0/month)
- Hobby: 100 req/sec ($10/month)
- Growth: 1000 req/sec ($50/month)

Keep using:
```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

## Changes Made

### 1. Improved Meteora Transaction Detection
- Fixed string comparison bug in `isMeteoraDLMMTransaction`
- Now properly detects Meteora DLMM transactions by:
  - ✅ Checking account keys
  - ✅ Checking instruction program IDs
  - ✅ Checking log messages for "meteora" or program ID

### 2. Added Retry Logic
- Exponential backoff for rate limit errors (1s → 2s → 4s)
- Automatically retries up to 3 times on rate limits
- Gracefully handles failed transactions (returns null instead of crashing)

### 3. Increased Request Delay
- Changed from 300ms to **1000ms (1 second)** between requests
- Safe for both public RPC and free Helius tier
- Means scanning 50 transactions takes ~50 seconds (better than failing!)

## Cost Comparison

| Option | Monthly Cost | Request Rate | Best For |
|--------|-------------|--------------|----------|
| Public RPC | $0 | ~5 req/sec | Testing, occasional scans |
| Helius Free | $0 | ~10 req/sec | Light usage |
| Helius Hobby | $10 | 100 req/sec | Regular usage |
| Helius Growth | $50 | 1000 req/sec | Heavy/production usage |

## Recommendation

**For your current usage (scanning once in a while):**
→ Use **Public RPC** (free) with 1-second delay

**If you want faster scans:**
→ Upgrade to **Helius Hobby** ($10/month)

## Next Steps

1. **Update `.env.local`** to use public RPC
2. **Restart dev server**: Stop and run `npm run dev` again
3. **Test wallet sync** with your address: `8bCupLv3n8u9tToLBJ3e1SNL5p5oSyMPz9Mr3j8ZkbYR`
4. **Expect ~50 seconds** for 50 transactions (this is normal and safe!)

---

Last updated: 2025-10-19


