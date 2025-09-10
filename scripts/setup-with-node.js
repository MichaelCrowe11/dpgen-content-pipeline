#!/usr/bin/env node

// Node.js script to set up Google Cloud resources
// This works without gcloud CLI

const fs = require('fs');
const path = require('path');
const https = require('https');
const { google } = require('googleapis');

// Configuration
const CONFIG = {
  projectId: 'content-pipeline-7dd4f',
  oauthProjectId: 'tenacious-cocoa-471700-i9',
  serviceAccountPath: path.join(__dirname, '../config/service_account.json'),
  envPath: path.join(__dirname, '../config/.env')
};

// Load service account
let auth;
try {
  const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf8'));
  auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  console.log('✓ Service account loaded');
} catch (error) {
  console.error('❌ Failed to load service account:', error.message);
  console.log('Make sure config/service_account.json exists');
  process.exit(1);
}

// Initialize clients
async function initializeClients() {
  const authClient = await auth.getClient();
  
  return {
    apikeys: google.apikeys({ version: 'v2', auth: authClient }),
    secretmanager: google.secretmanager({ version: 'v1', auth: authClient }),
    serviceusage: google.serviceusage({ version: 'v1', auth: authClient }),
    iam: google.iam({ version: 'v1', auth: authClient })
  };
}

// Enable APIs
async function enableAPIs(serviceusage) {
  console.log('\n📦 Enabling required APIs...');
  
  const apis = [
    'secretmanager.googleapis.com',
    'customsearch.googleapis.com',
    'youtube.googleapis.com',
    'aiplatform.googleapis.com',
    'firestore.googleapis.com',
    'storage-api.googleapis.com',
    'texttospeech.googleapis.com',
    'run.googleapis.com',
    'workflows.googleapis.com'
  ];
  
  for (const api of apis) {
    try {
      await serviceusage.services.enable({
        name: `projects/${CONFIG.projectId}/services/${api}`
      });
      console.log(`  ✓ ${api}`);
    } catch (error) {
      if (error.code !== 409) { // 409 means already enabled
        console.log(`  ⚠️  ${api}: ${error.message}`);
      }
    }
  }
}

// Create API keys
async function createAPIKeys(apikeys) {
  console.log('\n🔑 Managing API keys...');
  const keys = {};
  
  try {
    // List existing keys
    const listResponse = await apikeys.projects.locations.keys.list({
      parent: `projects/${CONFIG.projectId}/locations/global`
    });
    
    const existingKeys = listResponse.data.keys || [];
    
    // Check for Custom Search key
    let cseKey = existingKeys.find(k => k.displayName === 'dpgen-custom-search');
    if (!cseKey) {
      console.log('  Creating Custom Search API key...');
      const createResponse = await apikeys.projects.locations.keys.create({
        parent: `projects/${CONFIG.projectId}/locations/global`,
        keyId: 'dpgen-custom-search',
        requestBody: {
          displayName: 'dpgen-custom-search',
          restrictions: {
            apiTargets: [{ service: 'customsearch.googleapis.com' }]
          }
        }
      });
      cseKey = createResponse.data;
    }
    
    // Get key string
    if (cseKey) {
      const keyResponse = await apikeys.projects.locations.keys.getKeyString({
        name: cseKey.name
      });
      keys.CSE_API_KEY = keyResponse.data.keyString;
      console.log(`  ✓ Custom Search API Key: ${keys.CSE_API_KEY.substring(0, 10)}...`);
    }
    
    // Check for YouTube key
    let ytKey = existingKeys.find(k => k.displayName === 'dpgen-youtube');
    if (!ytKey) {
      console.log('  Creating YouTube API key...');
      const createResponse = await apikeys.projects.locations.keys.create({
        parent: `projects/${CONFIG.projectId}/locations/global`,
        keyId: 'dpgen-youtube',
        requestBody: {
          displayName: 'dpgen-youtube',
          restrictions: {
            apiTargets: [{ service: 'youtube.googleapis.com' }]
          }
        }
      });
      ytKey = createResponse.data;
    }
    
    // Get key string
    if (ytKey) {
      const keyResponse = await apikeys.projects.locations.keys.getKeyString({
        name: ytKey.name
      });
      keys.YOUTUBE_API_KEY = keyResponse.data.keyString;
      console.log(`  ✓ YouTube API Key: ${keys.YOUTUBE_API_KEY.substring(0, 10)}...`);
    }
    
  } catch (error) {
    console.error('  ❌ Error managing API keys:', error.message);
  }
  
  return keys;
}

