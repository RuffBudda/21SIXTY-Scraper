/**
 * LinkedIn authentication credentials (encrypted)
 * Note: HTTP scraping cannot perform login - these credentials are for manual cookie extraction
 * To get cookies: Log in with these credentials in browser, then copy cookies from DevTools
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Encryption key (in production, use environment variable)
const ENCRYPTION_KEY = Buffer.from(process.env.LINKEDIN_ENCRYPTION_KEY || '21SIXTY-SCRAPER-KEY-32-BYTE-LENGTH!!', 'utf8').subarray(0, 32);
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts text using AES-256-CBC
 */
function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts text using AES-256-CBC
 */
function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Encrypted credentials (AES-256-CBC encryption)
// Email: lucy@fitout.contractors
// Password: C0ntr@ct0r$.D1r3ct.Pr0j3ct
const ACTUAL_ENCRYPTED_EMAIL = '008a23256556dc51abca170df43477ce:def749922e44cb925e75c18d19a80691757fa7d187e9be39005efb6c1ddd2b26';
const ACTUAL_ENCRYPTED_PASSWORD = 'ce3e5cde83851efd45c55374e5c614d3:aebe041a9b23e4910b081034d2a7edc099bc0fc27a2047bd5f91ec32ac9da09f';

/**
 * Gets LinkedIn credentials (decrypted)
 * Note: These are for manual cookie extraction only
 */
export function getLinkedInCredentials(): { email: string; password: string } {
  try {
    return {
      email: decrypt(ACTUAL_ENCRYPTED_EMAIL),
      password: decrypt(ACTUAL_ENCRYPTED_PASSWORD),
    };
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    throw new Error('Failed to decrypt LinkedIn credentials');
  }
}

/**
 * Gets LinkedIn cookies from environment variable or returns empty string
 * To get cookies:
 * 1. Log in to LinkedIn with the credentials above
 * 2. Open DevTools (F12) → Network tab
 * 3. Visit any LinkedIn profile
 * 4. Find the request → Headers → Copy the Cookie header value
 * 5. Set LINKEDIN_COOKIES environment variable
 */
export function getLinkedInCookies(): string {
  // First try environment variable (preferred method)
  if (process.env.LINKEDIN_COOKIES) {
    return process.env.LINKEDIN_COOKIES;
  }
  
  // Return empty string if no cookies available
  return '';
}

/**
 * Instructions for getting LinkedIn cookies manually
 */
export function getCookieInstructions(): string {
  const creds = getLinkedInCredentials();
  return `
To get LinkedIn cookies:
1. Log in to LinkedIn using these credentials:
   Email: ${creds.email}
   Password: [stored securely - use getLinkedInCredentials() to retrieve]
2. Open browser DevTools (F12)
3. Go to Network tab
4. Visit any LinkedIn profile
5. Find the profile request → Headers → Request Headers
6. Copy the entire Cookie header value
7. Set LINKEDIN_COOKIES environment variable with the cookie value
`;
}

