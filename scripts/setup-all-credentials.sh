#!/bin/bash

# Comprehensive DeepParallel Credential Setup Script
# This script automates the complete credential setup process for the DeepParallel Content Pipeline

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-""}
LOCATION=${GCP_LOCATION:-"us-central1"}
SERVICE_ACCOUNT_NAME="content-pipeline"

echo -e "${BLUE}🔐 DeepParallel Complete Credential Setup${NC}"
echo "===================================="

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check gcloud CLI
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Please install it first.${NC}"
        echo "Visit: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    # Check and set project
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [ -z "$PROJECT_ID" ]; then
            echo -e "${RED}❌ No GCP project set.${NC}"
            echo "Run: gcloud config set project YOUR_PROJECT_ID"
            echo "Or set: export GCP_PROJECT_ID=YOUR_PROJECT_ID"
            exit 1
        fi
    fi
    
    # Set the project
    gcloud config set project $PROJECT_ID
    
    echo -e "${GREEN}✓ Prerequisites checked${NC}"
    echo "  Project: $PROJECT_ID"
    echo "  Location: $LOCATION"
}

# Function to enable required APIs
enable_apis() {
    echo -e "\n${YELLOW}Enabling required APIs...${NC}"
    
    APIS=(
        "aiplatform.googleapis.com"
        "firestore.googleapis.com"
        "storage.googleapis.com"
        "texttospeech.googleapis.com"
        "vision.googleapis.com"
        "videointelligence.googleapis.com"
        "run.googleapis.com"
        "workflows.googleapis.com"
        "cloudscheduler.googleapis.com"
        "secretmanager.googleapis.com"
        "customsearch.googleapis.com"
        "youtube.googleapis.com"
        "perspective.googleapis.com"
    )
    
    for api in "${APIS[@]}"; do
        echo "  Enabling $api..."
        gcloud services enable $api --project=$PROJECT_ID --quiet || true
    done
    
    echo -e "${GREEN}✓ APIs enabled${NC}"
}

# Function to create service account
create_service_account() {
    echo -e "\n${YELLOW}Creating service account...${NC}"
    
    SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Create service account if it doesn't exist
    if ! gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
        gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
            --display-name="DeepParallel Pipeline Service Account" \
            --project=$PROJECT_ID
        echo -e "${GREEN}✓ Service account created: $SA_EMAIL${NC}"
    else
        echo -e "${BLUE}ℹ Service account already exists: $SA_EMAIL${NC}"
    fi
    
    # Grant necessary roles
    ROLES=(
        "roles/aiplatform.user"
        "roles/datastore.user"
        "roles/storage.admin"
        "roles/secretmanager.secretAccessor"
        "roles/run.invoker"
        "roles/workflows.invoker"
        "roles/cloudtasks.enqueuer"
        "roles/bigquery.dataEditor"
    )
    
    echo "Granting IAM roles..."
    for role in "${ROLES[@]}"; do
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SA_EMAIL" \
            --role="$role" \
            --quiet &>/dev/null || true
        echo "  ✓ $role"
    done
    
    # Create service account key
    KEY_DIR="config"
    mkdir -p $KEY_DIR
    KEY_FILE="$KEY_DIR/service_account.json"
    
    if [ ! -f "$KEY_FILE" ]; then
        echo "Creating service account key..."
        gcloud iam service-accounts keys create $KEY_FILE \
            --iam-account=$SA_EMAIL \
            --project=$PROJECT_ID
        echo -e "${GREEN}✓ Service account key saved to $KEY_FILE${NC}"
    else
        echo -e "${BLUE}ℹ Service account key already exists at $KEY_FILE${NC}"
    fi
}

