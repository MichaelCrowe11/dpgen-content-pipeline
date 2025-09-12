# Cloudflare Pages Deployment Guide for DeepParallel.org

## Quick Deploy Steps:

### 1. Create Cloudflare Account
- Go to https://dash.cloudflare.com/sign-up
- Sign up for free account

### 2. Add Your Domain
- Click "Add a Site"
- Enter: `deepparallel.org`
- Select the FREE plan
- Cloudflare will scan current DNS records

### 3. Update Namecheap DNS
When Cloudflare gives you nameservers (like `nina.ns.cloudflare.com`):
1. Log into Namecheap
2. Go to Domain List → deepparallel.org → Manage
3. Under "NAMESERVERS", select "Custom DNS"
4. Add Cloudflare's nameservers
5. Save changes

### 4. Deploy to Cloudflare Pages
1. Go to https://pages.cloudflare.com
2. Click "Create a project"
3. Choose "Upload assets"
4. Upload the `/public` folder
5. Name your project: `deepparallel`
6. Deploy!

### 5. Connect Custom Domain
1. In Cloudflare Pages, go to your project
2. Go to "Custom domains"
3. Add `deepparallel.org`
4. Add `www.deepparallel.org`
5. Cloudflare will automatically configure SSL

## What You Get:
✅ **Public website** at https://deepparallel.org
✅ **Web application** at https://deepparallel.org/app.html
✅ **Automatic SSL** certificate
✅ **Global CDN** for fast loading
✅ **DDoS protection** included
✅ **Analytics** dashboard

## Files Ready for Upload:
- `/public/index.html` - Landing page
- `/public/app.html` - Pipeline interface
- `/public/_redirects` - API proxy rules

## Pipeline Access:
The pipeline will be accessible through:
1. **Web Interface**: https://deepparallel.org/app.html
2. **API Endpoints** (proxied through Cloudflare):
   - POST https://deepparallel.org/api/generate
   - GET https://deepparallel.org/api/health
   - GET https://deepparallel.org/api/status

## Next Steps After Deployment:
1. Test the site at https://deepparallel.org
2. Try the app at https://deepparallel.org/app.html
3. Configure API authentication if needed
4. Monitor traffic in Cloudflare dashboard

## Alternative: Quick Deploy via Git
If you prefer Git integration:
1. Push this repo to GitHub
2. In Cloudflare Pages, connect to GitHub
3. Select your repo
4. Build settings:
   - Build command: (leave empty)
   - Build output directory: `/public`
5. Deploy!

---
Ready to deploy! The `/public` folder has everything you need.