// Store secrets in Secret Manager
async function storeSecrets(secretmanager, keys) {
  console.log('\n🔐 Storing secrets in Secret Manager...');
  
  const parent = `projects/${CONFIG.projectId}`;
  
  async function createOrUpdateSecret(secretId, data) {
    try {
      // Try to get the secret
      const secretName = `${parent}/secrets/${secretId}`;
      let secret;
      
      try {
        secret = await secretmanager.projects.secrets.get({ name: secretName });
      } catch (e) {
        // Secret doesn't exist, create it
        console.log(`  Creating secret: ${secretId}`);
        secret = await secretmanager.projects.secrets.create({
          parent,
          secretId,
          requestBody: {
            replication: { automatic: {} },
            labels: { app: 'dpgen' }
          }
        });
      }
      
      // Add new version
      await secretmanager.projects.secrets.addVersion({
        parent: secretName,
        requestBody: {
          payload: {
            data: Buffer.from(data).toString('base64')
          }
        }
      });
      console.log(`  ✓ ${secretId} stored`);
      
    } catch (error) {
      console.error(`  ❌ Error with ${secretId}:`, error.message);
    }
  }
  
  // Store API keys
  if (keys.CSE_API_KEY) {
    await createOrUpdateSecret('cse-api-key', keys.CSE_API_KEY);
  }
  if (keys.YOUTUBE_API_KEY) {
    await createOrUpdateSecret('youtube-api-key', keys.YOUTUBE_API_KEY);
  }
  
  // Store credential files
  if (fs.existsSync(path.join(__dirname, '../config/oauth_credentials.json'))) {
    const oauthCreds = fs.readFileSync(path.join(__dirname, '../config/oauth_credentials.json'), 'utf8');
    await createOrUpdateSecret('oauth-credentials', oauthCreds);
  }
  
  if (fs.existsSync(CONFIG.serviceAccountPath)) {
    const serviceAccount = fs.readFileSync(CONFIG.serviceAccountPath, 'utf8');
    await createOrUpdateSecret('service-account-key', serviceAccount);
  }
}

// Update .env file
function updateEnvFile(keys) {
  console.log('\n📝 Updating .env file...');
  
  if (!fs.existsSync(CONFIG.envPath)) {
    console.log('  ⚠️  .env file not found');
    return;
  }
  
  // Read current .env
  let envContent = fs.readFileSync(CONFIG.envPath, 'utf8');
  
  // Backup
  fs.writeFileSync(`${CONFIG.envPath}.backup`, envContent);
  
  // Update keys
  for (const [key, value] of Object.entries(keys)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
    console.log(`  ✓ Updated ${key}`);
  }
  
  // Write back
  fs.writeFileSync(CONFIG.envPath, envContent);
  console.log('  ✓ .env file updated');
}

// Main execution
async function main() {
  console.log('🚀 Google Cloud Setup with Node.js');
  console.log('==================================');
  
  try {
    const clients = await initializeClients();
    
    // Enable APIs
    await enableAPIs(clients.serviceusage);
    
    // Create API keys
    const keys = await createAPIKeys(clients.apikeys);
    
    // Store in Secret Manager
    await storeSecrets(clients.secretmanager, keys);
    
    // Update .env file
    updateEnvFile(keys);
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Create a Custom Search Engine at:');
    console.log('   https://programmablesearchengine.google.com/');
    console.log('   Add the Search Engine ID (cx) to your .env file');
    console.log('\n2. Test the pipeline:');
    console.log('   cd seeds && npm install && node seed_channels.js');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}