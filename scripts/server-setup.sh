#!/bin/bash

# Server Setup Script for 2160 Scraper
# Optimized for DigitalOcean $6 droplet (1GB RAM, 1 vCPU)

set -e

echo "=========================================="
echo "2160 Scraper Server Setup"
echo "=========================================="

# Update system packages
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Git (if not already installed)
echo "Installing Git..."
apt-get install -y git

# Install Node.js 20.x
echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2

# Install Nginx
echo "Installing Nginx..."
apt-get install -y nginx

# Install Playwright system dependencies
echo "Installing Playwright system dependencies..."
apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libcairo-gobject2 \
  libgtk-3-0 \
  libgdk-pixbuf2.0-0 \
  fonts-liberation \
  libappindicator3-1 \
  xdg-utils

# Configure firewall (UFW)
echo "Configuring firewall..."
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw status

# Install fail2ban for basic security
echo "Installing fail2ban..."
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Create application and log directories
echo "Creating directories..."
mkdir -p /var/www
mkdir -p /var/log/scraper
chown -R $USER:$USER /var/www
chown -R $USER:$USER /var/log/scraper

# Create PM2 log directory
mkdir -p ~/.pm2/logs

echo "=========================================="
echo "Server setup complete!"
echo "=========================================="
echo ""
echo "NOTE: If you haven't cloned the repository yet, run:"
echo "  mkdir -p /var/www"
echo "  cd /var/www"
echo "  git clone https://github.com/RuffBudda/21SIXTY-Scraper.git scraper"
echo ""
echo "Then continue with:"
echo "1. cd /var/www/scraper"
echo "2. npm install"
echo "3. npx playwright install chromium"
echo "4. npm run build"
echo "5. Configure .env.local file"
echo "6. pm2 start ecosystem.config.js"
echo "7. Configure Nginx and SSL"

