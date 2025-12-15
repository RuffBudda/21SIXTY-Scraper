import { NextRequest, NextResponse } from 'next/server';
import { scrapeProfileProgressive, detectPlatform } from '@/lib/scraper';
import { ScrapeResponse, ScrapeContinuation } from '@/lib/types';
import { getContinuation, setContinuation } from '@/lib/continuationStore';
import { getRequestQueue } from '@/lib/requestQueue';

// Max duration for droplet deployment (60 seconds)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
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

    const platform = detectPlatform(targetUrl);
    const queue = getRequestQueue();

    // Queue the scraping request
    const result = await queue.enqueue(targetUrl, async () => {
      const TIMEOUT_MS = 60000; // 60 seconds - reasonable timeout for Playwright scraping
      
      const scrapePromise = scrapeProfileProgressive(targetUrl, continuation || undefined);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - scraping took too long')), TIMEOUT_MS)
      );
      
      try {
        return await Promise.race([scrapePromise, timeoutPromise]) as any;
      } catch (error: any) {
        // If timeout, try to get partial result
        try {
          const partialResult = await scrapePromise.catch(() => null);
          if (partialResult) {
            return {
              ...partialResult,
              isComplete: false,
              error: 'Partial results due to timeout',
            };
          }
        } catch (e) {
          // Ignore
        }
        throw error;
      }
    });

    // Generate and store continuation token if scraping is incomplete
    let token: string | undefined;
    const resultContinuation = result.continuation;
    if (!result.isComplete && resultContinuation) {
      token = resultContinuation.sessionId;
      if (token) {
        setContinuation(token, resultContinuation);
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

    // Add queue stats to headers
    const queueStats = queue.getStats();
    const headers: Record<string, string> = {
      'X-Queue-Length': queueStats.queueLength.toString(),
      'X-Queue-Active': queueStats.activeCount.toString(),
      'X-Queue-Max-Concurrent': queueStats.maxConcurrent.toString(),
    };

    return NextResponse.json(response, { headers });
  } catch (error: any) {
    console.error('Scrape error:', error);
    
    const errorMessage = error.message || 'Scraping error occurred';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
    
    return NextResponse.json(
      {
        success: false,
        error: isTimeout 
          ? 'Request timeout - the scraping took too long. Please try again or use a simpler profile.'
          : errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: isTimeout ? 504 : 500 }
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

