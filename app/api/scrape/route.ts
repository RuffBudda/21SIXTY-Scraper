import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { scrapeProfile } from '@/lib/scraper';
import { ScrapeResponse, ProfileData } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    // Check rate limiting using IP address
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const rateLimit = checkRateLimit(ip);
    
    if (!rateLimit.allowed) {
      const resetSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: resetSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': resetSeconds.toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetTime.toString(),
          },
        }
      );
    }

    // Parse request body
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid URL parameter',
        },
        { status: 400 }
      );
    }

    // Scrape profile (supports LinkedIn, Instagram, and websites)
    const profileData = await scrapeProfile(url);

    const response: ScrapeResponse = {
      success: true,
      platform: profileData.platform,
      data: profileData,
      timestamp: new Date().toISOString(),
      url,
    };

    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': rateLimit.resetTime.toString(),
      },
    });
  } catch (error: any) {
    console.error('Scrape error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to scrape profile',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

