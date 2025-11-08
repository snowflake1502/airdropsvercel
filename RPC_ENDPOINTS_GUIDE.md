# 🌐 Solana RPC Endpoints Guide

## ⚠️ Current Issue
The 403 errors you're seeing are due to RPC rate limiting. Free public endpoints have strict limits.

---

## 🎯 **Recommended Solution: Get Your Own Free RPC**

### **Option 1: Helius (BEST - Recommended)** ⭐

**Why Helius:**
- ✅ Most generous free tier
- ✅ 100,000 requests/day free
- ✅ Best performance
- ✅ No credit card required

**Setup Steps:**
1. Go to https://www.helius.dev/
2. Click "Start Building" → Sign up (free)
3. Create a new project
4. Copy your API key
5. Update `.env.local`:
   ```bash
   NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY_HERE
   ```

**Free Tier:**
- 100,000 credits/day
- Enough for development and testing
- No credit card needed

---

### **Option 2: Alchemy (Also Great)** ⭐

**Why Alchemy:**
- ✅ 300 million compute units/month free
- ✅ Reliable infrastructure
- ✅ Good documentation

**Setup Steps:**
1. Go to https://www.alchemy.com/
2. Sign up for free account
3. Create new app → Select "Solana" → "Mainnet"
4. Copy your API key from dashboard
5. Update `.env.local`:
   ```bash
   NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY_HERE
   ```

**Free Tier:**
- 300M compute units/month
- More than enough for testing
- Requires email signup

---

### **Option 3: QuickNode (Professional)**

**Why QuickNode:**
- ✅ Enterprise-grade
- ✅ Free tier available
- ✅ Best for production

**Setup Steps:**
1. Go to https://www.quicknode.com/
2. Sign up and create endpoint
3. Select Solana Mainnet
4. Copy your endpoint URL
5. Update `.env.local`:
   ```bash
   NEXT_PUBLIC_SOLANA_RPC_URL=YOUR_QUICKNODE_ENDPOINT
   ```

**Free Tier:**
- Limited requests/day
- Good for testing
- Upgrade for production

---

## 🆓 **Public Endpoints (Current - Limited)**

These work but have strict rate limits:

### **Currently Using:**
```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-mainnet.rpc.extrnode.com
```

### **Other Public Options:**
```bash
# Triton (backup)
https://solana-mainnet.rpc.extrnode.com

# Solana Labs (very limited)
https://api.mainnet-beta.solana.com

# Public Helius (rate limited)
https://rpc.helius.xyz/?api-key=public
```

**⚠️ Warning:** Public endpoints are:
- Rate limited (403 errors)
- Slower performance
- Not reliable for production
- Should only be used for quick testing

---

## 🚀 **Quick Fix (Right Now)**

I've updated your app to use a more reliable public endpoint, but you'll still hit rate limits.

**To fix permanently:**

1. **Get Helius API Key** (2 minutes):
   - Visit https://www.helius.dev/
   - Sign up (no credit card)
   - Create project
   - Copy API key

2. **Update `.env.local`**:
   ```bash
   NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   ```

3. **Restart server**:
   ```bash
   npm run dev
   ```

4. **Test again** - No more 403 errors! ✅

---

## 📊 **Comparison Table**

| Provider | Free Tier | Rate Limit | Signup | Best For |
|----------|-----------|------------|--------|----------|
| **Helius** | 100K/day | High | Email | Development ⭐ |
| **Alchemy** | 300M CU/month | High | Email | Production ⭐ |
| **QuickNode** | Limited | Medium | Email | Enterprise |
| **Public** | Very Low | Very Low | None | Quick Test Only |

---

## 🔧 **After Getting Your API Key**

1. Update `.env.local` with your new endpoint
2. Restart the dev server: `npm run dev`
3. Clear browser cache (Ctrl+Shift+R)
4. Reconnect your wallet
5. Navigate to Positions page
6. ✅ Should work perfectly!

---

## 💡 **Pro Tips**

1. **Never commit API keys to Git** (already handled in `.gitignore`)
2. **Use environment variables** (already set up)
3. **Get multiple API keys** (Helius + Alchemy as backup)
4. **Monitor usage** in provider dashboards
5. **Upgrade to paid tier** when going to production

---

## 🆘 **Still Getting 403 Errors?**

If you still see 403 errors after getting an API key:

1. **Check the API key is correct** in `.env.local`
2. **Restart the server** completely
3. **Clear browser cache** (Ctrl+Shift+R)
4. **Check provider dashboard** for usage limits
5. **Try a different provider** (Helius vs Alchemy)

---

## 📝 **Current Configuration**

Your `.env.local` should look like this:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# Solana RPC Configuration
# Option 1: Helius (Recommended)
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY

# Option 2: Alchemy
# NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Option 3: Public (current - rate limited)
# NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-mainnet.rpc.extrnode.com
```

---

**🎯 Bottom Line:** Get a free Helius API key (takes 2 minutes) and you'll never see 403 errors again!

