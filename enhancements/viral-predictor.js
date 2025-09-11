#!/usr/bin/env node

// Viral Content Predictor using ML
// Predicts viral potential before publishing

const { google } = require('googleapis');
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');
const path = require('path');

class ViralPredictor {
  constructor(config) {
    this.config = config;
    this.setupClients();
    this.viralThreshold = 0.75; // 75% confidence threshold
  }

  async setupClients() {
    const serviceAccount = JSON.parse(fs.readFileSync(this.config.serviceAccountPath, 'utf8'));
    
    this.auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    this.bigquery = new BigQuery({
      projectId: this.config.projectId,
      credentials: serviceAccount
    });
    
    this.authClient = await this.auth.getClient();
  }

  // Main prediction pipeline
  async predictVirality(content) {
    console.log('🔮 Predicting viral potential...\n');
    
    const predictions = {
      session_id: content.session_id,
      timestamp: new Date().toISOString(),
      channel: content.channel_slug,
      topic: content.topic,
      scores: {},
      recommendation: '',
      should_publish: false,
      optimization_suggestions: []
    };

    try {
      // Run all prediction models
      const [
        hookScore,
        thumbnailScore,
        topicScore,
        timingScore,
        competitionScore
      ] = await Promise.all([
        this.analyzeHook(content),
        this.analyzeThumbnail(content),
        this.analyzeTopic(content),
        this.analyzeTimingPotential(content),
        this.analyzeCompetition(content)
      ]);

      // Calculate weighted viral score
      predictions.scores = {
        hook: hookScore,
        thumbnail: thumbnailScore,
        topic: topicScore,
        timing: timingScore,
        competition: competitionScore
      };

      predictions.viral_score = this.calculateViralScore(predictions.scores);
      predictions.confidence = this.calculateConfidence(predictions.scores);
      
      // Platform-specific predictions
      predictions.platform_scores = await this.predictPlatformPerformance(content, predictions.viral_score);
      
      // Generate recommendations
      predictions.optimization_suggestions = this.generateOptimizations(predictions.scores);
      
      // Final decision
      predictions.should_publish = predictions.viral_score >= this.viralThreshold;
      
      if (predictions.should_publish) {
        predictions.recommendation = `✅ PUBLISH - ${(predictions.viral_score * 100).toFixed(1)}% viral potential`;
        predictions.estimated_views = this.estimateViews(predictions.viral_score, content.channel_slug);
      } else {
        predictions.recommendation = `⏸️ OPTIMIZE FIRST - Only ${(predictions.viral_score * 100).toFixed(1)}% viral potential`;
      }

      console.log('\n📊 Viral Prediction Results:');
      console.log(`   Viral Score: ${(predictions.viral_score * 100).toFixed(1)}%`);
      console.log(`   Confidence: ${(predictions.confidence * 100).toFixed(1)}%`);
      console.log(`   Decision: ${predictions.recommendation}`);
      
      if (predictions.estimated_views) {
        console.log(`   Estimated Views (7 days): ${predictions.estimated_views.toLocaleString()}`);
      }

      return predictions;

    } catch (error) {
      console.error('❌ Prediction failed:', error.message);
      predictions.error = error.message;
      return predictions;
    }
  }

