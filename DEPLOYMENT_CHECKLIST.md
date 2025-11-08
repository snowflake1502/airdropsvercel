# ✅ Deployment Checklist

## 🔒 **Security Review**

### **Before Deploying:**

1. **Remove Hardcoded API Keys** ⚠️
   - [ ] Remove Helius API key from `src/lib/solana-rpc.ts` (line 15)
   - [ ] Ensure all credentials come from environment variables only
   - [ ] Hardcoded Supabase URL/key are OK (anon key is public-safe)

2. **Environment Variables**
   - [ ] All sensitive values are in `.env.local` (not committed)
   - [ ] `.env.local` is in `.gitignore` ✅ (already done)

---

## 📦 **Pre-Deployment Steps**

### **1. Test Build Locally**
```bash
npm run build
```
- [ ] Build succeeds without errors
- [ ] No TypeScript errors
- [ ] No missing dependencies

### **2. Remove Debug Files**
- [ ] Delete any temporary debug scripts (already done ✅)
- [ ] Remove console.log statements (optional, but recommended)

### **3. Update Hardcoded Values**

**File: `src/lib/solana-rpc.ts`**
- [ ] Remove hardcoded Helius API key
- [ ] Use only environment variables

**Files with hardcoded Supabase values:**
- These are fallbacks and safe (anon key is public)
- But better to remove for production:
  - `src/lib/supabase.ts`
  - `src/app/api/wallet/sync-meteora/route.ts`
  - `src/app/api/wallet/clear-transactions/route.ts`

---

## 🚀 **Vercel Deployment Steps**

### **Step 1: Prepare Repository**
```bash
# Ensure all changes are committed
git status

# If not committed:
git add .
git commit -m "Prepare for deployment"
```

### **Step 2: Push to GitHub**
```bash
# If not already pushed:
git push origin main
```

### **Step 3: Create Vercel Account**
- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Sign up/login with GitHub

### **Step 4: Import Project**
- [ ] Click "Add New Project"
- [ ] Select your GitHub repository
- [ ] Framework: Next.js (auto-detected)

### **Step 5: Configure Environment Variables**

In Vercel Dashboard → Settings → Environment Variables:

**Required Variables:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
```

- [ ] Add for **Production** environment
- [ ] Add for **Preview** environment (optional, can use same values)
- [ ] Add for **Development** environment (optional)

### **Step 6: Deploy**
- [ ] Click "Deploy"
- [ ] Wait for build to complete (2-3 minutes)
- [ ] Check build logs for errors

### **Step 7: Upgrade to Pro**
- [ ] Go to Settings → Billing
- [ ] Select Pro Plan ($20/month)
- [ ] This enables 60-second execution time (needed for 48s sync)

### **Step 8: Test Deployment**
- [ ] Visit your Vercel URL: `https://your-project.vercel.app`
- [ ] Test login/authentication
- [ ] Test wallet sync (use a small wallet first)
- [ ] Verify P&L calculations
- [ ] Check console for errors

---

## 🔧 **Post-Deployment Configuration**

### **Optional: Custom Domain**
- [ ] Go to Settings → Domains
- [ ] Add your custom domain
- [ ] Update DNS records as instructed

### **Optional: Monitoring**
- [ ] Enable Vercel Analytics (included with Pro)
- [ ] Set up error tracking (Sentry, etc.)

---

## 🐛 **Troubleshooting**

### **Build Fails**
- Check build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Ensure TypeScript compiles without errors

### **Environment Variables Not Working**
- Verify variables are set in Vercel dashboard
- Check variable names match exactly (case-sensitive)
- Redeploy after adding variables

### **Sync Times Out**
- Upgrade to Pro tier (60s limit)
- Or optimize sync to be faster (chunk processing)

### **Supabase Connection Fails**
- Verify Supabase project is not paused
- Check environment variables are correct
- Test Supabase connection from local first

---

## 📝 **Quick Deploy Command**

```bash
# 1. Test build
npm run build

# 2. Commit and push
git add .
git commit -m "Deploy to Vercel"
git push

# 3. Go to vercel.com and import repo
# 4. Add environment variables
# 5. Deploy!
# 6. Upgrade to Pro
```

---

## ✅ **Final Checklist**

- [ ] Build succeeds locally
- [ ] All environment variables configured in Vercel
- [ ] Hardcoded API keys removed (or documented as safe)
- [ ] Code pushed to GitHub
- [ ] Vercel project created and deployed
- [ ] Pro tier activated
- [ ] App tested and working
- [ ] Custom domain configured (optional)

---

**Ready to deploy! Follow the steps above. 🚀**

