#!/bin/bash

# Deployment script for 2160 Scraper
# Run this from your local machine after droplet is created and initial setup is done

set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/deploy.sh [DROPLET_IP] [GITHUB_REPO_URL]"
    echo "Example: ./scripts/deploy.sh 123.45.67.89 https://github.com/RuffBudda/21SIXTY-Scraper.git"
    exit 1
fi

DROPLET_IP=$1
GITHUB_REPO=${2:-"https://github.com/RuffBudda/21SIXTY-Scraper.git"}
APP_DIR="/var/www/scraper"

echo "=========================================="
echo "Deploying 2160 Scraper to $DROPLET_IP"
echo "=========================================="

# Run setup commands on remote server
echo "Deploying from GitHub repository..."
ssh root@$DROPLET_IP << EOF
    set -e
    
    # Clone or update repository
    if [ -d "$APP_DIR/.git" ]; then
        echo "Updating existing repository..."
        cd $APP_DIR
        git pull origin main
    else
        echo "Cloning repository..."
        cd /var/www
        rm -rf scraper 2>/dev/null || true
        git clone $GITHUB_REPO scraper
        cd scraper
    fi
    
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

