/**
 * Concurrent scrape limit tracking
 * Limits to 4 concurrent scrapes at a time
 */

interface ActiveScrape {
  id: string;
  url: string;
  startTime: number;
}

const activeScrapes = new Map<string, ActiveScrape>();
const MAX_CONCURRENT_SCRAPES = 4;

/**
 * Generate a unique ID for a scrape request
 */
function generateScrapeId(): string {
  return `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clean up stale scrape entries (older than 5 minutes)
 */
function cleanupStaleEntries() {
  const now = Date.now();
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  for (const [id, scrape] of activeScrapes.entries()) {
    if (now - scrape.startTime > STALE_THRESHOLD) {
      activeScrapes.delete(id);
    }
  }
}

/**
 * Check if a new scrape can be started
 */
export function canStartScrape(): {
  allowed: boolean;
  activeCount: number;
  maxConcurrent: number;
} {
  cleanupStaleEntries();
  
  const activeCount = activeScrapes.size;
  
  if (activeCount >= MAX_CONCURRENT_SCRAPES) {
    return {
      allowed: false,
      activeCount,
      maxConcurrent: MAX_CONCURRENT_SCRAPES,
    };
  }
  
  return {
    allowed: true,
    activeCount,
    maxConcurrent: MAX_CONCURRENT_SCRAPES,
  };
}

/**
 * Register a new scrape
 * Returns a scrape ID that must be used to finish the scrape
 */
export function startScrape(url: string): string {
  cleanupStaleEntries();
  
  const check = canStartScrape();
  if (!check.allowed) {
    throw new Error(`Concurrent scrape limit reached. ${check.activeCount}/${check.maxConcurrent} scrapes active.`);
  }
  
  const id = generateScrapeId();
  activeScrapes.set(id, {
    id,
    url,
    startTime: Date.now(),
  });
  
  return id;
}

/**
 * Finish a scrape (remove from active list)
 */
export function finishScrape(scrapeId: string): void {
  activeScrapes.delete(scrapeId);
  cleanupStaleEntries();
}

/**
 * Get current concurrent scrape stats
 */
export function getConcurrentScrapeStats(): {
  activeCount: number;
  maxConcurrent: number;
  activeScrapes: Array<{ id: string; url: string; duration: number }>;
} {
  cleanupStaleEntries();
  
  const now = Date.now();
  const active = Array.from(activeScrapes.values()).map(scrape => ({
    id: scrape.id,
    url: scrape.url,
    duration: now - scrape.startTime,
  }));
  
  return {
    activeCount: active.length,
    maxConcurrent: MAX_CONCURRENT_SCRAPES,
    activeScrapes: active,
  };
}

