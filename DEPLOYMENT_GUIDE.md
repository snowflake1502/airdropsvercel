# 🚀 Deployment Guide - Airdrop Dashboard

## 📊 Deployment Options Comparison

### **Option 1: Vercel (Recommended ✅)**

**Pros:**
- ✅ **Zero-config** - Built by Next.js creators, optimized for Next.js
- ✅ **Automatic CI/CD** - Push to Git = auto-deploy
- ✅ **Free tier available** - Good for testing
- ✅ **Edge network** - Fast global CDN
- ✅ **Automatic HTTPS** - SSL certificates included
- ✅ **Environment variables** - Easy management in dashboard
- ✅ **Preview deployments** - Test before production
- ✅ **Serverless scaling** - Handles traffic spikes automatically

**Cons:**
- ⚠️ **Execution time limits**: 
  - Free: 10 seconds
  - Pro ($20/mo): 60 seconds
  - Your sync takes ~48 seconds → **Needs Pro tier**
- ⚠️ **Cold starts** - First request after inactivity can be slow

**Cost:**
- Free: $0 (limited to 10s execution)
- Pro: $20/month (60s execution, unlimited bandwidth)
- Enterprise: Custom pricing

**Best For:** Production deployment, easy maintenance, automatic updates

---

### **Option 2: GCP VM (Alternative)**

**Pros:**
- ✅ **No execution limits** - Can run long processes
- ✅ **Full control** - Custom server configuration
- ✅ **Persistent storage** - Files persist between deployments
- ✅ **Always-on** - No cold starts

**Cons:**
- ❌ **More setup** - Need to configure server, nginx, SSL, etc.
- ❌ **Manual updates** - Need to SSH and deploy manually
- ❌ **More expensive** - ~$10-30/month minimum
- ❌ **Maintenance** - Need to manage server updates, security patches
- ❌ **No auto-scaling** - Need to configure load balancing

**Cost:**
- e2-micro: ~$6/month (1 vCPU, 1GB RAM) - **Too small for Next.js**
- e2-small: ~$15/month (2 vCPU, 2GB RAM) - **Minimum recommended**
- e2-medium: ~$30/month (2 vCPU, 4GB RAM) - **Comfortable**

**Best For:** Long-running processes, custom requirements, full control

---

## 🎯 **Recommendation: Vercel Pro**

**Why Vercel Pro is better:**

1. **Your sync takes ~48 seconds** → Fits within 60s Pro limit ✅
2. **Zero maintenance** → Focus on features, not infrastructure
3. **Automatic deployments** → Push to Git = live in 2 minutes
4. **Better DX** → Preview deployments, rollbacks, analytics
5. **Cost-effective** → $20/month vs $15-30+ for VM + setup time

**Optimization Option:** If you want to stay on free tier, we can optimize the sync to be faster (chunked processing, parallel requests).

---

## 📋 **Vercel Deployment Steps**

### **Step 1: Prepare Your Code**

1. **Ensure `.env.local` is NOT committed** (should be in `.gitignore`)
2. **Remove hardcoded credentials** from code (if any)
3. **Test build locally:**
   ```bash
   npm run build
   ```

### **Step 2: Push to GitHub**

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Ready for deployment"

# Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/airdrop-dashboard.git
git branch -M main
git push -u origin main
```

### **Step 3: Deploy to Vercel**

1. **Go to [vercel.com](https://vercel.com)** and sign up/login
2. **Click "Add New Project"**
3. **Import your GitHub repository**
4. **Configure project:**
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

### **Step 4: Add Environment Variables**

In Vercel dashboard → Project Settings → Environment Variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://mcakqykdtxlythsutgpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Solana RPC
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

**Important:** 
- Add these for **Production**, **Preview**, and **Development** environments
- Use the same values for all environments (or different RPC keys per env)

### **Step 5: Deploy**

1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. Your app will be live at: `https://your-project.vercel.app`

### **Step 6: Upgrade to Pro (Required for 48s sync)**

1. Go to **Settings → Billing**
2. Select **Pro Plan** ($20/month)
3. This enables 60-second execution time limit

---

## 🔧 **GCP VM Deployment (Alternative)**

If you prefer GCP VM, here's the setup:

### **Step 1: Create VM Instance**

```bash
# Using gcloud CLI
gcloud compute instances create airdrop-dashboard \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

### **Step 2: Install Dependencies**

```bash
# SSH into VM
gcloud compute ssh airdrop-dashboard --zone=us-central1-a

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx
sudo apt-get update
sudo apt-get install -y nginx
```

### **Step 3: Deploy Application**

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/airdrop-dashboard.git
cd airdrop-dashboard

# Install dependencies
npm install

# Create .env file
nano .env.local
# Paste your environment variables

# Build
npm run build

# Start with PM2
pm2 start npm --name "airdrop-dashboard" -- start
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### **Step 4: Configure Nginx**

```bash
sudo nano /etc/nginx/sites-available/airdrop-dashboard
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/airdrop-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### **Step 5: Setup SSL (Let's Encrypt)**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### **Step 6: Configure Firewall**

```bash
# Allow HTTP/HTTPS
gcloud compute firewall-rules create allow-http-https \
  --allow tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --target-tags http-server,https-server
```

---

## 🔄 **Continuous Deployment Setup**

### **Vercel (Automatic)**
- ✅ Already automatic - just push to Git
- Preview deployments for every PR
- Production deployment on merge to main

### **GCP VM (Manual or GitHub Actions)**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GCP VM

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to VM
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          script: |
            cd airdrop-dashboard
            git pull
            npm install
            npm run build
            pm2 restart airdrop-dashboard
```

---

## 📊 **Performance Comparison**

| Metric | Vercel Pro | GCP VM (e2-small) |
|--------|-----------|-------------------|
| **Deploy Time** | 2-3 minutes | 5-10 minutes |
| **Cold Start** | ~500ms | 0ms (always on) |
| **Auto-scaling** | ✅ Yes | ❌ Manual |
| **SSL Setup** | ✅ Automatic | ⚠️ Manual (Let's Encrypt) |
| **Monitoring** | ✅ Built-in | ⚠️ Need to setup |
| **Cost** | $20/month | $15-30/month |
| **Maintenance** | ✅ Zero | ⚠️ Regular updates |

---

## 🎯 **Final Recommendation**

### **For Production: Vercel Pro** ✅

**Reasons:**
1. Your sync (48s) fits Pro tier limit
2. Zero maintenance overhead
3. Automatic deployments
4. Better developer experience
5. Built-in monitoring and analytics

### **When to Use GCP VM:**
- Need execution time > 60 seconds
- Require persistent file storage
- Need custom server configuration
- Want full control over infrastructure

---

## 🚀 **Quick Start: Deploy to Vercel Now**

```bash
# 1. Build test
npm run build

# 2. Commit and push
git add .
git commit -m "Ready for Vercel deployment"
git push

# 3. Go to vercel.com and import repo
# 4. Add environment variables
# 5. Deploy!
# 6. Upgrade to Pro ($20/mo) for 60s execution
```

---

## 📝 **Post-Deployment Checklist**

- [ ] Environment variables configured
- [ ] Build successful
- [ ] App accessible at Vercel URL
- [ ] Login/authentication works
- [ ] Wallet sync works (test with small wallet)
- [ ] Upgraded to Pro tier (if needed)
- [ ] Custom domain configured (optional)
- [ ] Monitoring/alerts setup (optional)

---

**Ready to deploy? Start with Vercel - it's the fastest path to production! 🚀**

