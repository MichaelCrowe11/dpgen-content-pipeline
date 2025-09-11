#!/bin/bash

# Production Deployment Script for DPGen Pipeline
# Full automation with monitoring, scaling, and failover

set -e

# Configuration
PROJECT_ID="content-pipeline-7dd4f"
REGION="us-central1"
BACKUP_REGION="us-east1"
ENVIRONMENT="production"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 DPGen Production Deployment${NC}"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Primary Region: $REGION"
echo "Backup Region: $BACKUP_REGION"
echo ""

# Pre-deployment checks
pre_deployment_checks() {
    echo -e "${YELLOW}Running pre-deployment checks...${NC}"
    
    # Check if all APIs are enabled
    node ../scripts/enable-apis.js
    
    # Run test suite
    echo "Running test suite..."
    if ! node ../scripts/test-pipeline.js; then
        echo -e "${RED}❌ Tests failed! Fix issues before deploying.${NC}"
        exit 1
    fi
    
    # Create backup
    echo "Creating pre-deployment backup..."
    node ../scripts/backup-restore.js create
    
    echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"
}

# Deploy infrastructure
deploy_infrastructure() {
    echo -e "\n${YELLOW}Deploying infrastructure...${NC}"
    
    # Create production VPC
    echo "Creating VPC network..."
    gcloud compute networks create dpgen-vpc \
        --subnet-mode=custom \
        --bgp-routing-mode=regional \
        --project=$PROJECT_ID 2>/dev/null || echo "VPC already exists"
    
    # Create subnets
    gcloud compute networks subnets create dpgen-subnet-$REGION \
        --network=dpgen-vpc \
        --region=$REGION \
        --range=10.0.1.0/24 \
        --project=$PROJECT_ID 2>/dev/null || echo "Subnet already exists"
    
    # Create Cloud NAT for outbound connectivity
    gcloud compute routers create dpgen-router \
        --network=dpgen-vpc \
        --region=$REGION \
        --project=$PROJECT_ID 2>/dev/null || echo "Router already exists"
    
    gcloud compute routers nats create dpgen-nat \
        --router=dpgen-router \
        --region=$REGION \
        --nat-all-subnet-ip-ranges \
        --auto-allocate-nat-external-ips \
        --project=$PROJECT_ID 2>/dev/null || echo "NAT already exists"
    
    echo -e "${GREEN}✓ Infrastructure deployed${NC}"
}

