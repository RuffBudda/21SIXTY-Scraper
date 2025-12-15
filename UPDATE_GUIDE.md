# Update Guide - 21SIXTY Scraper

This guide explains how to update your scraper installation on the DigitalOcean droplet.

> **Note:** Make sure you've pushed the latest code (including `scripts/update.sh` and `app/api/webhook/deploy/route.ts`) to your GitHub repository before setting up auto-deployment.

## Quick Update (Manual)

### Method 1: SSH and Update

1. **SSH into your droplet:**
   ```bash
   ssh root@[YOUR_DROPLET_IP]
   ```

2. **Navigate to the application directory:**
   ```bash
   cd /var/www/scraper
   ```

3. **Pull latest changes from GitHub:**
   ```bash
   git pull origin main
   ```

4. **Install any new dependencies:**
   ```bash
   npm install
   ```

5. **Reinstall Playwright browsers (if Playwright version changed):**
   ```bash
   npx playwright install chromium
   ```

6. **Rebuild the application:**
   ```bash
   npm run build
   ```

7. **Restart the application:**
   ```bash
   pm2 restart scraper
   ```

8. **Verify the update:**
   ```bash
   pm2 logs scraper --lines 50
   ```

### Method 2: Using the Update Script

A convenient update script is available:

```bash
ssh root@[YOUR_DROPLET_IP]
cd /var/www/scraper
chmod +x scripts/update.sh
./scripts/update.sh
```

## Automatic Deployment (Recommended)

