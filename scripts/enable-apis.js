#!/usr/bin/env node

// API Enablement Helper Script
// Creates quick links and checks API status

const https = require('https');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'content-pipeline-7dd4f';
const REQUIRED_APIS = [
  {
    service: 'aiplatform.googleapis.com',
    name: 'Vertex AI API',
    description: 'Required for Gemini, Veo, and Imagen',
    essential: true
  },
  {
    service: 'secretmanager.googleapis.com',
    name: 'Secret Manager API',
    description: 'For secure credential storage',
    essential: true
  },
  {
    service: 'customsearch.googleapis.com',
    name: 'Custom Search API',
    description: 'For research agent web search',
    essential: true
  },
  {
    service: 'youtube.googleapis.com',
    name: 'YouTube Data API v3',
    description: 'For YouTube publishing',
    essential: false
  },
  {
    service: 'texttospeech.googleapis.com',
    name: 'Cloud Text-to-Speech API',
    description: 'For voice generation',
    essential: true
  },
  {
    service: 'storage-api.googleapis.com',
    name: 'Cloud Storage API',
    description: 'For asset storage',
    essential: true
  },
  {
    service: 'firestore.googleapis.com',
    name: 'Cloud Firestore API',
    description: 'For database operations',
    essential: true
  },
  {
    service: 'run.googleapis.com',
    name: 'Cloud Run API',
    description: 'For renderer deployment',
    essential: true
  },
  {
    service: 'workflows.googleapis.com',
    name: 'Cloud Workflows API',
    description: 'For pipeline orchestration',
    essential: true
  },
  {
    service: 'cloudscheduler.googleapis.com',
    name: 'Cloud Scheduler API',
    description: 'For automated scheduling',
    essential: false
  },
  {
    service: 'bigquery.googleapis.com',
    name: 'BigQuery API',
    description: 'For analytics data lake',
    essential: false
  }
];

async function checkAPIStatus() {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../config/service_account.json'), 'utf8'
    ));
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const serviceusage = google.serviceusage({ version: 'v1', auth });
    
    console.log('🔍 Checking API Status...\n');
    
    const results = [];
    
    for (const api of REQUIRED_APIS) {
      try {
        const response = await serviceusage.services.get({
          name: `projects/${PROJECT_ID}/services/${api.service}`
        });
        
        const enabled = response.data.state === 'ENABLED';
        const status = enabled ? '✅ ENABLED' : '❌ DISABLED';
        const priority = api.essential ? '[ESSENTIAL]' : '[OPTIONAL]';
        
        console.log(`${status} ${priority} ${api.name}`);
        console.log(`   ${api.description}`);
        
        if (!enabled && api.essential) {
          console.log(`   🔗 Enable: https://console.developers.google.com/apis/api/${api.service}/overview?project=${PROJECT_ID}`);
        }
        
        console.log();
        
        results.push({
          ...api,
          enabled,
          status: response.data.state
        });
        
      } catch (error) {
        console.log(`❓ UNKNOWN ${api.essential ? '[ESSENTIAL]' : '[OPTIONAL]'} ${api.name}`);
        console.log(`   Error checking status: ${error.message}`);
        console.log(`   🔗 Enable: https://console.developers.google.com/apis/api/${api.service}/overview?project=${PROJECT_ID}\n`);
        
        results.push({
          ...api,
          enabled: false,
          status: 'UNKNOWN',
          error: error.message
        });
      }
    }
    
    // Summary
    const enabledEssential = results.filter(r => r.essential && r.enabled).length;
    const totalEssential = results.filter(r => r.essential).length;
    const enabledOptional = results.filter(r => !r.essential && r.enabled).length;
    const totalOptional = results.filter(r => !r.essential).length;
    
    console.log('📊 Summary:');
    console.log(`   Essential APIs: ${enabledEssential}/${totalEssential} enabled`);
    console.log(`   Optional APIs:  ${enabledOptional}/${totalOptional} enabled`);
    
    if (enabledEssential === totalEssential) {
      console.log('\n🎉 All essential APIs are enabled! You can proceed with deployment.');
    } else {
      console.log('\n⚠️  Some essential APIs need to be enabled before proceeding.');
      console.log('Click the links above to enable them in the Google Cloud Console.');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Failed to check API status:', error.message);
    console.log('\nManual check required. Visit:');
    console.log(`https://console.cloud.google.com/apis/dashboard?project=${PROJECT_ID}`);
    return null;
  }
}

function generateSetupHTML(apiStatus) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DPGen Pipeline Setup</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; }
        .essential { border-left: 4px solid #dc3545; padding-left: 16px; margin: 16px 0; }
        .optional { border-left: 4px solid #ffc107; padding-left: 16px; margin: 16px 0; }
        .enabled { border-left: 4px solid #28a745; padding-left: 16px; margin: 16px 0; }
        .api-link { background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; }
        .progress { width: 100%; background: #e9ecef; border-radius: 4px; }
        .progress-bar { height: 20px; background: #28a745; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>🚀 DPGen Pipeline Setup</h1>
    <p>Click the links below to enable required APIs in Google Cloud Console.</p>
    
    <h2>📊 Progress</h2>
    <div class="progress">
        <div class="progress-bar" style="width: ${(apiStatus.filter(a => a.enabled).length / apiStatus.length * 100).toFixed(0)}%"></div>
    </div>
    <p>${apiStatus.filter(a => a.enabled).length} of ${apiStatus.length} APIs enabled</p>
    
    <h2>🔧 Required APIs</h2>
    ${apiStatus.map(api => `
        <div class="${api.enabled ? 'enabled' : (api.essential ? 'essential' : 'optional')}">
            <h3>${api.enabled ? '✅' : '❌'} ${api.name} ${api.essential ? '[ESSENTIAL]' : '[OPTIONAL]'}</h3>
            <p>${api.description}</p>
            ${!api.enabled ? `<a href="https://console.developers.google.com/apis/api/${api.service}/overview?project=${PROJECT_ID}" target="_blank" class="api-link">Enable ${api.name}</a>` : ''}
        </div>
    `).join('')}
    
    <h2>🎯 Next Steps</h2>
    <ol>
        <li>Enable all essential APIs above</li>
        <li>Create API keys: <a href="https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}" target="_blank">API Credentials</a></li>
        <li>Set up Custom Search Engine: <a href="https://programmablesearchengine.google.com/" target="_blank">Programmable Search</a></li>
        <li>Deploy the renderer: <code>gcloud run deploy dpgen-renderer --source renderer/</code></li>
        <li>Test the pipeline: <code>node scripts/test-pipeline.js</code></li>
    </ol>
</body>
</html>`;
  
  fs.writeFileSync(path.join(__dirname, '../setup-guide.html'), html);
  console.log('\n📄 Setup guide created: setup-guide.html');
  console.log('Open this file in your browser for clickable links.');
}

async function main() {
  console.log('🔧 DPGen API Enablement Helper');
  console.log('==============================\n');
  
  const apiStatus = await checkAPIStatus();
  
  if (apiStatus) {
    generateSetupHTML(apiStatus);
    
    // Save status for other scripts
    fs.writeFileSync(
      path.join(__dirname, '../config/api-status.json'),
      JSON.stringify(apiStatus, null, 2)
    );
  }
}

if (require.main === module) {
  main();
}