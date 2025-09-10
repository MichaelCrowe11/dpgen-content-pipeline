// Pipedream Publishing Workflow - Multi-Platform Distribution
// Handles YouTube, TikTok, Instagram, and Facebook publishing

export default {
  name: "publish_to_platforms",
  description: "Publish rendered content to social media platforms",
  version: "1.0.0",

  props: {
    session_id: {
      type: "string",
      label: "Session ID",
      description: "Production session ID"
    },
    render_uri: {
      type: "string",
      label: "Render URI",
      description: "GCS URI of the rendered video"
    },
    thumbnail_uri: {
      type: "string",
      label: "Thumbnail URI",
      description: "GCS URI of the thumbnail"
    },
    platforms: {
      type: "string[]",
      label: "Platforms",
      description: "Target platforms for publishing",
      default: ["youtube", "tiktok", "instagram"]
    }
  },

  steps: [
    // Step 1: Load Session Data
    {
      id: "load_session",
      name: "Load Production Session",
      code: `
        import { Firestore } from '@google-cloud/firestore';
        
        const db = new Firestore();
        const doc = await db.collection('production_sessions').doc(this.session_id).get();
        
        if (!doc.exists) {
          throw new Error(\`Session not found: \${this.session_id}\`);
        }
        
        const session = doc.data();
        $.export('session', session);
        $.export('distribution', session.distribution);
      `
    },

    // Step 2: Download Video from GCS
    {
      id: "download_video",
      name: "Download Video for Upload",
      code: `
        import { Storage } from '@google-cloud/storage';
        import fs from 'fs';
        import path from 'path';
        
        const storage = new Storage();
        const tempPath = \`/tmp/video_\${this.session_id}.mp4\`;
        
        // Parse GCS URI
        const uri = this.render_uri;
        const [bucket, ...pathParts] = uri.replace('gs://', '').split('/');
        const filePath = pathParts.join('/');
        
        // Download file
        await storage.bucket(bucket).file(filePath).download({
          destination: tempPath
        });
        
        const stats = fs.statSync(tempPath);
        $.export('video_path', tempPath);
        $.export('video_size', stats.size);
      `
    },

    // Step 3: Publish to YouTube
    {
      id: "publish_youtube",
      name: "Publish to YouTube",
      code: `
        import { google } from 'googleapis';
        import fs from 'fs';
        
        if (!this.platforms.includes('youtube')) {
          $.export('youtube_result', { skipped: true });
          return;
        }
        
        const youtube = google.youtube({
          version: 'v3',
          auth: process.env.YOUTUBE_API_KEY
        });
        
        const distribution = steps.load_session.distribution;
        const videoPath = steps.download_video.video_path;
        
        // Prepare video metadata
        const videoMetadata = {
          snippet: {
            title: distribution.titles?.[0] || "Untitled Video",
            description: distribution.description || "",
            tags: distribution.hashtags?.map(h => h.replace('#', '')) || [],
            categoryId: "28", // Science & Technology
            defaultLanguage: "en",
            defaultAudioLanguage: "en"
          },
          status: {
            privacyStatus: "private", // Start as private, can be changed
            selfDeclaredMadeForKids: false,
            madeForKids: false
          }
        };
        
        // Check if this is a Short
        const duration = steps.load_session.session.metadata?.duration_target || 60;
        if (duration <= 60) {
          videoMetadata.snippet.title = videoMetadata.snippet.title + " #Shorts";
        }
        
        try {
          // Upload video
          const res = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: videoMetadata,
            media: {
              body: fs.createReadStream(videoPath)
            }
          });
          
          $.export('youtube_result', {
            success: true,
            video_id: res.data.id,
            url: \`https://youtube.com/watch?v=\${res.data.id}\`
          });
        } catch (error) {
          $.export('youtube_result', {
            success: false,
            error: error.message
          });
        }
      `
    },

    // Step 4: Publish to TikTok
    {
      id: "publish_tiktok",
      name: "Publish to TikTok",
      code: `
        import fetch from 'node-fetch';
        import FormData from 'form-data';
        import fs from 'fs';
        
        if (!this.platforms.includes('tiktok')) {
          $.export('tiktok_result', { skipped: true });
          return;
        }
        
        const distribution = steps.load_session.distribution;
        const videoPath = steps.download_video.video_path;
        
        // TikTok Content Posting API
        const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
        const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
        const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN; // Pre-obtained
        
        try {
          // Step 1: Initialize upload
          const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${ACCESS_TOKEN}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              post_info: {
                title: distribution.titles?.[0] || "",
                description: distribution.description?.substring(0, 150) || "",
                disable_comment: false,
                privacy_level: "PUBLIC_TO_EVERYONE",
                video_cover_timestamp_ms: 1000
              },
              source_info: {
                source: "FILE_UPLOAD",
                video_size: steps.download_video.video_size
              }
            })
          });
          
          const initData = await initRes.json();
          
          if (!initData.data?.publish_id) {
            throw new Error('Failed to initialize TikTok upload');
          }
          
          // Step 2: Upload video chunks (simplified - in production handle chunking)
          const uploadUrl = initData.data.upload_url;
          const formData = new FormData();
          formData.append('video', fs.createReadStream(videoPath));
          
          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
          });
          
          if (!uploadRes.ok) {
            throw new Error('Failed to upload video to TikTok');
          }
          
          $.export('tiktok_result', {
            success: true,
            publish_id: initData.data.publish_id,
            message: 'Video submitted for processing'
          });
        } catch (error) {
          $.export('tiktok_result', {
            success: false,
            error: error.message
          });
        }
      `
    },

    // Step 5: Publish to Instagram
    {
      id: "publish_instagram",
      name: "Publish to Instagram Reels",
      code: `
        import fetch from 'node-fetch';
        
        if (!this.platforms.includes('instagram')) {
          $.export('instagram_result', { skipped: true });
          return;
        }
        
        const distribution = steps.load_session.distribution;
        const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
        const IG_USER_ID = process.env.IG_USER_ID;
        
        try {
          // Step 1: Create media container
          const containerRes = await fetch(
            \`https://graph.facebook.com/v18.0/\${IG_USER_ID}/media\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media_type: 'REELS',
              video_url: this.render_uri, // Must be publicly accessible
              caption: \`\${distribution.titles?.[0] || ""} \${distribution.hashtags?.join(' ') || ""}\`,
              share_to_feed: true,
              access_token: ACCESS_TOKEN
            })
          });
          
          const containerData = await containerRes.json();
          
          if (!containerData.id) {
            throw new Error('Failed to create Instagram media container');
          }
          
          // Step 2: Wait for processing (simplified)
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Step 3: Publish the reel
          const publishRes = await fetch(
            \`https://graph.facebook.com/v18.0/\${IG_USER_ID}/media_publish\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              creation_id: containerData.id,
              access_token: ACCESS_TOKEN
            })
          });
          
          const publishData = await publishRes.json();
          
          $.export('instagram_result', {
            success: true,
            media_id: publishData.id,
            message: 'Reel published successfully'
          });
        } catch (error) {
          $.export('instagram_result', {
            success: false,
            error: error.message
          });
        }
      `
    },

    // Step 6: Update Session Status
    {
      id: "update_session",
      name: "Update Publishing Status",
      code: `
        import { Firestore } from '@google-cloud/firestore';
        
        const db = new Firestore();
        
        const publishResults = {
          youtube: steps.publish_youtube.youtube_result,
          tiktok: steps.publish_tiktok.tiktok_result,
          instagram: steps.publish_instagram.instagram_result
        };
        
        await db.collection('production_sessions').doc(this.session_id).update({
          status: 'published',
          published_at: new Date().toISOString(),
          publish_results: publishResults
        });
        
        $.export('publish_summary', {
          session_id: this.session_id,
          results: publishResults,
          success: Object.values(publishResults).some(r => r.success)
        });
      `
    }
  ]
};