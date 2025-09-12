#!/bin/bash

# DeepParallel Pipeline Deployment Script
# Deploys the complete content creation pipeline to Google Cloud

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-""}
LOCATION=${GCP_LOCATION:-"us-central1"}
RENDERER_URL=""

echo -e "${GREEN}🚀 DeepParallel Pipeline Deployment${NC}"
echo "================================"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Check project
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project)
        if [ -z "$PROJECT_ID" ]; then
            echo -e "${RED}❌ No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ Prerequisites checked${NC}"
    echo "  Project: $PROJECT_ID"
    echo "  Location: $LOCATION"
}

# Enable required APIs
enable_apis() {
    echo -e "\n${YELLOW}Enabling required APIs...${NC}"
    
    APIs=(
        "aiplatform.googleapis.com"
        "firestore.googleapis.com"
        "storage.googleapis.com"
        "texttospeech.googleapis.com"
        "vision.googleapis.com"
        "videointelligence.googleapis.com"
        "run.googleapis.com"
        "workflows.googleapis.com"
        "cloudscheduler.googleapis.com"
        "cloudtasks.googleapis.com"
        "bigquery.googleapis.com"
        "customsearch.googleapis.com"
        "youtube.googleapis.com"
    )
    
    for api in "${APIs[@]}"; do
        echo "  Enabling $api..."
        gcloud services enable $api --project=$PROJECT_ID --quiet
    done
    
    echo -e "${GREEN}✓ APIs enabled${NC}"
}

