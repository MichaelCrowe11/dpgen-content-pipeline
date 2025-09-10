// Pipedream Parent Workflow - Channel Production Pipeline
// This is the main orchestration workflow that coordinates all agents

export default {
  name: "channel_production_parent",
  description: "Main content creation pipeline orchestrator",
  version: "1.0.0",
  
  // Workflow Triggers
  triggers: {
    // Cloud Scheduler webhook trigger
    schedule: {
      type: "$.interface.timer",
      default: {
        intervalSeconds: 43200 // 12 hours
      }
    },
    // Manual trigger via webhook
    http: {
      type: "$.interface.http",
      customResponse: true
    }
  },

  // Props/Parameters
  props: {
    channel_slug: {
      type: "string",
      label: "Channel Slug",
      description: "The channel identifier (e.g., 'circuit-myth')",
      default: "circuit-myth"
    },
    topic: {
      type: "string",
      label: "Content Topic",
      description: "The topic for this episode",
      optional: true
    },
    duration_s: {
      type: "integer",
      label: "Duration (seconds)",
      description: "Target video duration in seconds",
      optional: true
    },
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      description: "Video aspect ratio",
      options: ["9:16", "16:9", "1:1"],
      default: "9:16"
    },
    platforms: {
      type: "string[]",
      label: "Target Platforms",
      description: "Platforms to publish to",
      default: ["youtube", "tiktok", "instagram"]
    }
  },

  // Main workflow steps
  steps: [
    // Step 1: Get Google Cloud Token
    {
      id: "get_gcloud_token",
      name: "Get GCloud Auth Token",
      code: `
        import { google } from 'googleapis';
        const auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        $.export("$return_value", token.token);
      `
    },

    // Step 2: Fetch Channel Profile & Prompts
    {
      id: "fetch_channel_and_prompts",
      name: "Fetch Channel Configuration",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const base = \`https://firestore.googleapis.com/v1/projects/\${project}/databases/(default)/documents\`;
        
        async function getDoc(path) {
          const res = await fetch(\`\${base}/\${path}\`, {
            headers: { Authorization: \`Bearer \${token}\` }
          });
          return await res.json();
        }
        
        function unwrapFirestoreDoc(doc) {
          const v = (o) => o?.stringValue ?? o?.integerValue ?? o?.doubleValue ?? o?.booleanValue ?? null;
          const f = doc.fields;
          if (!f) return {};
          const out = {};
          for (const k of Object.keys(f)) {
            const val = f[k];
            if (val.mapValue) {
              out[k] = unwrapFirestoreDoc({ fields: val.mapValue.fields });
            } else if (val.arrayValue) {
              out[k] = (val.arrayValue.values || []).map(x => v(x) ?? unwrapFirestoreDoc({ fields: x.mapValue?.fields }));
            } else {
              out[k] = v(val);
            }
          }
          return out;
        }
        
        // Fetch channel profile
        const channelDoc = await getDoc(\`channels/\${this.channel_slug}\`);
        const profile = unwrapFirestoreDoc(channelDoc);
        
        // Fetch all prompts
        const promptIds = ['showrunner', 'research', 'scriptwriter', 'visual_director', 'thumbnail_director', 'tts', 'editor', 'distribution', 'compliance'];
        const prompts = {};
        
        for (const id of promptIds) {
          const promptDoc = await getDoc(\`channels/\${this.channel_slug}/prompts/\${id}\`);
          prompts[id] = unwrapFirestoreDoc(promptDoc);
        }
        
        // Fetch CSE config
        const cseDoc = await getDoc(\`channels/\${this.channel_slug}/integrations/cse\`);
        const cseConfig = unwrapFirestoreDoc(cseDoc);
        
        $.export('profile', profile);
        $.export('prompts', prompts);
        $.export('cse_config', cseConfig);
      `
    },

    // Step 3: Generate Topic (if not provided)
    {
      id: "generate_topic",
      name: "Generate Topic from Trends",
      code: `
        if (this.topic) {
          $.export('topic', this.topic);
        } else {
          // Call Gemini to generate trending topic
          const token = steps.get_gcloud_token.$return_value;
          const project = process.env.GCP_PROJECT_ID;
          const location = process.env.GCP_LOCATION;
          const profile = steps.fetch_channel_and_prompts.profile;
          
          const prompt = \`Generate a trending video topic for a \${profile.niche} channel focused on: \${profile.pillars.join(', ')}. The topic should be timely, searchable, and have high engagement potential. Return only the topic title, no explanation.\`;
          
          const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-flash:generateContent\`;
          
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${token}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 100 }
            })
          });
          
          const data = await res.json();
          const topic = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'How AI is Changing Everything';
          $.export('topic', topic);
        }
      `
    },

    // Step 4: Render Prompt Templates
    {
      id: "render_prompts",
      name: "Render Agent Prompts",
      code: `
        const { profile, prompts } = steps.fetch_channel_and_prompts;
        const topic = steps.generate_topic.topic;
        
        function render(template, vars) {
          return template.replace(/\\{([A-Z0-9_]+)\\}/g, (_, k) => (vars[k] ?? \`{\${k}}\`));
        }
        
        const base = {
          TOPIC: topic,
          DURATION_S: this.duration_s || profile.durations.short,
          ASPECT: this.aspect_ratio || '9:16',
          SEED: profile.veo_seed,
          VOICE_NAME: 'en-US-Neural2-G',
          LANGUAGE: profile.locale,
          DATE_HINT: 'm6',
          SAFE: 'active'
        };
        
        const rendered = {};
        for (const [k, v] of Object.entries(prompts)) {
          const merged = { ...(v.vars || {}), ...(v.defaults || {}), ...base };
          rendered[k] = render(v.system_template, merged);
        }
        
        $.export('rendered', rendered);
      `
    },

    // Step 5: Creative Director (Showrunner)
    {
      id: "call_showrunner",
      name: "Creative Director Agent",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const system = steps.render_prompts.rendered.showrunner;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-pro:generateContent\`;
        
        const body = {
          contents: [{ role: 'user', parts: [{ text: system }] }],
          generationConfig: { 
            temperature: 0.8, 
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
          }
        };
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const brief = JSON.parse(text);
        
        $.export('brief', brief);
        $.export('brief_text', JSON.stringify(brief, null, 2));
      `
    },

    // Step 6: Research Agent (with CSE)
    {
      id: "research_search",
      name: "Research Agent - Web Search",
      code: `
        import fetch from 'node-fetch';
        
        const cseConfig = steps.fetch_channel_and_prompts.cse_config;
        const topic = steps.generate_topic.topic;
        const brief = steps.call_showrunner.brief;
        
        // Build search queries from brief
        const queries = [
          topic,
          ...brief.hooks?.map(h => h.text) || [],
          ...brief.beats?.map(b => b.topic) || []
        ].filter(Boolean).slice(0, 3);
        
        const CX = cseConfig.cx || process.env.CSE_CX;
        const KEY = cseConfig.api_key || process.env.CSE_API_KEY;
        
        const allResults = [];
        
        for (const query of queries) {
          const params = new URLSearchParams({
            key: KEY,
            cx: CX,
            q: query,
            num: '10',
            safe: cseConfig.safe || 'active',
            hl: cseConfig.hl || 'en',
            gl: cseConfig.gl || 'us',
            lr: cseConfig.lr || 'lang_en',
            dateRestrict: cseConfig.date_restrict_default || 'm6'
          });
          
          const url = \`https://customsearch.googleapis.com/customsearch/v1?\${params.toString()}\`;
          const res = await fetch(url);
          
          if (res.ok) {
            const data = await res.json();
            const items = (data.items || []).map(x => ({
              title: x.title,
              link: x.link,
              snippet: x.snippet,
              displayLink: x.displayLink,
              query: query
            }));
            allResults.push(...items);
          }
        }
        
        // Deduplicate by URL
        const uniqueResults = Array.from(
          new Map(allResults.map(item => [item.link, item])).values()
        ).slice(0, 20);
        
        $.export('search_results', uniqueResults);
      `
    },

    // Step 7: Research Summarizer
    {
      id: "research_summarize",
      name: "Research Agent - Summarize",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const results = steps.research_search.search_results;
        const system = steps.render_prompts.rendered.research;
        
        const researchPrompt = system + \`

Search Results:
\${results.map(r => \`- [\${r.title}](\${r.link}): \${r.snippet}\`).join('\\n')}

Extract key facts, statistics, and claims with proper citations.\`;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-flash:generateContent\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: researchPrompt }] }],
            generationConfig: { 
              temperature: 0.3, 
              maxOutputTokens: 2048,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const factPack = JSON.parse(text);
        
        $.export('fact_pack', factPack);
      `
    },

    // Step 8: Scriptwriter Agent
    {
      id: "call_scriptwriter",
      name: "Scriptwriter Agent",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const system = steps.render_prompts.rendered.scriptwriter;
        const brief = steps.call_showrunner.brief;
        const facts = steps.research_summarize.fact_pack;
        
        const scriptPrompt = system + \`

Creative Brief:
\${JSON.stringify(brief, null, 2)}

Research Facts:
\${JSON.stringify(facts, null, 2)}

Write the complete script with SSML markup.\`;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-pro:generateContent\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: scriptPrompt }] }],
            generationConfig: { 
              temperature: 0.7, 
              maxOutputTokens: 3000,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const script = JSON.parse(text);
        
        $.export('script', script);
        $.export('script_ssml', script.script?.ssml || script.ssml || '');
      `
    },

    // Step 9: Compliance Check
    {
      id: "compliance_check",
      name: "Compliance Agent",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const script = steps.call_scriptwriter.script;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        const compliancePrompt = steps.render_prompts.rendered.compliance + \`

Script to Review:
\${JSON.stringify(script, null, 2)}

Channel Safety Rules:
\${JSON.stringify(profile.safety, null, 2)}

Check for policy violations and required edits.\`;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-flash:generateContent\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: compliancePrompt }] }],
            generationConfig: { 
              temperature: 0.2, 
              maxOutputTokens: 1024,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const compliance = JSON.parse(text);
        
        // Fail if compliance score too low
        if (compliance.compliance_score < 0.7) {
          throw new Error(\`Compliance check failed: \${JSON.stringify(compliance.issues)}\`);
        }
        
        $.export('compliance', compliance);
      `
    },

    // Step 10: Visual Director (Veo Prompts)
    {
      id: "visual_director",
      name: "Visual Director Agent",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const brief = steps.call_showrunner.brief;
        const script = steps.call_scriptwriter.script;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        const visualPrompt = steps.render_prompts.rendered.visual_director + \`

Brief Beats:
\${JSON.stringify(brief.beats, null, 2)}

B-Roll Cues:
\${JSON.stringify(script.broll_cues || [], null, 2)}

Generate Veo prompts for each shot.\`;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-flash:generateContent\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: visualPrompt }] }],
            generationConfig: { 
              temperature: 0.8, 
              maxOutputTokens: 2048,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const veoShots = JSON.parse(text);
        
        $.export('veo_shots', veoShots);
      `
    },

    // Step 11: Generate Veo Videos
    {
      id: "generate_veo_videos",
      name: "Generate Videos with Veo",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const shots = steps.visual_director.veo_shots.shots || steps.visual_director.veo_shots;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        const veoJobs = [];
        
        // Submit Veo generation jobs
        for (const shot of shots.slice(0, 5)) { // Limit to 5 shots for demo
          const body = {
            instances: [{
              prompt: shot.prompt,
              parameters: {
                aspectRatio: this.aspect_ratio || "9:16",
                sampleCount: 1,
                resolution: "1080p",
                duration: shot.duration || 5,
                seed: profile.veo_seed
              }
            }]
          };
          
          const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/veo-3.0-generate-001:predictLongRunning\`;
          
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${token}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
          
          if (res.ok) {
            const job = await res.json();
            veoJobs.push({
              operation_name: job.name,
              shot: shot
            });
          }
        }
        
        $.export('veo_jobs', veoJobs);
      `
    },

    // Step 12: Generate Thumbnails with Imagen
    {
      id: "generate_thumbnails",
      name: "Generate Thumbnails with Imagen",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const brief = steps.call_showrunner.brief;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        const thumbnailPrompts = [
          \`Ultra-detailed \${brief.hooks?.[0]?.visual || 'technology concept'}, rule-of-thirds composition, bold contrast, palette: \${profile.visual.palette.join(',')}\`,
          \`Cinematic \${brief.hooks?.[1]?.visual || 'abstract pattern'}, dramatic lighting, high contrast, minimal text space, palette: \${profile.visual.palette.join(',')}\`,
          \`Clean minimal \${brief.hooks?.[2]?.visual || 'geometric design'}, negative space, sharp focus, palette: \${profile.visual.palette.join(',')}\`
        ];
        
        const thumbnails = [];
        
        for (const prompt of thumbnailPrompts) {
          const body = {
            instances: [{
              prompt: prompt,
              parameters: {
                sampleCount: 1,
                aspectRatio: "16:9",
                addWatermark: false,
                seed: profile.veo_seed
              }
            }]
          };
          
          const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/imagen-3.0-generate-001:predict\`;
          
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${token}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });
          
          if (res.ok) {
            const data = await res.json();
            thumbnails.push({
              prompt: prompt,
              image: data.predictions?.[0]?.bytesBase64Encoded
            });
          }
        }
        
        $.export('thumbnails', thumbnails);
      `
    },

    // Step 13: Generate Voice with Cloud TTS
    {
      id: "generate_voice",
      name: "Generate Voice with Cloud TTS",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const ssml = steps.call_scriptwriter.script_ssml;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        // Wrap in SSML if not already
        const finalSsml = ssml.startsWith('<speak>') ? ssml : \`<speak>\${ssml}</speak>\`;
        
        const ttsBody = {
          input: { ssml: finalSsml },
          voice: {
            languageCode: profile.locale || "en-US",
            name: "en-US-Neural2-G"
          },
          audioConfig: {
            audioEncoding: "LINEAR16",
            speakingRate: (profile.voice.wpm / 150) || 1.1,
            pitch: 0,
            volumeGainDb: 0
          }
        };
        
        const url = \`https://texttospeech.googleapis.com/v1/text:synthesize\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(ttsBody)
        });
        
        const data = await res.json();
        $.export('audio_base64', data.audioContent);
        $.export('audio_duration_estimate', (finalSsml.length / 15)); // Rough estimate
      `
    },

    // Step 14: Save Assets to GCS
    {
      id: "save_assets",
      name: "Save Assets to Cloud Storage",
      code: `
        import { Storage } from '@google-cloud/storage';
        import { v4 as uuidv4 } from 'uuid';
        
        const storage = new Storage();
        const profile = steps.fetch_channel_and_prompts.profile;
        const bucketName = profile.gcs_bucket.replace('gs://', '');
        const sessionId = uuidv4();
        
        const assets = {
          session_id: sessionId,
          audio_uri: null,
          thumbnails_uris: [],
          script_uri: null
        };
        
        // Save audio
        if (steps.generate_voice.audio_base64) {
          const audioBuffer = Buffer.from(steps.generate_voice.audio_base64, 'base64');
          const audioPath = \`sessions/\${sessionId}/audio/voiceover.wav\`;
          const bucket = storage.bucket(bucketName);
          const audioFile = bucket.file(audioPath);
          await audioFile.save(audioBuffer);
          assets.audio_uri = \`gs://\${bucketName}/\${audioPath}\`;
        }
        
        // Save thumbnails
        for (let i = 0; i < steps.generate_thumbnails.thumbnails.length; i++) {
          const thumb = steps.generate_thumbnails.thumbnails[i];
          if (thumb.image) {
            const imgBuffer = Buffer.from(thumb.image, 'base64');
            const imgPath = \`sessions/\${sessionId}/thumbnails/variant_\${i}.png\`;
            const imgFile = storage.bucket(bucketName).file(imgPath);
            await imgFile.save(imgBuffer);
            assets.thumbnails_uris.push(\`gs://\${bucketName}/\${imgPath}\`);
          }
        }
        
        // Save script
        const scriptPath = \`sessions/\${sessionId}/script.json\`;
        const scriptFile = storage.bucket(bucketName).file(scriptPath);
        await scriptFile.save(JSON.stringify(steps.call_scriptwriter.script, null, 2));
        assets.script_uri = \`gs://\${bucketName}/\${scriptPath}\`;
        
        $.export('assets', assets);
      `
    },

    // Step 15: Wait for Veo Jobs (simplified - in production use proper polling)
    {
      id: "wait_veo_jobs",
      name: "Wait for Video Generation",
      code: `
        // In production, implement proper polling with exponential backoff
        // For demo, we'll simulate completion
        
        const veoJobs = steps.generate_veo_videos.veo_jobs;
        const profile = steps.fetch_channel_and_prompts.profile;
        const bucketName = profile.gcs_bucket.replace('gs://', '');
        const sessionId = steps.save_assets.assets.session_id;
        
        const videoUris = [];
        
        // Simulate video URIs (in production, poll the operations)
        for (let i = 0; i < veoJobs.length; i++) {
          const videoPath = \`sessions/\${sessionId}/videos/shot_\${i}.mp4\`;
          videoUris.push(\`gs://\${bucketName}/\${videoPath}\`);
        }
        
        $.export('video_uris', videoUris);
      `
    },

    // Step 16: Create EDL and Render Request
    {
      id: "create_edl",
      name: "Create Edit Decision List",
      code: `
        const videoUris = steps.wait_veo_jobs.video_uris;
        const script = steps.call_scriptwriter.script;
        const assets = steps.save_assets.assets;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        // Build EDL from script beats and available videos
        const edl = [];
        let currentTime = 0;
        
        for (let i = 0; i < videoUris.length; i++) {
          const duration = 5; // Each shot is 5 seconds
          edl.push({
            clip_uri: videoUris[i],
            start_time: 0,
            end_time: duration,
            transition: i === 0 ? "fade" : "cut",
            overlay_text: script.broll_cues?.[i]?.text || null,
            overlay_position: "bottom"
          });
          currentTime += duration;
        }
        
        const renderRequest = {
          job_id: assets.session_id,
          channel_slug: this.channel_slug,
          edl: edl,
          voiceover_uri: assets.audio_uri,
          output_bucket: profile.gcs_bucket.replace('gs://', ''),
          output_path: \`renders/\${assets.session_id}/master.mp4\`,
          aspect_ratio: this.aspect_ratio || "9:16",
          resolution: "1080p",
          fps: 30,
          enable_captions: true,
          metadata: {
            title: steps.generate_topic.topic,
            channel: profile.title,
            created_by: "dpgen-pipeline"
          }
        };
        
        $.export('render_request', renderRequest);
      `
    },

    // Step 17: Call Renderer Service
    {
      id: "call_renderer",
      name: "Submit to Render Service",
      code: `
        import fetch from 'node-fetch';
        
        const renderRequest = steps.create_edl.render_request;
        const rendererUrl = process.env.RENDERER_URL || 'https://dpgen-renderer-abc123-uc.a.run.app';
        
        const res = await fetch(\`\${rendererUrl}/render\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(renderRequest)
        });
        
        if (!res.ok) {
          throw new Error(\`Renderer error: \${res.status} \${res.statusText}\`);
        }
        
        const renderJob = await res.json();
        $.export('render_job', renderJob);
      `
    },

    // Step 18: Generate Distribution Metadata
    {
      id: "distribution_metadata",
      name: "Generate Distribution Metadata",
      code: `
        import fetch from 'node-fetch';
        
        const token = steps.get_gcloud_token.$return_value;
        const project = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_LOCATION;
        const topic = steps.generate_topic.topic;
        const brief = steps.call_showrunner.brief;
        const profile = steps.fetch_channel_and_prompts.profile;
        
        const distPrompt = steps.render_prompts.rendered.distribution + \`

Topic: \${topic}
Hooks: \${JSON.stringify(brief.hooks, null, 2)}
Channel Hashtags: \${profile.hashtags_base.join(', ')}

Generate platform-optimized titles, descriptions, and hashtags.\`;
        
        const url = \`https://\${location}-aiplatform.googleapis.com/v1/projects/\${project}/locations/\${location}/publishers/google/models/gemini-2.5-flash:generateContent\`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: distPrompt }] }],
            generationConfig: { 
              temperature: 0.7, 
              maxOutputTokens: 1024,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const distribution = JSON.parse(text);
        
        $.export('distribution', distribution);
      `
    },

    // Step 19: Save Session to Firestore
    {
      id: "save_session",
      name: "Save Production Session",
      code: `
        import { Firestore } from '@google-cloud/firestore';
        
        const db = new Firestore();
        const sessionId = steps.save_assets.assets.session_id;
        
        const session = {
          session_id: sessionId,
          channel_slug: this.channel_slug,
          topic: steps.generate_topic.topic,
          status: "rendering",
          created_at: new Date().toISOString(),
          brief: steps.call_showrunner.brief,
          script: steps.call_scriptwriter.script,
          research: steps.research_summarize.fact_pack,
          compliance: steps.compliance_check.compliance,
          assets: steps.save_assets.assets,
          render_job: steps.call_renderer.render_job,
          distribution: steps.distribution_metadata.distribution,
          platforms: this.platforms,
          metadata: {
            aspect_ratio: this.aspect_ratio,
            duration_target: this.duration_s || steps.fetch_channel_and_prompts.profile.durations.short
          }
        };
        
        await db.collection('production_sessions').doc(sessionId).set(session);
        
        $.export('session_saved', true);
        $.export('session_id', sessionId);
      `
    },

    // Step 20: Return Response
    {
      id: "return_response",
      name: "Return Workflow Response",
      code: `
        const response = {
          success: true,
          session_id: steps.save_session.session_id,
          channel: this.channel_slug,
          topic: steps.generate_topic.topic,
          render_job: steps.call_renderer.render_job,
          distribution: steps.distribution_metadata.distribution,
          message: "Content creation pipeline initiated successfully"
        };
        
        if (this.$respond) {
          await this.$respond({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response, null, 2)
          });
        }
        
        $.export('$return_value', response);
      `
    }
  ]
};