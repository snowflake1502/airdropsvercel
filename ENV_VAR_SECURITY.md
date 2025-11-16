# Environment Variable Security Guide

## ⚠️ Important: `NEXT_PUBLIC_` Variables Are Exposed to Browser

In Next.js, **any variable prefixed with `NEXT_PUBLIC_` is automatically bundled into the client-side JavaScript** and can be viewed by anyone in the browser.

## ✅ Safe to Expose (Current Variables)

### 1. `NEXT_PUBLIC_SUPABASE_URL`
- **Safe:** ✅ Yes, this is just a public URL
- **Why:** It's the public endpoint to your Supabase project
- **Risk:** None - it's meant to be public

### 2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Safe:** ✅ Yes, this is designed to be public
- **Why:** Supabase anon keys are specifically designed for client-side use
- **Security Model:** 
  - Security comes from **Row Level Security (RLS) policies**, not from hiding the key
  - Even if someone has your anon key, they can only access data your RLS policies allow
  - This is the standard way Supabase works
- **Risk:** Low - as long as RLS policies are properly configured

### 3. `NEXT_PUBLIC_SOLANA_RPC_URL`
- **Safe:** ⚠️ Depends on the URL
  - ✅ **Safe:** `https://api.mainnet-beta.solana.com` (public RPC, no key)
  - ⚠️ **RISKY:** `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` (contains API key)

## ⚠️ Security Concern: RPC URL with API Key

If your `NEXT_PUBLIC_SOLANA_RPC_URL` contains an API key (like Helius), **that key will be exposed** in the browser.

### Risks:
- Someone could use your API key
- Could lead to rate limiting on your account
- Could incur costs if you're on a paid plan
- API key could be revoked/abused

### Solutions:

#### Option 1: Use Public RPC (Recommended for now)
```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```
- ✅ Free
- ✅ No API key needed
- ⚠️ Rate-limited (may be slow under heavy load)

#### Option 2: Create a Proxy API Route (More Secure)
Create a server-side API route that uses your Helius key:

**Create:** `src/app/api/rpc/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL // Server-side only, no NEXT_PUBLIC_
  
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  
  const data = await response.json()
  return NextResponse.json(data)
}
```

Then update your RPC calls to use this proxy instead of direct Helius URL.

#### Option 3: Use Environment-Specific Variables
- Use public RPC for client-side (`NEXT_PUBLIC_SOLANA_RPC_URL`)
- Use Helius key only in server-side API routes (without `NEXT_PUBLIC_` prefix)

## 🔒 Best Practices

### ✅ Safe to Use `NEXT_PUBLIC_`:
- Public URLs
- Public API keys (like Supabase anon keys)
- Client-side configuration
- Public feature flags

### ❌ Never Use `NEXT_PUBLIC_`:
- Secret keys (service role keys, admin keys)
- Database passwords
- Private API keys (like Helius, Alchemy, etc.)
- Authentication tokens
- Payment keys

## Current Setup Assessment

Your current variables:
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Safe
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Safe (by design)
- ⚠️ `NEXT_PUBLIC_SOLANA_RPC_URL` - Check if it contains an API key

## Recommendation

For now, use the public Solana RPC:
```
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

If you need better performance later, implement Option 2 (proxy API route) to keep your Helius key server-side only.

