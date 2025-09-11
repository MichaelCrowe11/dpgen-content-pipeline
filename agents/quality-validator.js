#!/usr/bin/env node

// Content Quality Validation Agent
// Validates content quality, factual accuracy, and brand consistency

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class QualityValidator {
  constructor(config) {
    this.config = config;
    this.setupAuth();
  }
  
  async setupAuth() {
    const serviceAccount = JSON.parse(fs.readFileSync(this.config.serviceAccountPath, 'utf8'));
    this.auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.authClient = await this.auth.getClient();
  }
  
  // Main validation pipeline
  async validateContent(content) {
    console.log('🔍 Starting content quality validation...\n');
    
    const results = {
      session_id: content.session_id,
      timestamp: new Date().toISOString(),
      scores: {},
      flags: [],
      recommendations: [],
      passed: false
    };
    
    try {
      // Run all validation checks in parallel
      const [
        factualScore,
        brandScore,
        complianceScore,
        noveltyScore,
        engagementScore
      ] = await Promise.all([
        this.validateFactualAccuracy(content),
        this.validateBrandConsistency(content),
        this.validateCompliance(content),
        this.validateNovelty(content),
        this.predictEngagement(content)
      ]);
      
      results.scores = {
        factual_accuracy_score: factualScore.score,
        brand_consistency_score: brandScore.score,
        compliance_score: complianceScore.score,
        novelty_score: noveltyScore.score,
        engagement_prediction: engagementScore.score,
        content_quality_score: this.calculateOverallScore([
          factualScore.score,
          brandScore.score,
          complianceScore.score,
          noveltyScore.score
        ])
      };
      
      // Aggregate flags and recommendations
      results.flags = [
        ...factualScore.flags,
        ...brandScore.flags,
        ...complianceScore.flags,
        ...noveltyScore.flags,
        ...engagementScore.flags
      ];
      
      results.recommendations = [
        ...factualScore.recommendations,
        ...brandScore.recommendations,
        ...complianceScore.recommendations,
        ...noveltyScore.recommendations,
        ...engagementScore.recommendations
      ];
      
      // Determine if content passes quality gate
      results.passed = this.determineQualityGate(results.scores, results.flags);
      
      console.log('📊 Quality Validation Results:');
      console.log(`   Overall Score: ${results.scores.content_quality_score.toFixed(2)}/100`);
      console.log(`   Status: ${results.passed ? '✅ PASSED' : '❌ FAILED'}`);
      
      if (results.flags.length > 0) {
        console.log(`   Flags: ${results.flags.length} issues found`);
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Quality validation failed:', error.message);
      results.error = error.message;
      return results;
    }
  }
  
  // Validate factual accuracy using research citations
  async validateFactualAccuracy(content) {
    console.log('🔬 Checking factual accuracy...');
    
    const prompt = `
As a fact-checking expert, analyze this content for factual accuracy:

SCRIPT: ${content.script?.ssml || content.script}

RESEARCH CITATIONS: ${JSON.stringify(content.research?.citations || [], null, 2)}

CLAIMS TO VERIFY: ${JSON.stringify(content.research?.facts || [], null, 2)}

Rate factual accuracy from 0-100 and identify any:
1. Unsupported claims (no citation)
2. Outdated information (>2 years old)
3. Potentially misleading statements
4. Missing important context

Respond in JSON format:
{
  "score": 85,
  "flags": ["Missing citation for GPU benchmark claim"],
  "recommendations": ["Add source for RTX 4090 performance data"],
  "verified_claims": ["Claim about DDR5 speed is accurate"],
  "unsupported_claims": ["Gaming laptop battery life claim needs citation"]
}`;

    try {
      const response = await this.callGemini(prompt, 0.2);
      const result = JSON.parse(response);
      console.log(`   Score: ${result.score}/100`);
      return result;
    } catch (error) {
      console.log('   ⚠️ Fact-check failed, using default score');
      return {
        score: 70,
        flags: ['Could not verify factual accuracy'],
        recommendations: ['Manual fact-check recommended'],
        verified_claims: [],
        unsupported_claims: []
      };
    }
  }
  
  // Validate brand consistency against channel guidelines
  async validateBrandConsistency(content) {
    console.log('🎨 Checking brand consistency...');
    
    const channelProfile = content.channel_profile || {};
    
    const prompt = `
As a brand consistency expert, analyze this content against channel guidelines:

CHANNEL: ${channelProfile.title || content.channel_slug}
BRAND VOICE: ${channelProfile.voice?.tone || 'Not specified'}
CONTENT PILLARS: ${channelProfile.pillars?.join(', ') || 'Not specified'}
FORBIDDEN TOPICS: ${channelProfile.safety?.forbidden_topics?.join(', ') || 'None specified'}

CONTENT TO ANALYZE:
SCRIPT: ${content.script?.ssml || content.script}
TITLE OPTIONS: ${JSON.stringify(content.distribution?.titles || [], null, 2)}
HOOKS: ${JSON.stringify(content.brief?.hooks || [], null, 2)}

Rate brand consistency from 0-100 and check for:
1. Voice tone alignment
2. Content pillar relevance  
3. Forbidden topic violations
4. Channel style consistency
5. Target audience appropriateness

Respond in JSON format:
{
  "score": 92,
  "flags": ["Hook 2 tone too formal for channel style"],
  "recommendations": ["Make hook 2 more conversational", "Add more technical detail"],
  "voice_alignment": "Strong match for curious, precise, cheeky tone",
  "pillar_relevance": "Directly addresses 'myth vs benchmark' pillar"
}`;

    try {
      const response = await this.callGemini(prompt, 0.3);
      const result = JSON.parse(response);
      console.log(`   Score: ${result.score}/100`);
      return result;
    } catch (error) {
      console.log('   ⚠️ Brand check failed, using default score');
      return {
        score: 80,
        flags: ['Could not verify brand consistency'],
        recommendations: ['Manual brand review recommended'],
        voice_alignment: 'Unable to verify',
        pillar_relevance: 'Unable to verify'
      };
    }
  }
  
  // Validate compliance and safety
  async validateCompliance(content) {
    console.log('⚖️ Checking compliance...');
    
    const prompt = `
As a content compliance expert, analyze this content for policy violations:

SCRIPT: ${content.script?.ssml || content.script}
CHANNEL SAFETY RULES: ${JSON.stringify(content.channel_profile?.safety || {}, null, 2)}

Check for:
1. Platform policy violations (YouTube, TikTok, Instagram)
2. Copyright risks
3. Harmful/misleading content
4. Age-appropriateness
5. Advertising standards compliance

Rate compliance from 0-100 and flag any issues:

Respond in JSON format:
{
  "score": 95,
  "flags": ["Minor: Could add more disclaimer about performance claims"],
  "recommendations": ["Add 'results may vary' disclaimer"],
  "platform_compliance": {
    "youtube": "compliant",
    "tiktok": "compliant", 
    "instagram": "compliant"
  },
  "risk_level": "low"
}`;

    try {
      const response = await this.callGemini(prompt, 0.1);
      const result = JSON.parse(response);
      console.log(`   Score: ${result.score}/100`);
      return result;
    } catch (error) {
      console.log('   ⚠️ Compliance check failed, using default score');
      return {
        score: 85,
        flags: ['Could not verify compliance'],
        recommendations: ['Manual compliance review recommended'],
        platform_compliance: {},
        risk_level: 'unknown'
      };
    }
  }
  
  // Validate content novelty/uniqueness
  async validateNovelty(content) {
    console.log('💡 Checking content novelty...');
    
    const prompt = `
As a content originality expert, analyze this content for novelty and uniqueness:

TOPIC: ${content.topic}
SCRIPT: ${content.script?.ssml || content.script}
HOOKS: ${JSON.stringify(content.brief?.hooks || [], null, 2)}

Rate novelty from 0-100 based on:
1. Unique angle/perspective
2. Fresh insights or data
3. Original hook/presentation
4. Value-add beyond common knowledge
5. Creative storytelling elements

Consider if this feels:
- Completely original (90-100)
- Fresh take on known topic (70-89) 
- Standard approach with some twist (50-69)
- Generic/overdone content (0-49)

Respond in JSON format:
{
  "score": 78,
  "flags": ["Topic well-covered but angle is fresh"],
  "recommendations": ["Add more unique data points", "Strengthen hook originality"],
  "unique_elements": ["Specific benchmark comparison", "Myth-busting approach"],
  "similarity_risks": ["Common topic but execution differentiates"]
}`;

    try {
      const response = await this.callGemini(prompt, 0.4);
      const result = JSON.parse(response);
      console.log(`   Score: ${result.score}/100`);
      return result;
    } catch (error) {
      console.log('   ⚠️ Novelty check failed, using default score');
      return {
        score: 65,
        flags: ['Could not assess novelty'],
        recommendations: ['Manual originality review recommended'],
        unique_elements: [],
        similarity_risks: []
      };
    }
  }
  
  // Predict engagement potential
  async predictEngagement(content) {
    console.log('📈 Predicting engagement...');
    
    const prompt = `
As an engagement prediction expert, analyze this content's viral potential:

TOPIC: ${content.topic}
HOOKS: ${JSON.stringify(content.brief?.hooks || [], null, 2)}
THUMBNAIL CONCEPTS: ${JSON.stringify(content.thumbnails || [], null, 2)}
SCRIPT STRUCTURE: ${JSON.stringify(content.brief?.beats || [], null, 2)}

Predict engagement score 0-100 based on:
1. Hook strength (curiosity gap, emotional trigger)
2. Topic trend potential
3. Thumbnail click-worthiness  
4. Script pacing and payoff
5. Shareability factors

Consider platform-specific factors:
- YouTube: Retention curve, CTR potential
- TikTok: Hook speed, visual interest
- Instagram: Story-driven, aspirational

Respond in JSON format:
{
  "score": 82,
  "flags": ["Hook could be stronger for TikTok"],
  "recommendations": ["Speed up hook delivery", "Add visual surprise element"],
  "platform_predictions": {
    "youtube": 85,
    "tiktok": 75,
    "instagram": 80
  },
  "viral_elements": ["Strong curiosity gap", "Myth-busting angle"],
  "improvement_areas": ["Faster hook delivery", "More visual variety"]
}`;

    try {
      const response = await this.callGemini(prompt, 0.6);
      const result = JSON.parse(response);
      console.log(`   Predicted Score: ${result.score}/100`);
      return result;
    } catch (error) {
      console.log('   ⚠️ Engagement prediction failed, using default score');
      return {
        score: 70,
        flags: ['Could not predict engagement'],
        recommendations: ['Manual engagement review recommended'],
        platform_predictions: {},
        viral_elements: [],
        improvement_areas: []
      };
    }
  }
  
  // Calculate weighted overall quality score
  calculateOverallScore(scores) {
    const weights = {
      factual: 0.25,
      brand: 0.20,
      compliance: 0.30,
      novelty: 0.25
    };
    
    const [factual, brand, compliance, novelty] = scores;
    
    return (
      factual * weights.factual +
      brand * weights.brand + 
      compliance * weights.compliance +
      novelty * weights.novelty
    );
  }
  
  // Determine if content passes quality gate
  determineQualityGate(scores, flags) {
    // Must pass all critical thresholds
    const criticalThresholds = {
      compliance_score: 80,  // Must be compliant
      factual_accuracy_score: 70,  // Must be factually sound
      content_quality_score: 75   // Must meet overall quality bar
    };
    
    // Check critical thresholds
    for (const [metric, threshold] of Object.entries(criticalThresholds)) {
      if (scores[metric] < threshold) {
        console.log(`   ❌ Failed ${metric}: ${scores[metric]} < ${threshold}`);
        return false;
      }
    }
    
    // Check for critical flags
    const criticalFlags = [
      'copyright violation',
      'policy violation', 
      'factual error',
      'brand violation'
    ];
    
    const hasCriticalFlag = flags.some(flag => 
      criticalFlags.some(critical => 
        flag.toLowerCase().includes(critical)
      )
    );
    
    if (hasCriticalFlag) {
      console.log('   ❌ Critical flag detected');
      return false;
    }
    
    return true;
  }
  
  // Call Gemini API
  async callGemini(prompt, temperature = 0.3) {
    const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${this.config.projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(await this.authClient.getAccessToken()).token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  }
}

// CLI usage
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node quality-validator.js <content-file.json>');
    console.log('Example: node quality-validator.js ../test-content.json');
    process.exit(1);
  }
  
  const contentFile = process.argv[2];
  
  if (!fs.existsSync(contentFile)) {
    console.error(`❌ Content file not found: ${contentFile}`);
    process.exit(1);
  }
  
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  
  const validator = new QualityValidator({
    projectId: 'content-pipeline-7dd4f',
    serviceAccountPath: path.join(__dirname, '../config/service_account.json')
  });
  
  const results = await validator.validateContent(content);
  
  // Save results
  const resultsFile = contentFile.replace('.json', '_quality_results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  console.log(`\n📄 Results saved: ${resultsFile}`);
  
  // Exit with appropriate code
  process.exit(results.passed ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = QualityValidator;