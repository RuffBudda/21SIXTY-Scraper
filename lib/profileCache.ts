import { ProfileData } from './types';

/**
 * Simple in-memory cache for scraped profiles
 * In production, consider using Redis or a database
 */

interface CachedProfile {
  data: ProfileData;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const cache = new Map<string, CachedProfile>();

// Default TTL: 24 hours
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/**
 * Get cached profile data if available and not expired
 */
export function getCachedProfile(url: string): ProfileData | null {
  const cached = cache.get(url);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > cached.ttl) {
    // Expired, remove from cache
    cache.delete(url);
    return null;
  }

  return cached.data;
}

/**
 * Cache a profile with optional TTL
 */
export function setCachedProfile(
  url: string,
  data: ProfileData,
  ttl: number = DEFAULT_TTL
): void {
  cache.set(url, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * Clear expired entries from cache (optional cleanup)
 */
export function clearExpiredCache(): number {
  const now = Date.now();
  let cleared = 0;
  
  for (const [url, cached] of cache.entries()) {
    if (now - cached.timestamp > cached.ttl) {
      cache.delete(url);
      cleared++;
    }
  }
  
  return cleared;
}

/**
 * Clear all cache (useful for testing or manual refresh)
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
  };
}

