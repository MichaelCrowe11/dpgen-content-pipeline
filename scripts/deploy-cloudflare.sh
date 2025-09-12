#!/bin/bash

# Cloudflare Deployment Script
# Using your Zone and Account IDs

ZONE_ID="0dee7676d43422b333b1bc56662c63c4"
ACCOUNT_ID="9f3b1ed688d960bc9ea03569ca840dfd"

echo "======================================"
echo "DeepParallel.org Cloudflare Deployment"
echo "======================================"
echo ""
echo "Zone ID: $ZONE_ID"
echo "Account ID: $ACCOUNT_ID"
echo ""

# Check if API token is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "Please set your Cloudflare API Token:"
    echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Create a token with these permissions:"
    echo "   - Zone:DNS:Edit"
    echo "   - Zone:Page Rules:Edit"
    echo "   - Account:Cloudflare Pages:Edit"
    echo "   - Account:Workers Scripts:Edit"
    echo ""
    echo "Then run:"
    echo "export CLOUDFLARE_API_TOKEN='your-token-here'"
    echo "./scripts/deploy-cloudflare.sh"
    exit 1
fi

echo "Step 1: Creating Cloudflare Pages project..."
# Create Pages project
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "deepparallel",
    "production_branch": "main"
  }' 2>/dev/null | python3 -m json.tool

echo ""
echo "Step 2: Deploying files to Pages..."
# Note: Direct file upload via API requires multipart form data
# For simplicity, we'll use wrangler or manual upload

echo ""
echo "Step 3: Setting up DNS records..."

# Clear existing A records for root domain
curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=deepparallel.org" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" 2>/dev/null | \
  python3 -c "import sys, json; records = json.load(sys.stdin)['result']; [print(r['id']) for r in records]" | \
  while read record_id; do
    echo "Removing old A record: $record_id"
    curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null
  done

# Add CNAME for Pages
echo "Adding CNAME for Cloudflare Pages..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "@",
    "content": "deepparallel.pages.dev",
    "ttl": 1,
    "proxied": true
  }' 2>/dev/null | python3 -m json.tool

# Add www CNAME
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "www",
    "content": "deepparallel.org",
    "ttl": 1,
    "proxied": true
  }' 2>/dev/null | python3 -m json.tool

echo ""
echo "Step 4: Creating Worker for API proxy..."
# Deploy worker script
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/deepparallel-api" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/javascript" \
  --data-binary "@cloudflare-worker.js" 2>/dev/null | python3 -m json.tool

# Create worker route
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "pattern": "deepparallel.org/api/*",
    "script": "deepparallel-api"
  }' 2>/dev/null | python3 -m json.tool

echo ""
echo "======================================"
echo "Deployment Steps Complete!"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Upload the /public folder to Cloudflare Pages:"
echo "   - Go to: https://dash.cloudflare.com/?to=/:account/pages/view/deepparallel"
echo "   - Click 'Create deployment'"
echo "   - Upload the /public folder"
echo ""
echo "2. Your site will be live at:"
echo "   - https://deepparallel.org"
echo "   - https://deepparallel.pages.dev"
echo ""
echo "3. API endpoints available at:"
echo "   - https://deepparallel.org/api/*"
echo "   - https://deepparallel.org/health"
echo ""
echo "Files ready in: /workspaces/dpgen-content-pipeline/public/"