  // Analyze hook effectiveness
  async analyzeHook(content) {
    const hooks = content.brief?.hooks || [];
    
    if (hooks.length === 0) return 0.5;

    // Analyze hook patterns that work
    const viralPatterns = [
      { pattern: /here's|this is|watch|look/i, weight: 0.8 },
      { pattern: /never|always|everyone|no one/i, weight: 0.9 },
      { pattern: /secret|hidden|revealed|exposed/i, weight: 0.95 },
      { pattern: /\?|!/, weight: 0.85 },
      { pattern: /\d+/, weight: 0.75 }, // Numbers
      { pattern: /you|your/i, weight: 0.8 }, // Direct address
      { pattern: /mistake|wrong|lie|myth/i, weight: 0.9 },
      { pattern: /before|after|vs/i, weight: 0.85 }
    ];

    let maxScore = 0;
    
    for (const hook of hooks) {
      const text = hook.text || hook;
      let score = 0.5; // Base score
      
      // Check pattern matches
      for (const { pattern, weight } of viralPatterns) {
        if (pattern.test(text)) {
          score += weight * 0.1;
        }
      }
      
      // Length optimization (5-10 words is ideal)
      const wordCount = text.split(' ').length;
      if (wordCount >= 5 && wordCount <= 10) {
        score += 0.2;
      }
      
      // Emotional triggers
      const emotions = /amazing|shocking|unbelievable|crazy|insane|mind-blowing/i;
      if (emotions.test(text)) {
        score += 0.15;
      }
      
      maxScore = Math.max(maxScore, Math.min(score, 1.0));
    }
    
    return maxScore;
  }

  // Analyze thumbnail clickability
  async analyzeThumbnail(content) {
    // Simplified scoring based on thumbnail elements
    const thumbnailConcepts = content.thumbnails || [];
    
    if (thumbnailConcepts.length === 0) return 0.5;
    
    // High-performing thumbnail patterns
    const clickPatterns = {
      contrast: 0.9,      // High contrast colors
      faces: 0.85,        // Human faces (if appropriate)
      text_overlay: 0.8,  // Bold text
      curiosity_gap: 0.95, // Something partially hidden
      comparison: 0.85,   // Before/after, vs
      arrows_circles: 0.75 // Visual indicators
    };
    
    // Analyze thumbnail descriptions
    let score = 0.6; // Base score
    
    for (const thumb of thumbnailConcepts) {
      const desc = JSON.stringify(thumb).toLowerCase();
      
      if (desc.includes('contrast') || desc.includes('bold')) score += 0.15;
      if (desc.includes('text') || desc.includes('title')) score += 0.1;
      if (desc.includes('arrow') || desc.includes('circle')) score += 0.1;
      if (desc.includes('comparison') || desc.includes('vs')) score += 0.15;
    }
    
    return Math.min(score, 1.0);
  }

  // Analyze topic trending potential
  async analyzeTopic(content) {
    const topic = content.topic || '';
    
    try {
      // Query historical performance data
      const query = `
        SELECT 
          AVG(views) as avg_views,
          AVG(performance_score) as avg_score,
          COUNT(*) as sample_size
        FROM \`${this.config.projectId}.dpgen_analytics.content_metrics\`
        WHERE LOWER(title) LIKE LOWER('%${topic.split(' ')[0]}%')
          OR LOWER(title) LIKE LOWER('%${topic.split(' ').slice(-1)[0]}%')
        LIMIT 100
      `;
      
      const [rows] = await this.bigquery.query(query);
      
      if (rows.length > 0 && rows[0].sample_size > 0) {
        // Normalize score based on historical performance
        const avgScore = rows[0].avg_score || 0.5;
        return Math.min(avgScore / 100, 1.0);
      }
    } catch (error) {
      console.log('   Using default topic score');
    }
    
    // Fallback: analyze topic characteristics
    let score = 0.6;
    
    // Trending keywords
    const trendingTerms = ['ai', '2024', 'new', 'latest', 'update', 'leaked', 'announced'];
    for (const term of trendingTerms) {
      if (topic.toLowerCase().includes(term)) {
        score += 0.1;
      }
    }
    
    // Question format
    if (topic.includes('?')) score += 0.15;
    
    // Controversy/debate potential
    if (/vs|versus|better|worth|waste/i.test(topic)) score += 0.15;
    
    return Math.min(score, 1.0);
  }

  // Analyze timing for maximum reach
  async analyzeTimingPotential(content) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // Optimal posting times (based on general data)
    let score = 0.5;
    
    // Best days: Tuesday-Thursday
    if (dayOfWeek >= 2 && dayOfWeek <= 4) score += 0.2;
    
    // Best hours: 12-3pm, 7-9pm (adjusted for timezone)
    if ((hour >= 12 && hour <= 15) || (hour >= 19 && hour <= 21)) {
      score += 0.3;
    }
    
    // Check for competing major events
    // (In production, this would check a calendar API)
    
    return Math.min(score, 1.0);
  }

  // Analyze competition saturation
  async analyzeCompetition(content) {
    // Check if topic is oversaturated
    try {
      const recentDays = 7;
      const query = `
        SELECT COUNT(DISTINCT title) as similar_content
        FROM \`${this.config.projectId}.dpgen_analytics.content_metrics\`
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${recentDays} DAY)
          AND LOWER(title) LIKE LOWER('%${content.topic.split(' ')[0]}%')
      `;
      
      const [rows] = await this.bigquery.query(query);
      
      if (rows.length > 0) {
        const similarCount = rows[0].similar_content || 0;
        
        // Less competition = higher score
        if (similarCount === 0) return 1.0;
        if (similarCount < 5) return 0.8;
        if (similarCount < 10) return 0.6;
        return 0.4;
      }
    } catch (error) {
      console.log('   Using default competition score');
    }
    
    return 0.7; // Default moderate competition
  }

