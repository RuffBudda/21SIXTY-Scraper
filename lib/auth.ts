import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { Buffer } from 'buffer';

/**
 * Validates API key using constant-time comparison to prevent timing attacks
 */
export function validateApiKey(apiKey: string | null): boolean {
  const expectedKey = process.env.API_KEY;
  
  if (!expectedKey) {
    console.error('API_KEY environment variable is not set');
    return false;
  }

  if (!apiKey) {
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  // Check lengths first to avoid timingSafeEqual error
  if (apiKey.length !== expectedKey.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(apiKey),
    Buffer.from(expectedKey)
  );
}

/**
 * Middleware to check API key authentication
 */
export function checkAuth(request: Request): NextResponse | null {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!validateApiKey(apiKey)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Invalid or missing API key' },
      { status: 401 }
    );
  }

  return null;
}

