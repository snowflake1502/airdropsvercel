# Step-by-Step: Adding Environment Variables in Vercel

## Quick Steps

### 1. Navigate to Your Project Settings

1. Go to https://vercel.com/dashboard
2. Click on your project: **"airdropsvercel"**
3. Click **"Settings"** in the top navigation bar

### 2. Open Environment Variables

1. In the left sidebar, click **"Environment Variables"**
2. You'll see a list of existing variables (if any)

### 3. Add Each Variable

Click **"Add New"** button and add these three variables one by one:

#### Variable 1: Supabase URL
- **Name:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** `https://mcakqykdtxlythsutgpx.supabase.co`
- **Environments:** ✅ Production ✅ Preview ✅ Development
- Click **"Save"**

#### Variable 2: Supabase Anon Key
- **Name:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY`
- **Environments:** ✅ Production ✅ Preview ✅ Development
- Click **"Save"**

#### Variable 3: Solana RPC URL
- **Name:** `NEXT_PUBLIC_SOLANA_RPC_URL`
- **Value:** `https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY`
  - Replace `YOUR_HELIUS_API_KEY` with your actual Helius API key
  - Or use public RPC: `https://api.mainnet-beta.solana.com` (rate-limited)
- **Environments:** ✅ Production ✅ Preview ✅ Development
- Click **"Save"**

### 4. Redeploy

After adding all variables:

1. Go to **"Deployments"** tab
2. Find the latest deployment (should be `177740c`)
3. Click the **"⋯"** (three dots) menu
4. Click **"Redeploy"**
5. Confirm the redeploy

### 5. Verify

After redeployment completes:
- Click **"Visit"** button on the deployment
- The app should load without the "Application error" message
- Check browser console for any remaining errors

## Visual Guide

```
Vercel Dashboard
  └── Your Project (airdropsvercel)
      └── Settings (top nav)
          └── Environment Variables (left sidebar)
              └── Add New (button)
                  └── Enter Name, Value, Select Environments
                      └── Save
```

## Important Notes

- ✅ Always select all three environments (Production, Preview, Development)
- ✅ Variable names are case-sensitive - must match exactly
- ✅ `NEXT_PUBLIC_` prefix is required for client-side variables
- ✅ After adding variables, you MUST redeploy for them to take effect
- ✅ Variables are encrypted and secure in Vercel

## Troubleshooting

**If variables don't work:**
1. Check spelling - names must match exactly
2. Ensure all environments are selected
3. Redeploy after adding variables
4. Check deployment logs for errors

**If you see "Application error":**
- This is likely because env vars aren't set yet
- Add the variables and redeploy
- Check browser console for specific error messages

