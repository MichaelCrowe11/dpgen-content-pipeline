#!/bin/bash

# DNS Configuration for deepparallel.org
# This script sets up DNS records for GCP deployment

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

# Function to set DNS records
setup_cloud_run_dns() {
    echo "Setting up DNS for Cloud Run deployment..."
    
    # Clear existing records first
    echo "Clearing existing DNS records..."
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
        --data-urlencode "TTL5=300" | xmllint --format -
    
    echo -e "\n✅ DNS records configured for Google Cloud Load Balancer"
    echo "Next steps:"
    echo "1. Deploy your app to Cloud Run: gcloud run deploy renderer --source renderer/"
    echo "2. Set up domain mapping: gcloud run domain-mappings create --service renderer --domain deepparallel.org"
    echo "3. Verify domain ownership in Google Cloud Console"
}

# Function to set DNS for Firebase Hosting
setup_firebase_dns() {
    echo "Setting up DNS for Firebase Hosting..."
    
    namecheap_api "namecheap.domains.dns.setHosts" \
        --data-urlencode "SLD=deepparallel" \
        --data-urlencode "TLD=org" \
        --data-urlencode "HostName1=@" \
        --data-urlencode "RecordType1=A" \
        --data-urlencode "Address1=199.36.158.100" \
        --data-urlencode "TTL1=300" \
        --data-urlencode "HostName2=www" \
        --data-urlencode "RecordType2=CNAME" \
        --data-urlencode "Address2=deepparallel.org" \
        --data-urlencode "TTL2=300" | xmllint --format -
    
    echo -e "\n✅ DNS records configured for Firebase Hosting"
    echo "Next steps:"
    echo "1. Add domain in Firebase Console: firebase hosting:channel:deploy production"
    echo "2. Verify domain ownership"
}

# Function to set custom IP
setup_custom_ip() {
    local ip=$1
    echo "Setting up DNS for custom IP: $ip"
    
    namecheap_api "namecheap.domains.dns.setHosts" \
        --data-urlencode "SLD=deepparallel" \
        --data-urlencode "TLD=org" \
        --data-urlencode "HostName1=@" \
        --data-urlencode "RecordType1=A" \
        --data-urlencode "Address1=$ip" \
        --data-urlencode "TTL1=300" \
        --data-urlencode "HostName2=www" \
        --data-urlencode "RecordType2=CNAME" \
        --data-urlencode "Address2=deepparallel.org" \
        --data-urlencode "TTL2=300" | xmllint --format -
    
    echo -e "\n✅ DNS records configured for IP: $ip"
}

# Menu
echo "==================================="
echo "deepparallel.org DNS Configuration"
echo "==================================="
echo "1. Set up for Cloud Run (Recommended)"
echo "2. Set up for Firebase Hosting"
echo "3. Set up for custom IP address"
echo "4. Show current DNS records"
echo ""
read -p "Choose an option (1-4): " choice

case $choice in
    1)
        setup_cloud_run_dns
        ;;
    2)
        setup_firebase_dns
        ;;
    3)
        read -p "Enter your server IP address: " custom_ip
        setup_custom_ip "$custom_ip"
        ;;
    4)
        echo "Current DNS records:"
        namecheap_api "namecheap.domains.dns.getHosts" \
            --data-urlencode "SLD=deepparallel" \
            --data-urlencode "TLD=org" | xmllint --format -
        ;;
    *)
        echo "Invalid option"
        exit 1
        ;;
esac