#!/bin/bash

# Quick setup script for your specific GCP project
# Project: tenacious-cocoa-471700-i9

set -e

PROJECT_ID="tenacious-cocoa-471700-i9"
LOCATION="us-central1"

echo "🚀 Setting up DPGen Pipeline for project: $PROJECT_ID"
echo "=================================================="

# Set the project
gcloud config set project $PROJECT_ID

# Enable essential APIs first
echo "📦 Enabling core APIs..."
gcloud services enable \
    aiplatform.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    texttospeech.googleapis.com \
    run.googleapis.com \
    workflows.googleapis.com \
    --project=$PROJECT_ID

echo "✅ Core APIs enabled"

# Create minimal storage buckets with unique names
echo "🗂️ Creating storage buckets..."
for bucket in shared renderer circuit-myth; do
    gsutil mb -p $PROJECT_ID -l $LOCATION gs://dpgen-${bucket}-471700 2>/dev/null || echo "  Bucket dpgen-${bucket}-471700 exists"
done

echo "✅ Storage ready"

# Initialize Firestore
echo "🔥 Initializing Firestore..."
gcloud firestore databases create --location=$LOCATION --project=$PROJECT_ID 2>/dev/null || echo "  Firestore already exists"

echo "✅ Firestore ready"

echo ""
echo "✨ Basic setup complete!"
echo ""
echo "Next steps:"
echo "1. Get API keys from:"
echo "   - Custom Search API: https://console.cloud.google.com/apis/credentials"
echo "   - YouTube Data API: https://console.cloud.google.com/apis/library/youtube.googleapis.com"
echo ""
echo "2. Update config/.env with your API keys"
echo ""
echo "3. Seed the database:"
echo "   cd seeds && npm install && node seed_channels.js"
echo ""
echo "4. Deploy the renderer:"
echo "   cd renderer && gcloud run deploy dpgen-renderer --source . --region=$LOCATION"
echo ""
echo "5. Deploy workflows:"
echo "   gcloud workflows deploy content-pipeline --source=workflows-gcp/main.yaml --location=$LOCATION"