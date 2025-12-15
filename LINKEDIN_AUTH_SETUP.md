# LinkedIn Authentication Setup Guide

## Overview

The scraper uses encrypted credentials stored in `lib/linkedinAuth.ts` and supports cookie-based authentication to bypass LinkedIn login walls.

## Credentials Storage

- **Location**: `lib/linkedinAuth.ts`
- **Encryption**: AES-256-CBC
- **Status**: Credentials are encrypted and stored securely in code

## Getting LinkedIn Cookies

Since HTTP scraping cannot perform login, you need to manually extract cookies from a logged-in browser session:

### Step-by-Step Instructions

1. **Log in to LinkedIn**
   - Use the credentials stored in `lib/linkedinAuth.ts`
   - You can retrieve them programmatically using `getLinkedInCredentials()`

2. **Open Browser DevTools**
   - Press `F12` or right-click → Inspect
   - Go to the **Network** tab

3. **Visit a LinkedIn Profile**
   - Navigate to any LinkedIn profile (e.g., `https://www.linkedin.com/in/davidcookuae/`)

4. **Find the Profile Request**
   - In the Network tab, find the request to the profile URL
   - Click on it to view details

5. **Copy Cookie Header**
   - Go to **Headers** → **Request Headers**
   - Find the `Cookie` header
   - Copy the entire value (it will be a long string)

6. **Set Environment Variable**
   - Create a `.env.local` file in the project root
   - Add: `LINKEDIN_COOKIES=<paste-cookie-value-here>`
   - Or set it in Vercel environment variables for production

## How It Works

1. **First Attempt**: Scraper tries without cookies
2. **Login Wall Detected**: If login wall is found, scraper automatically retries with cookies
3. **Fallback**: If cookies don't work, tries to extract partial data from meta tags
4. **Error**: Only throws error if no data can be extracted

## Environment Variables

### Required (for cookie-based auth)
```bash
LINKEDIN_COOKIES=li_at=...; JSESSIONID=...; (full cookie string)
```

### Optional (for custom encryption key)
```bash
LINKEDIN_ENCRYPTION_KEY=your-32-byte-key-here
```

## Security Notes

- ✅ Credentials are encrypted using AES-256-CBC
- ✅ Cookies should be stored in environment variables (not committed to git)
- ✅ `.env` files are already in `.gitignore`
- ⚠️ Cookies expire - refresh them periodically
- ⚠️ Don't share cookies publicly

## Troubleshooting

### "Login wall detected" error
- **Solution**: Set `LINKEDIN_COOKIES` environment variable with valid cookies
- **Check**: Cookies may have expired - get fresh ones

### "Failed to decrypt credentials" error
- **Solution**: Check that encryption key matches (default key is used if not set)

### Cookies not working
- **Check**: Cookies may have expired
- **Solution**: Get fresh cookies from browser
- **Note**: LinkedIn may detect automated access - use cookies sparingly

## Code Usage

```typescript
import { getLinkedInCredentials, getLinkedInCookies } from './lib/linkedinAuth';

// Get credentials (for manual login)
const { email, password } = getLinkedInCredentials();

// Get cookies (automatically used by scraper)
const cookies = getLinkedInCookies();
```

The scraper automatically uses cookies when available, so you don't need to manually pass them.

