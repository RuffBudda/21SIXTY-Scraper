# Setup Notes for 21SIXTY SCRAPER

## Logo and Favicon Setup

### Logo
1. Replace `public/logos/logo.png` with your actual logo image (PNG format recommended)
2. The logo should be at least 256x256 pixels for best quality
3. The app references `/logos/logo.png` in the UI

### Favicon
1. Replace `public/favicons/favicon.ico` with your actual favicon file
2. The favicon should include multiple sizes (16x16, 32x32, 48x48) for compatibility
3. The app references `/favicons/favicon.ico` in the layout metadata

## Multi-Platform Support

The scraper now supports three platform types:

1. **LinkedIn Profiles** - Extracts:
   - Name, headline, location
   - About section
   - Experience (expanded)
   - Education
   - Skills
   - Profile image

2. **Instagram Profiles** - Extracts:
   - Username, full name
   - Biography
   - Followers, following, posts count
   - Verification status
   - Private account indicator
   - Profile image
   - Website link

3. **Websites** - Extracts:
   - Page title
   - Person name (from structured data and meta tags)
   - Email, phone (if found)
   - Location, job title, company
   - Social media links (LinkedIn, Twitter, Instagram, Facebook, GitHub)
   - Images
   - Structured data (JSON-LD)
   - Metadata (Open Graph, Twitter Cards)

## Platform Detection

The scraper automatically detects the platform type based on the URL:
- URLs containing `linkedin.com` → LinkedIn scraper
- URLs containing `instagram.com` → Instagram scraper
- All other URLs → Website scraper

## API Response Format

All responses include a `platform` field indicating the detected platform:
- `"linkedin"`
- `"instagram"`
- `"website"`

The `data` field contains platform-specific data structures as defined in `lib/types.ts`.

