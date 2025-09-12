#!/bin/bash

# Install gcloud CLI in GitHub Codespace

echo "Installing Google Cloud SDK..."

# Go to home directory
cd ~

# Download the SDK
curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz

# Extract it
tar -xf google-cloud-cli-linux-x86_64.tar.gz

# Install it
./google-cloud-sdk/install.sh --quiet --path-update true

# Source the path
source ~/google-cloud-sdk/path.bash.inc

echo "Installation complete!"
echo "Testing gcloud..."
gcloud version

echo ""
echo "Next steps:"
echo "1. Run: source ~/google-cloud-sdk/path.bash.inc"
echo "2. Run: gcloud auth login"
echo "3. Set project: gcloud config set project deepparallel"