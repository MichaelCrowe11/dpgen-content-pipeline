#!/usr/bin/env node

// Affiliate Marketing Integration Engine
// Automatically matches products with content and generates affiliate links

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AffiliateEngine {
  constructor(config) {
    this.config = config;
    this.affiliatePrograms = this.loadAffiliatePrograms();
    this.productDatabase = this.loadProductDatabase();
    this.conversionTracking = new Map();
  }

  // Load affiliate program configurations
  loadAffiliatePrograms() {
    return {
      amazon: {
        name: 'Amazon Associates',
        base_url: 'https://amazon.com',
        tracking_id: 'dpgen-20', // Replace with actual ID
        commission_rate: 0.04, // 4% average
        cookie_duration: 24, // hours
        supported_categories: ['electronics', 'books', 'tools', 'software'],
        link_format: 'https://amazon.com/dp/{asin}?tag=dpgen-20'
      },
      bestbuy: {
        name: 'Best Buy Affiliate',
        base_url: 'https://bestbuy.com',
        tracking_id: 'dpgen-bestbuy',
        commission_rate: 0.02, // 2%
        cookie_duration: 7 * 24, // 7 days
        supported_categories: ['electronics', 'gaming', 'tech'],
        link_format: 'https://bestbuy.7tiv.net/c/dpgen/{sku}'
      },
      newegg: {
        name: 'Newegg Affiliate',
        base_url: 'https://newegg.com',
        tracking_id: 'dpgen-newegg',
        commission_rate: 0.025, // 2.5%
        cookie_duration: 3 * 24, // 3 days
        supported_categories: ['pc_components', 'electronics'],
        link_format: 'https://newegg.com/p/{item_number}?cm_mmc=dpgen'
      },
      brilliant: {
        name: 'Brilliant Learning',
        base_url: 'https://brilliant.org',
        tracking_id: 'dpgen-brilliant',
        commission_rate: 0.30, // 30% on subscriptions
        cookie_duration: 30 * 24, // 30 days
        supported_categories: ['education', 'science', 'math'],
        link_format: 'https://brilliant.org/dpgen/'
      }
    };
  }

  // Load product database with affiliate info
  loadProductDatabase() {
    return {
      'nvidia_rtx_4090': {
        name: 'NVIDIA RTX 4090',
        category: 'electronics',
        price_range: [1500, 2000],
        keywords: ['rtx', '4090', 'nvidia', 'gpu', 'graphics'],
        affiliate_links: {
          amazon: { asin: 'B0BGB1TGMK', price: 1599 },
          bestbuy: { sku: '6521432', price: 1649 },
          newegg: { item_number: '9SIAD8KEHX3456', price: 1579 }
        },
        commission_potential: 64, // $1600 * 4%
        search_volume: 'high'
      },
      'amd_ryzen_7950x': {
        name: 'AMD Ryzen 9 7950X',
        category: 'electronics',
        price_range: [600, 800],
        keywords: ['amd', 'ryzen', '7950x', 'cpu', 'processor'],
        affiliate_links: {
          amazon: { asin: 'B0BBX6BQHX', price: 699 },
          newegg: { item_number: 'N82E16819113771', price: 679 }
        },
        commission_potential: 28,
        search_volume: 'medium'
      },
      'brilliant_annual': {
        name: 'Brilliant Premium Annual',
        category: 'education',
        price_range: [149, 149],
        keywords: ['brilliant', 'learning', 'math', 'science', 'course'],
        affiliate_links: {
          brilliant: { price: 149 }
        },
        commission_potential: 45, // 30% of $149
        search_volume: 'medium',
        recurring: true
      },
      'telescope_celestron': {
        name: 'Celestron NexStar 8SE',
        category: 'electronics',
        price_range: [1200, 1400],
        keywords: ['telescope', 'celestron', 'nexstar', 'astronomy', 'stargazing'],
        affiliate_links: {
          amazon: { asin: 'B000GUFOBO', price: 1299 },
          bestbuy: { sku: '6418503', price: 1349 }
        },
        commission_potential: 52,
        search_volume: 'low'
      }
    };
  }

  // Find relevant products for content
  async findAffiliateProducts(content) {
    console.log('🔗 Finding affiliate opportunities...\n');

    const opportunities = {
      content_id: content.session_id,
      channel: content.channel_slug,
      topic: content.topic,
      products: [],
      estimated_revenue: 0,
      integration_strategy: '',
      links_generated: []
    };

    try {
      const contentKeywords = this.extractKeywords(content.topic);
      
      // Match products to content
      for (const [productId, product] of Object.entries(this.productDatabase)) {
        const relevance = this.calculateRelevance(contentKeywords, product.keywords);
        
        if (relevance > 0.5) {
          const match = {
            product_id: productId,
            name: product.name,
            relevance_score: relevance,
            category: product.category,
            commission_potential: product.commission_potential,
            best_affiliate: this.findBestAffiliate(product),
            integration_type: this.suggestIntegration(product, content),
            estimated_conversions: this.estimateConversions(product, content)
          };

          opportunities.products.push(match);
        }
      }

      // Sort by revenue potential
      opportunities.products.sort((a, b) => 
        (b.commission_potential * b.estimated_conversions) - 
        (a.commission_potential * a.estimated_conversions)
      );

      // Generate affiliate links
      for (const product of opportunities.products.slice(0, 5)) {
        const links = this.generateAffiliateLinks(product);
        opportunities.links_generated.push(...links);
      }

      // Calculate estimated revenue
      opportunities.estimated_revenue = opportunities.products
        .slice(0, 3)
        .reduce((sum, p) => sum + (p.commission_potential * p.estimated_conversions), 0);

      opportunities.integration_strategy = this.generateIntegrationStrategy(opportunities.products);

      console.log(`📦 Found ${opportunities.products.length} relevant products`);
      console.log(`💰 Estimated affiliate revenue: $${opportunities.estimated_revenue.toFixed(2)}`);

      return opportunities;

    } catch (error) {
      console.error('❌ Affiliate matching failed:', error.message);
      opportunities.error = error.message;
      return opportunities;
    }
  }

  // Extract keywords from content topic
  extractKeywords(topic) {
    return topic.toLowerCase()
      .split(/[\s,.-]+/)
      .filter(word => word.length > 2)
      .map(word => word.replace(/[^a-z0-9]/g, ''));
  }

  // Calculate product relevance to content
  calculateRelevance(contentKeywords, productKeywords) {
    let matches = 0;
    
    for (const contentWord of contentKeywords) {
      for (const productWord of productKeywords) {
        if (contentWord.includes(productWord) || productWord.includes(contentWord)) {
          matches++;
        }
      }
    }

    return Math.min(matches / Math.max(contentKeywords.length, productKeywords.length), 1.0);
  }

  // Find best affiliate program for product
  findBestAffiliate(product) {
    let bestAffiliate = null;
    let bestCommission = 0;

    for (const [programName, programData] of Object.entries(this.affiliatePrograms)) {
      if (product.affiliate_links[programName] && programData.supported_categories.includes(product.category)) {
        const potentialCommission = product.affiliate_links[programName].price * programData.commission_rate;
        
        if (potentialCommission > bestCommission) {
          bestCommission = potentialCommission;
          bestAffiliate = {
            program: programName,
            commission: potentialCommission,
            cookie_duration: programData.cookie_duration
          };
        }
      }
    }

    return bestAffiliate;
  }

  // Suggest integration method
  suggestIntegration(product, content) {
    if (product.category === 'education') {
      return 'educational_recommendation';
    } else if (product.price_range[0] > 1000) {
      return 'detailed_review_segment';
    } else if (content.topic.includes('review') || content.topic.includes('comparison')) {
      return 'comparison_highlight';
    } else {
      return 'contextual_mention';
    }
  }

  // Estimate conversion rate
  estimateConversions(product, content) {
    let baseRate = 0.02; // 2% base conversion rate

    // Adjust for product price
    if (product.price_range[0] < 100) baseRate *= 1.5;
    else if (product.price_range[0] > 1000) baseRate *= 0.7;

    // Adjust for search volume
    if (product.search_volume === 'high') baseRate *= 1.3;
    else if (product.search_volume === 'low') baseRate *= 0.8;

    // Adjust for content type
    if (content.topic.includes('review') || content.topic.includes('best')) {
      baseRate *= 2.0; // Reviews convert better
    }

    return baseRate;
  }

  // Generate trackable affiliate links
  generateAffiliateLinks(product) {
    const links = [];
    const productData = this.productDatabase[product.product_id];

    for (const [programName, linkData] of Object.entries(productData.affiliate_links)) {
      const program = this.affiliatePrograms[programName];
      if (!program) continue;

      const trackingCode = this.generateTrackingCode(product.product_id, programName);
      
      let affiliateUrl;
      if (programName === 'amazon') {
        affiliateUrl = program.link_format.replace('{asin}', linkData.asin);
      } else if (programName === 'bestbuy') {
        affiliateUrl = program.link_format.replace('{sku}', linkData.sku);
      } else if (programName === 'newegg') {
        affiliateUrl = program.link_format.replace('{item_number}', linkData.item_number);
      } else {
        affiliateUrl = program.link_format;
      }

      // Add tracking parameters
      affiliateUrl += (affiliateUrl.includes('?') ? '&' : '?') + `utm_source=dpgen&utm_campaign=${trackingCode}`;

      links.push({
        product_id: product.product_id,
        program: programName,
        url: affiliateUrl,
        tracking_code: trackingCode,
        commission_rate: program.commission_rate,
        expected_commission: linkData.price * program.commission_rate
      });

      // Store for tracking
      this.conversionTracking.set(trackingCode, {
        product_id: product.product_id,
        program: programName,
        generated_at: new Date(),
        price: linkData.price
      });
    }

    return links;
  }

  // Generate unique tracking code
  generateTrackingCode(productId, program) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${productId}_${program}_${timestamp}`).digest('hex').substr(0, 8);
    return `${productId}_${program}_${hash}`;
  }

  // Generate integration strategy
  generateIntegrationStrategy(products) {
    if (products.length === 0) return 'No affiliate opportunities found';

    const topProduct = products[0];
    
    switch (topProduct.integration_type) {
      case 'educational_recommendation':
        return 'Integrate as learning resource recommendation in conclusion';
      case 'detailed_review_segment':
        return 'Dedicated 30-second product spotlight with pros/cons';
      case 'comparison_highlight':
        return 'Include in comparison table or feature breakdown';
      default:
        return 'Natural mention during relevant topic discussion';
    }
  }

  // Create affiliate disclosure
  generateDisclosure() {
    return `
**Affiliate Disclosure**: This content contains affiliate links. When you click and purchase through these links, we may earn a small commission at no additional cost to you. This helps support our content creation while recommending products we genuinely believe in.

All prices and availability are accurate as of recording and may change. We only recommend products that align with our content and values.
    `.trim();
  }

  // Generate video script integration
  generateScriptIntegration(opportunities) {
    const scripts = [];
    
    for (const product of opportunities.products.slice(0, 3)) {
      const integration = this.generateProductIntegration(product);
      scripts.push(integration);
    }

    return scripts;
  }

  // Generate individual product integration script
  generateProductIntegration(product) {
    const productData = this.productDatabase[product.product_id];
    
    switch (product.integration_type) {
      case 'educational_recommendation':
        return {
          timing: 'conclusion',
          script: `Speaking of learning more about this topic, I've been using ${productData.name} and it's been incredibly helpful for diving deeper into these concepts. There's a link in the description if you want to check it out.`,
          cta: 'Check out the link in the description'
        };
        
      case 'detailed_review_segment':
        return {
          timing: 'mid_content',
          script: `Now, if you're thinking about actually getting into this, the ${productData.name} is what I'd recommend. It's around $${productData.price_range[0]} and here's why it stands out... [insert 2-3 key benefits]. I'll put a link below with current pricing.`,
          cta: 'Current pricing link in description'
        };
        
      case 'comparison_highlight':
        return {
          timing: 'comparison_section',
          script: `For this comparison, I'm using the ${productData.name} as our baseline. It's a solid choice at around $${productData.price_range[0]}. Link below if you want to check current deals.`,
          cta: 'Check current deals below'
        };
        
      default:
        return {
          timing: 'natural_mention',
          script: `This is actually really similar to what you see with the ${productData.name}...`,
          cta: 'More details in description'
        };
    }
  }

  // Track affiliate performance
  async trackConversion(trackingCode, conversionData) {
    const trackingInfo = this.conversionTracking.get(trackingCode);
    if (!trackingInfo) return null;

    const conversion = {
      tracking_code: trackingCode,
      product_id: trackingInfo.product_id,
      program: trackingInfo.program,
      conversion_value: conversionData.orderValue || trackingInfo.price,
      commission_earned: (conversionData.orderValue || trackingInfo.price) * this.affiliatePrograms[trackingInfo.program].commission_rate,
      converted_at: new Date(),
      time_to_conversion: new Date() - trackingInfo.generated_at
    };

    console.log(`💰 Conversion tracked: $${conversion.commission_earned.toFixed(2)} from ${conversion.product_id}`);
    return conversion;
  }

  // Generate performance report
  generatePerformanceReport(timeframe = '30d') {
    const report = {
      timeframe,
      total_clicks: 0,
      total_conversions: 0,
      total_revenue: 0,
      conversion_rate: 0,
      top_products: [],
      top_programs: []
    };

    // In production, this would query actual tracking data
    // For now, provide sample performance
    report.total_clicks = 1250;
    report.total_conversions = 23;
    report.total_revenue = 487.50;
    report.conversion_rate = (report.total_conversions / report.total_clicks) * 100;

    return report;
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const contentFile = process.argv[3];

  const affiliateEngine = new AffiliateEngine({
    projectId: 'content-pipeline-7dd4f'
  });

  switch (command) {
    case 'match':
      if (!contentFile) {
        console.error('Usage: node affiliate-engine.js match <content-file.json>');
        process.exit(1);
      }

      const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      const opportunities = await affiliateEngine.findAffiliateProducts(content);

      console.log('\n🔗 Affiliate Opportunities:');
      opportunities.products.forEach((product, i) => {
        console.log(`\n${i + 1}. ${product.name}`);
        console.log(`   Relevance: ${(product.relevance_score * 100).toFixed(0)}%`);
        console.log(`   Commission: $${product.commission_potential.toFixed(2)}`);
        console.log(`   Integration: ${product.integration_type}`);
      });

      // Generate script integrations
      const scripts = affiliateEngine.generateScriptIntegration(opportunities);
      console.log('\n📝 Script Integrations:');
      scripts.forEach((script, i) => {
        console.log(`\n${i + 1}. ${script.timing}:`);
        console.log(`   "${script.script}"`);
      });

      // Generate disclosure
      console.log('\n📋 Affiliate Disclosure:');
      console.log(affiliateEngine.generateDisclosure());

      // Save opportunities
      const outputFile = contentFile.replace('.json', '_affiliates.json');
      fs.writeFileSync(outputFile, JSON.stringify({
        opportunities,
        scripts,
        disclosure: affiliateEngine.generateDisclosure()
      }, null, 2));

      console.log(`\n📄 Affiliate plan saved: ${outputFile}`);
      break;

    case 'report':
      const report = affiliateEngine.generatePerformanceReport();
      console.log('\n📊 Affiliate Performance Report:');
      console.log(`Clicks: ${report.total_clicks.toLocaleString()}`);
      console.log(`Conversions: ${report.total_conversions}`);
      console.log(`Revenue: $${report.total_revenue.toFixed(2)}`);
      console.log(`Conversion Rate: ${report.conversion_rate.toFixed(2)}%`);
      break;

    default:
      console.log('Affiliate Marketing Engine');
      console.log('==========================');
      console.log('');
      console.log('Usage:');
      console.log('  node affiliate-engine.js match <content-file.json>');
      console.log('  node affiliate-engine.js report');
      console.log('');
      console.log('Example:');
      console.log('  node affiliate-engine.js match ../test-content.json');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Affiliate engine failed:', error.message);
    process.exit(1);
  });
}

module.exports = AffiliateEngine;