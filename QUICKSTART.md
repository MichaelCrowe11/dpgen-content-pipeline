# DPGen Pipeline - Quick Start Guide

## Current Status

Your service account (`firebase-adminsdk-fbsvc@content-pipeline-7dd4f.iam.gserviceaccount.com`) needs additional permissions to enable APIs and create resources.

## Manual Setup Steps Required

### 1. Enable Required APIs

Visit these links to manually enable the APIs in your Google Cloud Console:

**Essential APIs:**
- [Secret Manager API](https://console.developers.google.com/apis/api/secretmanager.googleapis.com/overview?project=content-pipeline-7dd4f)
- [API Keys API](https://console.developers.google.com/apis/api/apikeys.googleapis.com/overview?project=content-pipeline-7dd4f)
- [Custom Search API](https://console.developers.google.com/apis/api/customsearch.googleapis.com/overview?project=content-pipeline-7dd4f)
- [YouTube Data API](https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=content-pipeline-7dd4f)
- [Vertex AI API](https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview?project=content-pipeline-7dd4f)
- [Cloud Text-to-Speech](https://console.developers.google.com/apis/api/texttospeech.googleapis.com/overview?project=content-pipeline-7dd4f)
- [Cloud Run](https://console.developers.google.com/apis/api/run.googleapis.com/overview?project=content-pipeline-7dd4f)
- [Cloud Workflows](https://console.developers.google.com/apis/api/workflows.googleapis.com/overview?project=content-pipeline-7dd4f)

Click each link and press the **"Enable"** button.

### 2. Grant IAM Permissions

Go to [IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=content-pipeline-7dd4f) and add these roles to your service account:

- **Editor** (or more specific roles):
  - `roles/serviceusage.serviceUsageAdmin` (to enable APIs)
  - `roles/apikeys.admin` (to create API keys)
  - `roles/secretmanager.admin` (to manage secrets)
  - `roles/aiplatform.user` (to use Vertex AI)

### 3. Create API Keys Manually

1. Go to [API Credentials](https://console.cloud.google.com/apis/credentials?project=content-pipeline-7dd4f)
2. Click **"+ CREATE CREDENTIALS"** → **"API key"**
3. Name it "dpgen-custom-search"
4. Restrict it to **Custom Search API**
5. Copy the key and add to your `.env` file as `CSE_API_KEY`

Repeat for YouTube:
1. Create another API key named "dpgen-youtube"
2. Restrict it to **YouTube Data API v3**
3. Copy and add as `YOUTUBE_API_KEY`

### 4. Create Custom Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click **"Add"**
3. Configure:
   - Search the entire web: **ON**
   - SafeSearch: **On**
   - Give it a name: "DPGen Content Search"
4. Copy the **Search Engine ID (cx)**
5. Add to your `.env` as `CSE_CX`

### 5. Test Basic Functionality

Once APIs are enabled and keys are configured:

```bash
# Test Firestore seeding (this should work with current permissions)
cd dpgen-pipeline/seeds
npm install
node seed_channels.js
```

## Alternative: Use Firebase Project

Since you have a Firebase project, you can also:

1. Use Firebase Admin SDK (already configured)
2. Deploy Cloud Functions instead of Cloud Run
3. Use Firebase Hosting for any web interfaces

## Simplified Pipeline for Testing

To test without all APIs enabled:

```javascript
// test-pipeline.js
const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({
  projectId: 'content-pipeline-7dd4f',
  keyFilename: 'config/service_account.json'
});

async function test() {
  // Test Firestore access
  const doc = await db.collection('channels').doc('circuit-myth').get();
  if (doc.exists) {
    console.log('✓ Firestore working:', doc.data().title);
  }
  
  // Test can be expanded as APIs are enabled
}

test();
```

## Next Steps

1. **Enable APIs manually** using the links above
2. **Create API keys** in the console
3. **Update .env** with your keys
4. **Test incrementally** as each service becomes available

## Working Components

With your current permissions, these should work:
- ✅ Firestore read/write
- ✅ Firebase Authentication
- ✅ Basic project access

Need additional permissions for:
- ❌ Enabling new APIs
- ❌ Creating API keys programmatically
- ❌ Secret Manager operations
- ❌ Cloud Run deployment

## Support

If you're the project owner, you can grant additional permissions. If not, ask the project owner to:

1. Grant you **Editor** role, or
2. Enable the APIs listed above, or
3. Create the API keys for you