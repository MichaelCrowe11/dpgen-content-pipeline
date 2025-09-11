#!/usr/bin/env node

// Comprehensive test suite for DPGen pipeline components
// Tests each component independently before full pipeline run

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Firestore } = require('@google-cloud/firestore');

const CONFIG = {
  projectId: 'content-pipeline-7dd4f',
  serviceAccountPath: path.join(__dirname, '../config/service_account.json'),
  testChannel: 'circuit-myth'
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, status, message = '', details = null) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}`);
  
  if (details) {
    console.log(`   ${JSON.stringify(details, null, 2)}`);
  }
  
  results.tests.push({ name, status, message, details, timestamp: new Date().toISOString() });
  
  if (status === 'PASS') results.passed++;
  if (status === 'FAIL') results.failed++;
}

async function testServiceAccount() {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf8'));
    
    if (!serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Invalid service account format');
    }
    
    logTest('Service Account', 'PASS', 'Valid credentials loaded');
    return serviceAccount;
  } catch (error) {
    logTest('Service Account', 'FAIL', error.message);
    return null;
  }
}

async function testFirestore(serviceAccount) {
  try {
    const db = new Firestore({
      projectId: CONFIG.projectId,
      credentials: serviceAccount
    });
    
    // Test read access
    const testDoc = await db.collection('channels').doc(CONFIG.testChannel).get();
    
    if (!testDoc.exists) {
      logTest('Firestore Read', 'WARN', 'Test channel not found - run seed script first');
      return db;
    }
    
    const data = testDoc.data();
    logTest('Firestore Read', 'PASS', `Retrieved channel: ${data.title}`);
    
    // Test write access
    const testCollection = db.collection('tests');
    const testWrite = await testCollection.add({
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Pipeline test write'
    });
    
    // Clean up test document
    await testWrite.delete();
    
    logTest('Firestore Write', 'PASS', 'Write/delete operations successful');
    return db;
    
  } catch (error) {
    logTest('Firestore Access', 'FAIL', error.message);
    return null;
  }
}

async function testVertexAI(serviceAccount) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const authClient = await auth.getClient();
    
    // Test Gemini API call
    const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(await authClient.getAccessToken()).token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: 'Say "test successful" if you can respond.' }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 50
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (text.toLowerCase().includes('test successful')) {
      logTest('Vertex AI (Gemini)', 'PASS', 'API call successful', { response: text.trim() });
    } else {
      logTest('Vertex AI (Gemini)', 'WARN', 'Unexpected response', { response: text });
    }
    
    return authClient;
    
  } catch (error) {
    logTest('Vertex AI (Gemini)', 'FAIL', error.message);
    return null;
  }
}

async function testCloudStorage(authClient) {
  try {
    const storage = google.storage({ version: 'v1', auth: authClient });
    
    // List buckets to test access
    const response = await storage.buckets.list({
      project: CONFIG.projectId
    });
    
    const buckets = response.data.items || [];
    const dpgenBuckets = buckets.filter(b => b.name.includes('dpgen'));
    
    if (dpgenBuckets.length > 0) {
      logTest('Cloud Storage', 'PASS', `Found ${dpgenBuckets.length} DPGen buckets`);
    } else {
      logTest('Cloud Storage', 'WARN', 'No DPGen buckets found - create them first');
    }
    
    return storage;
    
  } catch (error) {
    logTest('Cloud Storage', 'FAIL', error.message);
    return null;
  }
}

async function testTextToSpeech(authClient) {
  try {
    const tts = google.texttospeech({ version: 'v1', auth: authClient });
    
    // Test synthesis
    const response = await tts.text.synthesize({
      requestBody: {
        input: { text: 'Pipeline test' },
        voice: { languageCode: 'en-US', name: 'en-US-Neural2-G' },
        audioConfig: { audioEncoding: 'MP3' }
      }
    });
    
    if (response.data.audioContent) {
      const audioSize = Buffer.from(response.data.audioContent, 'base64').length;
      logTest('Cloud Text-to-Speech', 'PASS', `Generated ${audioSize} bytes of audio`);
    } else {
      logTest('Cloud Text-to-Speech', 'FAIL', 'No audio content returned');
    }
    
  } catch (error) {
    logTest('Cloud Text-to-Speech', 'FAIL', error.message);
  }
}

async function testCustomSearch() {
  try {
    const envPath = path.join(__dirname, '../config/.env');
    
    if (!fs.existsSync(envPath)) {
      logTest('Custom Search API', 'WARN', '.env file not found');
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const cseKey = envContent.match(/CSE_API_KEY=(.+)/)?.[1];
    const cseCx = envContent.match(/CSE_CX=(.+)/)?.[1];
    
    if (!cseKey || cseKey.includes('your-')) {
      logTest('Custom Search API', 'WARN', 'API key not configured in .env');
      return;
    }
    
    if (!cseCx || cseCx.includes('your-')) {
      logTest('Custom Search API', 'WARN', 'Search engine CX not configured in .env');
      return;
    }
    
    // Test search API call
    const url = `https://customsearch.googleapis.com/customsearch/v1?key=${cseKey}&cx=${cseCx}&q=test&num=1`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      logTest('Custom Search API', 'PASS', `Search returned ${data.items.length} results`);
    } else {
      logTest('Custom Search API', 'WARN', 'Search returned no results');
    }
    
  } catch (error) {
    logTest('Custom Search API', 'FAIL', error.message);
  }
}

