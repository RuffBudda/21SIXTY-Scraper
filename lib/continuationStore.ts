import { ScrapeContinuation } from './types';
import { Buffer } from 'buffer';

/**
 * In-memory store for continuation tokens
 * TTL: 5 minutes (300000ms)
 */
const CONTINUATION_TTL = 5 * 60 * 1000; // 5 minutes

interface StoredContinuation {
  continuation: ScrapeContinuation;
  expiresAt: number;
}

const store = new Map<string, StoredContinuation>();

/**
 * Cleanup expired continuations
 */
function cleanupExpired() {
  const now = Date.now();
  for (const [token, stored] of store.entries()) {
    if (stored.expiresAt < now) {
      store.delete(token);
    }
  }
}

/**
 * Get continuation by token
 */
export function getContinuation(token: string): ScrapeContinuation | null {
  cleanupExpired();
  const stored = store.get(token);
  if (!stored) {
    return null;
  }
  if (stored.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }
  return stored.continuation;
}

/**
 * Set continuation with TTL
 */
export function setContinuation(token: string, continuation: ScrapeContinuation): void {
  cleanupExpired();
  const expiresAt = Date.now() + CONTINUATION_TTL;
  store.set(token, { continuation, expiresAt });
}

/**
 * Delete continuation
 */
export function deleteContinuation(token: string): void {
  store.delete(token);
}

/**
 * Generate a unique continuation token
 */
export function generateToken(url: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const urlHash = Buffer.from(url).toString('base64').substring(0, 10).replace(/[^a-zA-Z0-9]/g, '');
  return `${urlHash}-${timestamp}-${random}`;
}
