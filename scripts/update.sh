#!/bin/bash

# Update script for 21SIXTY Scraper
# This script updates the application from GitHub and restarts services

set -e

APP_DIR="/var/www/scraper"
BRANCH=${1:-"main"}

echo "=========================================="
echo "Updating 21SIXTY Scraper"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "$APP_DIR/.git" ]; then
    echo "Error: $APP_DIR is not a git repository"
    echo "Please run this script from the server where the app is installed"
    exit 1
fi

cd "$APP_DIR"

# Show current commit
echo "Current version:"
git log -1 --oneline
echo ""

# Fetch latest changes
echo "Fetching latest changes from GitHub..."
git fetch origin

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Already up to date!"
    exit 0
fi

echo "New version available:"
git log HEAD..origin/$BRANCH --oneline
echo ""

# Pull latest changes
echo "Pulling latest changes..."
git pull origin $BRANCH

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Check if Playwright needs updating
echo ""
echo "Checking Playwright installation..."
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

# Rebuild application
echo ""
echo "Building application..."
npm run build

# Restart PM2
echo ""
echo "Restarting application..."
pm2 restart scraper

# Show status
echo ""
echo "=========================================="
echo "Update complete!"
echo "=========================================="
echo ""
echo "Application status:"
pm2 status scraper
echo ""
echo "Latest logs:"
pm2 logs scraper --lines 10 --nostream
echo ""
echo "To view full logs: pm2 logs scraper"