async function testRenderer() {
  try {
    const envPath = path.join(__dirname, '../config/.env');
    
    if (!fs.existsSync(envPath)) {
      logTest('Renderer Service', 'WARN', '.env file not found');
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const rendererUrl = envContent.match(/RENDERER_URL=(.+)/)?.[1];
    
    if (!rendererUrl || rendererUrl.includes('xxx')) {
      logTest('Renderer Service', 'WARN', 'Renderer URL not configured - deploy first');
      return;
    }
    
    // Test health endpoint
    const response = await fetch(rendererUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'healthy') {
      logTest('Renderer Service', 'PASS', `Service healthy: ${data.service} v${data.version}`);
    } else {
      logTest('Renderer Service', 'WARN', 'Service responded but not healthy');
    }
    
  } catch (error) {
    logTest('Renderer Service', 'FAIL', error.message);
  }
}

async function testChannelPrompts(db) {
  try {
    if (!db) {
      logTest('Channel Prompts', 'SKIP', 'Firestore not available');
      return;
    }
    
    const promptsSnapshot = await db
      .collection('channels')
      .doc(CONFIG.testChannel)
      .collection('prompts')
      .get();
    
    if (promptsSnapshot.empty) {
      logTest('Channel Prompts', 'WARN', 'No prompts found - run seed script');
      return;
    }
    
    const prompts = [];
    promptsSnapshot.forEach(doc => {
      prompts.push(doc.id);
    });
    
    const expectedPrompts = ['showrunner', 'research', 'scriptwriter', 'visual_director', 'thumbnail_director'];
    const hasAllPrompts = expectedPrompts.every(p => prompts.includes(p));
    
    if (hasAllPrompts) {
      logTest('Channel Prompts', 'PASS', `Found all ${prompts.length} required prompts`);
    } else {
      logTest('Channel Prompts', 'WARN', `Missing some prompts. Found: ${prompts.join(', ')}`);
    }
    
  } catch (error) {
    logTest('Channel Prompts', 'FAIL', error.message);
  }
}

function generateTestReport() {
  const report = {
    summary: {
      total: results.tests.length,
      passed: results.passed,
      failed: results.failed,
      warnings: results.tests.filter(t => t.status === 'WARN').length,
      skipped: results.tests.filter(t => t.status === 'SKIP').length
    },
    timestamp: new Date().toISOString(),
    tests: results.tests
  };
  
  const reportPath = path.join(__dirname, '../test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${report.summary.passed}`);
  console.log(`   ❌ Failed: ${report.summary.failed}`);
  console.log(`   ⚠️  Warnings: ${report.summary.warnings}`);
  console.log(`   ⏭️  Skipped: ${report.summary.skipped}`);
  
  const readiness = report.summary.failed === 0 ? 
    (report.summary.warnings === 0 ? 'READY' : 'PARTIALLY_READY') : 'NOT_READY';
  
  console.log(`\n🎯 Pipeline Status: ${readiness}`);
  
  if (readiness === 'READY') {
    console.log('🚀 All tests passed! Pipeline is ready for production.');
  } else if (readiness === 'PARTIALLY_READY') {
    console.log('⚠️  Some components need configuration. Check warnings above.');
  } else {
    console.log('❌ Critical issues found. Fix failed tests before proceeding.');
  }
  
  console.log(`\n📄 Full report saved: test-report.json`);
  
  return report;
}

async function main() {
  console.log('🧪 DPGen Pipeline Component Tests');
  console.log('==================================\n');
  
  // Run all tests
  const serviceAccount = await testServiceAccount();
  const db = await testFirestore(serviceAccount);
  const authClient = await testVertexAI(serviceAccount);
  
  if (authClient) {
    await testCloudStorage(authClient);
    await testTextToSpeech(authClient);
  }
  
  await testCustomSearch();
  await testRenderer();
  await testChannelPrompts(db);
  
  // Generate report
  const report = generateTestReport();
  
  // Exit with appropriate code
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
}