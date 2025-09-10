# DPGen Content Creation Pipeline

Production-grade, multi-agent content creation pipeline using **100% Google AI** for automated video generation and multi-platform publishing.

## 🚀 Quick Start

### Prerequisites
- Google Cloud Project with billing enabled
- Node.js 18+ 
- gcloud CLI installed and configured

### Project Setup

You have two GCP projects configured:
1. **content-pipeline-7dd4f** - Main project with Firebase/Firestore (service account provided)
2. **tenacious-cocoa-471700-i9** - OAuth2 credentials for API access

### Installation

```bash
# Clone and navigate to project
cd dpgen-pipeline

# Install dependencies
npm install

# Set up environment
cp config/.env.example config/.env
# Your credentials are already configured in config/

# Initialize GCP project
chmod +x scripts/setup-project.sh
./scripts/setup-project.sh

# Seed the database
cd seeds
npm install
node seed_channels.js
cd ..

# Deploy the renderer
cd renderer
gcloud run deploy dpgen-renderer \
  --source . \
  --region us-central1 \
  --project content-pipeline-7dd4f

# Deploy workflows (recommended over Pipedream)
gcloud workflows deploy content-pipeline \
  --source workflows-gcp/main.yaml \
  --location us-central1 \
  --project content-pipeline-7dd4f
```

## 📁 Project Structure

```
dpgen-pipeline/
├── config/                   # Configuration files
│   ├── .env                 # Environment variables
│   ├── service_account.json # GCP service account
│   └── oauth_credentials.json # OAuth2 credentials
├── seeds/                    # Firestore seeding scripts
│   └── seed_channels.js     # 8 pre-configured channels
├── renderer/                 # Cloud Run video renderer
│   ├── app.py               # FastAPI renderer service
│   ├── Dockerfile           # Container configuration
│   └── requirements.txt     # Python dependencies
├── workflows-gcp/           # Google Cloud Workflows
│   └── main.yaml           # Main orchestration workflow
├── workflows/               # Alternative Pipedream workflows
│   ├── parent_workflow.js  # Main pipeline
│   ├── publish_workflow.js # Multi-platform publishing
│   └── analytics_workflow.js # Performance tracking
└── scripts/                 # Deployment scripts
    ├── deploy.sh           # Full deployment script
    └── setup-project.sh    # Quick setup script
```

## 🎬 8 Pre-Configured Channels

1. **Circuit Myth** - Tech myths & benchmarks
2. **DeepTime Microhistory** - 60-120s history shorts
3. **Zero-View Science** - Everyday physics demos
4. **Map Oddities** - Geographic quirks
5. **Space Minute** - Space explainers
6. **Design Details** - Industrial design insights
7. **Pattern Language** - Productivity/AI workflows
8. **Econ Snack** - Economic literacy

## 🔧 Pipeline Components

### Multi-Agent System
- **Creative Director** - Episode planning & hooks
- **Research Agent** - Web search & fact-checking
- **Scriptwriter** - SSML script generation
- **Visual Director** - Veo prompt generation
- **Compliance Agent** - Safety & policy checks
- **Distribution Producer** - Platform-specific metadata

### Google AI Services Used
- **Gemini 2.5 Pro/Flash** - Agent reasoning
- **Veo 3** - Text-to-video generation
- **Imagen 3/4** - Thumbnail generation
- **Cloud Text-to-Speech** - Voice synthesis
- **Vision SafeSearch** - Content safety
- **Video Intelligence API** - Video analysis

### Storage & Data
- **Firestore** - Channel profiles & sessions
- **Cloud Storage** - Media assets
- **BigQuery** - Analytics data lake

## 🚦 Running the Pipeline

### Manual Trigger
```bash
# Test with specific topic
gcloud workflows run content-pipeline \
  --data='{"channel_slug":"circuit-myth","topic":"Do SSDs really last longer?"}' \
  --project=content-pipeline-7dd4f

# Auto-generate trending topic
gcloud workflows run content-pipeline \
  --data='{"channel_slug":"space-minute"}' \
  --project=content-pipeline-7dd4f
```

### Scheduled Runs
The pipeline automatically runs twice daily (12:30 PM and 7:30 PM Phoenix time) for each channel.

## 📊 Monitoring

### View Workflow Executions
```bash
# List recent executions
gcloud workflows executions list \
  --workflow=content-pipeline \
  --project=content-pipeline-7dd4f

# View specific execution
gcloud workflows executions describe EXECUTION_ID \
  --workflow=content-pipeline \
  --project=content-pipeline-7dd4f
```

### Check Renderer Status
```bash
# Get renderer URL
gcloud run services describe dpgen-renderer \
  --region=us-central1 \
  --project=content-pipeline-7dd4f \
  --format='value(status.url)'

# Check health
curl https://dpgen-renderer-xxx.run.app/
```

## 🔑 API Keys Required

Update these in `config/.env`:

1. **Custom Search API** 
   - Enable at: https://console.cloud.google.com/apis/library/customsearch.googleapis.com
   - Get key at: https://console.cloud.google.com/apis/credentials
   - Create search engine: https://programmablesearchengine.google.com/

2. **YouTube Data API**
   - Enable at: https://console.cloud.google.com/apis/library/youtube.googleapis.com
   - OAuth2 setup required for uploads

3. **Platform APIs** (Optional for publishing)
   - TikTok Content API
   - Meta (Instagram/Facebook) Graph API

## 🛠️ Troubleshooting

### Common Issues

1. **Firestore not initialized**
```bash
gcloud firestore databases create --location=us-central1
```

2. **Missing APIs**
```bash
gcloud services enable aiplatform.googleapis.com firestore.googleapis.com
```

3. **Insufficient permissions**
```bash
# Grant necessary roles to service account
gcloud projects add-iam-policy-binding content-pipeline-7dd4f \
  --member="serviceAccount:firebase-adminsdk-fbsvc@content-pipeline-7dd4f.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## 📈 Performance & Costs

### Estimated Costs (per video)
- Gemini API calls: ~$0.05
- Veo generation: ~$0.10
- Imagen thumbnails: ~$0.02
- Cloud TTS: ~$0.01
- Storage/Compute: ~$0.02
- **Total: ~$0.20 per video**

### Optimization Tips
- Cache evergreen B-roll clips
- Reuse voice segments for common CTAs
- Batch thumbnail generation
- Use Gemini Flash for non-critical tasks

## 🎯 Next Steps

1. **Get API Keys** - Set up Custom Search and YouTube APIs
2. **Test Pipeline** - Run a test video for one channel
3. **Monitor Performance** - Check BigQuery analytics
4. **Scale Gradually** - Start with 1 channel, expand to all 8
5. **Customize Prompts** - Tune agent prompts for your style

## 📝 License

MIT

## 🤝 Support

For issues or questions, check the logs:
```bash
gcloud logging read "resource.type=cloud_function" --limit 50
```

---

Built with 🔥 using Google Cloud AI