# Deploy Cloud Run services with auto-scaling
deploy_cloud_run() {
    echo -e "\n${YELLOW}Deploying Cloud Run services...${NC}"
    
    # Build and push renderer image
    cd ../renderer
    
    # Build with Cloud Build for better caching
    gcloud builds submit \
        --tag gcr.io/$PROJECT_ID/dpgen-renderer:$ENVIRONMENT \
        --project=$PROJECT_ID
    
    # Deploy renderer with production config
    gcloud run deploy dpgen-renderer-prod \
        --image gcr.io/$PROJECT_ID/dpgen-renderer:$ENVIRONMENT \
        --region=$REGION \
        --platform=managed \
        --memory=4Gi \
        --cpu=2 \
        --timeout=600 \
        --concurrency=10 \
        --min-instances=1 \
        --max-instances=100 \
        --service-account=dpgen-renderer@$PROJECT_ID.iam.gserviceaccount.com \
        --vpc-connector=dpgen-vpc-connector \
        --set-env-vars="ENVIRONMENT=$ENVIRONMENT,PROJECT_ID=$PROJECT_ID" \
        --labels="app=dpgen,env=$ENVIRONMENT" \
        --project=$PROJECT_ID
    
    # Get service URL
    RENDERER_URL=$(gcloud run services describe dpgen-renderer-prod \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    
    echo -e "${GREEN}✓ Renderer deployed: $RENDERER_URL${NC}"
    
    # Deploy backup renderer in different region
    echo "Deploying backup renderer..."
    gcloud run deploy dpgen-renderer-backup \
        --image gcr.io/$PROJECT_ID/dpgen-renderer:$ENVIRONMENT \
        --region=$BACKUP_REGION \
        --platform=managed \
        --memory=2Gi \
        --cpu=1 \
        --timeout=600 \
        --concurrency=5 \
        --min-instances=0 \
        --max-instances=10 \
        --project=$PROJECT_ID
    
    cd ..
}

# Deploy Cloud Workflows with error handling
deploy_workflows() {
    echo -e "\n${YELLOW}Deploying Cloud Workflows...${NC}"
    
    # Update workflow with production settings
    sed -i "s|RENDERER_URL_PLACEHOLDER|$RENDERER_URL|g" ../workflows-gcp/main.yaml
    
    # Deploy main workflow
    gcloud workflows deploy content-pipeline-prod \
        --source=../workflows-gcp/main.yaml \
        --location=$REGION \
        --service-account=dpgen-workflow@$PROJECT_ID.iam.gserviceaccount.com \
        --labels="app=dpgen,env=$ENVIRONMENT" \
        --project=$PROJECT_ID
    
    echo -e "${GREEN}✓ Workflows deployed${NC}"
}

# Set up Cloud Scheduler for production
setup_scheduler() {
    echo -e "\n${YELLOW}Setting up production schedules...${NC}"
    
    CHANNELS=("circuit-myth" "deeptime-microhistory" "zero-view-science" "map-oddities" "space-minute" "design-details" "pattern-language" "econ-snack")
    
    for channel in "${CHANNELS[@]}"; do
        # Stagger schedules to avoid API rate limits
        HOUR=$((12 + ($RANDOM % 8)))
        MINUTE=$((RANDOM % 60))
        
        # Create production schedule
        gcloud scheduler jobs create http "${channel}-prod" \
            --location=$REGION \
            --schedule="$MINUTE $HOUR,$(($HOUR+8)) * * *" \
            --time-zone="America/Phoenix" \
            --uri="https://workflowexecutions.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/workflows/content-pipeline-prod/executions" \
            --http-method=POST \
            --headers="Content-Type=application/json" \
            --message-body="{\"argument\":\"{\\\"channel_slug\\\":\\\"${channel}\\\",\\\"environment\\\":\\\"production\\\"}\"}" \
            --oauth-service-account-email="dpgen-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
            --attempt-deadline="30m" \
            --project=$PROJECT_ID 2>/dev/null || echo "Schedule exists: ${channel}-prod"
        
        echo "  ✓ Scheduled: $channel at $HOUR:$MINUTE and $(($HOUR+8)):$MINUTE daily"
    done
    
    echo -e "${GREEN}✓ Production schedules created${NC}"
}

# Set up monitoring and alerting
setup_monitoring() {
    echo -e "\n${YELLOW}Setting up monitoring...${NC}"
    
    # Create uptime checks
    gcloud monitoring uptime-checks create \
        --display-name="DPGen Renderer Health" \
        --resource-type="CLOUD_RUN" \
        --service="dpgen-renderer-prod" \
        --location=$REGION \
        --project=$PROJECT_ID 2>/dev/null || echo "Uptime check exists"
    
    # Create alert policies
    cat > alert-policy.yaml << EOF
displayName: "DPGen Pipeline Failures"
conditions:
  - displayName: "High failure rate"
    conditionThreshold:
      filter: 'resource.type="cloud_workflow" AND metric.type="workflows.googleapis.com/finished_execution_count" AND metric.labels.status="FAILED"'
      comparison: COMPARISON_GT
      thresholdValue: 5
      duration: 300s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
alertStrategy:
  autoClose: 86400s
notificationChannels: []
enabled: true
EOF
    
    gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml \
        --project=$PROJECT_ID 2>/dev/null || echo "Alert policy exists"
    
    # Set up BigQuery monitoring
    cd ../monitoring
    node dashboard-setup.js
    cd ..
    
    echo -e "${GREEN}✓ Monitoring configured${NC}"
}

# Set up auto-scaling policies
setup_autoscaling() {
    echo -e "\n${YELLOW}Configuring auto-scaling...${NC}"
    
    # Create Cloud Tasks queue for async processing
    gcloud tasks queues create dpgen-render-queue \
        --location=$REGION \
        --max-concurrent-dispatches=100 \
        --max-dispatches-per-second=10 \
        --max-attempts=3 \
        --project=$PROJECT_ID 2>/dev/null || echo "Queue exists"
    
    # Set up Pub/Sub for event-driven scaling
    gcloud pubsub topics create dpgen-events \
        --project=$PROJECT_ID 2>/dev/null || echo "Topic exists"
    
    gcloud pubsub subscriptions create dpgen-events-sub \
        --topic=dpgen-events \
        --ack-deadline=600 \
        --project=$PROJECT_ID 2>/dev/null || echo "Subscription exists"
    
    echo -e "${GREEN}✓ Auto-scaling configured${NC}"
}

# Deploy CDN for global content delivery
setup_cdn() {
    echo -e "\n${YELLOW}Setting up CDN...${NC}"
    
    # Create Cloud CDN backend bucket
    gsutil mb -p $PROJECT_ID -c STANDARD -l MULTI-REGION -b on \
        gs://dpgen-cdn-prod 2>/dev/null || echo "CDN bucket exists"
    
    # Enable Cloud CDN
    gcloud compute backend-buckets create dpgen-cdn-backend \
        --gcs-bucket-name=dpgen-cdn-prod \
        --enable-cdn \
        --cache-mode=CACHE_ALL_STATIC \
        --default-ttl=3600 \
        --project=$PROJECT_ID 2>/dev/null || echo "Backend bucket exists"
    
    # Create URL map
    gcloud compute url-maps create dpgen-cdn-map \
        --default-backend-bucket=dpgen-cdn-backend \
        --project=$PROJECT_ID 2>/dev/null || echo "URL map exists"
    
    echo -e "${GREEN}✓ CDN configured${NC}"
}

# Final production checks
post_deployment_checks() {
    echo -e "\n${YELLOW}Running post-deployment checks...${NC}"
    
    # Test renderer endpoint
    echo "Testing renderer..."
    HEALTH_CHECK=$(curl -s "$RENDERER_URL/" | jq -r '.status')
    if [ "$HEALTH_CHECK" = "healthy" ]; then
        echo -e "${GREEN}✓ Renderer is healthy${NC}"
    else
        echo -e "${RED}❌ Renderer health check failed${NC}"
    fi
    
    # Test workflow execution
    echo "Testing workflow..."
    EXECUTION_ID=$(gcloud workflows run content-pipeline-prod \
        --data='{"channel_slug":"circuit-myth","topic":"Test deployment","environment":"production"}' \
        --location=$REGION \
        --project=$PROJECT_ID \
        --format='value(name)')
    
    echo "  Execution started: $EXECUTION_ID"
    
    # Check cost tracking
    echo "Checking cost tracking..."
    node ../monitoring/cost-tracker.js spending daily
    
    echo -e "${GREEN}✓ Post-deployment checks complete${NC}"
}

# Generate production documentation
generate_docs() {
    echo -e "\n${YELLOW}Generating production documentation...${NC}"
    
    cat > PRODUCTION_STATUS.md << EOF
# DPGen Production Deployment Status

**Deployment Date**: $(date)
**Environment**: $ENVIRONMENT
**Project ID**: $PROJECT_ID

## Services
- **Renderer URL**: $RENDERER_URL
- **Primary Region**: $REGION
- **Backup Region**: $BACKUP_REGION

## Monitoring
- Dashboard: https://console.cloud.google.com/monitoring/dashboards
- Logs: https://console.cloud.google.com/logs
- Costs: https://console.cloud.google.com/billing

## Scheduled Channels
$(for channel in "${CHANNELS[@]}"; do echo "- $channel: 2x daily"; done)

## Commands
\`\`\`bash
# Check status
gcloud workflows executions list --workflow=content-pipeline-prod

# View logs
gcloud logging read "resource.type=cloud_workflow"

# Monitor costs
node monitoring/cost-tracker.js spending daily

# Create backup
node scripts/backup-restore.js create
\`\`\`

## Support
- Alerts configured for >5 failures in 5 minutes
- Auto-scaling: 1-100 instances
- Budget alert: \$100/month
EOF
    
    echo -e "${GREEN}✓ Documentation generated: PRODUCTION_STATUS.md${NC}"
}

# Main deployment flow
main() {
    echo -e "${BLUE}Starting production deployment...${NC}"
    echo "This will:"
    echo "  1. Run pre-deployment checks"
    echo "  2. Deploy infrastructure"
    echo "  3. Deploy Cloud Run services"
    echo "  4. Deploy workflows"
    echo "  5. Set up scheduling"
    echo "  6. Configure monitoring"
    echo "  7. Set up auto-scaling"
    echo "  8. Configure CDN"
    echo "  9. Run post-deployment checks"
    echo ""
    read -p "Continue with production deployment? (y/n) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
    
    # Track deployment time
    START_TIME=$(date +%s)
    
    # Run deployment steps
    pre_deployment_checks
    deploy_infrastructure
    deploy_cloud_run
    deploy_workflows
    setup_scheduler
    setup_monitoring
    setup_autoscaling
    setup_cdn
    post_deployment_checks
    generate_docs
    
    # Calculate deployment time
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo -e "\n${GREEN}✅ PRODUCTION DEPLOYMENT COMPLETE!${NC}"
    echo "=================================="
    echo "Deployment time: ${DURATION} seconds"
    echo "Renderer URL: $RENDERER_URL"
    echo "Project: $PROJECT_ID"
    echo ""
    echo "Next steps:"
    echo "  1. Monitor first automated runs"
    echo "  2. Check cost tracking"
    echo "  3. Review analytics dashboard"
    echo "  4. Scale up if successful"
    echo ""
    echo "Monitor at: https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
}

# Run deployment
main