#!/bin/bash

# DeepParallel Credential Validation Script
# This script validates that all required credentials are properly configured

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}
LOCATION=${GCP_LOCATION:-"us-central1"}

echo -e "${BLUE}🔍 DeepParallel Credential Validation${NC}"
echo "================================"
echo ""

# Track validation status
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Function to check status
check_status() {
    local condition=$1
    local success_msg=$2
    local error_msg=$3
    local is_warning=${4:-false}
    
    if eval $condition; then
        echo -e "${GREEN}✓${NC} $success_msg"
        return 0
    else
        if [ "$is_warning" = true ]; then
            echo -e "${YELLOW}⚠${NC} $error_msg"
            ((VALIDATION_WARNINGS++))
        else
            echo -e "${RED}✗${NC} $error_msg"
            ((VALIDATION_ERRORS++))
        fi
        return 1
    fi
}

# Function to test API call
test_api() {
    local api_name=$1
    local test_url=$2
    local api_key=$3
    
    if [ -z "$api_key" ] || [ "$api_key" = "null" ]; then
        echo -e "${YELLOW}⚠${NC} $api_name API key not configured"
        ((VALIDATION_WARNINGS++))
        return 1
    fi
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$test_url" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ] || [ "$response" = "400" ] || [ "$response" = "403" ]; then
        echo -e "${GREEN}✓${NC} $api_name API key is valid (HTTP $response)"
        return 0
    else
        echo -e "${RED}✗${NC} $api_name API key test failed (HTTP $response)"
        ((VALIDATION_ERRORS++))
        return 1
    fi
}

echo -e "${YELLOW}1. Checking GCP Configuration${NC}"
echo "------------------------------"

# Check project
check_status "[ ! -z '$PROJECT_ID' ]" \
    "Project ID: $PROJECT_ID" \
    "No GCP project configured"

# Check gcloud auth
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
check_status "[ ! -z '$ACCOUNT' ]" \
    "Authenticated as: $ACCOUNT" \
    "Not authenticated with gcloud"

echo ""
echo -e "${YELLOW}2. Checking Service Account${NC}"
echo "----------------------------"

SA_EMAIL="content-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"

# Check service account exists
check_status "gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null" \
    "Service account exists: $SA_EMAIL" \
    "Service account not found: $SA_EMAIL"

# Check service account key file
check_status "[ -f 'config/service_account.json' ]" \
    "Service account key file exists" \
    "Service account key file not found at config/service_account.json"

# Check key file validity
if [ -f "config/service_account.json" ]; then
    KEY_PROJECT=$(cat config/service_account.json | grep -o '"project_id": "[^"]*"' | cut -d'"' -f4)
    check_status "[ '$KEY_PROJECT' = '$PROJECT_ID' ]" \
        "Service account key matches project" \
        "Service account key is for different project: $KEY_PROJECT" true
fi

echo ""
echo -e "${YELLOW}3. Checking IAM Roles${NC}"
echo "---------------------"

REQUIRED_ROLES=(
    "roles/aiplatform.user"
    "roles/datastore.user"
    "roles/storage.admin"
    "roles/secretmanager.secretAccessor"
    "roles/run.invoker"
    "roles/workflows.invoker"
)

for role in "${REQUIRED_ROLES[@]}"; do
    role_granted=$(gcloud projects get-iam-policy $PROJECT_ID \
        --flatten="bindings[].members" \
        --filter="bindings.role:$role AND bindings.members:serviceAccount:$SA_EMAIL" \
        --format="value(bindings.role)" 2>/dev/null | head -n1)
    
    check_status "[ ! -z '$role_granted' ]" \
        "Role granted: $role" \
        "Role missing: $role" true
done

echo ""
echo -e "${YELLOW}4. Checking APIs Enabled${NC}"
echo "------------------------"

