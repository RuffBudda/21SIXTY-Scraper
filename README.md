# 21SIXTY SCRAPER

A powerful, open-source web scraper that extracts profile data from LinkedIn, Instagram, and general websites. Built with Next.js and Playwright, designed for easy deployment on Vercel with a modern web interface and RESTful API.

## ✨ Features

- **Multi-Platform Support**: Scrape data from LinkedIn profiles, Instagram profiles, and general websites
- **Smart Content Expansion**: Automatically expands collapsed content to capture full profile information
- **Multiple Export Formats**: Download scraped data as JSON, CSV, or TXT files
- **Webhook API**: Integrate with automation tools like N8N, Zapier, or custom applications
- **Modern UI**: Clean, responsive interface built with Tailwind CSS
- **No Authentication Required**: Works with public profiles only - no login needed
- **Serverless Ready**: Optimized for Vercel deployment with automatic scaling
- **Rate Limiting**: Built-in protection against abuse with configurable rate limits

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** installed ([Download here](https://nodejs.org/))
- A **Vercel account** (free tier is sufficient) for deployment
- **Git** installed for cloning the repository

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd SCRAPE
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npm run install-browsers
   ```
   Or manually:
   ```bash
   npx playwright install chromium
   ```
   > **Note**: For Vercel deployment, `@sparticuz/chromium` is automatically used which includes pre-bundled Chromium optimized for serverless environments.

4. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   API_KEY=your-secret-api-key-here
   ```
   > **Note**: For local development, you can use any string as your API key. For production, use a strong, random key.

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000) to access the application.

### Linux/WSL/Docker Users

If you're running on Linux, WSL, or in a Docker container, install system dependencies:

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0
```

**Or use Playwright's automated installer:**
```bash
npx playwright install-deps chromium
```

## 📦 Deployment to Vercel

Deploying to Vercel is straightforward and free:

1. **Push your code to GitHub**
   - Create a new repository on GitHub
   - Push your code: `git push origin main`

2. **Import project in Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js settings

3. **Configure environment variables**
   - In Vercel project settings, add your `API_KEY` environment variable
   - Redeploy to apply changes

4. **Deploy!**
   - Vercel will automatically deploy on every push to main
   - Your app will be live at `your-project.vercel.app`

> **Note**: The function timeout is set to 60 seconds, which works perfectly on Vercel's free tier. For longer scraping operations, consider upgrading to a paid plan.

## 📖 Usage Guide

### Direct Scraping (Web Interface)

The easiest way to scrape profiles is through the web interface:

1. **Open the application** in your browser
2. **Navigate to the "Direct Scrape" tab**
3. **Enter a profile URL**:
   - LinkedIn: `https://www.linkedin.com/in/username`
   - Instagram: `https://www.instagram.com/username`
   - Website: Any public website URL
4. **Click "Scrape"** and wait for the results
5. **Download your data** in your preferred format (JSON, CSV, or TXT)

### Webhook API (Programmatic Access)

For automation and integration with other tools:

1. **Navigate to the "Webhook API" tab** in the application
2. **Copy your webhook URL** (displayed in the interface)
3. **Test the webhook** with a sample URL
4. **View request/response details** to understand the API structure

### N8N Integration

21SIXTY SCRAPER includes comprehensive N8N integration support:

- **Step-by-step workflow setup** guide
- **Complete workflow JSON** examples ready to import
- **Expression examples** for data transformation
- **Troubleshooting guide** for common issues

All integration details are available in the Webhook API panel of the application.

## 🔌 API Documentation

### Endpoint

```
POST /api/scrape
```

### Headers

```http
Content-Type: application/json
```

### Request Body

```json
{
  "url": "https://www.linkedin.com/in/example"
}
```

**Supported Platforms:**
- LinkedIn profiles: `https://www.linkedin.com/in/username`
- Instagram profiles: `https://www.instagram.com/username`
- General websites: Any public URL

### Response Format

**Success Response (200 OK):**
```json
{
  "success": true,
  "platform": "linkedin",
  "data": {
    "platform": "linkedin",
    "url": "https://www.linkedin.com/in/example",
    "name": "John Doe",
    "headline": "Software Engineer at Tech Corp",
    "location": "San Francisco, CA",
    "about": "Experienced software engineer...",
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "Tech Corp",
        "startDate": "2020",
        "description": "Led development of..."
      }
    ],
    "education": [
      {
        "school": "University of Technology",
        "degree": "Bachelor of Science",
        "startDate": "2016"
      }
    ],
    "skills": ["JavaScript", "TypeScript", "React"],
    "profileImage": "https://..."
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "https://www.linkedin.com/in/example",
  "isComplete": true
}
```

### Rate Limiting

- **Limit**: 10 requests per minute per IP address
- **Headers**: Rate limit information included in every response:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining in current window
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

### Error Responses

| Status Code | Description |
|------------|-------------|
| `400` | Bad Request - Invalid URL format or missing required fields |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Server-side error during scraping |

**Error Response Format:**
```json
{
  "success": false,
  "error": "Error message description",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🛠️ Technical Stack

- **Framework**: Next.js 14+ with App Router
- **Scraping Engine**: Playwright with @sparticuz/chromium for serverless environments (optimized for Vercel)
- **Styling**: Tailwind CSS for modern, responsive design
- **Language**: TypeScript for type safety
- **Deployment**: Optimized for Vercel serverless functions

## 🔒 Security Features

- **Rate Limiting**: Prevents abuse with IP-based rate limiting
- **URL Validation**: SSRF protection through strict URL validation
- **HTTPS Enforcement**: All production deployments use HTTPS
- **Input Sanitization**: All user inputs are validated and sanitized

## ⚠️ Limitations & Considerations

- **Public Profiles Only**: This tool only works with publicly accessible profiles. Private or restricted profiles cannot be scraped.
- **Rate Limits**: Limited to 10 requests per minute per IP address to prevent abuse
- **Platform Changes**: Social media platforms frequently update their HTML structure, which may temporarily affect scraping accuracy
- **Timeout Constraints**: Vercel free tier has execution time limits; consider upgrading for longer operations
- **Legal Compliance**: Always ensure you have permission to scrape data and comply with platform terms of service and applicable laws

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Issues**: Found a bug? Open an issue with details
2. **Suggest Features**: Have an idea? Share it in the issues section
3. **Submit Pull Requests**: Fix bugs or add features and submit a PR
4. **Improve Documentation**: Help make the docs better for everyone

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📞 Support

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/your-username/21-sixty-scrapper/issues)
- **Documentation**: Check the [SETUP_NOTES.md](SETUP_NOTES.md) for detailed setup instructions

---

**Made with ❤️ for the developer community**

