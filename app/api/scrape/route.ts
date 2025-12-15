import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { scrapeProfileProgressive, detectPlatform } from '@/lib/scraper';
import { ScrapeResponse, ScrapeContinuation } from '@/lib/types';
import { getContinuation, setContinuation } from '@/lib/continuationStore';
import { checkLinkedInMonthlyLimit, incrementLinkedInScrapeCount, getLinkedInScrapeStats } from '@/lib/linkedinLimit';
import { canStartScrape, startScrape, finishScrape } from '@/lib/concurrentLimit';

// Set max duration for Vercel (free tier: 10s, we use 8s to be safe)
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  let scrapeId: string | null = null;
  
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

    // Check concurrent scrape limit
    const concurrentCheck = canStartScrape();
    if (!concurrentCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Concurrent scrape limit reached. ${concurrentCheck.activeCount}/${concurrentCheck.maxConcurrent} scrapes currently active. Please try again later.`,
        },
        { status: 429 }
      );
    }

    // Check LinkedIn monthly limit if scraping LinkedIn
    const platform = detectPlatform(targetUrl);
    if (platform === 'linkedin') {
      const linkedInLimit = checkLinkedInMonthlyLimit();
      if (!linkedInLimit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `LinkedIn monthly scrape limit reached. ${linkedInLimit.count}/${linkedInLimit.limit} scrapes used this month. Limit resets at the start of next month.`,
            limitInfo: {
              count: linkedInLimit.count,
              limit: linkedInLimit.limit,
              remaining: linkedInLimit.remaining,
            },
          },
          { status: 429 }
        );
      }
    }

    // Start scrape tracking
    try {
      scrapeId = startScrape(targetUrl);
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to start scrape',
        },
        { status: 429 }
      );
    }

    // Scrape profile using HTTP-based scraping (fetch + Cheerio)
    // Vercel free tier has 10s limit, so we set timeout to 8s to ensure we return JSON before Vercel times out
    const TIMEOUT_MS = 8000; // 8 seconds - well under Vercel's 10s limit
    
    const scrapePromise = scrapeProfileProgressive(targetUrl, continuation || undefined);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - scraping took too long')), TIMEOUT_MS)
    );
    
    let result;
    try {
      result = await Promise.race([scrapePromise, timeoutPromise]) as any;
      
      // Increment LinkedIn scrape count if successful and LinkedIn platform
      if (platform === 'linkedin' && result?.data) {
        incrementLinkedInScrapeCount();
      }
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
      const errorMessage = error.message || 'Scraping error occurred';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
      
      return NextResponse.json(
        {
          success: false,
          error: isTimeout 
            ? 'Request timeout - the scraping took too long. Please try again or use a simpler profile.'
            : errorMessage,
          timestamp: new Date().toISOString(),
          url: targetUrl,
        },
        { status: isTimeout ? 504 : 500 }
      );
    }

    // Generate and store continuation token if scraping is incomplete
    let token: string | undefined;
    const resultContinuation = result.continuation;
    if (!result.isComplete && resultContinuation) {
      token = resultContinuation.sessionId;
      if (token) {
        setContinuation(token, resultContinuation);
      }
    }

    // Get LinkedIn stats for response headers
    const linkedInStats = platform === 'linkedin' ? getLinkedInScrapeStats() : null;

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

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': rateLimit.resetTime.toString(),
    };

    if (linkedInStats) {
      headers['X-LinkedIn-Monthly-Count'] = linkedInStats.count.toString();
      headers['X-LinkedIn-Monthly-Limit'] = linkedInStats.limit.toString();
      headers['X-LinkedIn-Monthly-Remaining'] = linkedInStats.remaining.toString();
    }

    return NextResponse.json(response, { headers });
  } catch (error: any) {
    console.error('Scrape error:', error);
    
    // Finish scrape tracking if it was started
    if (scrapeId) {
      finishScrape(scrapeId);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to scrape profile',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    // Always finish the scrape tracking
    if (scrapeId) {
      finishScrape(scrapeId);
    }
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

