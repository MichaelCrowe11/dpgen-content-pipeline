#!/bin/bash

# Script to pull Google secrets via CLI
# Configures authentication and retrieves necessary API keys

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
PROJECT_ID="content-pipeline-7dd4f"
OAUTH_PROJECT="tenacious-cocoa-471700-i9"

echo -e "${BLUE}🔐 Google Secrets Management${NC}"
echo "=============================="

# Function to check if user is authenticated
check_auth() {
    echo -e "\n${YELLOW}Checking authentication...${NC}"
    
    # Check current account
    ACCOUNT=$(gcloud config get-value account 2>/dev/null)
    if [ -z "$ACCOUNT" ]; then
        echo -e "${RED}❌ Not authenticated with gcloud${NC}"
        echo "Run: gcloud auth login"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Authenticated as: $ACCOUNT${NC}"
    
    # Check application default credentials
    if ! gcloud auth application-default print-access-token &>/dev/null; then
        echo -e "${YELLOW}Setting up application default credentials...${NC}"
        gcloud auth application-default login
    fi
}

# Function to create API keys
create_api_keys() {
    echo -e "\n${YELLOW}Managing API Keys...${NC}"
    
    # List existing API keys
    echo "Existing API keys in $PROJECT_ID:"
    gcloud services api-keys list --project=$PROJECT_ID --format="table(name,displayName,restrictions.api_targets[].service:label=APIs)" 2>/dev/null || echo "No API keys found"
    
    # Create Custom Search API key
    echo -e "\n${BLUE}Creating Custom Search API key...${NC}"
    CSE_KEY_NAME="dpgen-custom-search"
    
    # Check if key exists
    if ! gcloud services api-keys list --filter="displayName:$CSE_KEY_NAME" --project=$PROJECT_ID --format="value(name)" | grep -q .; then
        gcloud services api-keys create \
            --display-name="$CSE_KEY_NAME" \
            --api-target=service=customsearch.googleapis.com \
            --project=$PROJECT_ID
    fi
    
    # Get the key value
    CSE_KEY=$(gcloud services api-keys get-key-string \
        $(gcloud services api-keys list --filter="displayName:$CSE_KEY_NAME" --project=$PROJECT_ID --format="value(name)") \
        --project=$PROJECT_ID --format="value(keyString)" 2>/dev/null) || echo ""
    
    if [ ! -z "$CSE_KEY" ]; then
        echo -e "${GREEN}✓ Custom Search API Key: ${CSE_KEY:0:10}...${NC}"
    fi
    
    # Create YouTube API key
    echo -e "\n${BLUE}Creating YouTube Data API key...${NC}"
    YT_KEY_NAME="dpgen-youtube"
    
    if ! gcloud services api-keys list --filter="displayName:$YT_KEY_NAME" --project=$PROJECT_ID --format="value(name)" | grep -q .; then
        gcloud services api-keys create \
            --display-name="$YT_KEY_NAME" \
            --api-target=service=youtube.googleapis.com \
            --project=$PROJECT_ID
    fi
    
    YT_KEY=$(gcloud services api-keys get-key-string \
        $(gcloud services api-keys list --filter="displayName:$YT_KEY_NAME" --project=$PROJECT_ID --format="value(name)") \
        --project=$PROJECT_ID --format="value(keyString)" 2>/dev/null) || echo ""
    
    if [ ! -z "$YT_KEY" ]; then
        echo -e "${GREEN}✓ YouTube API Key: ${YT_KEY:0:10}...${NC}"
    fi
}

# Function to set up Secret Manager
setup_secret_manager() {
    echo -e "\n${YELLOW}Setting up Secret Manager...${NC}"
    
    # Enable Secret Manager API
    gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID
    
    # Function to create or update a secret
    create_secret() {
        local SECRET_NAME=$1
        local SECRET_VALUE=$2
        local DESCRIPTION=$3
        
        # Check if secret exists
        if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
            echo "Updating secret: $SECRET_NAME"
            echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=- --project=$PROJECT_ID
        else
            echo "Creating secret: $SECRET_NAME"
            echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME \
                --data-file=- \
                --replication-policy="automatic" \
                --labels="app=dpgen" \
                --project=$PROJECT_ID
        fi
    }
    
    # Store API keys in Secret Manager
    if [ ! -z "$CSE_KEY" ]; then
        create_secret "cse-api-key" "$CSE_KEY" "Custom Search API Key"
    fi
    
    if [ ! -z "$YT_KEY" ]; then
        create_secret "youtube-api-key" "$YT_KEY" "YouTube Data API Key"
    fi
    
    # Store OAuth credentials
    if [ -f "config/oauth_credentials.json" ]; then
        create_secret "oauth-credentials" "$(cat config/oauth_credentials.json)" "OAuth2 Credentials"
    fi
    
    # Store service account key
    if [ -f "config/service_account.json" ]; then
        create_secret "service-account-key" "$(cat config/service_account.json)" "Service Account Key"
    fi
    
    echo -e "${GREEN}✓ Secrets stored in Secret Manager${NC}"
}