For automatic deployment whenever you push to GitHub, see the [Auto-Deployment Setup](#auto-deployment-setup) section below.

## Update Checklist

Before updating, it's good practice to:

- [ ] **Check for breaking changes** in the commit messages
- [ ] **Backup your `.env.local`** file (if you have one)
- [ ] **Verify the update** works in a test environment first (optional)

After updating:

- [ ] **Check PM2 logs** for any errors: `pm2 logs scraper`
- [ ] **Test the application** by visiting your domain
- [ ] **Monitor memory usage**: `pm2 monit`

## Troubleshooting Updates

### Issue: Git pull fails with "Your local changes would be overwritten"

**Error message:**
```
error: Your local changes to the following files would be overwritten by merge:
	scripts/server-setup.sh
Please commit your changes or stash them before you merge.
Aborting
```

**Solution 1: Use the update script (Recommended)**

The update script automatically handles local changes:

```bash
cd /var/www/scraper
chmod +x scripts/update.sh
./scripts/update.sh
```

**Solution 2: Stash local changes manually**

If you prefer to handle it manually:

```bash
cd /var/www/scraper

# Stash your local changes
git stash

# Pull the latest changes
git pull origin main

# Apply your stashed changes back (if needed)
git stash pop

# If there are conflicts, resolve them manually
# Then commit if you want to keep the merged changes
```

**Solution 3: Discard local changes**

If your local changes are not important and you want to match GitHub exactly:

```bash
cd /var/www/scraper

# Discard all local changes
git reset --hard HEAD

# Pull the latest changes
git pull origin main
```

**Solution 4: Commit local changes first**

If you want to keep your local changes:

```bash
cd /var/www/scraper

# Commit your local changes
git add .
git commit -m "Local server changes"

# Pull and merge
git pull origin main

# If there are merge conflicts, resolve them:
# 1. Edit the conflicted files
# 2. git add <resolved-files>
# 3. git commit
```

### Issue: Git pull fails with "permission denied"

**Solution:**
```bash
cd /var/www/scraper
chown -R $USER:$USER .
git pull origin main
```

### Issue: npm install fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Build fails

**Solution:**
```bash
# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build
```

### Issue: Application won't start after update

**Solution:**
```bash
# Check PM2 logs
pm2 logs scraper --err

# Restart PM2
pm2 restart scraper

# If still failing, delete and recreate
pm2 delete scraper
pm2 start ecosystem.config.js
pm2 save
```

### Issue: Playwright errors after update

**Solution:**
```bash
# Reinstall Playwright dependencies
chmod +x scripts/fix-playwright-deps.sh
./scripts/fix-playwright-deps.sh
pm2 restart scraper
```

**Note:** The fix script now provides clear error messages if something goes wrong. If you see errors, they will be displayed (not hidden) so you can diagnose the issue properly.

### Issue: Playwright installation shows unclear errors

**Problem:** Previous versions of scripts suppressed error messages, making debugging difficult.

**Solution:** The updated scripts (`update.sh` and `fix-playwright-deps.sh`) now:
- Show all error messages clearly
- Provide actionable error messages
- Distinguish between "command not available" vs "command failed"
- Exit with proper error codes for automation

If you encounter Playwright installation errors, you'll now see exactly what went wrong and can take appropriate action.

## Rollback to Previous Version

If an update causes issues, you can rollback:

```bash
cd /var/www/scraper

# View commit history
git log --oneline -10

# Rollback to a specific commit (replace COMMIT_HASH)
git reset --hard COMMIT_HASH

# Rebuild and restart
npm run build
pm2 restart scraper
```

## Update Frequency Recommendations

- **Security updates**: Apply immediately
- **Bug fixes**: Apply within 24-48 hours
- **Feature updates**: Review and test before applying
- **Major version updates**: Test in staging first (if available)

## Auto-Deployment Setup

See the [Auto-Deployment Setup](#auto-deployment-setup) section below for GitHub webhook configuration.

---

## Auto-Deployment Setup

### Overview

Auto-deployment allows your droplet to automatically update whenever you push changes to the `main` branch on GitHub. This is done using GitHub webhooks.

### Prerequisites

- GitHub repository with your code
- SSH access to your droplet
- A secret token for webhook authentication

### Step 1: Generate a Secret Token

On your droplet, generate a secure token:

```bash
ssh root@[YOUR_DROPLET_IP]
openssl rand -hex 32
```

**Save this token** - you'll need it for GitHub webhook configuration.

### Step 2: Configure GitHub Webhook

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://scrape.2160.media/api/webhook/deploy` (or your domain)
   - **Content type**: `application/json`
   - **Secret**: Paste the token you generated in Step 1
   - **Events**: Select "Just the push event"
   - **Active**: ✅ Checked
4. Click **Add webhook**

### Step 3: Set Environment Variable on Server

On your droplet, add the secret token:

```bash
ssh root@[YOUR_DROPLET_IP]
cd /var/www/scraper

# Create or edit .env.local
nano .env.local
```

Add this line:
```
DEPLOY_SECRET=your-secret-token-here
```

Save and exit (Ctrl+X, then Y, then Enter).

### Step 4: Make Update Script Executable

```bash
chmod +x /var/www/scraper/scripts/update.sh
```

### Step 5: Restart Application

```bash
pm2 restart scraper
```

### Step 6: Test Auto-Deployment

1. Make a small change to your code (e.g., update README.md)
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Test auto-deployment"
   git push origin main
   ```
3. Check GitHub webhook delivery:
   - Go to your repository → Settings → Webhooks
   - Click on your webhook
   - Check "Recent Deliveries" - should show a successful delivery
4. Check server logs:
   ```bash
   ssh root@[YOUR_DROPLET_IP]
   pm2 logs scraper --lines 50
   ```

You should see deployment messages in the logs.

### Troubleshooting Auto-Deployment

#### Webhook shows "Failed" in GitHub

1. **Check webhook URL is correct:**
   - Should be: `https://scrape.2160.media/api/webhook/deploy`
   - Make sure your domain is accessible

2. **Check SSL certificate:**
   ```bash
   curl -I https://scrape.2160.media/api/webhook/deploy
   ```

3. **Check server logs:**
   ```bash
   pm2 logs scraper --err
   tail -f /var/log/nginx/error.log
   ```

#### Webhook succeeds but deployment doesn't happen

1. **Check DEPLOY_SECRET matches:**
   ```bash
   cat /var/www/scraper/.env.local | grep DEPLOY_SECRET
   ```
   Compare with the secret in GitHub webhook settings.

2. **Check file permissions:**
   ```bash
   cd /var/www/scraper
   ls -la scripts/update.sh
   chmod +x scripts/update.sh
   ```

3. **Check git permissions:**
   ```bash
   cd /var/www/scraper
   git status
   ```

#### Deployment fails silently

Check PM2 logs for errors:
```bash
pm2 logs scraper --err --lines 100
```

### Security Considerations

- **Never commit `.env.local`** to GitHub (it's already in `.gitignore`)
- **Use a strong secret token** (at least 32 characters)
- **Limit webhook to push events only**
- **Monitor webhook deliveries** in GitHub for suspicious activity
- **Consider IP whitelisting** if your Nginx supports it

### Disabling Auto-Deployment

To temporarily disable auto-deployment:

1. Go to GitHub → Repository → Settings → Webhooks
2. Click on your webhook
3. Uncheck **Active**
4. Click **Update webhook**

Or remove the webhook entirely if you no longer need it.

---

## Manual Deployment Script

If you prefer to deploy manually from your local machine:

```bash
./scripts/deploy.sh [DROPLET_IP] [GITHUB_REPO_URL]
```

Example:
```bash
./scripts/deploy.sh 123.45.67.89 https://github.com/RuffBudda/21SIXTY-Scraper.git
```

This script will:
- SSH into your droplet
- Pull latest changes from GitHub
- Install dependencies
- Build the application
- Restart PM2
- Reload Nginx