  // Calculate weighted viral score
  calculateViralScore(scores) {
    const weights = {
      hook: 0.35,      // Most important
      thumbnail: 0.25, // Very important
      topic: 0.20,     // Important
      timing: 0.10,    // Moderate
      competition: 0.10 // Moderate
    };
    
    let weightedScore = 0;
    for (const [factor, score] of Object.entries(scores)) {
      weightedScore += score * (weights[factor] || 0);
    }
    
    return weightedScore;
  }

  // Calculate prediction confidence
  calculateConfidence(scores) {
    // Confidence based on score consistency
    const values = Object.values(scores);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    
    // Lower variance = higher confidence
    return Math.max(0.5, 1 - (variance * 2));
  }

  // Predict platform-specific performance
  async predictPlatformPerformance(content, viralScore) {
    const platforms = {
      youtube_shorts: viralScore * 1.0,  // Baseline
      youtube_long: viralScore * 0.8,    // Harder for long-form
      tiktok: viralScore * 1.1,          // Easier to go viral
      instagram_reels: viralScore * 0.95, // Slightly below YouTube
      facebook_reels: viralScore * 0.85  // Hardest platform
    };
    
    // Adjust based on content type
    const duration = content.metadata?.duration_target || 60;
    
    if (duration <= 60) {
      // Short content performs better on TikTok/Reels
      platforms.tiktok *= 1.1;
      platforms.instagram_reels *= 1.05;
    } else {
      // Longer content better on YouTube
      platforms.youtube_long *= 1.15;
    }
    
    // Normalize scores
    for (const platform in platforms) {
      platforms[platform] = Math.min(platforms[platform], 1.0);
    }
    
    return platforms;
  }

  // Generate optimization suggestions
  generateOptimizations(scores) {
    const suggestions = [];
    
    // Identify weak points
    if (scores.hook < 0.7) {
      suggestions.push({
        priority: 'high',
        area: 'hook',
        suggestion: 'Strengthen hook with curiosity gap or emotional trigger',
        impact: '+20% CTR'
      });
    }
    
    if (scores.thumbnail < 0.75) {
      suggestions.push({
        priority: 'high',
        area: 'thumbnail',
        suggestion: 'Add bold text overlay and increase color contrast',
        impact: '+15% CTR'
      });
    }
    
    if (scores.topic < 0.6) {
      suggestions.push({
        priority: 'medium',
        area: 'topic',
        suggestion: 'Add trending angle or controversial element',
        impact: '+30% reach'
      });
    }
    
    if (scores.timing < 0.7) {
      suggestions.push({
        priority: 'low',
        area: 'timing',
        suggestion: 'Schedule for optimal time (2-3pm or 7-9pm)',
        impact: '+10% initial views'
      });
    }
    
    if (scores.competition > 0.8) {
      suggestions.push({
        priority: 'medium',
        area: 'differentiation',
        suggestion: 'Add unique angle to stand out from competition',
        impact: '+25% retention'
      });
    }
    
    return suggestions;
  }

  // Estimate view count based on viral score
  estimateViews(viralScore, channelSlug) {
    // Base views by channel size (would query actual subscriber count)
    const channelBaseViews = {
      'circuit-myth': 10000,
      'space-minute': 8000,
      'zero-view-science': 5000,
      'default': 3000
    };
    
    const base = channelBaseViews[channelSlug] || channelBaseViews.default;
    
    // Viral multiplier (exponential growth for high scores)
    const multiplier = Math.pow(10, viralScore * 2); // 1x to 100x
    
    return Math.round(base * multiplier);
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const contentFile = process.argv[3];
  
  const predictor = new ViralPredictor({
    projectId: 'content-pipeline-7dd4f',
    serviceAccountPath: path.join(__dirname, '../config/service_account.json')
  });
  
  await predictor.setupClients();
  
  switch (command) {
    case 'predict':
      if (!contentFile) {
        console.error('Usage: node viral-predictor.js predict <content-file.json>');
        process.exit(1);
      }
      
      const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      const predictions = await predictor.predictVirality(content);
      
      // Save predictions
      const outputFile = contentFile.replace('.json', '_viral_predictions.json');
      fs.writeFileSync(outputFile, JSON.stringify(predictions, null, 2));
      
      console.log(`\n📄 Predictions saved: ${outputFile}`);
      
      // Exit code based on recommendation
      process.exit(predictions.should_publish ? 0 : 1);
      break;
      
    default:
      console.log('Viral Content Predictor');
      console.log('=======================');
      console.log('');
      console.log('Usage:');
      console.log('  node viral-predictor.js predict <content-file.json>');
      console.log('');
      console.log('Example:');
      console.log('  node viral-predictor.js predict ../test-content.json');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Prediction failed:', error.message);
    process.exit(1);
  });
}

module.exports = ViralPredictor;