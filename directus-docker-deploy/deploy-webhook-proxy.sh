#!/bin/bash

set -e  # Exit on error

echo "=== Deploying Webhook Proxy to Production ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: Must run from directus-docker-deploy directory"
    exit 1
fi

echo -e "${BLUE}Step 1: Pulling latest changes from git...${NC}"
git pull origin feature/parijat

echo ""
echo -e "${BLUE}Step 2: Building webhook-proxy extension...${NC}"
cd ../extensions/directus-endpoint-webhook-proxy
docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c 'npm install && npm run build'
echo -e "${GREEN}✓ Webhook proxy built${NC}"

echo ""
echo -e "${BLUE}Step 3: Building updated configurable-button extension...${NC}"
cd ../directus-extension-configurable-button
docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c 'npm install && npm run build'
echo -e "${GREEN}✓ Configurable button built${NC}"

echo ""
echo -e "${BLUE}Step 4: Verifying docker-compose.yml has webhook-proxy volume...${NC}"
cd ../../directus-docker-deploy
if grep -q "directus-endpoint-webhook-proxy" docker-compose.yml; then
    echo -e "${GREEN}✓ docker-compose.yml already configured${NC}"
else
    echo "⚠️  WARNING: docker-compose.yml missing webhook-proxy volume mount"
    echo "Add this line to the directus service volumes:"
    echo "  - ../extensions/directus-endpoint-webhook-proxy:/directus/extensions/directus-endpoint-webhook-proxy"
fi

echo ""
echo -e "${BLUE}Step 5: Restarting Directus service...${NC}"
docker compose restart directus

echo ""
echo -e "${BLUE}Step 6: Waiting for Directus to start...${NC}"
sleep 5

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Next steps:"
echo "1. Check logs: docker compose logs -f directus | grep -i webhook"
echo "2. Verify endpoint is registered at: https://app.getcolex.com/admin/settings/extensions"
echo "3. Test webhook functionality with a test task"
echo ""
