/**
 * Browser Pool Manager for efficient Playwright browser instance management
 * Optimized for 1GB RAM droplet - limits concurrent instances to prevent memory exhaustion
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  inUse: boolean;
}

class BrowserPool {
  private instances: BrowserInstance[] = [];
  private maxInstances = 2; // Limit to 2 concurrent browsers for 1GB RAM
  private maxIdleTime = 30000; // 30 seconds - close idle browsers
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Launch a new browser instance with memory-efficient configuration
   */
  private async launchBrowser(): Promise<BrowserInstance> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--disable-features=TranslateUI',
        '--disable-remote-fonts',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-default-apps',
        '--disable-component-extensions-with-background-pages',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      lastUsed: Date.now(),
      inUse: false,
    };
  }

  /**
   * Get an available browser instance from the pool
   */
  async acquire(): Promise<BrowserInstance> {
    // Find an available instance
    let instance = this.instances.find(inst => !inst.inUse);

    // If no available instance and under limit, create a new one
    if (!instance && this.instances.length < this.maxInstances) {
      instance = await this.launchBrowser();
      this.instances.push(instance);
    }

    // If still no instance, wait a bit and try to find one that becomes available
    if (!instance) {
      // Wait for an instance to become available (max 5 seconds)
      const startTime = Date.now();
      while (!instance && Date.now() - startTime < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        instance = this.instances.find(inst => !inst.inUse);
      }
    }

    if (!instance) {
      throw new Error('Browser pool exhausted - too many concurrent requests');
    }

    instance.inUse = true;
    instance.lastUsed = Date.now();

    // Start cleanup interval if not already running
    if (!this.cleanupInterval) {
      this.startCleanup();
    }

    return instance;
  }

  /**
   * Release a browser instance back to the pool
   */
  release(instance: BrowserInstance): void {
    instance.inUse = false;
    instance.lastUsed = Date.now();
    
    // Reset page state
    instance.page.goto('about:blank').catch(() => {});
  }

  /**
   * Close and remove a browser instance
   */
  private async closeInstance(instance: BrowserInstance): Promise<void> {
    try {
      await instance.page.close();
      await instance.context.close();
      await instance.browser.close();
    } catch (error) {
      console.error('Error closing browser instance:', error);
    }
    
    const index = this.instances.indexOf(instance);
    if (index > -1) {
      this.instances.splice(index, 1);
    }
  }

  /**
   * Cleanup idle browser instances
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const instancesToClose = this.instances.filter(
        inst => !inst.inUse && (now - inst.lastUsed) > this.maxIdleTime
      );

      for (const instance of instancesToClose) {
        await this.closeInstance(instance);
      }

      // Stop cleanup if no instances left
      if (this.instances.length === 0 && this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Close all browser instances (cleanup on shutdown)
   */
  async closeAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await Promise.all(
      this.instances.map(instance => this.closeInstance(instance))
    );
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      total: this.instances.length,
      inUse: this.instances.filter(inst => inst.inUse).length,
      available: this.instances.filter(inst => !inst.inUse).length,
      maxInstances: this.maxInstances,
    };
  }
}

// Singleton instance
let browserPool: BrowserPool | null = null;

/**
 * Get the browser pool singleton instance
 */
export function getBrowserPool(): BrowserPool {
  if (!browserPool) {
    browserPool = new BrowserPool();
  }
  return browserPool;
}

/**
 * Cleanup browser pool on process exit
 */
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    if (browserPool) {
      await browserPool.closeAll();
    }
  });

  process.on('SIGINT', async () => {
    if (browserPool) {
      await browserPool.closeAll();
    }
  });
}

