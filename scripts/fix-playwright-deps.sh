#!/bin/bash

# Quick Fix Script for Playwright Missing Dependencies
# Run this script if you encounter "libatk-1.0.so.0" or similar library errors

set -e

echo "=========================================="
echo "Fixing Playwright Dependencies"
echo "=========================================="

# Check if we're in the project directory
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the project root directory"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed"
    exit 1
fi

echo "Step 1: Installing system dependencies..."
apt-get update

# Install all Playwright system dependencies
apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  libu2f-udev \
  libvulkan1 \
  libcairo-gobject2 \
  libgdk-pixbuf2.0-0 \
  libpangocairo-1.0-0 \
  libappindicator3-1

echo ""
echo "Step 2: Installing Playwright browsers..."
npx playwright install chromium

echo ""
echo "Step 3: Installing Playwright system dependencies (if available)..."
# Try to install Playwright's system dependencies
# This command may not be available in all Playwright versions
npx playwright install-deps chromium 2>/dev/null || {
    echo "Note: 'playwright install-deps' not available in this version"
    echo "System dependencies have been installed manually"
}

echo ""
echo "=========================================="
echo "Dependencies fix complete!"
echo "=========================================="
echo ""
echo "You can now restart your application:"
echo "  pm2 restart scraper"
echo ""

