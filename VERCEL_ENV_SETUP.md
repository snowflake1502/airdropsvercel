# Vercel Environment Variables Setup

## Required Environment Variables

To deploy successfully to Vercel, you need to set the following environment variables in your Vercel project settings:

### 1. Supabase Configuration

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY
```

### 2. Solana RPC Configuration

```
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

Or use the public RPC (rate-limited):
```
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## How to Add Environment Variables in Vercel

1. **Via Dashboard:**
   - Go to your project → Settings → Environment Variables
   - Click "Add New"
   - Enter the variable name and value
   - Select environments (Production, Preview, Development)
   - Click "Save"

2. **Via Vercel CLI:**
   ```bash
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add NEXT_PUBLIC_SOLANA_RPC_URL
   ```

## After Adding Environment Variables

1. **Redeploy:** Go to Deployments → Click "Redeploy" on the latest deployment
2. **Or:** Push a new commit to trigger automatic deployment

## Verification

After deployment, check:
- Build logs should show "✅ Loaded X env vars"
- Application should connect to Supabase successfully
- No "Missing Supabase environment variables" errors

## Troubleshooting

### Build Still Fails
- Ensure environment variables are set for **Production** environment
- Check variable names match exactly (case-sensitive)
- Redeploy after adding variables

### Runtime Errors
- Verify variables are accessible (check Vercel logs)
- Ensure `NEXT_PUBLIC_` prefix is used for client-side variables
- Check Supabase project is active and accessible
