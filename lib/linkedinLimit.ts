/**
 * LinkedIn scrape limit tracking
 * Limits to 100 scrapes per month
 */

interface MonthlyLimit {
  count: number;
  month: string; // Format: YYYY-MM
}

const monthlyLimitStore = new Map<string, MonthlyLimit>();

const LINKEDIN_MONTHLY_LIMIT = 100;

/**
 * Get current month string (YYYY-MM)
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Clean up old monthly entries
 */
function cleanupOldEntries() {
  const currentMonth = getCurrentMonth();
  for (const [key, entry] of monthlyLimitStore.entries()) {
    if (entry.month !== currentMonth) {
      monthlyLimitStore.delete(key);
    }
  }
}

/**
 * Check if LinkedIn scrape is allowed for the current month
 */
export function checkLinkedInMonthlyLimit(): {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
} {
  cleanupOldEntries();
  
  const currentMonth = getCurrentMonth();
  const entry = monthlyLimitStore.get('linkedin_monthly');
  
  if (!entry || entry.month !== currentMonth) {
    // New month or no entry - reset
    monthlyLimitStore.set('linkedin_monthly', {
      count: 0,
      month: currentMonth,
    });
    return {
      allowed: true,
      count: 0,
      limit: LINKEDIN_MONTHLY_LIMIT,
      remaining: LINKEDIN_MONTHLY_LIMIT,
    };
  }
  
  if (entry.count >= LINKEDIN_MONTHLY_LIMIT) {
    return {
      allowed: false,
      count: entry.count,
      limit: LINKEDIN_MONTHLY_LIMIT,
      remaining: 0,
    };
  }
  
  return {
    allowed: true,
    count: entry.count,
    limit: LINKEDIN_MONTHLY_LIMIT,
    remaining: LINKEDIN_MONTHLY_LIMIT - entry.count,
  };
}

/**
 * Increment LinkedIn scrape count
 */
export function incrementLinkedInScrapeCount(): void {
  cleanupOldEntries();
  
  const currentMonth = getCurrentMonth();
  const entry = monthlyLimitStore.get('linkedin_monthly');
  
  if (!entry || entry.month !== currentMonth) {
    monthlyLimitStore.set('linkedin_monthly', {
      count: 1,
      month: currentMonth,
    });
  } else {
    entry.count += 1;
    monthlyLimitStore.set('linkedin_monthly', entry);
  }
}

/**
 * Get current LinkedIn scrape stats
 */
export function getLinkedInScrapeStats(): {
  count: number;
  limit: number;
  remaining: number;
  month: string;
} {
  cleanupOldEntries();
  
  const currentMonth = getCurrentMonth();
  const entry = monthlyLimitStore.get('linkedin_monthly');
  
  if (!entry || entry.month !== currentMonth) {
    return {
      count: 0,
      limit: LINKEDIN_MONTHLY_LIMIT,
      remaining: LINKEDIN_MONTHLY_LIMIT,
      month: currentMonth,
    };
  }
  
  return {
    count: entry.count,
    limit: LINKEDIN_MONTHLY_LIMIT,
    remaining: LINKEDIN_MONTHLY_LIMIT - entry.count,
    month: currentMonth,
  };
}

