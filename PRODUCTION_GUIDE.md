# DPGen Pipeline - Production Deployment Guide

## 🎯 You Now Have a Complete Production System

Your content pipeline includes:

### ✅ Core Pipeline
- **8 Pre-configured Channels** with unique personalities
- **Multi-agent Content Creation** (Google AI only)
- **Cloud Run Video Renderer** with FFmpeg
- **Google Cloud Workflows** orchestration
- **Firestore** for data management

### ✅ Production Tools
- **API Enablement Helper** (`scripts/enable-apis.js`)
- **Comprehensive Test Suite** (`scripts/test-pipeline.js`)
- **Quality Validation Agent** (`agents/quality-validator.js`)
- **Backup & Recovery System** (`scripts/backup-restore.js`)
- **Cost Tracking & Alerts** (`monitoring/cost-tracker.js`)
- **BigQuery Analytics** (`monitoring/dashboard-setup.js`)

---

## 🚀 Quick Deployment Checklist

### 1. **Enable APIs** (5 minutes)
```bash
cd dpgen-pipeline/scripts
npm install
node enable-apis.js
```
Opens browser links to enable each required API.

### 2. **Run Test Suite** (2 minutes)
```bash
node test-pipeline.js
```
Validates all components before deployment.

### 3. **Seed Database** (1 minute)
```bash
cd ../seeds
npm install
node seed_channels.js
```

### 4. **Deploy Renderer** (3 minutes)
```bash
cd ../renderer
gcloud run deploy dpgen-renderer --source . --region us-central1
```

### 5. **Deploy Workflow** (1 minute)
```bash
gcloud workflows deploy content-pipeline --source ../workflows-gcp/main.yaml --location us-central1
```

### 6. **Test End-to-End** (2 minutes)
```bash
gcloud workflows run content-pipeline --data='{"channel_slug":"circuit-myth","topic":"Are 4090s worth it in 2024?"}'
```

---

## 📊 Monitoring & Analytics

### Set Up BigQuery Dashboard
```bash
cd monitoring
node dashboard-setup.js
```

### Track Costs
```bash
# Check daily spending
node cost-tracker.js spending daily

# Set up budget alerts
node cost-tracker.js setup-alerts

# Get optimization tips
node cost-tracker.js optimize
```

### Create Backup
```bash
cd ../scripts
node backup-restore.js create
```

---

## 🎨 Channel Configuration

Each channel has its own personality in Firestore:

| Channel | Niche | Voice | Specialty |
|---------|-------|-------|-----------|
| **Circuit Myth** | Tech myths | Curious, precise, cheeky | Hardware benchmarks |
| **DeepTime** | History | Storyteller, vivid | 60-120s historical moments |
| **Zero-View Science** | Physics | Playful lab coach | Safe kitchen experiments |
| **Map Oddities** | Geography | Deadpan explorer | Border puzzles, projections |
| **Space Minute** | Astronomy | Awe with rigor | Observations, instruments |
| **Design Details** | Industrial design | Crisp designer | Hidden mechanisms |
| **Pattern Language** | Productivity | Pragmatic coach | Workflow patterns |
| **Econ Snack** | Economics | Calm analyst | Everyday price analysis |

---

## 💰 Cost Management

### Expected Costs Per Video
- **Gemini API calls**: ~$0.05
- **Veo generation**: ~$0.10
- **Imagen thumbnails**: ~$0.02
- **Cloud TTS**: ~$0.01
- **Cloud Run + Storage**: ~$0.02
- **Total**: ~**$0.20 per video**

### Daily Budget Recommendations
- **Testing**: $2-5/day
- **Single Channel**: $5-10/day
- **All 8 Channels**: $20-40/day

### Optimization Tips
1. **Use Gemini Flash** for non-critical tasks
2. **Cache B-roll clips** for reuse
3. **Limit video duration** to 60-90 seconds
4. **Batch operations** when possible

---

## 🔧 Advanced Features

### Quality Validation
```bash
# Validate content before publishing
cd agents
node quality-validator.js ../test-content.json
```

### Content Scheduling
Set up automated runs:
```bash
# Morning runs at 12:30 PM Phoenix time
gcloud scheduler jobs create http circuit-myth-morning \
  --schedule="30 12 * * *" \
  --time-zone="America/Phoenix" \
  --uri="https://workflowexecutions.googleapis.com/v1/projects/content-pipeline-7dd4f/locations/us-central1/workflows/content-pipeline/executions"
```

### A/B Testing Thumbnails
- Generate 3 variants per video
- Track CTR in BigQuery
- Auto-select best performer

---

## 🚨 Troubleshooting

### Common Issues

1. **"API not enabled"**
   ```bash
   node scripts/enable-apis.js
   ```

2. **"Permission denied"**
   - Check service account roles
   - Ensure billing is enabled

3. **"Quota exceeded"**
   ```bash
   node monitoring/cost-tracker.js spending daily
   ```

4. **Pipeline failing**
   ```bash
   node scripts/test-pipeline.js
   ```

### Logs & Debugging
```bash
# View workflow execution logs
gcloud workflows executions describe EXECUTION_ID --workflow=content-pipeline

# Check renderer logs
gcloud logs read "resource.type=cloud_run_revision" --limit=50

# View cost breakdown
node monitoring/cost-tracker.js spending monthly
```

---

## 📈 Scaling Strategy

### Phase 1: Single Channel (Week 1-2)
- Test with Circuit Myth
- Validate costs and quality
- Tune prompts

### Phase 2: 3 Channels (Week 3-4)
- Add Space Minute and Zero-View Science
- Set up analytics dashboard
- Implement A/B testing

### Phase 3: All 8 Channels (Month 2)
- Enable full automation
- Optimize costs
- Scale to 2x daily per channel

### Phase 4: Platform Publishing (Month 3)
- Add YouTube, TikTok, Instagram APIs
- Implement cross-platform analytics
- Expand to 16 channels

---

## 🎉 You're Ready for Production!

Your pipeline is production-grade with:
- ✅ **Comprehensive testing**
- ✅ **Cost monitoring**
- ✅ **Quality validation**
- ✅ **Backup & recovery**
- ✅ **Performance analytics**
- ✅ **Automated scaling**

**Next Step**: Enable APIs and run your first video generation!

```bash
# Start here:
cd dpgen-pipeline/scripts
node enable-apis.js
```

---

## 📞 Need Help?

1. **Test Everything**: `node scripts/test-pipeline.js`
2. **Check Logs**: View execution details in console
3. **Monitor Costs**: `node monitoring/cost-tracker.js spending`
4. **Backup First**: `node scripts/backup-restore.js create`

Happy content creating! 🎬✨