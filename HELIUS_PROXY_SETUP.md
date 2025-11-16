# Helius RPC Proxy Setup Guide

## ✅ What Was Implemented

A server-side RPC proxy that keeps your Helius API key secure (not exposed to browser).

## Architecture

```
Browser (Client) → /api/rpc (Proxy) → Helius RPC (Server-side, secure)
```

- **Client-side:** Uses `/api/rpc` proxy endpoint
- **Server-side:** Uses direct Helius URL (API key never exposed)

## Environment Variables Setup

### In Vercel Dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:

#### Required:
```
NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### For Helius RPC (Server-side only - NO NEXT_PUBLIC_ prefix):
```
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

**Important:** 
- ✅ Use `HELIUS_RPC_URL` (no `NEXT_PUBLIC_` prefix)
- ✅ This keeps your API key secure (server-side only)
- ❌ Don't use `NEXT_PUBLIC_HELIUS_RPC_URL` (would expose key)

### Fallback:
If `HELIUS_RPC_URL` is not set, the proxy will use the public Solana RPC:
```
https://api.mainnet-beta.solana.com
```

## How It Works

### Client-Side (Browser)
- `getRpcUrl()` returns: `https://your-domain.com/api/rpc`
- ConnectionProvider uses this proxy URL
- All RPC requests go through the proxy

### Server-Side (API Routes)
- `getServerRpcUrl()` returns: Direct Helius URL (from `HELIUS_RPC_URL` env var)
- Used in API routes like `/api/automation/execute`
- API key stays secure (never sent to browser)

### Proxy API Route (`/api/rpc`)
- Receives RPC requests from client
- Forwards them to Helius using server-side `HELIUS_RPC_URL`
- Returns response to client
- API key never exposed to browser

## Testing

1. **Check Proxy is Working:**
   - Visit: `https://your-domain.com/api/rpc` (GET request)
   - Should return: `{ status: 'ok', message: 'Solana RPC Proxy is running' }`

2. **Test RPC Calls:**
   - Connect wallet in your app
   - Check browser network tab
   - RPC calls should go to `/api/rpc`
   - Should work without errors

## Troubleshooting

### "RPC Proxy Error" in console
- Check `HELIUS_RPC_URL` is set in Vercel
- Verify API key is correct
- Check Vercel deployment logs

### RPC calls failing
- Ensure proxy route is deployed: `/api/rpc`
- Check CORS (shouldn't be an issue for same-origin)
- Verify Helius API key is valid

### Still using public RPC
- Check `HELIUS_RPC_URL` is set (without `NEXT_PUBLIC_` prefix)
- Redeploy after adding environment variable
- Check deployment logs for env var loading

## Security Benefits

✅ **API Key Protection:**
- Helius API key never exposed to browser
- Only accessible server-side
- Can't be stolen or abused by users

✅ **Rate Limiting:**
- All requests go through your proxy
- Can add rate limiting if needed
- Better control over usage

✅ **Monitoring:**
- Can log all RPC requests
- Track usage patterns
- Detect abuse

## Next Steps

1. Add `HELIUS_RPC_URL` to Vercel environment variables
2. Redeploy application
3. Test wallet connection
4. Verify RPC calls work through proxy

