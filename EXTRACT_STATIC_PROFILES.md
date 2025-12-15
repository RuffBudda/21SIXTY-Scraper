# Extracting Static Profiles from LinkedIn

Since LinkedIn scraping can be unreliable on Vercel (timeouts, login walls), you can extract static profiles to provide instant responses for known profiles.

## Method 1: Using the Web UI (Easiest)

1. **Scrape a profile** (works best locally or when scraping succeeds)
   - Open your app in browser
   - Enter a LinkedIn URL
   - Click "Scrape"
   - Wait for results

2. **Export as Static Profile**
   - After successful scrape, click the green **"Export as Static Profile"** button
   - The static profile code will be copied to your clipboard

3. **Add to staticProfiles.ts**
   - Open `lib/staticProfiles.ts`
   - Paste the code at the top (after imports, before the staticLinkedInProfiles object)
   - Add the two lines shown in comments to the `staticLinkedInProfiles` object

**Example:**

```typescript
// Paste the generated profile code here:
const john_doeProfile: LinkedInProfileData = {
  platform: 'linkedin',
  url: 'https://www.linkedin.com/in/johndoe',
  name: 'John Doe',
  // ... rest of profile
};

// Then add to staticLinkedInProfiles:
const staticLinkedInProfiles: Record<string, LinkedInProfileData> = {
  [abubakrBase.url]: abubakrBase,
  [`${abubakrBase.url}/`]: { ...abubakrBase, url: `${abubakrBase.url}/` },
  // Add your new profile:
  [normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe')]: john_doeProfile,
  [normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe/')]: { ...john_doeProfile, url: normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe/') },
};
```

## Method 2: Using the Script (Local Development)

If you're running the app locally and have Playwright installed:

```bash
npm run extract-profile https://www.linkedin.com/in/username
```

This will:
1. Scrape the profile using your local browser
2. Automatically add it to `lib/staticProfiles.ts`
3. Future requests will use the static profile (instant response)

**Note:** This only works locally when you have a browser installed and LinkedIn doesn't show a login wall.

## Method 3: Manual Extraction from Browser

If scraping fails due to login walls, you can manually extract data:

1. **Open the LinkedIn profile in your browser** (while logged in)
2. **Use browser DevTools** to inspect the page
3. **Look for structured data** in the page source or use browser extensions
4. **Create the profile object** manually following the format in `lib/staticProfiles.ts`

## Method 4: Using the API Endpoint

You can also call the export API directly:

```bash
curl -X POST https://your-app.vercel.app/api/export-profile \
  -H "Content-Type: application/json" \
  -d '{"profile": {...profileData...}}'
```

## Benefits of Static Profiles

- ✅ **Instant responses** (0ms vs 5-10s)
- ✅ **No timeouts** on Vercel
- ✅ **No login walls** or bot detection
- ✅ **Reliable** for known profiles
- ✅ **Lower costs** (no browser automation needed)

## When to Use Static Profiles

Use static profiles for:
- Profiles you scrape frequently
- Important profiles that need fast responses
- Profiles that fail to scrape reliably
- Any profile you want instant access to

The system automatically checks static profiles first, then cache, then live scraping.

