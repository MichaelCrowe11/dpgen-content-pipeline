#!/bin/bash

# Domain Verification Script for deepparallel.org

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

# Add Google verification TXT record
add_verification_record() {
    local verification_code=$1
    
    echo "Adding Google domain verification TXT record..."
    
    # Get existing records first
    existing_records=$(namecheap_api "namecheap.domains.dns.getHosts" \
        --data-urlencode "SLD=deepparallel" \
        --data-urlencode "TLD=org")
    
    # Add verification TXT record along with existing A records
    namecheap_api "namecheap.domains.dns.setHosts" \
        --data-urlencode "SLD=deepparallel" \
        --data-urlencode "TLD=org" \
        --data-urlencode "HostName1=@" \
        --data-urlencode "RecordType1=A" \
        --data-urlencode "Address1=216.239.32.21" \
        --data-urlencode "TTL1=300" \
        --data-urlencode "HostName2=@" \
        --data-urlencode "RecordType2=A" \
        --data-urlencode "Address2=216.239.34.21" \
        --data-urlencode "TTL2=300" \
        --data-urlencode "HostName3=@" \
        --data-urlencode "RecordType3=A" \
        --data-urlencode "Address3=216.239.36.21" \
        --data-urlencode "TTL3=300" \
        --data-urlencode "HostName4=@" \
        --data-urlencode "RecordType4=A" \
        --data-urlencode "Address4=216.239.38.21" \
        --data-urlencode "TTL4=300" \
        --data-urlencode "HostName5=www" \
        --data-urlencode "RecordType5=CNAME" \
        --data-urlencode "Address5=deepparallel.org" \
        --data-urlencode "TTL5=300" \
        --data-urlencode "HostName6=@" \
        --data-urlencode "RecordType6=TXT" \
        --data-urlencode "Address6=$verification_code" \
        --data-urlencode "TTL6=300" | xmllint --format -
    
    echo -e "\n✅ Verification TXT record added"
    echo "Next steps:"
    echo "1. Wait 5-10 minutes for DNS propagation"
    echo "2. Run: gcloud domains verify deepparallel.org"
    echo "3. Once verified, run: gcloud beta run domain-mappings create --service dpgen-renderer --domain deepparallel.org"
}

# Main
echo "To verify deepparallel.org with Google Cloud:"
echo "1. Go to: https://search.google.com/search-console/"
echo "2. Add property for deepparallel.org"
echo "3. Choose 'Domain' verification method"
echo "4. Copy the TXT record value (looks like: google-site-verification=xxxxx)"
echo ""
read -p "Enter the Google verification TXT record value: " verification_code

if [ -z "$verification_code" ]; then
    echo "No verification code provided. Exiting."
    exit 1
fi

add_verification_record "$verification_code"