# Function to create API keys
create_api_keys() {
    echo -e "\n${YELLOW}Creating API keys...${NC}"
    
    # Custom Search API key
    CSE_KEY_NAME="deepparallel-custom-search"
    echo "Creating Custom Search API key..."
    
    CSE_KEY_ID=$(gcloud services api-keys list \
        --filter="displayName:$CSE_KEY_NAME" \
        --project=$PROJECT_ID \
        --format="value(name)" 2>/dev/null | head -n1)
    
    if [ -z "$CSE_KEY_ID" ]; then
        CSE_KEY_ID=$(gcloud services api-keys create \
            --display-name="$CSE_KEY_NAME" \
            --project=$PROJECT_ID \
            --format="value(name)" 2>/dev/null)
        echo -e "${GREEN}✓ Created Custom Search API key${NC}"
    else
        echo -e "${BLUE}ℹ Custom Search API key already exists${NC}"
    fi
    
    # YouTube Data API key
    YT_KEY_NAME="deepparallel-youtube"
    echo "Creating YouTube Data API key..."
    
    YT_KEY_ID=$(gcloud services api-keys list \
        --filter="displayName:$YT_KEY_NAME" \
        --project=$PROJECT_ID \
        --format="value(name)" 2>/dev/null | head -n1)
    
    if [ -z "$YT_KEY_ID" ]; then
        YT_KEY_ID=$(gcloud services api-keys create \
            --display-name="$YT_KEY_NAME" \
            --project=$PROJECT_ID \
            --format="value(name)" 2>/dev/null)
        echo -e "${GREEN}✓ Created YouTube API key${NC}"
    else
        echo -e "${BLUE}ℹ YouTube API key already exists${NC}"
    fi
    
    # Perspective API key
    PERSPECTIVE_KEY_NAME="deepparallel-perspective"
    echo "Creating Perspective API key..."
    
    PERSPECTIVE_KEY_ID=$(gcloud services api-keys list \
        --filter="displayName:$PERSPECTIVE_KEY_NAME" \
        --project=$PROJECT_ID \
        --format="value(name)" 2>/dev/null | head -n1)
    
    if [ -z "$PERSPECTIVE_KEY_ID" ]; then
        PERSPECTIVE_KEY_ID=$(gcloud services api-keys create \
            --display-name="$PERSPECTIVE_KEY_NAME" \
            --project=$PROJECT_ID \
            --format="value(name)" 2>/dev/null)
        echo -e "${GREEN}✓ Created Perspective API key${NC}"
    else
        echo -e "${BLUE}ℹ Perspective API key already exists${NC}"
    fi
}

# Function to set up Custom Search Engine
setup_custom_search() {
    echo -e "\n${YELLOW}Setting up Custom Search Engine...${NC}"
    echo "Note: Custom Search Engine (CSE) must be created manually in the Google Console"
    echo ""
    echo "Steps to create CSE:"
    echo "1. Go to: https://programmablesearchengine.google.com/controlpanel/all"
    echo "2. Click 'Add' to create a new search engine"
    echo "3. Name: 'DeepParallel Content Research'"
    echo "4. What to search: 'Search the entire web'"
    echo "5. Create the search engine"
    echo "6. Copy the Search Engine ID (cx parameter)"
    echo ""
    
    read -p "Enter your Custom Search Engine ID (cx): " CSE_CX
    
    if [ ! -z "$CSE_CX" ]; then
        echo -e "${GREEN}✓ Custom Search Engine ID saved${NC}"
    else
        echo -e "${YELLOW}⚠ Custom Search Engine ID not provided${NC}"
        CSE_CX="YOUR_CSE_CX_HERE"
    fi
}

