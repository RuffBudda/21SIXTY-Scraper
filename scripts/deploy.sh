#!/bin/bash

# Deployment script for 2160 Scraper
# Run this from your local machine after droplet is created

set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/deploy.sh [DROPLET_IP]"
    echo "Example: ./scripts/deploy.sh 123.45.67.89"
    exit 1
fi

DROPLET_IP=$1
APP_DIR="/var/www/scraper"

echo "=========================================="
echo "Deploying 2160 Scraper to $DROPLET_IP"
echo "=========================================="

# Upload files (exclude node_modules, .next, .git)
echo "Uploading files..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    --exclude '.cursor' \
    --exclude '*.log' \
    --exclude '.env.local' \
    ./ root@$DROPLET_IP:$APP_DIR/

echo "Files uploaded successfully!"

# Run setup commands on remote server
echo "Running setup on remote server..."
ssh root@$DROPLET_IP << EOF
    set -e
    cd $APP_DIR
    
    echo "Installing dependencies..."
    npm install
    
    echo "Installing Playwright browser..."
    npx playwright install chromium
    
    echo "Building application..."
    npm run build
    
    echo "Setting up PM2..."
    pm2 delete scraper 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    
    echo "Configuring Nginx..."
    cp nginx/scraper.conf /etc/nginx/sites-available/scraper
    ln -sf /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/scraper
    nginx -t
    systemctl reload nginx
    
    echo "Deployment complete!"
EOF

echo ""
echo "=========================================="
echo "Deployment successful!"
echo "=========================================="
echo "Application should be running at: http://$DROPLET_IP:3000"
echo ""
echo "Next steps:"
echo "1. Setup DNS A record: scrape.2160.media -> $DROPLET_IP"
echo "2. Run SSL setup: ssh root@$DROPLET_IP 'certbot --nginx -d scrape.2160.media'"
echo "3. Test: https://scrape.2160.media"

