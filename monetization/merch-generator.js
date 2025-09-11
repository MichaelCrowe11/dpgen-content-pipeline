#!/usr/bin/env node

// Merchandise Generation System
// Automatically creates and lists merchandise based on viral content

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class MerchGenerator {
  constructor(config) {
    this.config = config;
    this.printProviders = this.loadPrintProviders();
    this.designTemplates = this.loadDesignTemplates();
    this.quoteExtractor = this.setupQuoteExtractor();
  }

  // Load print-on-demand providers
  loadPrintProviders() {
    return {
      printful: {
        name: 'Printful',
        api_url: 'https://api.printful.com',
        commission_rate: 0.25, // 25% profit margin
        supported_products: ['t-shirt', 'hoodie', 'mug', 'sticker', 'poster'],
        fulfillment_time: '2-5 business days',
        quality_rating: 4.5,
        integration_complexity: 'medium'
      },
      printify: {
        name: 'Printify',
        api_url: 'https://api.printify.com/v1',
        commission_rate: 0.30,
        supported_products: ['t-shirt', 'hoodie', 'mug', 'phone-case', 'canvas'],
        fulfillment_time: '3-7 business days',
        quality_rating: 4.2,
        integration_complexity: 'easy'
      },
      gooten: {
        name: 'Gooten',
        api_url: 'https://api.gooten.com',
        commission_rate: 0.28,
        supported_products: ['t-shirt', 'hoodie', 'mug', 'poster', 'notebook'],
        fulfillment_time: '2-4 business days',
        quality_rating: 4.3,
        integration_complexity: 'medium'
      }
    };
  }

  // Load design templates and generators
  loadDesignTemplates() {
    return {
      quote_designs: [
        {
          name: 'Minimalist Quote',
          style: 'clean',
          best_for: ['educational', 'inspirational'],
          layout: 'centered_text',
          color_schemes: ['black_white', 'navy_white', 'forest_cream']
        },
        {
          name: 'Tech Circuit',
          style: 'technical',
          best_for: ['tech', 'circuit-myth'],
          layout: 'circuit_background',
          color_schemes: ['neon_blue', 'matrix_green', 'cyber_purple']
        },
        {
          name: 'Space Explorer',
          style: 'cosmic',
          best_for: ['space', 'astronomy'],
          layout: 'starfield_background',
          color_schemes: ['deep_space', 'nebula_purple', 'cosmic_blue']
        }
      ],
      meme_templates: [
        {
          name: 'Drake Pointing',
          usage: 'comparison_content',
          viral_potential: 0.8
        },
        {
          name: 'Distracted Boyfriend',
          usage: 'choice_content',
          viral_potential: 0.9
        },
        {
          name: 'Galaxy Brain',
          usage: 'educational_progression',
          viral_potential: 0.7
        }
      ]
    };
  }

  // Set up quote extraction from content
  setupQuoteExtractor() {
    return {
      extractQuotes: (content) => {
        const quotes = [];
        
        // Extract from hooks
        if (content.brief?.hooks) {
          content.brief.hooks.forEach(hook => {
            if (hook.text && hook.text.length > 10 && hook.text.length < 100) {
              quotes.push({
                text: hook.text,
                type: 'hook',
                viral_score: 0.8,
                merchandisability: 0.7
              });
            }
          });
        }

        // Extract key facts that could be quotable
        if (content.brief?.facts) {
          content.brief.facts.forEach(fact => {
            if (fact.length > 20 && fact.length < 80 && this.isQuotable(fact)) {
              quotes.push({
                text: fact,
                type: 'fact',
                viral_score: 0.6,
                merchandisability: 0.8
              });
            }
          });
        }

        // Generate memorable phrases from topic
        const topicQuotes = this.generateTopicQuotes(content.topic);
        quotes.push(...topicQuotes);

        return quotes.sort((a, b) => b.merchandisability - a.merchandisability);
      }
    };
  }

  // Check if a fact is quotable
  isQuotable(text) {
    // Avoid complex technical details, prefer surprising or memorable facts
    const quotablePatterns = [
      /\d+%/, // Statistics
      /\d+\s+(times|years|million|billion)/, // Scale indicators
      /never|always|only|first|last/, // Absolutes
      /surprising|shocking|incredible|amazing/, // Emotional triggers
    ];

    return quotablePatterns.some(pattern => pattern.test(text.toLowerCase()));
  }

  // Generate topic-based quotes
  generateTopicQuotes(topic) {
    const quotes = [];
    
    // Create variations of the topic as potential quotes
    const variations = [
      `"${topic}" - The things you learn`,
      `I survived learning about ${topic}`,
      `${topic}: It's more interesting than you think`,
      `Ask me about ${topic}`,
    ];

    variations.forEach(variation => {
      quotes.push({
        text: variation,
        type: 'topic_variation',
        viral_score: 0.5,
        merchandisability: 0.6
      });
    });

    return quotes;
  }

  // Find merchandise opportunities
  async findMerchOpportunities(content) {
    console.log('🎽 Finding merchandise opportunities...\n');

    const opportunities = {
      content_id: content.session_id,
      channel: content.channel_slug,
      topic: content.topic,
      products: [],
      estimated_revenue: 0,
      design_concepts: [],
      quotes: []
    };

    try {
      // Extract quotable content
      opportunities.quotes = this.quoteExtractor.extractQuotes(content);
      
      // Generate design concepts
      opportunities.design_concepts = this.generateDesignConcepts(content, opportunities.quotes);
      
      // Create product recommendations
      opportunities.products = this.recommendProducts(content, opportunities.design_concepts);
      
      // Calculate revenue estimates
      opportunities.estimated_revenue = this.estimateRevenue(opportunities.products);

      console.log(`👕 Generated ${opportunities.products.length} merchandise concepts`);
      console.log(`💰 Estimated monthly revenue: $${opportunities.estimated_revenue.toFixed(2)}`);

      return opportunities;

    } catch (error) {
      console.error('❌ Merchandise generation failed:', error.message);
      opportunities.error = error.message;
      return opportunities;
    }
  }

  // Generate design concepts
  generateDesignConcepts(content, quotes) {
    const concepts = [];
    const channelTheme = this.getChannelTheme(content.channel_slug);

    // Quote-based designs
    quotes.slice(0, 3).forEach((quote, index) => {
      const template = this.selectDesignTemplate(content.channel_slug, quote.type);
      
      concepts.push({
        id: `quote_${index}`,
        type: 'quote_design',
        quote: quote.text,
        template: template.name,
        style: template.style,
        color_scheme: template.color_schemes[0],
        products: ['t-shirt', 'hoodie', 'mug'],
        viral_potential: quote.viral_score,
        design_complexity: 'low'
      });
    });

    // Channel branding merchandise
    concepts.push({
      id: 'channel_branding',
      type: 'channel_brand',
      quote: `${content.channel_slug.replace('-', ' ').toUpperCase()} - ${channelTheme.tagline}`,
      template: channelTheme.template,
      style: channelTheme.style,
      color_scheme: channelTheme.colors,
      products: ['t-shirt', 'hoodie', 'sticker', 'mug'],
      viral_potential: 0.6,
      design_complexity: 'medium'
    });

    // Topic-specific meme potential
    if (this.hasMemeViralPotential(content.topic)) {
      concepts.push({
        id: 'meme_design',
        type: 'meme_merchandise',
        quote: this.generateMemeText(content.topic),
        template: 'internet_meme',
        style: 'humorous',
        color_scheme: 'internet_culture',
        products: ['t-shirt', 'sticker', 'phone-case'],
        viral_potential: 0.9,
        design_complexity: 'high'
      });
    }

    return concepts;
  }

  // Get channel-specific theme
  getChannelTheme(channelSlug) {
    const themes = {
      'circuit-myth': {
        tagline: 'Busting Tech Myths',
        template: 'Tech Circuit',
        style: 'technical',
        colors: 'neon_blue'
      },
      'space-minute': {
        tagline: 'Universe in 60 Seconds',
        template: 'Space Explorer',
        style: 'cosmic',
        colors: 'deep_space'
      },
      'zero-view-science': {
        tagline: 'Science Made Fun',
        template: 'Minimalist Quote',
        style: 'educational',
        colors: 'forest_cream'
      }
    };

    return themes[channelSlug] || {
      tagline: 'Educational Content',
      template: 'Minimalist Quote',
      style: 'clean',
      colors: 'black_white'
    };
  }

  // Select appropriate design template
  selectDesignTemplate(channelSlug, quoteType) {
    const channelTemplates = {
      'circuit-myth': 'Tech Circuit',
      'space-minute': 'Space Explorer',
      'zero-view-science': 'Minimalist Quote'
    };

    const templateName = channelTemplates[channelSlug] || 'Minimalist Quote';
    return this.designTemplates.quote_designs.find(t => t.name === templateName);
  }

  // Check meme viral potential
  hasMemeViralPotential(topic) {
    const memeKeywords = ['vs', 'better', 'worst', 'comparison', 'myth', 'truth', 'secret'];
    return memeKeywords.some(keyword => topic.toLowerCase().includes(keyword));
  }

  // Generate meme text
  generateMemeText(topic) {
    if (topic.includes('vs')) {
      return `When someone says "${topic.split('vs')[0].trim()}" is better`;
    } else if (topic.includes('myth')) {
      return `People who still believe this myth about ${topic}`;
    } else {
      return `Me explaining ${topic} to my friends`;
    }
  }

  // Recommend specific products
  recommendProducts(content, designConcepts) {
    const products = [];

    designConcepts.forEach(concept => {
      concept.products.forEach(productType => {
        const product = {
          concept_id: concept.id,
          product_type: productType,
          design_concept: concept,
          pricing: this.calculatePricing(productType, concept.design_complexity),
          profit_margin: this.calculateProfitMargin(productType),
          estimated_monthly_sales: this.estimateMonthlySales(concept.viral_potential, productType),
          recommended_provider: this.recommendProvider(productType),
          listing_platforms: this.recommendPlatforms(content.channel_slug)
        };

        product.monthly_revenue = product.estimated_monthly_sales * product.profit_margin;
        products.push(product);
      });
    });

    return products.sort((a, b) => b.monthly_revenue - a.monthly_revenue);
  }

  // Calculate product pricing
  calculatePricing(productType, complexity) {
    const basePrices = {
      't-shirt': 24.99,
      'hoodie': 44.99,
      'mug': 16.99,
      'sticker': 4.99,
      'poster': 19.99,
      'phone-case': 29.99,
      'notebook': 22.99,
      'canvas': 49.99
    };

    const complexityMultiplier = {
      'low': 1.0,
      'medium': 1.15,
      'high': 1.30
    };

    return (basePrices[productType] || 24.99) * (complexityMultiplier[complexity] || 1.0);
  }

  // Calculate profit margin
  calculateProfitMargin(productType) {
    const costs = {
      't-shirt': 8.50,
      'hoodie': 16.00,
      'mug': 7.25,
      'sticker': 1.50,
      'poster': 6.00,
      'phone-case': 12.00,
      'notebook': 9.50,
      'canvas': 22.00
    };

    const cost = costs[productType] || 8.50;
    const price = this.calculatePricing(productType, 'low');
    
    return price - cost;
  }

  // Estimate monthly sales
  estimateMonthlySales(viralPotential, productType) {
    const baseRates = {
      't-shirt': 15,
      'hoodie': 8,
      'mug': 12,
      'sticker': 25,
      'poster': 5,
      'phone-case': 6,
      'notebook': 4,
      'canvas': 2
    };

    return Math.round((baseRates[productType] || 10) * viralPotential);
  }

  // Recommend print provider
  recommendProvider(productType) {
    // Printify for general products
    if (['t-shirt', 'hoodie', 'mug', 'phone-case'].includes(productType)) {
      return 'printify';
    }
    // Printful for premium quality
    else if (['poster', 'canvas'].includes(productType)) {
      return 'printful';
    }
    // Gooten for cost-effective options
    else {
      return 'gooten';
    }
  }

  // Recommend listing platforms
  recommendPlatforms(channelSlug) {
    return [
      'etsy', // Good for niche merchandise
      'redbubble', // Popular for designs
      'teespring', // Integrated with social media
      'amazon_merch', // Highest reach
      'shopify' // Own branded store
    ];
  }

  // Calculate total revenue estimate
  estimateRevenue(products) {
    return products.reduce((total, product) => total + product.monthly_revenue, 0);
  }

  // Generate Shopify store setup
  generateShopifySetup(opportunities) {
    const setup = {
      store_name: `${opportunities.channel.replace('-', '')}-merch`,
      products: opportunities.products.map(product => ({
        title: `${product.design_concept.quote} - ${product.product_type}`,
        description: this.generateProductDescription(product),
        price: product.pricing,
        inventory_policy: 'continue', // Print on demand
        requires_shipping: true,
        taxable: true,
        tags: [opportunities.channel, product.product_type, 'educational', 'youtube'],
        variants: this.generateVariants(product.product_type)
      }))
    };

    return setup;
  }

  // Generate product descriptions
  generateProductDescription(product) {
    const concept = product.design_concept;
    
    return `
${concept.quote}

Premium ${product.product_type} featuring this memorable quote from our ${product.listing_platforms[0]} content series.

• High-quality ${concept.style} design
• Comfortable and durable materials
• Perfect for fans of educational content
• Great conversation starter

This design was inspired by our viral content about educational topics. Show your love for learning with this unique piece!

#Education #Learning #ContentCreator #${product.product_type.replace('-', '')}
    `.trim();
  }

  // Generate product variants
  generateVariants(productType) {
    const variants = {
      't-shirt': [
        { option1: 'S', option2: 'Black' },
        { option1: 'M', option2: 'Black' },
        { option1: 'L', option2: 'Black' },
        { option1: 'XL', option2: 'Black' },
        { option1: 'S', option2: 'White' },
        { option1: 'M', option2: 'White' },
        { option1: 'L', option2: 'White' },
        { option1: 'XL', option2: 'White' }
      ],
      'hoodie': [
        { option1: 'S', option2: 'Gray' },
        { option1: 'M', option2: 'Gray' },
        { option1: 'L', option2: 'Gray' },
        { option1: 'XL', option2: 'Gray' }
      ],
      'mug': [
        { option1: '11oz', option2: 'White' },
        { option1: '15oz', option2: 'White' }
      ]
    };

    return variants[productType] || [{ option1: 'Standard' }];
  }

  // Generate marketing copy
  generateMarketingCopy(opportunities) {
    return {
      email_campaign: `
🎽 NEW MERCH DROP! 

Turn your favorite educational moments into wearable wisdom!

We've transformed the most quotable moments from our ${opportunities.channel} series into premium merchandise. From mind-bending facts to memorable one-liners - now you can wear the knowledge!

✨ Featured designs:
${opportunities.products.slice(0, 3).map(p => `• ${p.design_concept.quote}`).join('\n')}

LIMITED TIME: Use code LEARNER15 for 15% off your first order!

Shop now: [store link]
      `,
      
      social_posts: opportunities.products.slice(0, 3).map(product => ({
        platform: 'instagram',
        copy: `"${product.design_concept.quote}" \n\nNow available on a ${product.product_type}! 👕✨\n\nWho else needs this in their wardrobe? 🤔\n\n#merch #education #${opportunities.channel.replace('-', '')} #learningisfun`,
        hashtags: ['merch', 'education', opportunities.channel.replace('-', ''), 'learningisfun']
      }))
    };
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const contentFile = process.argv[3];

  const merchGenerator = new MerchGenerator({
    projectId: 'content-pipeline-7dd4f'
  });

  switch (command) {
    case 'generate':
      if (!contentFile) {
        console.error('Usage: node merch-generator.js generate <content-file.json>');
        process.exit(1);
      }

      const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      const opportunities = await merchGenerator.findMerchOpportunities(content);

      console.log('\n👕 Merchandise Opportunities:');
      opportunities.products.slice(0, 5).forEach((product, i) => {
        console.log(`\n${i + 1}. ${product.product_type}: "${product.design_concept.quote}"`);
        console.log(`   Price: $${product.pricing.toFixed(2)}`);
        console.log(`   Profit: $${product.profit_margin.toFixed(2)}`);
        console.log(`   Est. Monthly Sales: ${product.estimated_monthly_sales} units`);
        console.log(`   Monthly Revenue: $${product.monthly_revenue.toFixed(2)}`);
      });

      // Generate Shopify setup
      const shopifySetup = merchGenerator.generateShopifySetup(opportunities);
      const marketingCopy = merchGenerator.generateMarketingCopy(opportunities);

      // Save everything
      const outputFile = contentFile.replace('.json', '_merchandise.json');
      fs.writeFileSync(outputFile, JSON.stringify({
        opportunities,
        shopify_setup: shopifySetup,
        marketing: marketingCopy
      }, null, 2));

      console.log(`\n📄 Merchandise plan saved: ${outputFile}`);
      console.log(`\n💰 Total estimated monthly revenue: $${opportunities.estimated_revenue.toFixed(2)}`);
      break;

    default:
      console.log('Merchandise Generator');
      console.log('====================');
      console.log('');
      console.log('Usage:');
      console.log('  node merch-generator.js generate <content-file.json>');
      console.log('');
      console.log('Example:');
      console.log('  node merch-generator.js generate ../test-content.json');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Merchandise generation failed:', error.message);
    process.exit(1);
  });
}

module.exports = MerchGenerator;