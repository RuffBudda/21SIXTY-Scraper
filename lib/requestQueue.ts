/**
 * Request Queue Manager
 * Queues concurrent scraping requests to prevent resource exhaustion
 */

interface QueuedRequest {
  id: string;
  url: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private maxConcurrent = 2; // Process 2 requests at a time (optimized for 1GB RAM)
  private activeCount = 0;
  private activeRequests = new Map<string, QueuedRequest>();

  /**
   * Add a request to the queue
   */
  async enqueue<T>(url: string, processor: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.push(request);
      this.processQueue(processor);
    });
  }

  /**
   * Process the queue
   */
  private async processQueue<T>(processor: () => Promise<T>) {
    // Don't process if already processing or queue is empty
    if (this.processing || this.queue.length === 0) {
      return;
    }

    // Don't process if at max concurrent requests
    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const request = this.queue.shift();
      if (!request) break;

      this.activeCount++;
      this.activeRequests.set(request.id, request);

      // Process the request
      processor()
        .then((result) => {
          request.resolve(result);
        })
        .catch((error) => {
          request.reject(error);
        })
        .finally(() => {
          this.activeCount--;
          this.activeRequests.delete(request.id);
          
          // Continue processing queue
          this.processing = false;
          if (this.queue.length > 0) {
            this.processQueue(processor);
          }
        });
    }

    this.processing = false;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.maxConcurrent,
      totalPending: this.queue.length + this.activeCount,
    };
  }

  /**
   * Clear the queue (for cleanup)
   */
  clear() {
    // Reject all pending requests
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }
}

// Singleton instance
let requestQueue: RequestQueue | null = null;

/**
 * Get the request queue singleton instance
 */
export function getRequestQueue(): RequestQueue {
  if (!requestQueue) {
    requestQueue = new RequestQueue();
  }
  return requestQueue;
}

