#!/bin/bash

# Setup script for GitHub webhook auto-deployment
# This script helps configure the webhook endpoint

set -e

APP_DIR="/var/www/scraper"
ENV_FILE="$APP_DIR/.env.local"

echo "=========================================="
echo "GitHub Webhook Auto-Deployment Setup"
echo "=========================================="
echo ""

# Check if .env.local exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env.local file..."
    touch "$ENV_FILE"
fi

# Generate secret token
echo "Generating secure webhook secret..."
SECRET=$(openssl rand -hex 32)
echo ""

# Check if DEPLOY_SECRET already exists
if grep -q "DEPLOY_SECRET" "$ENV_FILE"; then
    echo "DEPLOY_SECRET already exists in .env.local"
    read -p "Do you want to generate a new one? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove old DEPLOY_SECRET
        sed -i '/DEPLOY_SECRET/d' "$ENV_FILE"
        echo "DEPLOY_SECRET=$SECRET" >> "$ENV_FILE"
        echo "New DEPLOY_SECRET generated and saved!"
    else
        echo "Keeping existing DEPLOY_SECRET"
        SECRET=$(grep "DEPLOY_SECRET" "$ENV_FILE" | cut -d '=' -f2)
    fi
else
    echo "DEPLOY_SECRET=$SECRET" >> "$ENV_FILE"
    echo "DEPLOY_SECRET generated and saved!"
fi

echo ""
echo "=========================================="
echo "Webhook Configuration"
echo "=========================================="
echo ""
echo "1. Go to your GitHub repository"
echo "2. Navigate to: Settings → Webhooks → Add webhook"
echo ""
echo "Configure the webhook with these settings:"
echo ""
echo "  Payload URL: https://scrape.2160.media/api/webhook/deploy"
echo "  Content type: application/json"
echo "  Secret: $SECRET"
echo "  Events: Just the push event"
echo "  Active: ✓"
echo ""
echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Add the webhook in GitHub with the secret above"
echo "2. Make sure the update script is executable:"
echo "   chmod +x $APP_DIR/scripts/update.sh"
echo "3. Restart the application:"
echo "   pm2 restart scraper"
echo "4. Test by pushing a commit to the main branch"
echo ""
echo "To view webhook logs:"
echo "  pm2 logs scraper | grep -i webhook"
echo ""

