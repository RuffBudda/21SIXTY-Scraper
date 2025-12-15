# Deployment Guide for 2160 Scraper

## Prerequisites

- DigitalOcean account
- Domain `2160.media` managed in DigitalOcean
- SSH key added to DigitalOcean account

## Step 1: Create DigitalOcean Droplet

Since the MCP droplet-create function is not available, create the droplet manually:

1. Log in to [DigitalOcean Console](https://cloud.digitalocean.com/)
2. Click "Create" → "Droplets"
3. Configure:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic - $6/month (1GB RAM, 1 vCPU, 25GB SSD)
   - **Region**: Singapore (sgp1)
   - **Authentication**: SSH keys
   - **Name**: "2160 tools"
   - **Project**: Select "2160" project
4. Click "Create Droplet"
5. Note the droplet IP address

## Step 2: Setup DNS Record

After droplet creation, add DNS A record:

1. Go to DigitalOcean Networking → Domains
2. Select `2160.media`
3. Add A record:
   - **Name**: `scrape`
   - **Type**: `A`
   - **Value**: [Droplet IP address]
   - **TTL**: 3600

## Step 3: Initial Server Setup

SSH into the droplet:

```bash
ssh root@[DROPLET_IP]
```

Run the setup script:

```bash
chmod +x scripts/server-setup.sh
sudo ./scripts/server-setup.sh
```

## Step 4: Upload Application Files

From your local machine, upload files to the droplet:

```bash
# Create deployment package (exclude node_modules and .next)
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' \
  ./ root@[DROPLET_IP]:/var/www/scraper/
```

Or use SCP:

```bash
scp -r . root@[DROPLET_IP]:/var/www/scraper/
```

## Step 5: Install Dependencies and Build

SSH into the droplet:

```bash
ssh root@[DROPLET_IP]
cd /var/www/scraper
npm install
npx playwright install chromium
npm run build
```

## Step 6: Configure Environment Variables

Create `.env.local` file:

```bash
nano /var/www/scraper/.env.local
```

Add your environment variables (API_KEY, etc.)

## Step 7: Start Application with PM2

```bash
cd /var/www/scraper
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## Step 8: Configure Nginx

Copy Nginx configuration:

```bash
cp nginx/scraper.conf /etc/nginx/sites-available/scraper
ln -s /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Step 9: Setup SSL Certificate

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d scrape.2160.media
```

Follow the prompts. Certbot will automatically configure SSL.

## Step 10: Verify Deployment

1. Check application is running: `pm2 status`
2. Check Nginx: `systemctl status nginx`
3. Visit: `https://scrape.2160.media`
4. Test scraping endpoint

## Monitoring

- View PM2 logs: `pm2 logs scraper`
- Monitor resources: `pm2 monit`
- Check Nginx logs: `tail -f /var/log/nginx/access.log`

## Troubleshooting

- If Playwright fails: Check system dependencies are installed
- If memory issues: Monitor with `pm2 monit` and adjust browser pool settings
- If SSL fails: Ensure DNS A record is propagated (check with `dig scrape.2160.media`)

