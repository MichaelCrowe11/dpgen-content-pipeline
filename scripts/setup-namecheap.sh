#!/bin/bash

# Namecheap CLI Configuration Setup
# Edit this file with your actual API key before running

NAMECHEAP_USERNAME="southwestfungi"
NAMECHEAP_API_KEY="437d398aa3ec49a0906426778b5b9354E"  # Replace with your actual API key
NAMECHEAP_IP_ADDRESS="172.182.200.133"

# Create config directory
mkdir -p ~/.namecheap

# Create configuration file
cat > ~/.namecheap/config.json << EOF
{
  "username": "${NAMECHEAP_USERNAME}",
  "apiKey": "${NAMECHEAP_API_KEY}",
  "ipAddress": "${NAMECHEAP_IP_ADDRESS}"
}
EOF

# Set proper permissions (readable only by owner)
chmod 600 ~/.namecheap/config.json

echo "Namecheap CLI configuration created at ~/.namecheap/config.json"

# Test the configuration
echo "Testing Namecheap API connection..."
namecheap domains list

# Check deepparallel.org domain
echo ""
echo "Checking deepparallel.org domain status..."
namecheap domains getInfo --domain deepparallel.org