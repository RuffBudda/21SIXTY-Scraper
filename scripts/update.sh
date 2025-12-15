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

# Check for local changes
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted local changes"
    echo "Stashing local changes..."
    git stash push -m "Auto-stash before update $(date +%Y-%m-%d_%H:%M:%S)"
fi

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

# Install Playwright browser
# Note: We don't use --with-deps because:
# 1. System dependencies should be installed via server-setup.sh or fix-playwright-deps.sh
# 2. If system deps are missing, we want to see the error clearly
# 3. The install-deps command is separate and may not be available in all versions
echo ""
echo "Installing Playwright browser..."
if ! npx playwright install chromium; then
    echo ""
    echo "ERROR: Failed to install Playwright browser"
    echo "This may be due to missing system dependencies."
    echo "Run the fix script: ./scripts/fix-playwright-deps.sh"
    exit 1
fi

# Rebuild application
echo ""
echo "Building application..."
if ! npm run build; then
    echo ""
    echo "ERROR: Build failed"
    echo "Check the error messages above for details"
    exit 1
fi

# Restart PM2
echo ""
echo "Restarting application..."
pm2 restart scraper

# Check if there were stashed changes
if git stash list | grep -q "Auto-stash before update"; then
    echo ""
    echo "Note: Local changes were stashed before update."
    echo "To view stashed changes: git stash list"
    echo "To apply stashed changes: git stash pop"
fi

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
