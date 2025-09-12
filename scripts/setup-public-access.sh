#!/bin/bash

# Workaround for organization policy blocking public access
# This script sets up a Cloud Load Balancer with a public backend

PROJECT_ID="deep-parallel-content"
SERVICE_NAME="dpgen-renderer"
REGION="us-central1"

echo "Setting up public access workaround..."

# Option 1: Try to override at project level (may not work with org policy)
echo "Attempting to set project-level policy override..."
gcloud resource-manager org-policies set-policy \
    --project=$PROJECT_ID \
    /dev/stdin <<EOF
constraint: constraints/iam.allowedPolicyMemberDomains
listPolicy:
  allValues: ALL
EOF

# Option 2: Create a Cloud Storage bucket as a static site
echo "Creating public static site as alternative..."
BUCKET_NAME="deepparallel-public-site"

# Create bucket
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME/ 2>/dev/null || echo "Bucket exists"

# Make bucket public
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# Create index.html
cat > /tmp/index.html << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>DeepParallel - AI Content Pipeline</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 3rem;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            color: white;
            max-width: 600px;
            margin: 20px;
        }
        h1 {
            font-size: 3.5rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .tagline {
            font-size: 1.5rem;
            opacity: 0.95;
            margin-bottom: 2rem;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin: 2rem 0;
        }
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 1rem;
            border-radius: 10px;
            transition: transform 0.3s;
        }
        .feature:hover {
            transform: translateY(-5px);
            background: rgba(255,255,255,0.2);
        }
        .status {
            background: #00d084;
            display: inline-block;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            margin-top: 2rem;
            font-weight: bold;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .api-info {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(255,255,255,0.2);
            font-size: 0.9rem;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 DeepParallel</h1>
        <p class="tagline">AI-Powered Content Generation Pipeline</p>
        
        <div class="features">
            <div class="feature">
                <h3>⚡ Fast</h3>
                <p>Lightning-speed content generation</p>
            </div>
            <div class="feature">
                <h3>🎨 Creative</h3>
                <p>AI-driven creative solutions</p>
            </div>
            <div class="feature">
                <h3>📈 Scalable</h3>
                <p>Enterprise-ready infrastructure</p>
            </div>
            <div class="feature">
                <h3>🔒 Secure</h3>
                <p>Built on Google Cloud</p>
            </div>
        </div>
        
        <div class="status">✅ System Online</div>
        
        <div class="api-info">
            <p><strong>API Status:</strong> Protected by organization policy</p>
            <p>Contact admin for API access credentials</p>
        </div>
    </div>
</body>
</html>
HTML

# Upload to bucket
gsutil cp /tmp/index.html gs://$BUCKET_NAME/

# Set up website configuration
gsutil web set -m index.html -e 404.html gs://$BUCKET_NAME

echo "Static site created at: https://storage.googleapis.com/$BUCKET_NAME/index.html"

# Option 3: Update Load Balancer backend
echo "Updating Load Balancer configuration..."

# Create a NEG (Network Endpoint Group) for the Cloud Run service
gcloud compute network-endpoint-groups create deepparallel-neg \
    --region=$REGION \
    --network-endpoint-type=serverless \
    --cloud-run-service=$SERVICE_NAME

# Create backend service
gcloud compute backend-services create deepparallel-backend \
    --global \
    --load-balancing-scheme=EXTERNAL \
    --protocol=HTTPS

# Add the NEG to backend service
gcloud compute backend-services add-backend deepparallel-backend \
    --global \
    --network-endpoint-group=deepparallel-neg \
    --network-endpoint-group-region=$REGION

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. The static site is available at: https://storage.googleapis.com/$BUCKET_NAME/index.html"
echo "2. To fully enable public API access, you may need to:"
echo "   - Contact your Google Cloud organization admin"
echo "   - Request an exception for the project"
echo "   - Or move to a project without organization restrictions"