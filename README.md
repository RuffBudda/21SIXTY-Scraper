# 21 SIXTY Scrapper

A multi-platform scraper for LinkedIn profiles, Instagram profiles, and websites with webhook API support, built for Vercel serverless deployment.

## Features

- 🎯 Scrape LinkedIn profiles, Instagram profiles, and websites (public content only)
- 🔓 Expand collapsed content automatically
- 🔌 Webhook API (no authentication required)
- 📥 Export data in JSON, CSV, or TXT formats
- 🎨 Modern, responsive UI
- 📚 Detailed N8N integration guide
- 🚀 Free hosting on Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Vercel account (free tier works)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd SCRAPE
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file:
```
API_KEY=your-secret-api-key-here
```

4. Run development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Deploy!

The function timeout is set to 60 seconds (works on Vercel free tier).

## Usage

### Direct Scraping

1. Navigate to the "Direct Scrape" tab
2. Enter a LinkedIn profile URL (e.g., `https://www.linkedin.com/in/example`)
3. Click "Scrape"
4. Download results as JSON, CSV, or TXT

### Webhook API

1. Navigate to the "Webhook API" tab
2. Test the webhook with a LinkedIn, Instagram, or website URL
3. View request/response details

### N8N Integration

See the detailed instructions in the Webhook API panel. The guide includes:
- Step-by-step N8N workflow setup
- Complete workflow JSON example
- Expression examples
- Troubleshooting guide

## API Documentation

### Endpoint

`POST /api/scrape`

### Headers

- `Content-Type: application/json`

### Request Body

```json
{
  "url": "https://www.linkedin.com/in/example"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "url": "https://www.linkedin.com/in/example",
    "name": "John Doe",
    "headline": "Software Engineer",
    "location": "San Francisco, CA",
    "about": "...",
    "experience": [...],
    "education": [...],
    "skills": [...],
    "languages": [...],
    "recommendations": [...]
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "https://www.linkedin.com/in/example"
}
```

### Rate Limiting

- 10 requests per minute per IP address
- Rate limit headers included in response:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

### Error Responses

- `400` - Bad Request (invalid URL)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Technical Stack

- **Framework**: Next.js 14+ (App Router)
- **Scraping**: Playwright with @sparticuz/chromium
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Security

- Rate limiting per IP address
- URL validation (SSRF protection)
- HTTPS only in production

## Limitations

- Public profiles only (no authentication required)
- Rate limited to 10 requests/minute per IP address
- Vercel free tier: 10s timeout (upgrade to 60s)
- Some profile sections may be limited if profile is partially private

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

