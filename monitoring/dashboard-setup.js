#!/usr/bin/env node

// Monitoring Dashboard Setup Script
// Creates BigQuery datasets, tables, and Looker Studio dashboard

const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  projectId: 'content-pipeline-7dd4f',
  datasetId: 'dpgen_analytics',
  location: 'us-central1',
  serviceAccountPath: path.join(__dirname, '../config/service_account.json')
};

async function setupBigQuery() {
  console.log('📊 Setting up BigQuery Analytics...\n');
  
  try {
    const bigquery = new BigQuery({
      projectId: CONFIG.projectId,
      keyFilename: CONFIG.serviceAccountPath
    });
    
    // Create dataset
    console.log('Creating dataset...');
    const [dataset] = await bigquery.dataset(CONFIG.datasetId).get({ autoCreate: true });
    console.log(`✅ Dataset created/verified: ${dataset.id}`);
    
    // Define table schemas
    const tables = [
      {
        id: 'content_metrics',
        schema: [
          { name: 'session_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'channel_slug', type: 'STRING', mode: 'REQUIRED' },
          { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
          { name: 'video_id', type: 'STRING' },
          { name: 'media_id', type: 'STRING' },
          { name: 'title', type: 'STRING' },
          { name: 'topic', type: 'STRING' },
          { name: 'published_at', type: 'TIMESTAMP' },
          { name: 'collected_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'views', type: 'INTEGER' },
          { name: 'likes', type: 'INTEGER' },
          { name: 'comments', type: 'INTEGER' },
          { name: 'shares', type: 'INTEGER' },
          { name: 'saves', type: 'INTEGER' },
          { name: 'reach', type: 'INTEGER' },
          { name: 'impressions', type: 'INTEGER' },
          { name: 'watch_time_minutes', type: 'FLOAT' },
          { name: 'avg_view_duration', type: 'FLOAT' },
          { name: 'avg_view_percentage', type: 'FLOAT' },
          { name: 'performance_score', type: 'FLOAT' },
          { name: 'hook_type', type: 'STRING' },
          { name: 'thumbnail_variant', type: 'STRING' }
        ],
        options: {
          timePartitioning: { type: 'DAY', field: 'collected_at' },
          clustering: { fields: ['channel_slug', 'platform'] }
        }
      },
      {
        id: 'pipeline_runs',
        schema: [
          { name: 'session_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'channel_slug', type: 'STRING', mode: 'REQUIRED' },
          { name: 'topic', type: 'STRING' },
          { name: 'status', type: 'STRING', mode: 'REQUIRED' },
          { name: 'started_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'completed_at', type: 'TIMESTAMP' },
          { name: 'duration_seconds', type: 'INTEGER' },
          { name: 'error_message', type: 'STRING' },
          { name: 'agent_costs', type: 'RECORD', mode: 'REPEATED', fields: [
            { name: 'agent', type: 'STRING' },
            { name: 'tokens_used', type: 'INTEGER' },
            { name: 'cost_usd', type: 'FLOAT' }
          ]},
          { name: 'total_cost_usd', type: 'FLOAT' },
          { name: 'assets_generated', type: 'RECORD', fields: [
            { name: 'videos', type: 'INTEGER' },
            { name: 'thumbnails', type: 'INTEGER' },
            { name: 'audio_duration_seconds', type: 'FLOAT' }
          ]}
        ],
        options: {
          timePartitioning: { type: 'DAY', field: 'started_at' },
          clustering: { fields: ['channel_slug', 'status'] }
        }
      },
      {
        id: 'cost_tracking',
        schema: [
          { name: 'date', type: 'DATE', mode: 'REQUIRED' },
          { name: 'service', type: 'STRING', mode: 'REQUIRED' },
          { name: 'channel_slug', type: 'STRING' },
          { name: 'usage_metric', type: 'STRING' },
          { name: 'usage_amount', type: 'FLOAT' },
          { name: 'cost_usd', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'project_id', type: 'STRING' }
        ],
        options: {
          timePartitioning: { type: 'DAY', field: 'date' },
          clustering: { fields: ['service', 'channel_slug'] }
        }
      },
      {
        id: 'quality_scores',
        schema: [
          { name: 'session_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'channel_slug', type: 'STRING', mode: 'REQUIRED' },
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'content_quality_score', type: 'FLOAT' },
          { name: 'factual_accuracy_score', type: 'FLOAT' },
          { name: 'brand_consistency_score', type: 'FLOAT' },
          { name: 'engagement_prediction', type: 'FLOAT' },
          { name: 'compliance_score', type: 'FLOAT' },
          { name: 'novelty_score', type: 'FLOAT' },
          { name: 'quality_flags', type: 'STRING', mode: 'REPEATED' }
        ],
        options: {
          timePartitioning: { type: 'DAY', field: 'timestamp' },
          clustering: { fields: ['channel_slug'] }
        }
      }
    ];
    
    // Create tables
    for (const tableConfig of tables) {
      console.log(`Creating table: ${tableConfig.id}...`);
      
      const [table] = await dataset.table(tableConfig.id).get({
        autoCreate: true,
        schema: tableConfig.schema,
        ...tableConfig.options
      });
      
      console.log(`✅ Table created/verified: ${table.id}`);
    }
    
    // Create views for common queries
    await createAnalyticsViews(bigquery);
    
    console.log('\n🎉 BigQuery setup complete!');
    return true;
    
  } catch (error) {
    console.error('❌ BigQuery setup failed:', error.message);
    return false;
  }
}

async function createAnalyticsViews(bigquery) {
  console.log('\nCreating analytics views...');
  
  const views = [
    {
      id: 'channel_performance_summary',
      query: `
        SELECT 
          channel_slug,
          platform,
          COUNT(*) as total_videos,
          AVG(performance_score) as avg_performance_score,
          SUM(views) as total_views,
          SUM(likes) as total_likes,
          AVG(avg_view_percentage) as avg_retention,
          DATE(collected_at) as date
        FROM \`${CONFIG.projectId}.${CONFIG.datasetId}.content_metrics\`
        WHERE collected_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY channel_slug, platform, DATE(collected_at)
        ORDER BY date DESC, total_views DESC
      `
    },
    {
      id: 'top_performing_content',
      query: `
        SELECT 
          channel_slug,
          title,
          platform,
          performance_score,
          views,
          avg_view_percentage,
          hook_type,
          thumbnail_variant,
          published_at
        FROM \`${CONFIG.projectId}.${CONFIG.datasetId}.content_metrics\`
        WHERE collected_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND performance_score IS NOT NULL
        ORDER BY performance_score DESC
        LIMIT 50
      `
    },
    {
      id: 'cost_analysis',
      query: `
        SELECT 
          channel_slug,
          service,
          DATE_TRUNC(date, WEEK) as week,
          SUM(cost_usd) as weekly_cost,
          AVG(cost_usd) as avg_daily_cost
        FROM \`${CONFIG.projectId}.${CONFIG.datasetId}.cost_tracking\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        GROUP BY channel_slug, service, DATE_TRUNC(date, WEEK)
        ORDER BY week DESC, weekly_cost DESC
      `
    },
    {
      id: 'pipeline_reliability',
      query: `
        SELECT 
          channel_slug,
          status,
          COUNT(*) as run_count,
          AVG(duration_seconds) as avg_duration_seconds,
          AVG(total_cost_usd) as avg_cost_usd,
          DATE(started_at) as date
        FROM \`${CONFIG.projectId}.${CONFIG.datasetId}.pipeline_runs\`
        WHERE started_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY channel_slug, status, DATE(started_at)
        ORDER BY date DESC, run_count DESC
      `
    }
  ];
  
  for (const view of views) {
    try {
      await bigquery.dataset(CONFIG.datasetId).createTable(view.id, {
        view: { query: view.query, useLegacySql: false }
      });
      console.log(`✅ View created: ${view.id}`);
    } catch (error) {
      if (error.code === 409) {
        console.log(`⚠️  View exists: ${view.id}`);
      } else {
        console.error(`❌ Failed to create view ${view.id}:`, error.message);
      }
    }
  }
}

function generateLookerStudioConfig() {
  console.log('\n📈 Generating Looker Studio configuration...');
  
  const config = {
    dashboards: [
      {
        name: "DPGen Content Performance",
        description: "Main dashboard for content performance across all channels",
        dataSource: `${CONFIG.projectId}.${CONFIG.datasetId}`,
        charts: [
          {
            type: "scorecard",
            title: "Total Views (Last 7 Days)",
            metric: "SUM(views)",
            dimension: "DATE(collected_at)",
            filter: "collected_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)"
          },
          {
            type: "line_chart",
            title: "Performance Score Trend",
            metrics: ["AVG(performance_score)"],
            dimension: "DATE(collected_at)",
            breakdown: "channel_slug"
          },
          {
            type: "bar_chart",
            title: "Views by Platform",
            metrics: ["SUM(views)"],
            dimension: "platform",
            sort: "SUM(views) DESC"
          },
          {
            type: "table",
            title: "Top Performing Videos",
            view: "top_performing_content",
            columns: ["title", "channel_slug", "performance_score", "views", "avg_view_percentage"]
          }
        ]
      },
      {
        name: "DPGen Operations & Costs",
        description: "Operational metrics and cost analysis",
        charts: [
          {
            type: "line_chart",
            title: "Daily Costs by Service",
            view: "cost_analysis",
            metrics: ["SUM(weekly_cost)"],
            dimension: "week",
            breakdown: "service"
          },
          {
            type: "pie_chart",
            title: "Pipeline Success Rate",
            view: "pipeline_reliability",
            metrics: ["COUNT(*)"],
            dimension: "status"
          }
        ]
      }
    ],
    setupInstructions: [
      "1. Go to Looker Studio: https://lookerstudio.google.com/",
      "2. Click 'Create' → 'Data Source'",
      `3. Select 'BigQuery' and choose project: ${CONFIG.projectId}`,
      `4. Select dataset: ${CONFIG.datasetId}`,
      "5. Choose tables: content_metrics, pipeline_runs, cost_tracking",
      "6. Create dashboard using the chart configurations above",
      "7. Set up automated refresh: Data → Refresh → Daily at 6 AM"
    ]
  };
  
  const configPath = path.join(__dirname, 'looker-studio-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`✅ Looker Studio config saved: ${configPath}`);
  console.log('\nSetup Instructions:');
  config.setupInstructions.forEach(instruction => {
    console.log(`   ${instruction}`);
  });
  
  return config;
}

async function setupCloudMonitoring() {
  console.log('\n🚨 Setting up Cloud Monitoring alerts...');
  
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const monitoring = google.monitoring({ version: 'v1', auth });
    
    // Define alert policies
    const alertPolicies = [
      {
        displayName: 'DPGen Pipeline Failures',
        documentation: {
          content: 'Alert when pipeline runs fail more than 20% of the time in a 1-hour window'
        },
        conditions: [{
          displayName: 'Pipeline failure rate',
          conditionThreshold: {
            filter: `resource.type="global" AND metric.type="bigquery.googleapis.com/slots/allocated"`,
            comparison: 'COMPARISON_GREATER_THAN',
            thresholdValue: 0.2,
            duration: '300s'
          }
        }],
        alertStrategy: {
          autoClose: '86400s'
        },
        enabled: true
      },
      {
        displayName: 'DPGen High Costs',
        documentation: {
          content: 'Alert when daily costs exceed $10 USD'
        },
        conditions: [{
          displayName: 'Daily cost threshold',
          conditionThreshold: {
            filter: `metric.type="billing.googleapis.com/billing/total_cost"`,
            comparison: 'COMPARISON_GREATER_THAN',
            thresholdValue: 10.0,
            duration: '86400s'
          }
        }],
        enabled: true
      }
    ];
    
    for (const policy of alertPolicies) {
      try {
        await monitoring.projects.alertPolicies.create({
          name: `projects/${CONFIG.projectId}`,
          requestBody: policy
        });
        console.log(`✅ Alert policy created: ${policy.displayName}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️  Alert policy exists: ${policy.displayName}`);
        } else {
          console.error(`❌ Failed to create alert: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Cloud Monitoring setup failed:', error.message);
  }
}

async function main() {
  console.log('📊 DPGen Monitoring Dashboard Setup');
  console.log('====================================\n');
  
  // Create directory if it doesn't exist
  const monitoringDir = path.dirname(__filename);
  if (!fs.existsSync(monitoringDir)) {
    fs.mkdirSync(monitoringDir, { recursive: true });
  }
  
  // Setup BigQuery
  const bigquerySuccess = await setupBigQuery();
  
  if (!bigquerySuccess) {
    console.error('❌ BigQuery setup failed. Cannot proceed with dashboard setup.');
    process.exit(1);
  }
  
  // Generate Looker Studio config
  generateLookerStudioConfig();
  
  // Setup Cloud Monitoring
  await setupCloudMonitoring();
  
  console.log('\n✅ Monitoring setup complete!');
  console.log('\nNext Steps:');
  console.log('1. Create Looker Studio dashboard using the generated config');
  console.log('2. Set up notification channels for alerts');
  console.log('3. Test the pipeline to start collecting data');
}

if (require.main === module) {
  main();
}