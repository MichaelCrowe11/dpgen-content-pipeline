# 🚀 Quick Cloudflare Deployment (5 Minutes)

Your Cloudflare IDs are configured and ready!
- **Zone ID**: `0dee7676d43422b333b1bc56662c63c4`
- **Account ID**: `9f3b1ed688d960bc9ea03569ca840dfd`

## Step 1: Deploy to Cloudflare Pages (2 min)

1. Go to: https://dash.cloudflare.com/?to=/:account/pages
2. Click **"Upload assets"**
3. Name your project: `deepparallel`
4. Upload the entire `/public` folder
5. Click **Deploy**

✅ Your site is now live at: `deepparallel.pages.dev`

## Step 2: Connect Your Domain (1 min)

1. In your Pages project, go to **"Custom domains"**
2. Click **"Set up a custom domain"**
3. Enter: `deepparallel.org`
4. Click **"Continue"** → Cloudflare will auto-configure DNS
5. Add another domain: `www.deepparallel.org`

✅ Your site is now live at: https://deepparallel.org

## Step 3: Deploy API Worker (2 min)

1. Go to: https://dash.cloudflare.com/?to=/:account/workers
2. Click **"Create a Service"**
3. Name: `deepparallel-api`
4. Click **"Create service"**
5. Click **"Quick edit"**
6. Copy and paste the contents of `cloudflare-worker.js`
7. Click **"Save and Deploy"**

## Step 4: Connect Worker to Domain (1 min)

1. In your Worker, go to **"Triggers"**
2. Click **"Add route"**
3. Route: `deepparallel.org/api/*`
4. Zone: `deepparallel.org`
5. Click **"Add route"**

## ✅ DONE! Your Pipeline is Live!

### Test Your Deployment:
- **Website**: https://deepparallel.org
- **Web App**: https://deepparallel.org/app.html
- **API Health**: https://deepparallel.org/health

### What You Get:
- ✅ Public website (no Google restrictions!)
- ✅ Working pipeline interface
- ✅ API proxy through Cloudflare Workers
- ✅ Automatic SSL certificates
- ✅ Global CDN
- ✅ DDoS protection
- ✅ Analytics

### Files You Need:
- `/public/` folder → Upload to Pages
- `cloudflare-worker.js` → Copy to Worker

---

## Alternative: Use the Script

If you have a Cloudflare API token:
```bash
export CLOUDFLARE_API_TOKEN='your-token-here'
./scripts/deploy-cloudflare.sh
```

Get your API token at: https://dash.cloudflare.com/profile/api-tokens

Required permissions:
- Zone:DNS:Edit
- Account:Cloudflare Pages:Edit
- Account:Workers Scripts:Edit