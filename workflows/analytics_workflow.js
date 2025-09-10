// Pipedream Analytics Workflow - Performance Tracking
// Collects metrics from all platforms and stores in BigQuery

export default {
  name: "collect_analytics",
  description: "Collect and analyze content performance metrics",
  version: "1.0.0",

  triggers: {
    schedule: {
      type: "$.interface.timer",
      default: {
        intervalSeconds: 3600 // Run every hour
      }
    }
  },

  props: {
    channel_slug: {
      type: "string",
      label: "Channel Slug",
      description: "Channel to analyze",
      optional: true
    },
    lookback_hours: {
      type: "integer",
      label: "Lookback Hours",
      description: "Hours to look back for content",
      default: 24
    }
  },

  steps: [
    // Step 1: Get Published Sessions
    {
      id: "get_sessions",
      name: "Get Recent Published Sessions",
      code: `
        import { Firestore } from '@google-cloud/firestore';
        
        const db = new Firestore();
        const cutoff = new Date(Date.now() - (this.lookback_hours * 60 * 60 * 1000));
        
        let query = db.collection('production_sessions')
          .where('status', '==', 'published')
          .where('published_at', '>=', cutoff.toISOString());
        
        if (this.channel_slug) {
          query = query.where('channel_slug', '==', this.channel_slug);
        }
        
        const snapshot = await query.limit(100).get();
        const sessions = [];
        
        snapshot.forEach(doc => {
          sessions.push({ id: doc.id, ...doc.data() });
        });
        
        $.export('sessions', sessions);
      `
    },

    // Step 2: Fetch YouTube Analytics
    {
      id: "youtube_analytics",
      name: "Fetch YouTube Analytics",
      code: `
        import { google } from 'googleapis';
        
        const youtube = google.youtube({
          version: 'v3',
          auth: process.env.YOUTUBE_API_KEY
        });
        
        const youtubeAnalytics = google.youtubeAnalytics({
          version: 'v2',
          auth: process.env.YOUTUBE_API_KEY
        });
        
        const sessions = steps.get_sessions.sessions;
        const metrics = [];
        
        for (const session of sessions) {
          const ytResult = session.publish_results?.youtube;
          if (!ytResult?.success || !ytResult?.video_id) continue;
          
          try {
            // Get video statistics
            const statsRes = await youtube.videos.list({
              part: ['statistics', 'snippet'],
              id: [ytResult.video_id]
            });
            
            const video = statsRes.data.items?.[0];
            if (!video) continue;
            
            const stats = video.statistics;
            metrics.push({
              session_id: session.id,
              platform: 'youtube',
              video_id: ytResult.video_id,
              title: video.snippet.title,
              published_at: video.snippet.publishedAt,
              views: parseInt(stats.viewCount || 0),
              likes: parseInt(stats.likeCount || 0),
              comments: parseInt(stats.commentCount || 0),
              favorites: parseInt(stats.favoriteCount || 0),
              collected_at: new Date().toISOString()
            });
            
            // Get more detailed analytics if available
            try {
              const analyticsRes = await youtubeAnalytics.reports.query({
                ids: 'channel==MINE',
                startDate: session.published_at.split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
                metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
                dimensions: 'video',
                filters: \`video==\${ytResult.video_id}\`
              });
              
              if (analyticsRes.data.rows?.length > 0) {
                const row = analyticsRes.data.rows[0];
                metrics[metrics.length - 1].watch_time_minutes = row[1];
                metrics[metrics.length - 1].avg_view_duration = row[2];
                metrics[metrics.length - 1].avg_view_percentage = row[3];
              }
            } catch (e) {
              // Analytics API might not have data yet
            }
          } catch (error) {
            console.error(\`Error fetching YouTube metrics for \${ytResult.video_id}: \${error.message}\`);
          }
        }
        
        $.export('youtube_metrics', metrics);
      `
    },

    // Step 3: Fetch TikTok Analytics
    {
      id: "tiktok_analytics",
      name: "Fetch TikTok Analytics",
      code: `
        import fetch from 'node-fetch';
        
        const sessions = steps.get_sessions.sessions;
        const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
        const metrics = [];
        
        for (const session of sessions) {
          const ttResult = session.publish_results?.tiktok;
          if (!ttResult?.success || !ttResult?.publish_id) continue;
          
          try {
            // Get video insights
            const res = await fetch(
              \`https://open.tiktokapis.com/v2/video/data/\`, {
              method: 'POST',
              headers: {
                'Authorization': \`Bearer \${ACCESS_TOKEN}\`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                filters: {
                  video_ids: [ttResult.publish_id]
                },
                fields: [
                  'id', 'create_time', 'cover_image_url', 'share_url',
                  'video_description', 'duration', 'height', 'width',
                  'title', 'like_count', 'comment_count', 'share_count',
                  'view_count', 'reach_count'
                ]
              })
            });
            
            const data = await res.json();
            const video = data.data?.videos?.[0];
            
            if (video) {
              metrics.push({
                session_id: session.id,
                platform: 'tiktok',
                video_id: video.id,
                title: video.title || video.video_description,
                published_at: video.create_time,
                views: video.view_count || 0,
                likes: video.like_count || 0,
                comments: video.comment_count || 0,
                shares: video.share_count || 0,
                reach: video.reach_count || 0,
                duration: video.duration,
                collected_at: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error(\`Error fetching TikTok metrics: \${error.message}\`);
          }
        }
        
        $.export('tiktok_metrics', metrics);
      `
    },

    // Step 4: Fetch Instagram Analytics
    {
      id: "instagram_analytics",
      name: "Fetch Instagram Analytics",
      code: `
        import fetch from 'node-fetch';
        
        const sessions = steps.get_sessions.sessions;
        const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
        const metrics = [];
        
        for (const session of sessions) {
          const igResult = session.publish_results?.instagram;
          if (!igResult?.success || !igResult?.media_id) continue;
          
          try {
            // Get media insights
            const res = await fetch(
              \`https://graph.facebook.com/v18.0/\${igResult.media_id}/insights\` +
              \`?metric=impressions,reach,profile_visits,shares,saves,total_interactions\` +
              \`&access_token=\${ACCESS_TOKEN}\`
            );
            
            const data = await res.json();
            
            if (data.data) {
              const insights = {};
              data.data.forEach(metric => {
                insights[metric.name] = metric.values[0]?.value || 0;
              });
              
              // Get basic media info
              const mediaRes = await fetch(
                \`https://graph.facebook.com/v18.0/\${igResult.media_id}\` +
                \`?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count\` +
                \`&access_token=\${ACCESS_TOKEN}\`
              );
              
              const mediaData = await mediaRes.json();
              
              metrics.push({
                session_id: session.id,
                platform: 'instagram',
                media_id: igResult.media_id,
                title: session.topic,
                caption: mediaData.caption,
                published_at: mediaData.timestamp,
                permalink: mediaData.permalink,
                impressions: insights.impressions || 0,
                reach: insights.reach || 0,
                profile_visits: insights.profile_visits || 0,
                shares: insights.shares || 0,
                saves: insights.saves || 0,
                likes: mediaData.like_count || 0,
                comments: mediaData.comments_count || 0,
                total_interactions: insights.total_interactions || 0,
                collected_at: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error(\`Error fetching Instagram metrics: \${error.message}\`);
          }
        }
        
        $.export('instagram_metrics', metrics);
      `
    },

    // Step 5: Calculate Performance Scores
    {
      id: "calculate_scores",
      name: "Calculate Performance Scores",
      code: `
        const ytMetrics = steps.youtube_analytics.youtube_metrics;
        const ttMetrics = steps.tiktok_analytics.tiktok_metrics;
        const igMetrics = steps.instagram_analytics.instagram_metrics;
        
        const allMetrics = [...ytMetrics, ...ttMetrics, ...igMetrics];
        
        // Calculate normalized scores
        const scored = allMetrics.map(m => {
          let score = 0;
          let factors = 0;
          
          // Platform-specific scoring
          if (m.platform === 'youtube') {
            if (m.views > 0) {
              score += Math.log10(m.views + 1) * 10;
              factors++;
            }
            if (m.avg_view_percentage) {
              score += m.avg_view_percentage;
              factors++;
            }
            if (m.likes && m.views) {
              score += (m.likes / m.views) * 100;
              factors++;
            }
          } else if (m.platform === 'tiktok') {
            if (m.views > 0) {
              score += Math.log10(m.views + 1) * 10;
              factors++;
            }
            if (m.reach > 0) {
              score += Math.log10(m.reach + 1) * 5;
              factors++;
            }
            if (m.shares && m.views) {
              score += (m.shares / m.views) * 200;
              factors++;
            }
          } else if (m.platform === 'instagram') {
            if (m.reach > 0) {
              score += Math.log10(m.reach + 1) * 10;
              factors++;
            }
            if (m.saves && m.reach) {
              score += (m.saves / m.reach) * 150;
              factors++;
            }
            if (m.total_interactions && m.reach) {
              score += (m.total_interactions / m.reach) * 100;
              factors++;
            }
          }
          
          return {
            ...m,
            performance_score: factors > 0 ? score / factors : 0,
            scoring_factors: factors
          };
        });
        
        $.export('scored_metrics', scored);
      `
    },

    // Step 6: Store in BigQuery
    {
      id: "store_bigquery",
      name: "Store Metrics in BigQuery",
      code: `
        import { BigQuery } from '@google-cloud/bigquery';
        
        const bigquery = new BigQuery();
        const datasetId = 'dpgen_analytics';
        const tableId = 'content_metrics';
        
        const rows = steps.calculate_scores.scored_metrics;
        
        if (rows.length === 0) {
          $.export('bigquery_result', { message: 'No metrics to store' });
          return;
        }
        
        try {
          // Ensure dataset exists
          const dataset = bigquery.dataset(datasetId);
          const [datasetExists] = await dataset.exists();
          
          if (!datasetExists) {
            await bigquery.createDataset(datasetId);
          }
          
          // Ensure table exists with schema
          const table = dataset.table(tableId);
          const [tableExists] = await table.exists();
          
          if (!tableExists) {
            await dataset.createTable(tableId, {
              schema: [
                { name: 'session_id', type: 'STRING', mode: 'REQUIRED' },
                { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
                { name: 'video_id', type: 'STRING' },
                { name: 'media_id', type: 'STRING' },
                { name: 'title', type: 'STRING' },
                { name: 'published_at', type: 'TIMESTAMP' },
                { name: 'collected_at', type: 'TIMESTAMP' },
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
                { name: 'scoring_factors', type: 'INTEGER' }
              ],
              timePartitioning: {
                type: 'DAY',
                field: 'collected_at'
              }
            });
          }
          
          // Insert rows
          await table.insert(rows);
          
          $.export('bigquery_result', {
            success: true,
            rows_inserted: rows.length
          });
        } catch (error) {
          $.export('bigquery_result', {
            success: false,
            error: error.message
          });
        }
      `
    },

    // Step 7: Identify Winners and Losers
    {
      id: "analyze_performance",
      name: "Analyze Performance Patterns",
      code: `
        const metrics = steps.calculate_scores.scored_metrics;
        
        // Sort by performance score
        const sorted = [...metrics].sort((a, b) => b.performance_score - a.performance_score);
        
        // Get top and bottom performers
        const winners = sorted.slice(0, Math.min(5, sorted.length));
        const losers = sorted.slice(-Math.min(5, sorted.length));
        
        // Calculate averages by platform
        const platformStats = {};
        metrics.forEach(m => {
          if (!platformStats[m.platform]) {
            platformStats[m.platform] = {
              count: 0,
              total_score: 0,
              total_views: 0,
              total_engagement: 0
            };
          }
          
          const stats = platformStats[m.platform];
          stats.count++;
          stats.total_score += m.performance_score;
          stats.total_views += m.views || m.reach || 0;
          stats.total_engagement += (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
        });
        
        // Calculate averages
        Object.keys(platformStats).forEach(platform => {
          const stats = platformStats[platform];
          stats.avg_score = stats.total_score / stats.count;
          stats.avg_views = stats.total_views / stats.count;
          stats.avg_engagement = stats.total_engagement / stats.count;
        });
        
        $.export('analysis', {
          total_content: metrics.length,
          winners: winners.map(w => ({
            session_id: w.session_id,
            platform: w.platform,
            title: w.title,
            score: w.performance_score,
            views: w.views || w.reach || 0
          })),
          losers: losers.map(l => ({
            session_id: l.session_id,
            platform: l.platform,
            title: l.title,
            score: l.performance_score,
            views: l.views || l.reach || 0
          })),
          platform_stats: platformStats
        });
      `
    },

    // Step 8: Send Report
    {
      id: "send_report",
      name: "Send Performance Report",
      code: `
        const analysis = steps.analyze_performance.analysis;
        
        // Format report
        const report = {
          timestamp: new Date().toISOString(),
          period: \`Last \${this.lookback_hours} hours\`,
          channel: this.channel_slug || 'All channels',
          summary: {
            total_content_analyzed: analysis.total_content,
            platforms: Object.keys(analysis.platform_stats)
          },
          top_performers: analysis.winners,
          under_performers: analysis.losers,
          platform_averages: analysis.platform_stats,
          bigquery_status: steps.store_bigquery.bigquery_result
        };
        
        // Send to Slack if configured
        if (process.env.SLACK_WEBHOOK_URL) {
          const slackMessage = {
            text: \`📊 Content Performance Report - \${report.period}\`,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: \`*Channel:* \${report.channel}\\n*Content Analyzed:* \${report.summary.total_content_analyzed}\`
                }
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: \`*🏆 Top Performer:*\\n\${analysis.winners[0]?.title || 'N/A'}\\nScore: \${analysis.winners[0]?.score?.toFixed(2) || 'N/A'}\`
                }
              }
            ]
          };
          
          await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackMessage)
          });
        }
        
        $.export('report', report);
      `
    }
  ]
};