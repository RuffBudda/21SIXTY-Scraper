# Deployment Guide for 2160 Scraper

## Prerequisites

- DigitalOcean account
- Domain `2160.media` managed in DigitalOcean
- SSH key added to DigitalOcean account
- GitHub repository with the scraper code

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

Install Git (if not already installed):

```bash
apt-get update
apt-get install -y git
```

Create application directory and clone repository:

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/RuffBudda/21SIXTY-Scraper.git scraper
cd scraper
chmod +x scripts/server-setup.sh
./scripts/server-setup.sh
```

## Step 4: Install Dependencies and Build

```bash
cd /var/www/scraper
npm install
npx playwright install chromium

# Install Playwright system dependencies (important!)
chmod +x scripts/fix-playwright-deps.sh
./scripts/fix-playwright-deps.sh

npm run build
```

## Step 5: Configure Environment Variables

Environment variables are secret settings that your application needs to run. Think of them like passwords that only your server knows.

### What you need to do:

1. **Open the file editor** (nano is a simple text editor):
   ```bash
   nano /var/www/scraper/.env.local
   ```
   
   This command opens a text editor. If the file doesn't exist, it will create a new one.

2. **You'll see an empty screen** (or some text if the file already exists). This is normal!

3. **Type or paste your environment variables**. For this scraper, you typically don't need any environment variables, but if you want to add one (like an API key), you would type:
   ```
   API_KEY=your-secret-key-here
   ```
   
   **Important**: 
   - No spaces around the `=` sign
   - Replace `your-secret-key-here` with your actual key
   - Each variable goes on its own line

4. **Save and exit**:
   - Press `Ctrl + X` (this means you want to exit)
   - You'll be asked "Save modified buffer?" - type `Y` and press Enter
   - You'll be asked for the filename - just press Enter (it will use the same filename)

5. **Verify the file was created**:
   ```bash
   cat /var/www/scraper/.env.local
   ```
   
   This will show you the contents of the file. You should see what you just typed.

### Notes:
- If you don't need any environment variables, you can skip this step or create an empty file
- The `.env.local` file is already in `.gitignore`, so it won't be uploaded to GitHub (this is good for security!)
- If you make a mistake, just run `nano /var/www/scraper/.env.local` again to edit it

## Step 6: Start Application with PM2

```bash
cd /var/www/scraper
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## Step 7: Configure Nginx

Copy Nginx configuration:

```bash
cp nginx/scraper.conf /etc/nginx/sites-available/scraper
ln -s /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Step 8: Setup SSL Certificate

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d scrape.2160.media
```

Follow the prompts. Certbot will automatically configure SSL.

## Step 9: Verify Deployment

1. Check application is running: `pm2 status`
2. Check Nginx: `systemctl status nginx`
3. Visit: `https://scrape.2160.media`
4. Test scraping endpoint

## Monitoring

- View PM2 logs: `pm2 logs scraper`
- Monitor resources: `pm2 monit`
- Check Nginx logs: `tail -f /var/log/nginx/access.log`

## Updating the Application

See [UPDATE_GUIDE.md](./UPDATE_GUIDE.md) for detailed update instructions, including:
- Manual update procedures
- Automatic deployment via GitHub webhooks
- Troubleshooting update issues
- Rollback procedures

Quick update:
```bash
ssh root@[DROPLET_IP]
cd /var/www/scraper
./scripts/update.sh
```

## Troubleshooting

### Playwright Browser Launch Errors

If you encounter errors like:
- `libatk-1.0.so.0: cannot open shared object file`
- `browserType.launch: Target page, context or browser has been closed`
- Missing shared library errors

**Quick Fix:**
```bash
cd /var/www/scraper
chmod +x scripts/fix-playwright-deps.sh
./scripts/fix-playwright-deps.sh
pm2 restart scraper
```

This script will install all required system dependencies for Playwright/Chromium.

### Other Issues

- If memory issues: Monitor with `pm2 monit` and adjust browser pool settings
- If SSL fails: Ensure DNS A record is propagated (check with `dig scrape.2160.media`)
- If git clone fails: Ensure the repository is public or SSH keys are configured for GitHub

