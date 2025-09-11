#!/usr/bin/env node

// Cost Tracking and Budget Alerts for DPGen Pipeline
// Monitors Google Cloud costs and sets up automated alerts

const { google } = require('googleapis');
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  projectId: 'content-pipeline-7dd4f',
  billingAccountId: null, // Will be auto-detected
  datasetId: 'dpgen_analytics',
  serviceAccountPath: path.join(__dirname, '../config/service_account.json'),
  budgetThresholds: {
    daily: 5.00,    // $5/day
    weekly: 30.00,  // $30/week  
    monthly: 100.00 // $100/month
  },
  costPerOperation: {
    gemini_flash_input: 0.075 / 1000000,    // $0.075 per 1M tokens
    gemini_flash_output: 0.30 / 1000000,    // $0.30 per 1M tokens
    gemini_pro_input: 1.25 / 1000000,       // $1.25 per 1M tokens
    gemini_pro_output: 5.00 / 1000000,      // $5.00 per 1M tokens
    veo_video_second: 0.10,                 // $0.10 per second
    imagen_image: 0.04,                     // $0.04 per image
    tts_character: 16.00 / 1000000,         // $16 per 1M characters
    storage_gb_month: 0.02,                 // $0.02 per GB/month
    cloud_run_vcpu_second: 0.00002400,     // $0.000024 per vCPU-second
    cloud_run_memory_gib_second: 0.00000250 // $0.0000025 per GiB-second
  }
};

class CostTracker {
  constructor() {
    this.setupClients();
  }
  
