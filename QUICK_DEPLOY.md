# ⚡ Quick Deploy Guide - 5 Minutes to Production

## 🎯 **Recommended: Vercel Pro**

**Why:** Your sync takes ~48 seconds, which fits Vercel Pro's 60s limit perfectly.

---

## 🚀 **5-Minute Deployment**

### **Step 1: Test Build (30 seconds)**
```bash
npm run build
```
✅ If build succeeds, you're ready!

---

### **Step 2: Push to GitHub (1 minute)**

```bash
# If not already a git repo:
git init
git add .
git commit -m "Initial deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/airdrop-dashboard.git
git branch -M main
git push -u origin main
```

---

### **Step 3: Deploy to Vercel (2 minutes)**

1. **Go to [vercel.com](https://vercel.com)** → Sign up/Login with GitHub

2. **Click "Add New Project"**

3. **Import your repository** → Click "Import"

4. **Configure:**
   - Framework: Next.js (auto-detected) ✅
   - Root Directory: `./` ✅
   - Build Command: `npm run build` ✅
   - Output Directory: `.next` ✅

5. **Add Environment Variables** (Click "Environment Variables"):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   ```
   - ✅ Add for **Production**
   - ✅ Add for **Preview** (optional)

6. **Click "Deploy"** → Wait 2-3 minutes

---

### **Step 4: Upgrade to Pro (1 minute)**

1. Go to **Settings → Billing**
2. Click **"Upgrade to Pro"** ($20/month)
3. Enter payment info
4. ✅ Done! Now supports 60-second execution time

---

### **Step 5: Test (30 seconds)**

1. Visit your app: `https://your-project.vercel.app`
2. Test login
3. Test wallet sync
4. ✅ Everything working!

---

## 📋 **Environment Variables Checklist**

Make sure these are set in Vercel:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_SOLANA_RPC_URL`

**Where to find them:**
- Supabase: Dashboard → Settings → API
- Helius: Dashboard → API Keys

---

## 🎉 **You're Live!**

Your app is now running at: `https://your-project.vercel.app`

**Next Steps:**
- [ ] Test all features
- [ ] Set up custom domain (optional)
- [ ] Monitor usage in Vercel dashboard

---

## 🔄 **Future Updates**

Every time you push to GitHub:
1. Vercel automatically detects changes
2. Creates a preview deployment
3. Runs tests
4. Deploys to production (if on main branch)

**No manual deployment needed!** 🎯

---

## 💰 **Cost Breakdown**

- **Vercel Pro**: $20/month
  - 60-second execution time ✅
  - Unlimited bandwidth
  - Automatic SSL
  - Preview deployments
  - Analytics included

**Total: $20/month** (vs $15-30+ for VM + setup time)

---

## 🆘 **Need Help?**

**Build Fails?**
- Check build logs in Vercel dashboard
- Verify all dependencies in `package.json`

**Environment Variables Not Working?**
- Redeploy after adding variables
- Check variable names match exactly

**Sync Times Out?**
- Make sure Pro tier is activated
- Check execution time in logs

---

**Ready? Let's deploy! 🚀**

