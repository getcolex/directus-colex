#!/bin/bash

# Colex Themes Deployment Script
# This script deploys the Colex themes to your Directus Docker instance

set -e

echo "======================================"
echo "Colex Themes Deployment Script"
echo "======================================"
echo ""

# Configuration
DROPLET_IP="${1:-YOUR_DROPLET_IP}"
DEPLOY_PATH="/opt/directus-colex/directus-docker-deploy"
EXTENSIONS_PATH="${DEPLOY_PATH}/extensions"

if [ "$DROPLET_IP" = "YOUR_DROPLET_IP" ]; then
    echo "❌ Error: Please provide your droplet IP"
    echo "Usage: bash deploy-themes.sh YOUR_DROPLET_IP"
    exit 1
fi

echo "📌 Deployment Configuration:"
echo "   Droplet IP: $DROPLET_IP"
echo "   Deploy Path: $DEPLOY_PATH"
echo "   Extensions Path: $EXTENSIONS_PATH"
echo ""

# Step 1: Pull latest changes
echo "📥 Step 1: Pulling latest changes from git..."
ssh root@$DROPLET_IP "cd /opt/directus-colex && git pull origin main"
echo "✅ Git pull completed"
echo ""

# Step 2: Create extensions directory
echo "📁 Step 2: Creating extensions directory..."
ssh root@$DROPLET_IP "mkdir -p $EXTENSIONS_PATH"
echo "✅ Extensions directory created"
echo ""

# Step 3: Copy extensions
echo "📋 Step 3: Copying theme extensions..."
ssh root@$DROPLET_IP "
  cp -r /opt/directus-colex/extensions/directus-extension-theme-claude-light $EXTENSIONS_PATH/
  cp -r /opt/directus-colex/extensions/directus-extension-theme-claude-dark $EXTENSIONS_PATH/
  chmod -R 755 $EXTENSIONS_PATH/
"
echo "✅ Extensions copied and permissions set"
echo ""

# Step 4: Remove node_modules from extensions (not needed on server)
echo "🧹 Step 4: Cleaning up node_modules..."
ssh root@$DROPLET_IP "
  rm -rf $EXTENSIONS_PATH/*/node_modules/
"
echo "✅ Cleaned up"
echo ""

# Step 5: Restart Docker containers
echo "🔄 Step 5: Restarting Directus containers..."
ssh root@$DROPLET_IP "
  cd $DEPLOY_PATH
  docker compose down
  docker compose up -d
"
echo "✅ Containers restarted"
echo ""

# Step 6: Wait for startup
echo "⏳ Waiting for Directus to start (30 seconds)..."
sleep 30
echo "✅ Done waiting"
echo ""

# Step 7: Check logs
echo "📋 Step 7: Checking extension loading..."
ssh root@$DROPLET_IP "
  cd $DEPLOY_PATH
  docker compose logs directus | grep -i -E 'extension|theme' | tail -10
"
echo ""

# Step 8: Final status
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "📝 Next Steps:"
echo "   1. Go to https://app.getcolex.com"
echo "   2. Login with your admin credentials"
echo "   3. Go to Settings → Appearance"
echo "   4. Select Claude Light or Claude Dark theme"
echo "   5. Click Save and refresh"
echo ""
echo "❓ Troubleshooting:"
echo "   - Check logs: ssh root@$DROPLET_IP 'cd $DEPLOY_PATH && docker compose logs directus'"
echo "   - Restart: ssh root@$DROPLET_IP 'cd $DEPLOY_PATH && docker compose restart'"
echo ""
