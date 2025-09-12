# DeepParallel Credentials Setup Guide

This guide walks you through setting up all required credentials for the DeepParallel Content Pipeline on Google Cloud Platform.

## Prerequisites

1. **Google Cloud Account**: Active GCP account with billing enabled
2. **gcloud CLI**: Installed and configured ([Install Guide](https://cloud.google.com/sdk/docs/install))
3. **Project Owner Role**: You need owner permissions on the GCP project

## Quick Start

Run the automated setup script:

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run the complete credential setup
./scripts/setup-all-credentials.sh

# Validate the setup
./scripts/validate-credentials.sh
```

## Required Credentials

### 1. Service Account
- **Name**: `deepparallel-pipeline@PROJECT_ID.iam.gserviceaccount.com`
- **Key Location**: `config/service_account.json`
- **Required Roles**:
  - `roles/aiplatform.user` - For Gemini, Veo, Imagen APIs
  - `roles/datastore.user` - For Firestore access
  - `roles/storage.admin` - For Cloud Storage operations
  - `roles/secretmanager.secretAccessor` - For accessing secrets
  - `roles/run.invoker` - For invoking Cloud Run services
  - `roles/workflows.invoker` - For running workflows

### 2. API Keys

#### Custom Search API
- **Purpose**: Web search for content research
- **Secret Name**: `CSE_API_KEY`
- **Setup**:
  1. Enable Custom Search API in GCP Console
  2. Create API key restricted to Custom Search API
  3. Create Custom Search Engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
  4. Get the Search Engine ID (cx parameter)

#### YouTube Data API
- **Purpose**: YouTube analytics and metadata
- **Secret Name**: `YOUTUBE_API_KEY`
- **Setup**:
  1. Enable YouTube Data API v3 in GCP Console
  2. Create API key restricted to YouTube Data API

#### Perspective API
- **Purpose**: Content moderation and compliance
- **Secret Name**: `PERSPECTIVE_API_KEY`
- **Setup**:
  1. Enable Perspective API in GCP Console
  2. Create API key for Perspective API

### 3. OAuth2 Credentials (Optional)
- **Purpose**: YouTube channel management and uploads
- **File**: `config/oauth_credentials.json`
- **Setup**:
  1. Create OAuth 2.0 Client ID in GCP Console
  2. Set authorized redirect URIs
  3. Download credentials JSON

## Manual Setup Steps

### Step 1: Set Project
```bash
export GCP_PROJECT_ID="your-project-id"
gcloud config set project $GCP_PROJECT_ID
```

### Step 2: Enable APIs
```bash
# Enable all required APIs
gcloud services enable \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  texttospeech.googleapis.com \
  run.googleapis.com \
  workflows.googleapis.com \
  secretmanager.googleapis.com \
  customsearch.googleapis.com \
  youtube.googleapis.com \
  perspective.googleapis.com
```

### Step 3: Create Service Account
```bash
# Create service account
gcloud iam service-accounts create deepparallel-pipeline \
  --display-name="DeepParallel Pipeline Service Account"

# Grant roles
SA_EMAIL="deepparallel-pipeline@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

for role in \
  roles/aiplatform.user \
  roles/datastore.user \
  roles/storage.admin \
  roles/secretmanager.secretAccessor \
  roles/run.invoker \
  roles/workflows.invoker; do
  
  gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role"
done

# Create key
mkdir -p config
gcloud iam service-accounts keys create config/service_account.json \
  --iam-account=$SA_EMAIL
```

### Step 4: Create API Keys
```bash
# Create Custom Search API key
gcloud services api-keys create \
  --display-name="deepparallel-custom-search" \
  --project=$GCP_PROJECT_ID

# Create YouTube API key
gcloud services api-keys create \
  --display-name="deepparallel-youtube" \
  --project=$GCP_PROJECT_ID

# Get key values (note the key IDs from creation output)
gcloud services api-keys get-key-string KEY_ID \
  --project=$GCP_PROJECT_ID
```

### Step 5: Store Secrets
```bash
# Store each secret
echo -n "YOUR_API_KEY" | gcloud secrets create CSE_API_KEY \
  --data-file=- \
  --replication-policy="automatic"

echo -n "YOUR_CSE_CX" | gcloud secrets create CSE_CX \
  --data-file=- \
  --replication-policy="automatic"

echo -n "YOUR_YOUTUBE_KEY" | gcloud secrets create YOUTUBE_API_KEY \
  --data-file=- \
  --replication-policy="automatic"
```

### Step 6: Create Environment File
```bash
cat > config/.env << EOF
GCP_PROJECT_ID=$GCP_PROJECT_ID
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=config/service_account.json

# Retrieved from Secret Manager
CSE_API_KEY=YOUR_CSE_API_KEY
CSE_CX=YOUR_CSE_CX
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY
PERSPECTIVE_API_KEY=YOUR_PERSPECTIVE_API_KEY

# Service Configuration
MAX_CONCURRENT_RENDERS=3
MAX_DAILY_VIDEOS_PER_CHANNEL=2
LOG_LEVEL=INFO
EOF
```

## Deploying with Credentials

### Cloud Run Deployment
```bash
# Deploy with secrets mounted
gcloud run deploy deepparallel-renderer \
  --source ./renderer \
  --region=us-central1 \
  --set-secrets="\
CSE_API_KEY=CSE_API_KEY:latest,\
CSE_CX=CSE_CX:latest,\
YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,\
PERSPECTIVE_API_KEY=PERSPECTIVE_API_KEY:latest" \
  --service-account=deepparallel-pipeline@${GCP_PROJECT_ID}.iam.gserviceaccount.com
```

### Workflows Deployment
```bash
# The workflow will use the service account for authentication
gcloud workflows deploy content-pipeline \
  --source=workflows-gcp/main.yaml \
  --location=us-central1 \
  --service-account=deepparallel-pipeline@${GCP_PROJECT_ID}.iam.gserviceaccount.com
```

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use Secret Manager** for all sensitive values
3. **Rotate keys regularly** (every 90 days)
4. **Restrict API key usage** to specific APIs and IPs
5. **Use service accounts** instead of user credentials
6. **Enable audit logging** for credential access
7. **Use least privilege** IAM roles

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```bash
# Re-authenticate
gcloud auth login
gcloud auth application-default login
```

#### 2. Permission Denied
```bash
# Check IAM roles
gcloud projects get-iam-policy $GCP_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:deepparallel-pipeline@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

#### 3. Secret Not Found
```bash
# List all secrets
gcloud secrets list --project=$GCP_PROJECT_ID

# Check secret versions
gcloud secrets versions list SECRET_NAME --project=$GCP_PROJECT_ID
```

#### 4. API Not Enabled
```bash
# Check enabled APIs
gcloud services list --enabled --project=$GCP_PROJECT_ID

# Enable missing API
gcloud services enable API_NAME.googleapis.com --project=$GCP_PROJECT_ID
```

## Validation Checklist

Run the validation script to ensure everything is configured:

```bash
./scripts/validate-credentials.sh
```

Expected output:
- ✅ All green checks = Ready to deploy
- ⚠️ Yellow warnings = Optional features may be limited
- ❌ Red errors = Must be fixed before deployment

## Support

For issues with credential setup:
1. Check the [GCP IAM documentation](https://cloud.google.com/iam/docs)
2. Review [Secret Manager best practices](https://cloud.google.com/secret-manager/docs/best-practices)
3. Consult the [API Keys guide](https://cloud.google.com/docs/authentication/api-keys)

## Next Steps

After credentials are configured:
1. Deploy the infrastructure: `./scripts/deploy.sh`
2. Test the pipeline: `gcloud workflows run content-pipeline --data='{"channel_slug":"circuit-myth"}'`
3. Monitor execution: Check Cloud Console for logs and metrics