# Function to pull secrets from Secret Manager
pull_secrets() {
    echo -e "\n${YELLOW}Pulling secrets from Secret Manager...${NC}"
    
    # List all secrets
    echo "Available secrets:"
    gcloud secrets list --project=$PROJECT_ID --filter="labels.app=dpgen" --format="table(name,created)" 2>/dev/null || echo "No secrets found"
    
    # Pull specific secrets
    echo -e "\n${BLUE}Retrieving secret values...${NC}"
    
    # Get CSE API key
    if gcloud secrets describe cse-api-key --project=$PROJECT_ID &>/dev/null; then
        CSE_KEY=$(gcloud secrets versions access latest --secret="cse-api-key" --project=$PROJECT_ID)
        echo -e "${GREEN}✓ Retrieved Custom Search API Key${NC}"
    fi
    
    # Get YouTube API key
    if gcloud secrets describe youtube-api-key --project=$PROJECT_ID &>/dev/null; then
        YT_KEY=$(gcloud secrets versions access latest --secret="youtube-api-key" --project=$PROJECT_ID)
        echo -e "${GREEN}✓ Retrieved YouTube API Key${NC}"
    fi
    
    # Get OAuth credentials
    if gcloud secrets describe oauth-credentials --project=$PROJECT_ID &>/dev/null; then
        gcloud secrets versions access latest --secret="oauth-credentials" --project=$PROJECT_ID > config/oauth_credentials_pulled.json
        echo -e "${GREEN}✓ Retrieved OAuth credentials -> config/oauth_credentials_pulled.json${NC}"
    fi
    
    # Get service account key
    if gcloud secrets describe service-account-key --project=$PROJECT_ID &>/dev/null; then
        gcloud secrets versions access latest --secret="service-account-key" --project=$PROJECT_ID > config/service_account_pulled.json
        echo -e "${GREEN}✓ Retrieved service account key -> config/service_account_pulled.json${NC}"
    fi
}

# Function to update .env file
update_env_file() {
    echo -e "\n${YELLOW}Updating .env file...${NC}"
    
    ENV_FILE="config/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}❌ .env file not found at $ENV_FILE${NC}"
        return
    fi
    
    # Update CSE API key
    if [ ! -z "$CSE_KEY" ]; then
        sed -i.bak "s/CSE_API_KEY=.*/CSE_API_KEY=$CSE_KEY/" $ENV_FILE
        echo -e "${GREEN}✓ Updated CSE_API_KEY${NC}"
    fi
    
    # Update YouTube API key
    if [ ! -z "$YT_KEY" ]; then
        sed -i.bak "s/YOUTUBE_API_KEY=.*/YOUTUBE_API_KEY=$YT_KEY/" $ENV_FILE
        echo -e "${GREEN}✓ Updated YOUTUBE_API_KEY${NC}"
    fi
    
    echo -e "${GREEN}✓ .env file updated${NC}"
}

# Function to grant necessary IAM roles
setup_iam() {
    echo -e "\n${YELLOW}Setting up IAM permissions...${NC}"
    
    SA_EMAIL="firebase-adminsdk-fbsvc@content-pipeline-7dd4f.iam.gserviceaccount.com"
    
    ROLES=(
        "roles/aiplatform.user"
        "roles/storage.admin"
        "roles/datastore.user"
        "roles/secretmanager.secretAccessor"
        "roles/run.invoker"
        "roles/workflows.invoker"
    )
    
    for role in "${ROLES[@]}"; do
        echo "Granting $role..."
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SA_EMAIL" \
            --role="$role" \
            --quiet 2>/dev/null || echo "  Role already granted"
    done
    
    echo -e "${GREEN}✓ IAM roles configured${NC}"
}

# Function to list all credentials
list_credentials() {
    echo -e "\n${BLUE}📋 Credentials Summary${NC}"
    echo "======================="
    
    echo -e "\n${YELLOW}Service Accounts:${NC}"
    gcloud iam service-accounts list --project=$PROJECT_ID --format="table(email,displayName)"
    
    echo -e "\n${YELLOW}API Keys:${NC}"
    gcloud services api-keys list --project=$PROJECT_ID --format="table(displayName,createTime,restrictions.api_targets[].service:label=APIs)"
    
    echo -e "\n${YELLOW}OAuth2 Clients:${NC}"
    # Note: OAuth clients are managed in the console, not via CLI
    echo "View at: https://console.cloud.google.com/apis/credentials?project=$OAUTH_PROJECT"
    
    echo -e "\n${YELLOW}Secrets in Secret Manager:${NC}"
    gcloud secrets list --project=$PROJECT_ID --filter="labels.app=dpgen" --format="table(name,created)"
}

# Main menu
main() {
    check_auth
    
    echo -e "\n${BLUE}Select an option:${NC}"
    echo "1) Create new API keys"
    echo "2) Set up Secret Manager (store secrets)"
    echo "3) Pull secrets from Secret Manager"
    echo "4) Update .env file with secrets"
    echo "5) Set up IAM permissions"
    echo "6) List all credentials"
    echo "7) Do everything (recommended for first setup)"
    echo "0) Exit"
    
    read -p "Enter choice [0-7]: " choice
    
    case $choice in
        1) create_api_keys ;;
        2) setup_secret_manager ;;
        3) pull_secrets ;;
        4) update_env_file ;;
        5) setup_iam ;;
        6) list_credentials ;;
        7) 
            create_api_keys
            setup_secret_manager
            pull_secrets
            update_env_file
            setup_iam
            list_credentials
            ;;
        0) 
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            exit 1
            ;;
    esac
    
    echo -e "\n${GREEN}✅ Complete!${NC}"
}

# Run main function
main