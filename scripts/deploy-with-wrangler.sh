#!/bin/bash

# Wrangler deployment script
echo "======================================"
echo "🚀 Cloudflare Deployment with Wrangler"
echo "======================================"
echo ""

# Check for API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "Getting Cloudflare API Token..."
    echo ""
    echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Click 'Create Token'"
    echo "3. Use template: 'Edit Cloudflare Workers'"
    echo "4. Add permissions:"
    echo "   - Account: Cloudflare Pages:Edit"
    echo "   - Zone: DNS:Edit (for deepparallel.org)"
    echo "5. Copy the token"
    echo ""
    read -p "Paste your API token here: " CLOUDFLARE_API_TOKEN
    export CLOUDFLARE_API_TOKEN
fi

echo ""
echo "Deploying Worker..."
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN wrangler deploy --env production

echo ""
echo "Deploying Pages..."
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN wrangler pages deploy public --project-name=deepparallel --commit-dirty=true

echo ""
echo "======================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "======================================"
echo ""
echo "Your site is now live at:"
echo "  🌐 https://deepparallel.org"
echo "  📱 https://deepparallel.org/app.html"
echo ""
echo "API endpoints:"
echo "  🔌 https://deepparallel.org/api/*"
echo "  💚 https://deepparallel.org/health"
echo ""