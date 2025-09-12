#!/bin/bash

# Rebrand DPGen to DeepParallel
# This script updates all references from DPGen to DeepParallel

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔄 Rebranding to DeepParallel${NC}"
echo "================================"

# Update renderer app
echo -e "${YELLOW}Updating renderer application...${NC}"
sed -i 's/DPGen/DeepParallel/g' renderer/app.py
sed -i 's/dpgen/deepparallel/g' renderer/app.py

# Update deployment scripts
echo -e "${YELLOW}Updating deployment scripts...${NC}"
sed -i 's/DPGen/DeepParallel/g' scripts/deploy.sh
sed -i 's/dpgen-/deepparallel-/g' scripts/deploy.sh

# Update credential scripts
echo -e "${YELLOW}Updating credential scripts...${NC}"
sed -i 's/DPGen/DeepParallel/g' scripts/setup-all-credentials.sh
sed -i 's/dpgen-/deepparallel-/g' scripts/setup-all-credentials.sh
sed -i 's/DPGen/DeepParallel/g' scripts/validate-credentials.sh
sed -i 's/dpgen-/deepparallel-/g' scripts/validate-credentials.sh

# Update documentation
echo -e "${YELLOW}Updating documentation...${NC}"
sed -i 's/DPGen/DeepParallel/g' README.md
sed -i 's/dpgen/deepparallel/g' README.md
sed -i 's/DPGen/DeepParallel/g' CREDENTIALS_SETUP.md
sed -i 's/dpgen/deepparallel/g' CREDENTIALS_SETUP.md

# Update config files
echo -e "${YELLOW}Updating configuration...${NC}"
sed -i 's/dpgen/deepparallel/g' config/.env.example

# Update package.json files
echo -e "${YELLOW}Updating package.json files...${NC}"
for pkg in package.json scripts/package.json seeds/package.json; do
    if [ -f "$pkg" ]; then
        sed -i 's/"name": "dpgen/"name": "deepparallel/g' "$pkg"
        sed -i 's/dpgen/deepparallel/g' "$pkg"
    fi
done

echo -e "${GREEN}✅ Rebranding complete!${NC}"
echo ""
echo "Next: The bucket names and service names will use 'deepparallel' prefix."
echo "Domain: deepparallel.org"