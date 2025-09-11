#!/usr/bin/env node

// Automated Sponsorship Matching System
// Connects content with relevant brands and negotiates rates

const { google } = require('googleapis');
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs');
const path = require('path');

class SponsorshipMatcher {
  constructor(config) {
    this.config = config;
    this.setupClients();
    this.brandDatabase = this.loadBrandDatabase();
    this.rateCard = this.loadRateCard();
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

  // Load brand database with contact info and preferences
  loadBrandDatabase() {
    return {
      'tech_hardware': [
        {
          name: 'NVIDIA',
          contact: 'partnerships@nvidia.com',
          budget_range: [5000, 50000],
          preferred_topics: ['gpu', 'ai', 'gaming', 'mining'],
          cpm_willingness: 15.0,
          requirements: {
            min_views: 50000,
            min_subscriber_count: 10000,
            content_rating: 'family_friendly'
          }
        },
        {
          name: 'AMD',
          contact: 'marketing@amd.com',
          budget_range: [3000, 30000],
          preferred_topics: ['cpu', 'gpu', 'gaming', 'workstation'],
          cpm_willingness: 12.0,
          requirements: {
            min_views: 25000,
            min_subscriber_count: 5000,
            content_rating: 'family_friendly'
          }
        },
        {
          name: 'Intel',
          contact: 'creator-program@intel.com',
          budget_range: [2000, 25000],
          preferred_topics: ['cpu', 'laptop', 'ai', 'datacenter'],
          cpm_willingness: 10.0,
          requirements: {
            min_views: 30000,
            min_subscriber_count: 7500,
            content_rating: 'family_friendly'
          }
        }
      ],
      'space_astronomy': [
        {
          name: 'Celestron',
          contact: 'marketing@celestron.com',
          budget_range: [1000, 10000],
          preferred_topics: ['telescope', 'astronomy', 'stargazing'],
          cpm_willingness: 8.0,
          requirements: {
            min_views: 15000,
            min_subscriber_count: 3000,
            content_rating: 'family_friendly'
          }
        },
        {
          name: 'SpaceX Merch',
          contact: 'partnerships@spacex.com',
          budget_range: [500, 5000],
          preferred_topics: ['spacex', 'rocket', 'mars', 'space'],
          cpm_willingness: 12.0,
          requirements: {
            min_views: 20000,
            min_subscriber_count: 5000,
            content_rating: 'family_friendly'
          }
        }
      ],
      'science_education': [
        {
          name: 'Brilliant',
          contact: 'creators@brilliant.org',
          budget_range: [2000, 20000],
          preferred_topics: ['math', 'science', 'physics', 'learning'],
          cpm_willingness: 18.0,
          requirements: {
            min_views: 10000,
            min_subscriber_count: 2000,
            content_rating: 'educational'
          }
        },
        {
          name: 'MasterClass',
          contact: 'partnerships@masterclass.com',
          budget_range: [3000, 30000],
          preferred_topics: ['learning', 'skills', 'education', 'career'],
          cpm_willingness: 20.0,
          requirements: {
            min_views: 25000,
            min_subscriber_count: 5000,
            content_rating: 'educational'
          }
        }
      ]
    };
  }

  // Load rate card based on channel performance
  loadRateCard() {
    return {
      'circuit-myth': {
        base_rate: 2000,
        cpm: 8.50,
        engagement_multiplier: 1.2,
        niche_premium: 1.5 // Tech content premium
      },
      'space-minute': {
        base_rate: 1500,
        cpm: 7.00,
        engagement_multiplier: 1.1,
        niche_premium: 1.3
      },
      'zero-view-science': {
        base_rate: 1200,
        cpm: 6.50,
        engagement_multiplier: 1.3, // High engagement
        niche_premium: 1.4 // Education premium
      },
      'default': {
        base_rate: 1000,
        cpm: 5.00,
        engagement_multiplier: 1.0,
        niche_premium: 1.0
      }
    };
  }

  // Find sponsorship opportunities for content
  async findSponsorships(content, channelMetrics) {
    console.log('🤝 Finding sponsorship opportunities...\n');

    const opportunities = {
      content_id: content.session_id,
      channel: content.channel_slug,
      topic: content.topic,
      matches: [],
      estimated_revenue: 0,
      recommended_approach: '',
      negotiation_points: []
    };

    try {
      // Analyze content for brand alignment
      const contentCategories = this.categorizeContent(content);
      
      // Get channel performance metrics
      const performance = await this.getChannelPerformance(content.channel_slug);
      
      // Find matching brands
      for (const category of contentCategories) {
        if (this.brandDatabase[category]) {
          for (const brand of this.brandDatabase[category]) {
            const match = await this.evaluateMatch(brand, content, performance, channelMetrics);
            if (match.score > 0.6) {
              opportunities.matches.push(match);
            }
          }
        }
      }

      // Sort by revenue potential
      opportunities.matches.sort((a, b) => b.estimated_payment - a.estimated_payment);
      
      // Calculate total estimated revenue
      opportunities.estimated_revenue = opportunities.matches
        .slice(0, 3) // Top 3 matches
        .reduce((sum, match) => sum + match.estimated_payment, 0);

      // Generate negotiation strategy
      opportunities.recommended_approach = this.generateNegotiationStrategy(opportunities.matches);
      opportunities.negotiation_points = this.generateNegotiationPoints(content, performance);

      console.log(`📊 Found ${opportunities.matches.length} potential sponsors`);
      console.log(`💰 Estimated revenue: $${opportunities.estimated_revenue.toLocaleString()}`);

      return opportunities;

    } catch (error) {
      console.error('❌ Sponsorship matching failed:', error.message);
      opportunities.error = error.message;
      return opportunities;
    }
  }

  // Categorize content for brand matching
  categorizeContent(content) {
    const topic = content.topic.toLowerCase();
    const categories = [];

    // Tech hardware
    if (/gpu|cpu|graphics|nvidia|amd|intel|benchmark|review/i.test(topic)) {
      categories.push('tech_hardware');
    }

    // Space/astronomy
    if (/space|rocket|planet|star|telescope|nasa|spacex/i.test(topic)) {
      categories.push('space_astronomy');
    }

    // Science/education
    if (/science|physics|chemistry|experiment|learn|education/i.test(topic)) {
      categories.push('science_education');
    }

    return categories.length > 0 ? categories : ['general'];
  }

  // Get channel performance from BigQuery
  async getChannelPerformance(channelSlug) {
    try {
      const query = `
        SELECT 
          AVG(views) as avg_views,
          AVG(likes) as avg_likes,
          AVG(comments) as avg_comments,
          COUNT(*) as video_count,
          AVG(engagement_rate) as avg_engagement
        FROM \`${this.config.projectId}.dpgen_analytics.content_metrics\`
        WHERE channel_slug = '${channelSlug}'
          AND DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      `;

      const [rows] = await this.bigquery.query(query);
      
      if (rows.length > 0) {
        return {
          avg_views: rows[0].avg_views || 10000,
          avg_likes: rows[0].avg_likes || 500,
          avg_comments: rows[0].avg_comments || 50,
          video_count: rows[0].video_count || 10,
          engagement_rate: rows[0].avg_engagement || 0.05
        };
      }
    } catch (error) {
      console.log('   Using estimated performance metrics');
    }

    // Fallback estimates
    return {
      avg_views: 15000,
      avg_likes: 750,
      avg_comments: 75,
      video_count: 12,
      engagement_rate: 0.06
    };
  }

  // Evaluate brand-content match
  async evaluateMatch(brand, content, performance, channelMetrics) {
    const match = {
      brand: brand.name,
      contact: brand.contact,
      score: 0,
      reasons: [],
      estimated_payment: 0,
      integration_type: 'sponsored_segment',
      requirements_met: true,
      negotiation_leverage: []
    };

    // Check topic alignment
    const topicMatch = brand.preferred_topics.some(topic => 
      content.topic.toLowerCase().includes(topic)
    );
    
    if (topicMatch) {
      match.score += 0.4;
      match.reasons.push('Strong topic alignment');
    }

    // Check performance requirements
    if (performance.avg_views >= brand.requirements.min_views) {
      match.score += 0.3;
      match.reasons.push('Meets view requirements');
      match.negotiation_leverage.push(`Exceeds minimum views by ${((performance.avg_views / brand.requirements.min_views - 1) * 100).toFixed(0)}%`);
    } else {
      match.requirements_met = false;
      match.reasons.push(`Below minimum views (${performance.avg_views.toLocaleString()} < ${brand.requirements.min_views.toLocaleString()})`);
    }

    // Check engagement quality
    if (performance.engagement_rate > 0.05) {
      match.score += 0.2;
      match.reasons.push('High engagement rate');
      match.negotiation_leverage.push(`${(performance.engagement_rate * 100).toFixed(1)}% engagement rate`);
    }

    // Content quality bonus
    if (content.quality_score && content.quality_score > 0.8) {
      match.score += 0.1;
      match.reasons.push('High content quality');
    }

    // Calculate estimated payment
    if (match.requirements_met) {
      const rateCard = this.rateCard[content.channel_slug] || this.rateCard.default;
      
      // Base rate + CPM calculation
      const cpmPayment = (performance.avg_views / 1000) * brand.cpm_willingness;
      const basePayment = rateCard.base_rate * rateCard.niche_premium;
      
      match.estimated_payment = Math.max(cpmPayment, basePayment);
      
      // Engagement bonus
      if (performance.engagement_rate > 0.05) {
        match.estimated_payment *= rateCard.engagement_multiplier;
      }
    }

    return match;
  }

  // Generate negotiation strategy
  generateNegotiationStrategy(matches) {
    if (matches.length === 0) return 'No viable sponsors found';
    
    const topMatch = matches[0];
    
    if (matches.length === 1) {
      return `Direct approach to ${topMatch.brand} - single sponsor opportunity`;
    } else if (matches.length >= 3) {
      return `Multi-sponsor auction - leverage competition between ${matches.slice(0, 3).map(m => m.brand).join(', ')}`;
    } else {
      return `Two-sponsor negotiation between ${matches[0].brand} and ${matches[1].brand}`;
    }
  }

  // Generate specific negotiation points
  generateNegotiationPoints(content, performance) {
    const points = [];

    if (performance.engagement_rate > 0.06) {
      points.push(`High engagement rate: ${(performance.engagement_rate * 100).toFixed(1)}%`);
    }

    if (performance.avg_views > 20000) {
      points.push(`Strong viewership: ${performance.avg_views.toLocaleString()} average views`);
    }

    if (content.viral_score && content.viral_score > 0.8) {
      points.push(`Viral potential: ${(content.viral_score * 100).toFixed(0)}% prediction score`);
    }

    points.push('Integrated, non-intrusive product placement');
    points.push('Cross-platform distribution (YouTube, TikTok, Instagram)');
    points.push('Analytics reporting and performance guarantees');

    return points;
  }

  // Auto-generate sponsorship email outreach
  generateOutreach(opportunity) {
    const topMatch = opportunity.matches[0];
    if (!topMatch) return null;

    const template = `
Subject: Partnership Opportunity - ${opportunity.channel} Content Collaboration

Hi ${topMatch.brand} Team,

I hope this email finds you well. I'm reaching out regarding a potential partnership opportunity for our ${opportunity.channel} channel.

**Content Details:**
- Topic: "${opportunity.topic}"
- Channel: ${opportunity.channel}
- Estimated Views: ${topMatch.estimated_payment > 0 ? '20,000+' : 'TBD'}
- Target Audience: Tech enthusiasts and early adopters

**Why This Partnership Makes Sense:**
${topMatch.reasons.map(reason => `• ${reason}`).join('\n')}

**Our Offer:**
• Integrated product demonstration (30-60 seconds)
• Authentic, editorial-style mention
• Cross-platform distribution
• Detailed analytics reporting

**Negotiation Points:**
${opportunity.negotiation_points.map(point => `• ${point}`).join('\n')}

We're looking at a rate of $${topMatch.estimated_payment.toLocaleString()} for this integration, which reflects our channel's strong performance metrics and audience engagement.

Would you be available for a brief call this week to discuss how we can create value for ${topMatch.brand} while providing genuine value to our audience?

Best regards,
[Your Name]
Content Partnership Manager
${opportunity.channel}

P.S. Happy to provide detailed channel analytics and previous campaign performance data upon request.
    `;

    return template.trim();
  }

  // Track sponsorship performance
  async trackSponsorshipROI(sponsorshipId, metrics) {
    const tracking = {
      sponsorship_id: sponsorshipId,
      timestamp: new Date().toISOString(),
      performance: metrics,
      roi_analysis: {},
      recommendations: []
    };

    // Calculate sponsor ROI
    if (metrics.sponsor_payment && metrics.conversions) {
      tracking.roi_analysis = {
        cost_per_conversion: metrics.sponsor_payment / metrics.conversions,
        estimated_sponsor_revenue: metrics.conversions * (metrics.average_order_value || 100),
        sponsor_roi: ((metrics.conversions * (metrics.average_order_value || 100)) / metrics.sponsor_payment - 1) * 100
      };

      // Generate recommendations
      if (tracking.roi_analysis.sponsor_roi > 200) {
        tracking.recommendations.push('Excellent ROI - propose rate increase for future campaigns');
      } else if (tracking.roi_analysis.sponsor_roi < 50) {
        tracking.recommendations.push('Low ROI - improve integration or adjust rates');
      }
    }

    return tracking;
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const contentFile = process.argv[3];

  const matcher = new SponsorshipMatcher({
    projectId: 'content-pipeline-7dd4f',
    serviceAccountPath: path.join(__dirname, '../config/service_account.json')
  });

  await matcher.setupClients();

  switch (command) {
    case 'find':
      if (!contentFile) {
        console.error('Usage: node sponsorship-matcher.js find <content-file.json>');
        process.exit(1);
      }

      const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      const opportunities = await matcher.findSponsorships(content, {});

      console.log('\n📧 Sponsorship Opportunities:');
      opportunities.matches.forEach((match, i) => {
        console.log(`\n${i + 1}. ${match.brand}`);
        console.log(`   Payment: $${match.estimated_payment.toLocaleString()}`);
        console.log(`   Score: ${(match.score * 100).toFixed(0)}%`);
        console.log(`   Contact: ${match.contact}`);
      });

      // Generate outreach email
      if (opportunities.matches.length > 0) {
        const outreach = matcher.generateOutreach(opportunities);
        fs.writeFileSync('sponsorship_outreach.txt', outreach);
        console.log('\n📧 Outreach email saved: sponsorship_outreach.txt');
      }

      // Save opportunities
      const outputFile = contentFile.replace('.json', '_sponsorships.json');
      fs.writeFileSync(outputFile, JSON.stringify(opportunities, null, 2));
      console.log(`📄 Opportunities saved: ${outputFile}`);
      break;

    case 'track':
      console.log('Sponsorship tracking coming soon...');
      break;

    default:
      console.log('Automated Sponsorship Matcher');
      console.log('=============================');
      console.log('');
      console.log('Usage:');
      console.log('  node sponsorship-matcher.js find <content-file.json>');
      console.log('  node sponsorship-matcher.js track <sponsorship-id>');
      console.log('');
      console.log('Example:');
      console.log('  node sponsorship-matcher.js find ../test-content.json');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Sponsorship matching failed:', error.message);
    process.exit(1);
  });
}

module.exports = SponsorshipMatcher;