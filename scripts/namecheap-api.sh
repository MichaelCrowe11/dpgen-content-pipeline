#!/bin/bash

# Namecheap API Direct Access Script

USERNAME="southwestfungi"
API_KEY="437d398aa3ec49a0906426778b5b9354E"
CLIENT_IP="172.182.200.133"
API_URL="https://api.namecheap.com/xml.response"

# Function to make API calls
namecheap_api() {
    local command=$1
    shift
    local params="$@"
    
    curl -s -G "$API_URL" \
        --data-urlencode "ApiUser=$USERNAME" \
        --data-urlencode "ApiKey=$API_KEY" \
        --data-urlencode "UserName=$USERNAME" \
        --data-urlencode "ClientIp=$CLIENT_IP" \
        --data-urlencode "Command=$command" \
        $params
}

# List all domains
echo "Fetching your domains..."
namecheap_api "namecheap.domains.getList" | xmllint --format -

# Get info about deepparallel.org
echo -e "\n\nFetching deepparallel.org domain info..."
namecheap_api "namecheap.domains.getInfo" --data-urlencode "DomainName=deepparallel.org" | xmllint --format -

# Get DNS hosts for deepparallel.org
echo -e "\n\nFetching DNS records for deepparallel.org..."
namecheap_api "namecheap.domains.dns.getHosts" --data-urlencode "SLD=deepparallel" --data-urlencode "TLD=org" | xmllint --format -