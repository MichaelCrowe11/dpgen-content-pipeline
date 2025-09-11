#!/usr/bin/env node

// Multi-Revenue Stream Dashboard
// Centralized dashboard for tracking all monetization streams

const { google } = require('googleapis');
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');
const path = require('path');

class RevenueDashboard {
  constructor(config) {
    this.config = config;
    this.setupClients();
    this.revenueStreams = this.initializeRevenueStreams();
    this.dashboardConfig = this.loadDashboardConfig();
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

  // Initialize revenue stream tracking
  initializeRevenueStreams() {
    return {
      youtube_ad_revenue: {
        name: 'YouTube Ad Revenue',
        status: 'active',
        automation_level: 'high',
        tracking_method: 'youtube_api',
        revenue_share: 0.55, // YouTube's 55% to creators
        expected_monthly: 2400
      },
      sponsorships: {
        name: 'Brand Sponsorships',
        status: 'active',
        automation_level: 'medium',
        tracking_method: 'manual_entry',
        revenue_share: 1.0,
        expected_monthly: 3500
      },
      affiliate_commissions: {
        name: 'Affiliate Marketing',
        status: 'active',
        automation_level: 'high',
        tracking_method: 'api_integration',
        revenue_share: 1.0,
        expected_monthly: 850
      },
      course_sales: {
        name: 'Course Sales',
        status: 'planned',
        automation_level: 'medium',
        tracking_method: 'lms_integration',
        revenue_share: 0.90, // After platform fees
        expected_monthly: 1200
      },
      merchandise: {
        name: 'Merchandise',
        status: 'planned',
        automation_level: 'high',
        tracking_method: 'pod_integration',
        revenue_share: 0.75, // After production costs
        expected_monthly: 400
      },
      membership_tiers: {
        name: 'Channel Memberships',
        status: 'planned',
        automation_level: 'medium',
        tracking_method: 'youtube_api',
        revenue_share: 0.70, // After YouTube fees
        expected_monthly: 600
      },
      licensing: {
        name: 'Content Licensing',
        status: 'future',
        automation_level: 'low',
        tracking_method: 'manual_entry',
        revenue_share: 1.0,
        expected_monthly: 800
      }
    };
  }

  // Load dashboard configuration
  loadDashboardConfig() {
    return {
      refresh_interval: 3600000, // 1 hour in milliseconds
      alert_thresholds: {
        revenue_drop: 0.15, // 15% drop triggers alert
        goal_achievement: 0.90, // 90% of goal triggers success alert
        conversion_drop: 0.20 // 20% conversion drop
      },
      kpis: [
        'total_monthly_revenue',
        'revenue_per_stream',
        'conversion_rates',
        'growth_rate',
        'diversification_index'
      ],
      visualization_types: ['line_chart', 'bar_chart', 'pie_chart', 'gauge']
    };
  }

  // Generate comprehensive revenue report
  async generateRevenueReport(timeframe = '30d') {
    console.log('📊 Generating revenue dashboard...\n');

    const report = {
      generated_at: new Date().toISOString(),
      timeframe,
      summary: {},
      streams: {},
      projections: {},
      optimizations: [],
      alerts: []
    };

    try {
      // Get current performance for each stream
      report.streams = await this.getStreamPerformance(timeframe);
      
      // Calculate summary metrics
      report.summary = this.calculateSummaryMetrics(report.streams);
      
      // Generate projections
      report.projections = this.generateProjections(report.streams);
      
      // Identify optimization opportunities
      report.optimizations = this.identifyOptimizations(report.streams);
      
      // Check for alerts
      report.alerts = this.checkAlerts(report.streams, report.summary);

      console.log('📈 Dashboard Summary:');
      console.log(`   Total Revenue: $${report.summary.total_revenue.toLocaleString()}`);
      console.log(`   Active Streams: ${report.summary.active_streams}`);
      console.log(`   Growth Rate: ${(report.summary.growth_rate * 100).toFixed(1)}%`);
      console.log(`   Diversification: ${(report.summary.diversification_index * 100).toFixed(0)}%`);

      return report;

    } catch (error) {
      console.error('❌ Dashboard generation failed:', error.message);
      report.error = error.message;
      return report;
    }
  }

  // Get performance data for each revenue stream
  async getStreamPerformance(timeframe) {
    const streamData = {};

    for (const [streamId, streamConfig] of Object.entries(this.revenueStreams)) {
      streamData[streamId] = {
        ...streamConfig,
        current_revenue: await this.getStreamRevenue(streamId, timeframe),
        performance_metrics: await this.getStreamMetrics(streamId, timeframe),
        trend: await this.getStreamTrend(streamId)
      };
    }

    return streamData;
  }

  // Get revenue for specific stream
  async getStreamRevenue(streamId, timeframe) {
    // In production, this would query actual APIs/databases
    // For now, simulate based on expected values with some variance
    const baseRevenue = this.revenueStreams[streamId].expected_monthly;
    const variance = (Math.random() - 0.5) * 0.3; // ±15% variance
    const actualRevenue = baseRevenue * (1 + variance);

    // Adjust for stream status
    if (this.revenueStreams[streamId].status === 'planned') {
      return 0;
    } else if (this.revenueStreams[streamId].status === 'future') {
      return 0;
    }

    return Math.max(0, actualRevenue);
  }

  // Get detailed metrics for stream
  async getStreamMetrics(streamId, timeframe) {
    const metrics = {
      transactions: 0,
      conversion_rate: 0,
      avg_transaction_value: 0,
      growth_rate: 0
    };

    // Simulate metrics based on stream type
    switch (streamId) {
      case 'youtube_ad_revenue':
        metrics.transactions = 1250000; // Views
        metrics.conversion_rate = 0.002; // RPM equivalent
        metrics.avg_transaction_value = 0.002;
        metrics.growth_rate = 0.12;
        break;
        
      case 'sponsorships':
        metrics.transactions = 8; // Sponsored videos
        metrics.conversion_rate = 0.80; // Deal close rate
        metrics.avg_transaction_value = 437.50;
        metrics.growth_rate = 0.25;
        break;
        
      case 'affiliate_commissions':
        metrics.transactions = 156; // Clicks that converted
        metrics.conversion_rate = 0.023;
        metrics.avg_transaction_value = 5.45;
        metrics.growth_rate = 0.18;
        break;
        
      default:
        // Default metrics for other streams
        metrics.transactions = Math.floor(Math.random() * 1000);
        metrics.conversion_rate = Math.random() * 0.05;
        metrics.avg_transaction_value = Math.random() * 50;
        metrics.growth_rate = (Math.random() - 0.5) * 0.4;
    }

    return metrics;
  }

  // Get trend data for stream
  async getStreamTrend(streamId) {
    // Simulate 7-day trend data
    const trend = [];
    let baseValue = this.revenueStreams[streamId].expected_monthly / 30; // Daily average
    
    for (let i = 6; i >= 0; i--) {
      const variance = (Math.random() - 0.5) * 0.2;
      const dailyRevenue = baseValue * (1 + variance);
      
      trend.push({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        revenue: Math.max(0, dailyRevenue),
        transactions: Math.floor(Math.random() * 100)
      });
    }

    return trend;
  }

  // Calculate summary metrics
  calculateSummaryMetrics(streams) {
    let totalRevenue = 0;
    let activeStreams = 0;
    let totalGrowthRate = 0;
    let streamCount = 0;
    
    const revenueByStream = {};

    Object.entries(streams).forEach(([streamId, data]) => {
      totalRevenue += data.current_revenue;
      revenueByStream[streamId] = data.current_revenue;
      
      if (data.status === 'active') {
        activeStreams++;
        totalGrowthRate += data.performance_metrics.growth_rate;
        streamCount++;
      }
    });

    // Calculate diversification index (how evenly distributed revenue is)
    const diversificationIndex = this.calculateDiversificationIndex(revenueByStream);

    return {
      total_revenue: totalRevenue,
      active_streams: activeStreams,
      growth_rate: streamCount > 0 ? totalGrowthRate / streamCount : 0,
      diversification_index: diversificationIndex,
      revenue_by_stream: revenueByStream
    };
  }

  // Calculate diversification index (Shannon entropy)
  calculateDiversificationIndex(revenueByStream) {
    const total = Object.values(revenueByStream).reduce((sum, rev) => sum + rev, 0);
    
    if (total === 0) return 0;

    let entropy = 0;
    Object.values(revenueByStream).forEach(revenue => {
      if (revenue > 0) {
        const proportion = revenue / total;
        entropy -= proportion * Math.log2(proportion);
      }
    });

    // Normalize to 0-1 scale (max entropy for 7 streams is log2(7))
    return entropy / Math.log2(Object.keys(revenueByStream).length);
  }

  // Generate revenue projections
  generateProjections(streams) {
    const projections = {
      next_month: 0,
      next_quarter: 0,
      next_year: 0,
      breakdown_by_stream: {}
    };

    Object.entries(streams).forEach(([streamId, data]) => {
      const currentRevenue = data.current_revenue;
      const growthRate = data.performance_metrics.growth_rate;
      
      // Monthly projection
      const nextMonth = currentRevenue * (1 + growthRate);
      
      // Quarterly projection (compound growth)
      const nextQuarter = currentRevenue * Math.pow(1 + growthRate, 3);
      
      // Annual projection
      const nextYear = currentRevenue * Math.pow(1 + growthRate, 12);

      projections.breakdown_by_stream[streamId] = {
        next_month: nextMonth,
        next_quarter: nextQuarter,
        next_year: nextYear
      };

      projections.next_month += nextMonth;
      projections.next_quarter += nextQuarter;
      projections.next_year += nextYear;
    });

    return projections;
  }

  // Identify optimization opportunities
  identifyOptimizations(streams) {
    const optimizations = [];

    Object.entries(streams).forEach(([streamId, data]) => {
      // Low performing streams
      if (data.current_revenue < data.expected_monthly * 0.7) {
        optimizations.push({
          stream: streamId,
          type: 'underperforming',
          priority: 'high',
          recommendation: `${data.name} is 30%+ below target. Review strategy and implementation.`,
          potential_impact: (data.expected_monthly - data.current_revenue)
        });
      }

      // Low conversion rates
      if (data.performance_metrics.conversion_rate < 0.02 && streamId !== 'youtube_ad_revenue') {
        optimizations.push({
          stream: streamId,
          type: 'low_conversion',
          priority: 'medium',
          recommendation: `Improve ${data.name} conversion rate through better targeting or offers.`,
          potential_impact: data.current_revenue * 0.5 // 50% improvement potential
        });
      }

      // Planned streams ready to activate
      if (data.status === 'planned') {
        optimizations.push({
          stream: streamId,
          type: 'activation_opportunity',
          priority: 'medium',
          recommendation: `Activate ${data.name} to diversify revenue streams.`,
          potential_impact: data.expected_monthly
        });
      }
    });

    // Sort by potential impact
    return optimizations.sort((a, b) => b.potential_impact - a.potential_impact);
  }

  // Check for alerts
  checkAlerts(streams, summary) {
    const alerts = [];

    // Revenue drop alerts
    Object.entries(streams).forEach(([streamId, data]) => {
      if (data.current_revenue < data.expected_monthly * (1 - this.dashboardConfig.alert_thresholds.revenue_drop)) {
        alerts.push({
          type: 'revenue_drop',
          severity: 'warning',
          stream: streamId,
          message: `${data.name} revenue dropped ${((1 - data.current_revenue / data.expected_monthly) * 100).toFixed(0)}% below target`,
          action_required: true
        });
      }
    });

    // Low diversification alert
    if (summary.diversification_index < 0.6) {
      alerts.push({
        type: 'low_diversification',
        severity: 'info',
        message: `Revenue is concentrated in few streams (${(summary.diversification_index * 100).toFixed(0)}% diversification)`,
        action_required: false
      });
    }

    // Growth rate alerts
    if (summary.growth_rate < 0.05) {
      alerts.push({
        type: 'low_growth',
        severity: 'warning',
        message: `Overall growth rate is below 5% (${(summary.growth_rate * 100).toFixed(1)}%)`,
        action_required: true
      });
    }

    return alerts;
  }

  // Generate HTML dashboard
  generateHTMLDashboard(report) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Revenue Dashboard - DPGen Pipeline</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .dashboard { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #2c3e50; }
        .metric-label { color: #7f8c8d; margin-top: 5px; }
        .chart-container { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .optimizations { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        .stream-table { width: 100%; border-collapse: collapse; }
        .stream-table th, .stream-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .stream-table th { background: #f8f9fa; }
        .status-active { color: #28a745; font-weight: bold; }
        .status-planned { color: #ffc107; font-weight: bold; }
        .status-future { color: #6c757d; font-weight: bold; }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>📊 Revenue Dashboard</h1>
            <p>Generated: ${new Date(report.generated_at).toLocaleString()}</p>
            <p>Timeframe: ${report.timeframe}</p>
        </div>

        <div class="metrics">
            <div class="metric-card">
                <div class="metric-value">$${report.summary.total_revenue.toLocaleString()}</div>
                <div class="metric-label">Total Monthly Revenue</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.active_streams}</div>
                <div class="metric-label">Active Revenue Streams</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${(report.summary.growth_rate * 100).toFixed(1)}%</div>
                <div class="metric-label">Average Growth Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${(report.summary.diversification_index * 100).toFixed(0)}%</div>
                <div class="metric-label">Revenue Diversification</div>
            </div>
        </div>

        ${report.alerts.length > 0 ? `
        <div class="chart-container">
            <h3>🚨 Alerts</h3>
            ${report.alerts.map(alert => `
                <div class="alert alert-${alert.severity}">
                    <strong>${alert.type.toUpperCase()}:</strong> ${alert.message}
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="chart-container">
            <h3>💰 Revenue by Stream</h3>
            <canvas id="revenueChart" width="400" height="200"></canvas>
        </div>

        <div class="chart-container">
            <h3>📈 Revenue Streams Performance</h3>
            <table class="stream-table">
                <thead>
                    <tr>
                        <th>Stream</th>
                        <th>Status</th>
                        <th>Current Revenue</th>
                        <th>Target</th>
                        <th>Growth Rate</th>
                        <th>Performance</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(report.streams).map(([id, stream]) => `
                        <tr>
                            <td>${stream.name}</td>
                            <td><span class="status-${stream.status}">${stream.status.toUpperCase()}</span></td>
                            <td>$${stream.current_revenue.toLocaleString()}</td>
                            <td>$${stream.expected_monthly.toLocaleString()}</td>
                            <td>${(stream.performance_metrics.growth_rate * 100).toFixed(1)}%</td>
                            <td>${((stream.current_revenue / stream.expected_monthly) * 100).toFixed(0)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="optimizations">
            <h3>🚀 Optimization Opportunities</h3>
            ${report.optimizations.slice(0, 5).map((opt, i) => `
                <div style="padding: 15px; border-left: 4px solid ${opt.priority === 'high' ? '#e74c3c' : '#f39c12'}; margin-bottom: 10px; background: #f8f9fa;">
                    <strong>${opt.stream}:</strong> ${opt.recommendation}
                    <br><small>Potential Impact: +$${opt.potential_impact.toLocaleString()}/month</small>
                </div>
            `).join('')}
        </div>

        <div class="chart-container">
            <h3>📊 Revenue Projections</h3>
            <canvas id="projectionChart" width="400" height="200"></canvas>
        </div>
    </div>

    <script>
        // Revenue by Stream Chart
        const revenueCtx = document.getElementById('revenueChart').getContext('2d');
        new Chart(revenueCtx, {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(Object.values(report.streams).map(s => s.name))},
                datasets: [{
                    data: ${JSON.stringify(Object.values(report.streams).map(s => s.current_revenue))},
                    backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

        // Projections Chart
        const projCtx = document.getElementById('projectionChart').getContext('2d');
        new Chart(projCtx, {
            type: 'bar',
            data: {
                labels: ['Current Month', 'Next Month', 'Next Quarter', 'Next Year'],
                datasets: [{
                    label: 'Revenue',
                    data: [${report.summary.total_revenue}, ${report.projections.next_month.toFixed(0)}, ${report.projections.next_quarter.toFixed(0)}, ${report.projections.next_year.toFixed(0)}],
                    backgroundColor: '#3498db'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>
    `;

    return html;
  }

  // Save dashboard to file
  saveDashboard(report, format = 'html') {
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'html') {
      const html = this.generateHTMLDashboard(report);
      const filename = `revenue_dashboard_${timestamp}.html`;
      fs.writeFileSync(filename, html);
      console.log(`\n📄 Dashboard saved: ${filename}`);
      return filename;
    } else {
      const filename = `revenue_report_${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved: ${filename}`);
      return filename;
    }
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const timeframe = process.argv[3] || '30d';

  const dashboard = new RevenueDashboard({
    projectId: 'content-pipeline-7dd4f',
    serviceAccountPath: path.join(__dirname, '../config/service_account.json')
  });

  await dashboard.setupClients();

  switch (command) {
    case 'generate':
      const report = await dashboard.generateRevenueReport(timeframe);
      
      // Save both formats
      dashboard.saveDashboard(report, 'html');
      dashboard.saveDashboard(report, 'json');
      
      // Show key optimizations
      if (report.optimizations.length > 0) {
        console.log('\n🚀 Top Optimization Opportunities:');
        report.optimizations.slice(0, 3).forEach((opt, i) => {
          console.log(`${i + 1}. ${opt.recommendation} (+$${opt.potential_impact.toLocaleString()}/month)`);
        });
      }

      console.log(`\n💰 Revenue Potential: $${report.projections.next_year.toLocaleString()}/year`);
      break;

    case 'live':
      console.log('📊 Starting live dashboard monitor...');
      console.log('   Refresh interval: 1 hour');
      console.log('   Press Ctrl+C to stop');
      
      setInterval(async () => {
        const report = await dashboard.generateRevenueReport();
        dashboard.saveDashboard(report, 'html');
        console.log(`Updated: ${new Date().toLocaleTimeString()}`);
      }, 3600000); // Update every hour
      break;

    default:
      console.log('Multi-Revenue Stream Dashboard');
      console.log('==============================');
      console.log('');
      console.log('Usage:');
      console.log('  node revenue-dashboard.js generate [timeframe]');
      console.log('  node revenue-dashboard.js live');
      console.log('');
      console.log('Examples:');
      console.log('  node revenue-dashboard.js generate 30d');
      console.log('  node revenue-dashboard.js generate 7d');
      console.log('  node revenue-dashboard.js live');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Dashboard generation failed:', error.message);
    process.exit(1);
  });
}

module.exports = RevenueDashboard;