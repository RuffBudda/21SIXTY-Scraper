# Fixing Playwright Missing Dependencies Error

## Problem

If you encounter this error:
```
error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory
```

This means your Linux system is missing required system libraries that Chromium/Playwright needs to run.

## Quick Fix

Run the fix script on your server:

```bash
cd /var/www/scraper
chmod +x scripts/fix-playwright-deps.sh
./scripts/fix-playwright-deps.sh
pm2 restart scraper
```

## Manual Fix (if script doesn't work)

If you prefer to install dependencies manually:

```bash
# Update package list
apt-get update

# Install all required dependencies
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

# Reinstall Playwright browsers
npx playwright install chromium

# Restart your application
pm2 restart scraper
```

## Using Playwright's Built-in Installer

Playwright also provides a command to install dependencies automatically:

```bash
# After npm install
npx playwright install-deps chromium
```

Note: This command may not be available in all Playwright versions. If it fails, use the manual method above.

## Verification

After installing dependencies, verify Playwright works:

```bash
# Test Playwright installation
node -e "const {chromium} = require('playwright'); (async () => { const browser = await chromium.launch({headless: true}); await browser.close(); console.log('Playwright works!'); })();"
```

If this command runs without errors, Playwright is properly configured.

## Common Issues

### Issue: Still getting library errors after installation

**Solution:** Make sure you've restarted your application:
```bash
pm2 restart scraper
```

### Issue: Permission denied when running script

**Solution:** Make the script executable:
```bash
chmod +x scripts/fix-playwright-deps.sh
```

### Issue: apt-get command not found

**Solution:** You might be on a different Linux distribution. For Ubuntu/Debian, use `apt-get`. For other distributions:
- **CentOS/RHEL**: `yum install` or `dnf install`
- **Arch Linux**: `pacman -S`
- **Alpine**: `apk add`

You'll need to find the equivalent packages for your distribution.

## Prevention

To prevent this issue in the future, ensure the `server-setup.sh` script runs during initial server setup. This script installs all required dependencies automatically.

