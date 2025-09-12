#!/bin/bash

# Alternative: Use Cloudflare Pages for public hosting

echo "Setting up alternative public hosting solution..."

# Create a simple redirect page that points to the Cloud Run service
cat > /workspaces/dpgen-content-pipeline/public/redirect.html << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>DeepParallel - Redirecting...</title>
    <meta charset="utf-8">
    <script>
        // Check if user has auth token
        const token = localStorage.getItem('auth_token');
        if (token) {
            // Redirect to authenticated endpoint
            window.location.href = 'https://dpgen-renderer-29690876826.us-central1.run.app';
        }
    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 3rem;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            max-width: 600px;
        }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        .info {
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 10px;
            margin: 2rem 0;
        }
        .solution {
            background: #00d084;
            color: white;
            padding: 1rem 2rem;
            border-radius: 25px;
            display: inline-block;
            margin-top: 1rem;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 DeepParallel.org</h1>
        <div class="info">
            <h2>Organization Policy Notice</h2>
            <p>This domain is protected by Google Cloud organization policies that prevent direct public access.</p>
            
            <div class="solution">
                ✅ Solution: Contact admin for API credentials
            </div>
            
            <p style="margin-top: 2rem;">
                <strong>For API Access:</strong><br>
                Email: mike@michaelcrowemycology.com
            </p>
            
            <p style="margin-top: 1rem; opacity: 0.8;">
                The service is fully operational at:<br>
                <code>https://dpgen-renderer-29690876826.us-central1.run.app</code><br>
                (Authentication required)
            </p>
        </div>
    </div>
</body>
</html>
HTML

echo "Created redirect page at /workspaces/dpgen-content-pipeline/public/redirect.html"

# Create GitHub Pages deployment
mkdir -p /workspaces/dpgen-content-pipeline/docs
cp /workspaces/dpgen-content-pipeline/public/index.html /workspaces/dpgen-content-pipeline/docs/index.html
cp /workspaces/dpgen-content-pipeline/public/redirect.html /workspaces/dpgen-content-pipeline/docs/redirect.html

# Create CNAME file for GitHub Pages
echo "deepparallel.org" > /workspaces/dpgen-content-pipeline/docs/CNAME

echo ""
echo "==================================="
echo "Alternative Solutions Available:"
echo "==================================="
echo ""
echo "Option 1: GitHub Pages (Recommended)"
echo "1. Push the 'docs' folder to a GitHub repository"
echo "2. Enable GitHub Pages in repository settings"
echo "3. Update DNS to point to GitHub Pages:"
echo "   A records: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153"
echo ""
echo "Option 2: Cloudflare Pages"
echo "1. Sign up for Cloudflare (free)"
echo "2. Add deepparallel.org to Cloudflare"
echo "3. Deploy the 'public' folder to Cloudflare Pages"
echo "4. Cloudflare will handle DNS and SSL automatically"
echo ""
echo "Option 3: Netlify"
echo "1. Sign up for Netlify (free)"
echo "2. Drag and drop the 'public' folder"
echo "3. Configure custom domain in Netlify settings"
echo ""
echo "Option 4: Request Organization Policy Exception"
echo "Contact your Google Cloud organization admin to:"
echo "- Add an exception for project 'deep-parallel-content'"
echo "- Or modify the iam.allowedPolicyMemberDomains constraint"
echo ""
echo "The static site files are ready in:"
echo "- /workspaces/dpgen-content-pipeline/public/"
echo "- /workspaces/dpgen-content-pipeline/docs/"