REQUIRED_APIS=(
    "aiplatform.googleapis.com"
    "firestore.googleapis.com"
    "storage.googleapis.com"
    "run.googleapis.com"
    "workflows.googleapis.com"
    "secretmanager.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
    api_enabled=$(gcloud services list --enabled --project=$PROJECT_ID \
        --filter="name:$api" --format="value(name)" 2>/dev/null | head -n1)
    
    check_status "[ ! -z '$api_enabled' ]" \
        "API enabled: $api" \
        "API not enabled: $api"
done

echo ""
echo -e "${YELLOW}5. Checking Secret Manager${NC}"
echo "--------------------------"

# Check if secrets exist
SECRETS=("CSE_API_KEY" "CSE_CX" "YOUTUBE_API_KEY" "PERSPECTIVE_API_KEY")

for secret in "${SECRETS[@]}"; do
    check_status "gcloud secrets describe $secret --project=$PROJECT_ID &>/dev/null" \
        "Secret exists: $secret" \
        "Secret not found: $secret" true
done

# Try to access secrets
if gcloud secrets describe CSE_API_KEY --project=$PROJECT_ID &>/dev/null; then
    CSE_API_KEY=$(gcloud secrets versions access latest --secret="CSE_API_KEY" --project=$PROJECT_ID 2>/dev/null || echo "")
fi

if gcloud secrets describe YOUTUBE_API_KEY --project=$PROJECT_ID &>/dev/null; then
    YOUTUBE_API_KEY=$(gcloud secrets versions access latest --secret="YOUTUBE_API_KEY" --project=$PROJECT_ID 2>/dev/null || echo "")
fi

if gcloud secrets describe CSE_CX --project=$PROJECT_ID &>/dev/null; then
    CSE_CX=$(gcloud secrets versions access latest --secret="CSE_CX" --project=$PROJECT_ID 2>/dev/null || echo "")
fi

echo ""
echo -e "${YELLOW}6. Checking API Keys${NC}"
echo "--------------------"

# Test Custom Search API
if [ ! -z "$CSE_API_KEY" ] && [ ! -z "$CSE_CX" ]; then
    test_api "Custom Search" \
        "https://www.googleapis.com/customsearch/v1?key=$CSE_API_KEY&cx=$CSE_CX&q=test" \
        "$CSE_API_KEY"
else
    echo -e "${YELLOW}⚠${NC} Custom Search API not fully configured (missing key or cx)"
    ((VALIDATION_WARNINGS++))
fi

# Test YouTube API
if [ ! -z "$YOUTUBE_API_KEY" ]; then
    test_api "YouTube Data" \
        "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=$YOUTUBE_API_KEY" \
        "$YOUTUBE_API_KEY"
else
    echo -e "${YELLOW}⚠${NC} YouTube API key not configured"
    ((VALIDATION_WARNINGS++))
fi

echo ""
echo -e "${YELLOW}7. Checking Storage Buckets${NC}"
echo "---------------------------"

EXPECTED_BUCKETS=(
    "deepparallel-shared"
    "deepparallel-renderer"
)

for bucket in "${EXPECTED_BUCKETS[@]}"; do
    bucket_exists=$(gsutil ls -p $PROJECT_ID gs://${bucket} &>/dev/null && echo "true" || echo "false")
    check_status "[ '$bucket_exists' = 'true' ]" \
        "Bucket exists: gs://${bucket}" \
        "Bucket not found: gs://${bucket}" true
done

echo ""
echo -e "${YELLOW}8. Checking Firestore${NC}"
echo "---------------------"

# Check if Firestore is initialized
firestore_exists=$(gcloud firestore databases list --project=$PROJECT_ID --format="value(name)" 2>/dev/null | head -n1)
check_status "[ ! -z '$firestore_exists' ]" \
    "Firestore database exists" \
    "Firestore not initialized"

echo ""
echo -e "${YELLOW}9. Checking Cloud Run Service${NC}"
echo "-----------------------------"

# Check if renderer service is deployed
service_exists=$(gcloud run services describe deepparallel-renderer \
    --region=$LOCATION --project=$PROJECT_ID --format="value(name)" 2>/dev/null || echo "")

if [ ! -z "$service_exists" ]; then
    SERVICE_URL=$(gcloud run services describe deepparallel-renderer \
        --region=$LOCATION --project=$PROJECT_ID --format="value(status.url)" 2>/dev/null)
    echo -e "${GREEN}✓${NC} Cloud Run service deployed: $SERVICE_URL"
    
    # Check service health
    health_check=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/" 2>/dev/null || echo "000")
    check_status "[ '$health_check' = '200' ]" \
        "Service health check passed" \
        "Service health check failed (HTTP $health_check)" true
else
    echo -e "${YELLOW}⚠${NC} Cloud Run service not deployed"
    ((VALIDATION_WARNINGS++))
fi

echo ""
echo -e "${YELLOW}10. Checking Cloud Workflows${NC}"
echo "----------------------------"

# Check if workflow is deployed
workflow_exists=$(gcloud workflows describe content-pipeline \
    --location=$LOCATION --project=$PROJECT_ID --format="value(name)" 2>/dev/null || echo "")

check_status "[ ! -z '$workflow_exists' ]" \
    "Workflow deployed: content-pipeline" \
    "Workflow not deployed" true

echo ""
echo -e "${YELLOW}11. Checking Environment File${NC}"
echo "-----------------------------"

check_status "[ -f 'config/.env' ]" \
    "Environment file exists: config/.env" \
    "Environment file not found" true

if [ -f "config/.env" ]; then
    # Check for placeholder values
    placeholders=$(grep -c "YOUR_" config/.env 2>/dev/null || echo "0")
    if [ "$placeholders" -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC} Found $placeholders placeholder values in .env file"
        ((VALIDATION_WARNINGS++))
    else
        echo -e "${GREEN}✓${NC} No placeholder values in .env file"
    fi
fi

echo ""
echo "================================"
echo -e "${BLUE}Validation Summary${NC}"
echo "================================"

if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All validations passed!${NC}"
    echo "Your DeepParallel pipeline is fully configured and ready to use."
    exit 0
elif [ $VALIDATION_ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation completed with $VALIDATION_WARNINGS warnings${NC}"
    echo "The pipeline should work but some optional features may be limited."
    exit 0
else
    echo -e "${RED}❌ Validation failed with $VALIDATION_ERRORS errors and $VALIDATION_WARNINGS warnings${NC}"
    echo ""
    echo "To fix the errors:"
    echo "1. Run: ./scripts/setup-all-credentials.sh"
    echo "2. Follow the setup prompts carefully"
    echo "3. Run this validation again"
    exit 1
fi