# Function to store secrets in Secret Manager
store_secrets() {
    echo -e "\n${YELLOW}Storing secrets in Secret Manager...${NC}"
    
    # Helper function to create or update secret
    create_or_update_secret() {
        local SECRET_NAME=$1
        local SECRET_VALUE=$2
        
        if [ -z "$SECRET_VALUE" ] || [ "$SECRET_VALUE" = "null" ]; then
            echo "  ⚠ Skipping $SECRET_NAME (empty value)"
            return
        fi
        
        if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
            echo "  Updating secret: $SECRET_NAME"
            echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME \
                --data-file=- \
                --project=$PROJECT_ID &>/dev/null
        else
            echo "  Creating secret: $SECRET_NAME"
            echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME \
                --data-file=- \
                --replication-policy="automatic" \
                --project=$PROJECT_ID &>/dev/null
        fi
    }
    
    # Get API key values
    if [ ! -z "$CSE_KEY_ID" ]; then
        CSE_API_KEY=$(gcloud services api-keys get-key-string $CSE_KEY_ID \
            --project=$PROJECT_ID \
            --format="value(keyString)" 2>/dev/null)
        create_or_update_secret "CSE_API_KEY" "$CSE_API_KEY"
    fi
    
    if [ ! -z "$YT_KEY_ID" ]; then
        YOUTUBE_API_KEY=$(gcloud services api-keys get-key-string $YT_KEY_ID \
            --project=$PROJECT_ID \
            --format="value(keyString)" 2>/dev/null)
        create_or_update_secret "YOUTUBE_API_KEY" "$YOUTUBE_API_KEY"
    fi
    
    if [ ! -z "$PERSPECTIVE_KEY_ID" ]; then
        PERSPECTIVE_API_KEY=$(gcloud services api-keys get-key-string $PERSPECTIVE_KEY_ID \
            --project=$PROJECT_ID \
            --format="value(keyString)" 2>/dev/null)
        create_or_update_secret "PERSPECTIVE_API_KEY" "$PERSPECTIVE_API_KEY"
    fi
    
    # Store CSE CX
    create_or_update_secret "CSE_CX" "$CSE_CX"
    
    # Store service account key
    if [ -f "config/service_account.json" ]; then
        create_or_update_secret "SERVICE_ACCOUNT_KEY" "$(cat config/service_account.json)"
    fi
    
    echo -e "${GREEN}✓ Secrets stored in Secret Manager${NC}"
}

# Function to create .env file
create_env_file() {
    echo -e "\n${YELLOW}Creating .env file...${NC}"
    
    ENV_FILE="config/.env"
    mkdir -p config
    
    cat > $ENV_FILE << EOF
# DeepParallel Content Pipeline Environment Variables
# Generated on $(date)

# GCP Configuration
GCP_PROJECT_ID=$PROJECT_ID
GCP_LOCATION=$LOCATION
GOOGLE_APPLICATION_CREDENTIALS=config/service_account.json

# API Keys (Retrieved from Secret Manager)
CSE_API_KEY=${CSE_API_KEY:-YOUR_CSE_API_KEY}
CSE_CX=${CSE_CX:-YOUR_CSE_CX}
YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-YOUR_YOUTUBE_API_KEY}
PERSPECTIVE_API_KEY=${PERSPECTIVE_API_KEY:-YOUR_PERSPECTIVE_API_KEY}

# Service Configuration
RENDERER_SERVICE_URL=https://deepparallel-renderer-XXXXX.run.app
MAX_CONCURRENT_RENDERS=3
MAX_DAILY_VIDEOS_PER_CHANNEL=2

# Monitoring
LOG_LEVEL=INFO
ENABLE_TRACING=true

# Redis Configuration (if using Redis for job tracking)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# BigQuery Configuration
BQ_DATASET=dpgen_analytics
BQ_TABLE_METRICS=content_metrics

# OAuth Configuration (for YouTube upload)
OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET
OAUTH_REDIRECT_URI=http://localhost:8080/oauth/callback
EOF
    
    echo -e "${GREEN}✓ Created .env file at $ENV_FILE${NC}"
    echo -e "${YELLOW}Note: Update the placeholders with actual values if needed${NC}"
}

# Function to update Cloud Run service with secrets
update_cloud_run_secrets() {
    echo -e "\n${YELLOW}Updating Cloud Run service with secrets...${NC}"
    
    # Check if Cloud Run service exists
    if gcloud run services describe deepparallel-renderer \
        --region=$LOCATION \
        --project=$PROJECT_ID &>/dev/null; then
        
        echo "Updating deepparallel-renderer service with secrets..."
        gcloud run services update deepparallel-renderer \
            --region=$LOCATION \
            --project=$PROJECT_ID \
            --set-secrets="CSE_API_KEY=CSE_API_KEY:latest,CSE_CX=CSE_CX:latest,YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,PERSPECTIVE_API_KEY=PERSPECTIVE_API_KEY:latest" \
            --quiet
        
        echo -e "${GREEN}✓ Cloud Run service updated with secrets${NC}"
    else
        echo -e "${BLUE}ℹ Cloud Run service not yet deployed${NC}"
        echo "Run './scripts/deploy.sh' to deploy the service"
    fi
}