  async setupClients() {
    const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf8'));
    
    this.auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/cloud-billing'
      ]
    });
    
    this.billing = google.cloudbilling({ version: 'v1', auth: this.auth });
    this.monitoring = google.monitoring({ version: 'v1', auth: this.auth });
    this.bigquery = new BigQuery({
      projectId: CONFIG.projectId,
      credentials: serviceAccount
    });
    
    // Get billing account ID
    await this.getBillingAccountId();
  }
  
  async getBillingAccountId() {
    try {
      const response = await this.billing.projects.getBillingInfo({
        name: `projects/${CONFIG.projectId}`
      });
      
      CONFIG.billingAccountId = response.data.billingAccountName?.split('/')[1];
      
      if (!CONFIG.billingAccountId) {
        console.warn('⚠️ No billing account found. Some features may not work.');
      } else {
        console.log(`💳 Billing Account: ${CONFIG.billingAccountId}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not retrieve billing account:', error.message);
    }
  }
  
  // Track costs for a specific session
  async trackSessionCosts(sessionData) {
    console.log(`💰 Calculating costs for session: ${sessionData.session_id}`);
    
    const costs = {
      session_id: sessionData.session_id,
      channel_slug: sessionData.channel_slug,
      timestamp: new Date().toISOString(),
      breakdown: {},
      total_usd: 0
    };
    
    try {
      // Gemini costs (estimate based on content length)
      costs.breakdown.gemini = this.calculateGeminiCosts(sessionData);
      
      // Veo costs (based on video duration)
      costs.breakdown.veo = this.calculateVeoCosts(sessionData);
      
      // Imagen costs (thumbnails)
      costs.breakdown.imagen = this.calculateImagenCosts(sessionData);
      
      // Text-to-Speech costs
      costs.breakdown.tts = this.calculateTTSCosts(sessionData);
      
      // Cloud Run costs (estimate)
      costs.breakdown.cloud_run = this.calculateCloudRunCosts(sessionData);
      
      // Storage costs (minimal for short-term)
      costs.breakdown.storage = this.calculateStorageCosts(sessionData);
      
      // Calculate total
      costs.total_usd = Object.values(costs.breakdown).reduce((sum, cost) => sum + cost.total, 0);
      
      console.log('   Cost Breakdown:');
      Object.entries(costs.breakdown).forEach(([service, cost]) => {
        console.log(`     ${service}: $${cost.total.toFixed(4)} (${cost.description})`);
      });
      console.log(`   Total: $${costs.total_usd.toFixed(4)}`);
      
      // Store in BigQuery
      await this.storeCostData(costs);
      
      return costs;
      
    } catch (error) {
      console.error('❌ Cost calculation failed:', error.message);
      return costs;
    }
  }
  
  calculateGeminiCosts(sessionData) {
    // Estimate token usage based on content
    const script = sessionData.script?.ssml || sessionData.script || '';
    const research = JSON.stringify(sessionData.research || {});
    const brief = JSON.stringify(sessionData.brief || {});
    
    // Rough token estimation (4 chars = 1 token)
    const totalChars = script.length + research.length + brief.length;
    const estimatedTokens = Math.ceil(totalChars / 4);
    
    // Assume 70% input tokens, 30% output tokens
    const inputTokens = Math.ceil(estimatedTokens * 0.7);
    const outputTokens = Math.ceil(estimatedTokens * 0.3);
    
    // Use Flash for most operations, Pro for creative tasks
    const flashInputCost = inputTokens * CONFIG.costPerOperation.gemini_flash_input * 0.8;
    const flashOutputCost = outputTokens * CONFIG.costPerOperation.gemini_flash_output * 0.8;
    const proInputCost = inputTokens * CONFIG.costPerOperation.gemini_pro_input * 0.2;
    const proOutputCost = outputTokens * CONFIG.costPerOperation.gemini_pro_output * 0.2;
    
    const total = flashInputCost + flashOutputCost + proInputCost + proOutputCost;
    
    return {
      total,
      description: `~${estimatedTokens.toLocaleString()} tokens`,
      details: {
        estimated_tokens: estimatedTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        flash_cost: flashInputCost + flashOutputCost,
        pro_cost: proInputCost + proOutputCost
      }
    };
  }
  
  calculateVeoCosts(sessionData) {
    // Estimate based on video duration
    const duration = sessionData.metadata?.duration_target || 60;
    const videosGenerated = sessionData.assets?.videos_generated || 5;
    
    const totalSeconds = duration * videosGenerated;
    const total = totalSeconds * CONFIG.costPerOperation.veo_video_second;
    
    return {
      total,
      description: `${totalSeconds}s of video`,
      details: {
        videos_generated: videosGenerated,
        duration_per_video: duration,
        total_seconds: totalSeconds,
        cost_per_second: CONFIG.costPerOperation.veo_video_second
      }
    };
  }
  
  calculateImagenCosts(sessionData) {
    // Thumbnails generated
    const thumbnailsGenerated = sessionData.assets?.thumbnails_generated || 3;
    const total = thumbnailsGenerated * CONFIG.costPerOperation.imagen_image;
    
    return {
      total,
      description: `${thumbnailsGenerated} thumbnails`,
      details: {
        images_generated: thumbnailsGenerated,
        cost_per_image: CONFIG.costPerOperation.imagen_image
      }
    };
  }
  
  calculateTTSCosts(sessionData) {
    // Estimate based on script length
    const script = sessionData.script?.ssml || sessionData.script || '';
    const characters = script.length;
    const total = characters * CONFIG.costPerOperation.tts_character;
    
    return {
      total,
      description: `${characters.toLocaleString()} characters`,
      details: {
        characters,
        cost_per_character: CONFIG.costPerOperation.tts_character
      }
    };
  }
  
  calculateCloudRunCosts(sessionData) {
    // Estimate renderer usage
    const duration = sessionData.metadata?.duration_target || 60;
    const renderTimeSeconds = Math.max(duration * 2, 120); // Assume 2x realtime + overhead
    
    const vcpuCost = renderTimeSeconds * 2 * CONFIG.costPerOperation.cloud_run_vcpu_second; // 2 vCPUs
    const memoryCost = renderTimeSeconds * 2 * CONFIG.costPerOperation.cloud_run_memory_gib_second; // 2 GiB
    
    const total = vcpuCost + memoryCost;
    
    return {
      total,
      description: `${renderTimeSeconds}s rendering`,
      details: {
        render_time_seconds: renderTimeSeconds,
        vcpu_cost: vcpuCost,
        memory_cost: memoryCost
      }
    };
  }
  
  calculateStorageCosts(sessionData) {
    // Minimal storage costs for temp files
    const estimatedGb = 0.5; // 500MB for videos/audio/images
    const hoursStored = 24; // Assume 24 hour retention
    const monthlyEquivalent = (hoursStored / (24 * 30)) * estimatedGb;
    
    const total = monthlyEquivalent * CONFIG.costPerOperation.storage_gb_month;
    
    return {
      total,
      description: `${estimatedGb}GB for ${hoursStored}h`,
      details: {
        estimated_gb: estimatedGb,
        hours_stored: hoursStored,
        monthly_equivalent_gb: monthlyEquivalent
      }
    };
  }
  
  // Store cost data in BigQuery
  async storeCostData(costs) {
    try {
      const table = this.bigquery.dataset(CONFIG.datasetId).table('cost_tracking');
      
      const rows = Object.entries(costs.breakdown).map(([service, data]) => ({
        date: new Date().toISOString().split('T')[0],
        service,
        channel_slug: costs.channel_slug,
        usage_metric: data.description,
        usage_amount: data.details ? Object.values(data.details)[0] : 1,
        cost_usd: data.total,
        project_id: CONFIG.projectId,
        session_id: costs.session_id
      }));
      
      await table.insert(rows);
      console.log(`   📊 Cost data stored in BigQuery`);
      
    } catch (error) {
      console.error('   ❌ Failed to store cost data:', error.message);
    }
  }
  
  // Get current spending
  async getCurrentSpending(period = 'daily') {
    console.log(`💸 Checking ${period} spending...`);
    
    try {
      const table = this.bigquery.dataset(CONFIG.datasetId).table('cost_tracking');
      
      let dateFilter;
      switch (period) {
        case 'daily':
          dateFilter = 'date = CURRENT_DATE()';
          break;
        case 'weekly':
          dateFilter = 'date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)';
          break;
        case 'monthly':
          dateFilter = 'date >= DATE_TRUNC(CURRENT_DATE(), MONTH)';
          break;
        default:
          dateFilter = 'date >= CURRENT_DATE()';
      }
      
      const query = `
        SELECT 
          service,
          channel_slug,
          SUM(cost_usd) as total_cost,
          COUNT(*) as operation_count
        FROM \`${CONFIG.projectId}.${CONFIG.datasetId}.cost_tracking\`
        WHERE ${dateFilter}
        GROUP BY service, channel_slug
        ORDER BY total_cost DESC
      `;
      
      const [rows] = await this.bigquery.query(query);
      
      const summary = {
        period,
        total_cost: 0,
        by_service: {},
        by_channel: {}
      };
      
      rows.forEach(row => {
        summary.total_cost += row.total_cost;
        
        if (!summary.by_service[row.service]) {
          summary.by_service[row.service] = 0;
        }
        summary.by_service[row.service] += row.total_cost;
        
        if (!summary.by_channel[row.channel_slug]) {
          summary.by_channel[row.channel_slug] = 0;
        }
        summary.by_channel[row.channel_slug] += row.total_cost;
      });
      
      const threshold = CONFIG.budgetThresholds[period];
      const percentUsed = (summary.total_cost / threshold) * 100;
      
      console.log(`   Total ${period} cost: $${summary.total_cost.toFixed(2)}`);
      console.log(`   Budget threshold: $${threshold.toFixed(2)}`);
      console.log(`   Budget used: ${percentUsed.toFixed(1)}%`);
      
      if (percentUsed > 80) {
        console.log('   🚨 WARNING: Approaching budget limit!');
      }
      
      return summary;
      
    } catch (error) {
      console.error('❌ Failed to get spending data:', error.message);
      return null;
    }
  }
  
  // Set up budget alerts
  async setupBudgetAlerts() {
    console.log('🚨 Setting up budget alerts...');
    
    if (!CONFIG.billingAccountId) {
      console.log('   ⚠️ No billing account found. Cannot set up budget alerts.');
      return;
    }
    
    try {
      const budgets = [
        {
          displayName: 'DPGen Daily Budget',
          amount: { specifiedAmount: { currencyCode: 'USD', units: CONFIG.budgetThresholds.daily.toString() } },
          timeUnit: 'DAY',
          thresholdRules: [
            { thresholdPercent: 0.8, spendBasis: 'CURRENT_SPEND' },
            { thresholdPercent: 0.95, spendBasis: 'CURRENT_SPEND' },
            { thresholdPercent: 1.0, spendBasis: 'CURRENT_SPEND' }
          ]
        },
        {
          displayName: 'DPGen Monthly Budget',
          amount: { specifiedAmount: { currencyCode: 'USD', units: CONFIG.budgetThresholds.monthly.toString() } },
          timeUnit: 'MONTH',
          thresholdRules: [
            { thresholdPercent: 0.5, spendBasis: 'CURRENT_SPEND' },
            { thresholdPercent: 0.8, spendBasis: 'CURRENT_SPEND' },
            { thresholdPercent: 0.95, spendBasis: 'CURRENT_SPEND' },
            { thresholdPercent: 1.0, spendBasis: 'CURRENT_SPEND' }
          ]
        }
      ];
      
      for (const budgetConfig of budgets) {
        const budget = {
          ...budgetConfig,
          budgetFilter: {
            projects: [`projects/${CONFIG.projectId}`],
            labels: {
              'app': 'dpgen'
            }
          }
        };
        
        try {
          await this.billing.billingAccounts.budgets.create({
            parent: `billingAccounts/${CONFIG.billingAccountId}`,
            requestBody: budget
          });
          
          console.log(`   ✅ Created budget: ${budget.displayName}`);
        } catch (error) {
          if (error.code === 409) {
            console.log(`   ⚠️ Budget already exists: ${budget.displayName}`);
          } else {
            console.error(`   ❌ Failed to create budget: ${error.message}`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Budget alert setup failed:', error.message);
    }
  }
  
  // Generate cost optimization recommendations
  async generateOptimizationRecommendations() {
    console.log('💡 Analyzing cost optimization opportunities...');
    
    try {
      const summary = await this.getCurrentSpending('monthly');
      
      if (!summary) {
        console.log('   ⚠️ Cannot generate recommendations without spending data');
        return;
      }
      
      const recommendations = [];
      
      // Analyze by service
      Object.entries(summary.by_service).forEach(([service, cost]) => {
        const percentage = (cost / summary.total_cost) * 100;
        
        if (service === 'veo' && percentage > 40) {
          recommendations.push({
            priority: 'high',
            service,
            issue: 'Video generation costs are high',
            suggestion: 'Consider reducing video duration or frequency',
            potential_savings: cost * 0.3
          });
        }
        
        if (service === 'gemini' && percentage > 30) {
          recommendations.push({
            priority: 'medium',
            service,
            issue: 'AI model usage costs are high',
            suggestion: 'Use Flash model for non-critical tasks, optimize prompts',
            potential_savings: cost * 0.2
          });
        }
        
        if (service === 'storage' && percentage > 10) {
          recommendations.push({
            priority: 'low',
            service,
            issue: 'Storage costs could be optimized',
            suggestion: 'Implement lifecycle policies, use Nearline for backups',
            potential_savings: cost * 0.4
          });
        }
      });
      
      // Analyze by channel
      const channelCosts = Object.entries(summary.by_channel);
      if (channelCosts.length > 1) {
        const [mostExpensive] = channelCosts.sort((a, b) => b[1] - a[1]);
        const avgCost = summary.total_cost / channelCosts.length;
        
        if (mostExpensive[1] > avgCost * 1.5) {
          recommendations.push({
            priority: 'medium',
            service: 'channel_optimization',
            issue: `Channel ${mostExpensive[0]} costs 50% more than average`,
            suggestion: 'Review content complexity and generation frequency',
            potential_savings: (mostExpensive[1] - avgCost) * 0.5
          });
        }
      }
      
      // Display recommendations
      if (recommendations.length === 0) {
        console.log('   ✅ No major optimization opportunities found');
      } else {
        console.log('   💡 Optimization Recommendations:');
        recommendations.forEach((rec, i) => {
          const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          console.log(`\n   ${i + 1}. ${priority} ${rec.issue}`);
          console.log(`      ${rec.suggestion}`);
          console.log(`      Potential savings: $${rec.potential_savings.toFixed(2)}/month`);
        });
        
        const totalSavings = recommendations.reduce((sum, rec) => sum + rec.potential_savings, 0);
        console.log(`\n   💰 Total potential savings: $${totalSavings.toFixed(2)}/month`);
      }
      
      return recommendations;
      
    } catch (error) {
      console.error('❌ Failed to generate recommendations:', error.message);
      return [];
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  const tracker = new CostTracker();
  await tracker.setupClients();
  
  switch (command) {
    case 'spending':
      const period = arg || 'daily';
      await tracker.getCurrentSpending(period);
      break;
      
    case 'setup-alerts':
      await tracker.setupBudgetAlerts();
      break;
      
    case 'optimize':
      await tracker.generateOptimizationRecommendations();
      break;
      
    case 'track-session':
      if (!arg) {
        console.error('Usage: node cost-tracker.js track-session <session-file.json>');
        process.exit(1);
      }
      
      const sessionData = JSON.parse(fs.readFileSync(arg, 'utf8'));
      await tracker.trackSessionCosts(sessionData);
      break;
      
    default:
      console.log('DPGen Cost Tracker');
      console.log('==================');
      console.log('');
      console.log('Usage:');
      console.log('  node cost-tracker.js spending [daily|weekly|monthly]  # Check current spending');
      console.log('  node cost-tracker.js setup-alerts                    # Set up budget alerts');
      console.log('  node cost-tracker.js optimize                        # Get optimization tips');
      console.log('  node cost-tracker.js track-session <file.json>       # Track session costs');
      console.log('');
      console.log('Examples:');
      console.log('  node cost-tracker.js spending monthly');
      console.log('  node cost-tracker.js setup-alerts');
      console.log('  node cost-tracker.js optimize');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  });
}

module.exports = CostTracker;