import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { scrapeProfileProgressive } from '@/lib/scraper';
import { ScrapeResponse, ScrapeContinuation } from '@/lib/types';
import { getContinuation, setContinuation } from '@/lib/continuationStore';

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
    const { url, continuationToken } = body;

    // Handle continuation request
    let continuation: ScrapeContinuation | null = null;
    let targetUrl: string;
    
    if (continuationToken) {
      continuation = getContinuation(continuationToken);
      if (!continuation) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid or expired continuation token',
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
      // Use URL from continuation
      targetUrl = continuation.url;
    } else {
      // Initial request - URL is required
      if (!url || typeof url !== 'string') {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing or invalid URL parameter',
          },
          { status: 400 }
        );
      }
      targetUrl = url;
    }

    // Scrape profile progressively (supports continuation)
    // Add timeout wrapper to prevent 504 errors
    const TIMEOUT_MS = 50000; // 50 seconds (Vercel free tier is 10s, but we'll try to finish faster)
    
    const scrapePromise = scrapeProfileProgressive(targetUrl, continuation || undefined);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - scraping took too long')), TIMEOUT_MS)
    );
    
    let result;
    try {
      result = await Promise.race([scrapePromise, timeoutPromise]) as any;
    } catch (error: any) {
      // If timeout or other error, return partial data if available
      console.error('Scraping error or timeout:', error);
      
      // Try to get partial result if available
      try {
        const partialResult = await scrapePromise.catch(() => null);
        if (partialResult) {
          return NextResponse.json({
            success: true,
            platform: partialResult.data.platform,
            data: partialResult.data,
            timestamp: new Date().toISOString(),
            url: targetUrl,
            isComplete: false,
            error: 'Partial results due to timeout',
            firstVisibleText: partialResult.firstVisibleText,
            lastVisibleText: partialResult.lastVisibleText,
          });
        }
      } catch (e) {
        // Ignore
      }
      
      // Return error as valid JSON
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Scraping timeout or error occurred',
          timestamp: new Date().toISOString(),
          url: targetUrl,
        },
        { status: 504 }
      );
    }

    // Generate and store continuation token if scraping is incomplete
    let token: string | undefined;
    if (!result.isComplete && result.continuation) {
      token = result.continuation.sessionId;
      if (token && result.continuation) {
        setContinuation(token, result.continuation);
      }
    }

    const response: ScrapeResponse = {
      success: true,
      platform: result.data.platform,
      data: result.data,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      continuationToken: token,
      isComplete: result.isComplete,
      firstVisibleText: result.firstVisibleText,
      lastVisibleText: result.lastVisibleText,
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

