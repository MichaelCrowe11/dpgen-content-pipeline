#!/bin/bash

# Automated secret setup script (non-interactive)
set -e

PROJECT_ID="content-pipeline-7dd4f"
OAUTH_PROJECT="tenacious-cocoa-471700-i9"

echo "🔐 Automated Google Secrets Setup"
echo "=================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID 2>/dev/null || {
    echo "❌ Failed to set project. Make sure you have access to: $PROJECT_ID"
    echo "   Run: gcloud auth login"
    exit 1
}

# Check current authentication
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if [ -z "$ACCOUNT" ]; then
    echo "❌ Not authenticated. Please run:"
    echo "   gcloud auth login"
    echo "   gcloud auth application-default login"
    exit 1
fi

echo "✓ Authenticated as: $ACCOUNT"

# Enable required APIs
echo ""
echo "Enabling required APIs..."
gcloud services enable \
    secretmanager.googleapis.com \
    customsearch.googleapis.com \
    youtube.googleapis.com \
    aiplatform.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    texttospeech.googleapis.com \
    run.googleapis.com \
    workflows.googleapis.com \
    --project=$PROJECT_ID 2>/dev/null || echo "APIs may already be enabled"

echo "✓ APIs enabled"

# Create API keys
echo ""
echo "Creating API keys..."

# Custom Search API key
CSE_KEY_NAME="dpgen-custom-search"
echo "Creating Custom Search API key..."

# Check if key exists, if not create it
if ! gcloud services api-keys list --filter="displayName:$CSE_KEY_NAME" --project=$PROJECT_ID --format="value(name)" 2>/dev/null | grep -q .; then
    gcloud services api-keys create \
        --display-name="$CSE_KEY_NAME" \
        --project=$PROJECT_ID 2>/dev/null || echo "Key may already exist"
fi

# Get the key value
CSE_KEY_ID=$(gcloud services api-keys list --filter="displayName:$CSE_KEY_NAME" --project=$PROJECT_ID --format="value(name)" 2>/dev/null | head -1)
if [ ! -z "$CSE_KEY_ID" ]; then
    CSE_KEY=$(gcloud services api-keys get-key-string "$CSE_KEY_ID" --project=$PROJECT_ID --format="value(keyString)" 2>/dev/null)
    echo "✓ Custom Search API Key retrieved"
fi

# YouTube API key
YT_KEY_NAME="dpgen-youtube"
echo "Creating YouTube Data API key..."

if ! gcloud services api-keys list --filter="displayName:$YT_KEY_NAME" --project=$PROJECT_ID --format="value(name)" 2>/dev/null | grep -q .; then
    gcloud services api-keys create \
        --display-name="$YT_KEY_NAME" \
        --project=$PROJECT_ID 2>/dev/null || echo "Key may already exist"
fi

YT_KEY_ID=$(gcloud services api-keys list --filter="displayName:$YT_KEY_NAME" --project=$PROJECT_ID --format="value(name)" 2>/dev/null | head -1)
if [ ! -z "$YT_KEY_ID" ]; then
    YT_KEY=$(gcloud services api-keys get-key-string "$YT_KEY_ID" --project=$PROJECT_ID --format="value(keyString)" 2>/dev/null)
    echo "✓ YouTube API Key retrieved"
fi

# Store in Secret Manager
echo ""
echo "Storing secrets in Secret Manager..."

store_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2
    
    if [ -z "$SECRET_VALUE" ]; then
        echo "⚠️  Skipping empty secret: $SECRET_NAME"
        return
    fi
    
    # Check if secret exists
    if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
        echo "Updating secret: $SECRET_NAME"
        echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=- --project=$PROJECT_ID 2>/dev/null
    else
        echo "Creating secret: $SECRET_NAME"
        echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME \
            --data-file=- \
            --replication-policy="automatic" \
            --labels="app=dpgen" \
            --project=$PROJECT_ID 2>/dev/null
    fi
}

# Store API keys
[ ! -z "$CSE_KEY" ] && store_secret "cse-api-key" "$CSE_KEY"
[ ! -z "$YT_KEY" ] && store_secret "youtube-api-key" "$YT_KEY"

# Store existing credential files
if [ -f "config/oauth_credentials.json" ]; then
    store_secret "oauth-credentials" "$(cat config/oauth_credentials.json)"
    echo "✓ OAuth credentials stored"
fi

if [ -f "config/service_account.json" ]; then
    store_secret "service-account-key" "$(cat config/service_account.json)"
    echo "✓ Service account key stored"
fi

# Update .env file
echo ""
echo "Updating .env file..."

ENV_FILE="config/.env"
if [ -f "$ENV_FILE" ]; then
    # Backup original
    cp $ENV_FILE ${ENV_FILE}.backup
    
    # Update keys if they exist
    if [ ! -z "$CSE_KEY" ]; then
        if grep -q "CSE_API_KEY=" $ENV_FILE; then
            sed -i "s/CSE_API_KEY=.*/CSE_API_KEY=$CSE_KEY/" $ENV_FILE
        else
            echo "CSE_API_KEY=$CSE_KEY" >> $ENV_FILE
        fi
        echo "✓ Updated CSE_API_KEY"
    fi
    
    if [ ! -z "$YT_KEY" ]; then
        if grep -q "YOUTUBE_API_KEY=" $ENV_FILE; then
            sed -i "s/YOUTUBE_API_KEY=.*/YOUTUBE_API_KEY=$YT_KEY/" $ENV_FILE
        else
            echo "YOUTUBE_API_KEY=$YT_KEY" >> $ENV_FILE
        fi
        echo "✓ Updated YOUTUBE_API_KEY"
    fi
fi

# Set up IAM permissions
echo ""
echo "Setting up IAM permissions..."

SA_EMAIL="firebase-adminsdk-fbsvc@content-pipeline-7dd4f.iam.gserviceaccount.com"

for role in \
    "roles/aiplatform.user" \
    "roles/storage.admin" \
    "roles/datastore.user" \
    "roles/secretmanager.secretAccessor" \
    "roles/run.invoker" \
    "roles/workflows.invoker"
do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" \
        --quiet 2>/dev/null || true
done

echo "✓ IAM roles configured"

# Summary
echo ""
echo "=============================="
echo "✅ Setup Complete!"
echo "=============================="
echo ""
echo "Credentials stored in Secret Manager:"
gcloud secrets list --project=$PROJECT_ID --filter="labels.app=dpgen" --format="table(name,created)" 2>/dev/null

echo ""
echo "API Keys created:"
gcloud services api-keys list --project=$PROJECT_ID --format="table(displayName,createTime)" 2>/dev/null

echo ""
echo "Next steps:"
echo "1. Create a Custom Search Engine at:"
echo "   https://programmablesearchengine.google.com/"
echo "   Get the Search Engine ID (cx) and add to .env"
echo ""
echo "2. Set up YouTube OAuth2 for uploads at:"
echo "   https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo ""
echo "3. Test the pipeline:"
echo "   cd seeds && npm install && node seed_channels.js"
echo ""

# Show retrieved keys (first 10 chars only for security)
if [ ! -z "$CSE_KEY" ]; then
    echo "Custom Search API Key: ${CSE_KEY:0:10}..."
fi
if [ ! -z "$YT_KEY" ]; then
    echo "YouTube API Key: ${YT_KEY:0:10}..."
fi