# Create service accounts (workflow + renderer) with least privilege
create_service_accounts() {
    echo -e "\n${YELLOW}Creating service accounts...${NC}"

    WORKFLOW_SA_NAME=${WORKFLOW_SA_NAME:-"deepparallel-workflow"}
    RENDERER_SA_NAME=${RENDERER_SA_NAME:-"deepparallel-renderer"}
    WORKFLOW_SA_EMAIL="${WORKFLOW_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    RENDERER_SA_EMAIL="${RENDERER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    gcloud iam service-accounts create $WORKFLOW_SA_NAME --display-name "Workflow Orchestrator SA" --project $PROJECT_ID 2>/dev/null || echo "Workflow SA exists"
    gcloud iam service-accounts create $RENDERER_SA_NAME --display-name "Renderer Service SA" --project $PROJECT_ID 2>/dev/null || echo "Renderer SA exists"

    WORKFLOW_ROLES=(
        roles/aiplatform.user
        roles/datastore.user
        roles/run.invoker
        roles/workflows.invoker
        roles/storage.objectViewer
        roles/secretmanager.secretAccessor
        roles/logging.logWriter
        roles/bigquery.dataEditor
    )
    RENDERER_ROLES=(
        roles/storage.objectAdmin
        roles/datastore.user
        roles/secretmanager.secretAccessor
        roles/logging.logWriter
    )

    for r in "${WORKFLOW_ROLES[@]}"; do
        gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:${WORKFLOW_SA_EMAIL}" --role "$r" --quiet
    done
    for r in "${RENDERER_ROLES[@]}"; do
        gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:${RENDERER_SA_EMAIL}" --role "$r" --quiet
    done

    echo -e "${GREEN}✓ Service accounts configured${NC}"
}

# Create storage buckets
create_storage() {
    echo -e "\n${YELLOW}Creating storage buckets...${NC}"
    
    BUCKETS=(
        "deepparallel-shared"
        "deepparallel-circuit-myth"
        "deepparallel-deeptime"
        "deepparallel-zero-view"
        "deepparallel-map-oddities"
        "deepparallel-space-minute"
        "deepparallel-design-details"
        "deepparallel-pattern-language"
        "deepparallel-econ-snack"
        "deepparallel-renderer"
    )
    
    for bucket in "${BUCKETS[@]}"; do
        echo "  Creating gs://${bucket}..."
        gsutil mb -p $PROJECT_ID -l $LOCATION gs://${bucket} 2>/dev/null || echo "  Bucket already exists"
    done
    
    echo -e "${GREEN}✓ Storage buckets created${NC}"
}

# Initialize Firestore
init_firestore() {
    echo -e "\n${YELLOW}Initializing Firestore...${NC}"
    
    # Create Firestore database (if not exists)
    gcloud firestore databases create \
        --location=$LOCATION \
        --project=$PROJECT_ID 2>/dev/null || echo "  Firestore already initialized"
    
    # Seed channels
    echo "  Seeding channel data..."
    cd seeds
    npm install --silent
    node seed_channels.js
    cd ..
    
    echo -e "${GREEN}✓ Firestore initialized and seeded${NC}"
}

# Deploy Cloud Run renderer
deploy_renderer() {
    echo -e "\n${YELLOW}Deploying Cloud Run renderer...${NC}"
    
    cd renderer
    
    # Build and deploy
    gcloud run deploy deepparallel-renderer \
        --source . \
        --region=$LOCATION \
        --memory=2Gi \
        --cpu=2 \
        --timeout=600 \
        --allow-unauthenticated \
        --service-account "${RENDERER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --project=$PROJECT_ID \
        --quiet

        echo "(Optional) Re-run with --set-secrets CSE_API_KEY=CSE_API_KEY:latest,etc once secrets are created."
    
    # Get service URL
    RENDERER_URL=$(gcloud run services describe deepparallel-renderer \
        --region=$LOCATION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    
    cd ..
    
    echo -e "${GREEN}✓ Renderer deployed at: $RENDERER_URL${NC}"
}

# Deploy Cloud Workflows
deploy_workflows() {
    echo -e "\n${YELLOW}Deploying Cloud Workflows...${NC}"

    TEMPLATE="workflows-gcp/main.yaml.tmpl"
    RENDERED="workflows-gcp/main.rendered.yaml"

    if [ ! -f "$TEMPLATE" ]; then
        echo -e "${RED}Template $TEMPLATE not found${NC}"; exit 1;
    fi

    cp "$TEMPLATE" "$RENDERED"
    # Inject renderer URL
    sed -i "s|__RENDERER_URL__|$RENDERER_URL|g" "$RENDERED"

    gcloud workflows deploy content-pipeline \
        --source="$RENDERED" \
        --location=$LOCATION \
        --service-account="${WORKFLOW_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --project=$PROJECT_ID

    echo -e "${GREEN}✓ Workflows deployed (source: $RENDERED)${NC}"
}

# Setup Cloud Scheduler
setup_scheduler() {
    echo -e "\n${YELLOW}Setting up Cloud Scheduler...${NC}"
    
    # Create scheduler jobs for each channel
    CHANNELS=("circuit-myth" "deeptime-microhistory" "zero-view-science" "map-oddities" "space-minute" "design-details" "pattern-language" "econ-snack")
    
    for channel in "${CHANNELS[@]}"; do
        echo "  Creating schedule for $channel..."
        
        # Morning schedule
        gcloud scheduler jobs create http "${channel}-morning" \
            --location=$LOCATION \
            --schedule="30 12 * * *" \
            --time-zone="America/Phoenix" \
            --uri="https://workflowexecutions.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/workflows/content-pipeline/executions" \
            --http-method=POST \
            --headers="Content-Type=application/json" \
            --message-body="{\"argument\":\"{\\\"channel_slug\\\":\\\"${channel}\\\"}\"}" \
            --oauth-service-account-email="${WORKFLOW_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
            --project=$PROJECT_ID 2>/dev/null || echo "    Schedule already exists"
        
        # Evening schedule
        gcloud scheduler jobs create http "${channel}-evening" \
            --location=$LOCATION \
            --schedule="30 19 * * *" \
            --time-zone="America/Phoenix" \
            --uri="https://workflowexecutions.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/workflows/content-pipeline/executions" \
            --http-method=POST \
            --headers="Content-Type=application/json" \
            --message-body="{\"argument\":\"{\\\"channel_slug\\\":\\\"${channel}\\\"}\"}" \
            --oauth-service-account-email="${WORKFLOW_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
            --project=$PROJECT_ID 2>/dev/null || echo "    Schedule already exists"
    done
    
    echo -e "${GREEN}✓ Cloud Scheduler configured${NC}"
}

# Setup BigQuery
setup_bigquery() {
    echo -e "\n${YELLOW}Setting up BigQuery...${NC}"
    
    # Create dataset
    bq mk --dataset \
        --location=$LOCATION \
        --project_id=$PROJECT_ID \
        dpgen_analytics 2>/dev/null || echo "  Dataset already exists"
    
    # Create tables
    bq mk --table \
        --project_id=$PROJECT_ID \
        dpgen_analytics.content_metrics \
        session_id:STRING,platform:STRING,video_id:STRING,title:STRING,published_at:TIMESTAMP,collected_at:TIMESTAMP,views:INTEGER,likes:INTEGER,comments:INTEGER,shares:INTEGER,performance_score:FLOAT 2>/dev/null || echo "  Table already exists"
    
    echo -e "${GREEN}✓ BigQuery configured${NC}"
}

# Main deployment flow
main() {
    check_prerequisites
    
    echo -e "\n${YELLOW}Starting deployment...${NC}"
    echo "This will:"
    echo "  1. Enable required APIs"
    echo "  2. Create service account"
    echo "  3. Create storage buckets"
    echo "  4. Initialize Firestore"
    echo "  5. Deploy Cloud Run renderer"
    echo "  6. Deploy Cloud Workflows"
    echo "  7. Setup Cloud Scheduler"
    echo "  8. Setup BigQuery"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
    
    enable_apis
    create_service_accounts
    create_storage
    init_firestore
    deploy_renderer
    deploy_workflows
    setup_scheduler
    setup_bigquery
    
    echo -e "\n${GREEN}✅ Deployment complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Add your API keys to config/.env"
    echo "  2. Test the pipeline: gcloud workflows run content-pipeline --data='{\"channel_slug\":\"circuit-myth\",\"topic\":\"Do SSDs really last longer?\"}'"
    echo "  3. Monitor at: https://console.cloud.google.com/workflows"
    echo ""
    echo "Renderer URL: $RENDERER_URL"
    echo "Project: $PROJECT_ID"
}

# Run main function
main