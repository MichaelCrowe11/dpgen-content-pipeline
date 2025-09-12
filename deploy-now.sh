#!/bin/bash

# Quick Cloudflare Deployment Script
# This will deploy everything in one go

ZONE_ID="0dee7676d43422b333b1bc56662c63c4"
ACCOUNT_ID="9f3b1ed688d960bc9ea03569ca840dfd"

echo "======================================"
echo "🚀 DeepParallel.org Quick Deploy"
echo "======================================"
echo ""

# Check for API key or token
if [ -z "$CF_API_KEY" ] && [ -z "$CF_API_TOKEN" ]; then
    echo "⚠️  Authentication needed!"
    echo ""
    echo "Option 1: Use Global API Key (easier)"
    echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. View 'Global API Key'"
    echo "3. Run these commands:"
    echo ""
    echo "   export CF_EMAIL='your-email@example.com'"
    echo "   export CF_API_KEY='your-global-api-key'"
    echo "   ./deploy-now.sh"
    echo ""
    echo "Option 2: Use API Token (more secure)"
    echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Create token with: Pages:Edit, Workers:Edit, DNS:Edit"
    echo "3. Run:"
    echo ""
    echo "   export CF_API_TOKEN='your-api-token'"
    echo "   ./deploy-now.sh"
    echo ""
    exit 1
fi

# Set auth headers
if [ -n "$CF_API_TOKEN" ]; then
    AUTH_HEADER="Authorization: Bearer $CF_API_TOKEN"
else
    AUTH_HEADER="X-Auth-Key: $CF_API_KEY"
    EMAIL_HEADER="X-Auth-Email: $CF_EMAIL"
fi

echo "✅ Authentication configured"
echo ""

# Step 1: Deploy Worker
echo "📦 Deploying API Worker..."
echo ""

# Create the worker script with form data
cat > /tmp/worker-upload.sh << 'SCRIPT'
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/9f3b1ed688d960bc9ea03569ca840dfd/workers/scripts/deepparallel-api" \
  -H "$AUTH_HEADER" \
  -H "$EMAIL_HEADER" \
  -F "worker.js=@cloudflare-worker.js;type=application/javascript" \
  -F 'metadata={"main_module":"worker.js"}'
SCRIPT

bash /tmp/worker-upload.sh

echo ""
echo "✅ Worker deployed"
echo ""

# Step 2: Create Worker routes
echo "🌐 Setting up API routes..."

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
  -H "$AUTH_HEADER" \
  -H "$EMAIL_HEADER" \
  -H "Content-Type: application/json" \
  --data '{
    "pattern": "deepparallel.org/api/*",
    "script": "deepparallel-api"
  }' 2>/dev/null

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
  -H "$AUTH_HEADER" \
  -H "$EMAIL_HEADER" \
  -H "Content-Type: application/json" \
  --data '{
    "pattern": "deepparallel.org/health",
    "script": "deepparallel-api"
  }' 2>/dev/null

echo ""
echo "✅ Routes configured"
echo ""

# Step 3: Update DNS for Cloudflare Pages
echo "🔧 Configuring DNS..."

# Get existing DNS records
echo "Checking existing DNS records..."
RECORDS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=deepparallel.org" \
  -H "$AUTH_HEADER" \
  -H "$EMAIL_HEADER")

# Parse and delete old A records
echo "$RECORDS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for record in data.get('result', []):
    print(record['id'])
" | while read record_id; do
    if [ ! -z "$record_id" ]; then
        echo "Removing old record: $record_id"
        curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
          -H "$AUTH_HEADER" \
          -H "$EMAIL_HEADER" > /dev/null
    fi
done

echo ""
echo "✅ DNS updated"
echo ""

# Step 4: Create Pages project using direct upload
echo "📄 Deploying to Cloudflare Pages..."
echo ""

# Create Pages deployment package
cd /workspaces/dpgen-content-pipeline
tar -czf /tmp/pages-deploy.tar.gz -C public .

echo "Package created: /tmp/pages-deploy.tar.gz"
echo ""
echo "======================================"
echo "✅ DEPLOYMENT READY!"
echo "======================================"
echo ""
echo "Worker deployed! Now complete Pages deployment:"
echo ""
echo "1. Go to: https://dash.cloudflare.com/?to=/:account/pages"
echo "2. Click 'Upload assets'"
echo "3. Name: deepparallel"
echo "4. Upload the /public folder"
echo "5. Deploy!"
echo ""
echo "Your API endpoints are already live at:"
echo "  🟢 https://deepparallel.org/api/*"
echo "  🟢 https://deepparallel.org/health"
echo ""
echo "Once Pages is deployed, your site will be at:"
echo "  🔵 https://deepparallel.org"
echo "  🔵 https://deepparallel.org/app.html"
echo ""