# Function to validate credentials
validate_credentials() {
    echo -e "\n${YELLOW}Validating credentials...${NC}"
    
    VALID=true
    
    # Check service account
    SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
        echo -e "${GREEN}✓ Service account exists${NC}"
    else
        echo -e "${RED}✗ Service account not found${NC}"
        VALID=false
    fi
    
    # Check service account key
    if [ -f "config/service_account.json" ]; then
        echo -e "${GREEN}✓ Service account key file exists${NC}"
    else
        echo -e "${RED}✗ Service account key file not found${NC}"
        VALID=false
    fi
    
    # Check API keys in Secret Manager
    SECRETS=("CSE_API_KEY" "CSE_CX" "YOUTUBE_API_KEY" "PERSPECTIVE_API_KEY")
    for secret in "${SECRETS[@]}"; do
        if gcloud secrets describe $secret --project=$PROJECT_ID &>/dev/null; then
            echo -e "${GREEN}✓ Secret '$secret' exists${NC}"
        else
            echo -e "${YELLOW}⚠ Secret '$secret' not found${NC}"
        fi
    done
    
    # Check .env file
    if [ -f "config/.env" ]; then
        echo -e "${GREEN}✓ .env file exists${NC}"
    else
        echo -e "${RED}✗ .env file not found${NC}"
        VALID=false
    fi
    
    if [ "$VALID" = true ]; then
        echo -e "\n${GREEN}✅ All credentials validated successfully!${NC}"
    else
        echo -e "\n${YELLOW}⚠ Some credentials are missing. Please review above.${NC}"
    fi
}

# Function to print summary
print_summary() {
    echo -e "\n${BLUE}📋 Setup Summary${NC}"
    echo "=================="
    echo ""
    echo "Project ID: $PROJECT_ID"
    echo "Location: $LOCATION"
    echo "Service Account: ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    echo ""
    echo "Files created:"
    echo "  - config/service_account.json (Service account key)"
    echo "  - config/.env (Environment variables)"
    echo ""
    echo "Secrets in Secret Manager:"
    gcloud secrets list --project=$PROJECT_ID --format="table(name)" 2>/dev/null || echo "  None found"
    echo ""
    echo "API Keys created:"
    gcloud services api-keys list --project=$PROJECT_ID --format="table(displayName)" 2>/dev/null || echo "  None found"
}

# Main setup flow
main() {
    check_prerequisites
    
    echo -e "\n${BLUE}This script will set up all credentials for DeepParallel Pipeline:${NC}"
    echo "  1. Enable required GCP APIs"
    echo "  2. Create service account and grant IAM roles"
    echo "  3. Create API keys (Custom Search, YouTube, Perspective)"
    echo "  4. Set up Custom Search Engine configuration"
    echo "  5. Store all secrets in Secret Manager"
    echo "  6. Create .env configuration file"
    echo "  7. Update Cloud Run service with secrets"
    echo "  8. Validate all credentials"
    echo ""
    
    read -p "Continue with setup? (y/n) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Setup cancelled${NC}"
        exit 1
    fi
    
    # Run setup steps
    enable_apis
    create_service_account
    create_api_keys
    setup_custom_search
    store_secrets
    create_env_file
    update_cloud_run_secrets
    validate_credentials
    print_summary
    
    echo -e "\n${GREEN}✅ Credential setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review and update config/.env with any missing values"
    echo "2. If you haven't deployed yet, run: ./scripts/deploy.sh"
    echo "3. Test the pipeline with: gcloud workflows run content-pipeline --data='{\"channel_slug\":\"circuit-myth\"}'"
    echo "4. Monitor logs at: https://console.cloud.google.com/logs"
}

# Run main function
main