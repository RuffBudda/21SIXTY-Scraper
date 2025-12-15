import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { 
  ProfileData, 
  LinkedInProfileData, 
  InstagramProfileData, 
  WebsitePersonData,
  PlatformType,
  ExperienceItem, 
  EducationItem,
  ScrapeContinuation,
  ProgressiveScrapeResult
} from './types';
import { getContinuation, setContinuation, generateToken } from './continuationStore';
import { getStaticLinkedInProfile } from './staticProfiles';
import { getCachedProfile, setCachedProfile } from './profileCache';

const LOG_PATH = join(process.cwd(), '.cursor', 'debug.log');

async function logDebug(data: any) {
  try {
    const logDir = join(process.cwd(), '.cursor');
    await fs.mkdir(logDir, { recursive: true }).catch(() => {});
    const logLine = JSON.stringify({...data, timestamp: Date.now()}) + '\n';
    await fs.appendFile(LOG_PATH, logLine, 'utf8').catch(() => {});
    // Also log to console for immediate visibility
    console.log('[DEBUG]', data.message, JSON.stringify(data.data || {}));
  } catch (e) {
    console.error('[DEBUG LOG ERROR]', e);
  }
}

/**
 * Detects platform type from URL
 */
export function detectPlatform(url: string): PlatformType {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (hostname.includes('linkedin.com')) {
      return 'linkedin';
    } else if (hostname.includes('instagram.com')) {
      return 'instagram';
    } else {
      return 'website';
    }
  } catch {
    return 'website';
  }
}

/**
 * Validates URL format
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates LinkedIn profile URL
 */
export function validateLinkedInUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname === 'www.linkedin.com' || urlObj.hostname === 'linkedin.com') &&
      urlObj.pathname.startsWith('/in/')
    );
  } catch {
    return false;
  }
}

/**
 * Validates Instagram profile URL
 */
export function validateInstagramUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname.includes('instagram.com') &&
      !!urlObj.pathname.match(/^\/[a-zA-Z0-9._]+$/)
    );
  } catch {
    return false;
  }
}

/**
 * Extracts first and last visible text from the page (priority extraction)
 * Returns within ~300ms for immediate response
 */
async function extractFirstLastVisibleText(page: any): Promise<{ firstVisibleText: string; lastVisibleText: string }> {
  let firstVisibleText = '';
  let lastVisibleText = '';

  try {
    // Extract first visible text (top of page)
    firstVisibleText = await page.evaluate(() => {
      // Get first visible text element
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node = walker.nextNode();
      while (node) {
        const text = node.textContent?.trim() || '';
        if (text.length > 10) { // Get meaningful text
          const rect = node.parentElement?.getBoundingClientRect();
          if (rect && rect.top >= 0 && rect.top < window.innerHeight) {
            return text.substring(0, 200); // Limit to 200 chars
          }
        }
        node = walker.nextNode();
      }
      return '';
    });

    // Scroll to bottom to get last visible text
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(100);

    // Extract last visible text (bottom of page)
    lastVisibleText = await page.evaluate(() => {
      // Get last visible text element
      const allTextNodes: Text[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node = walker.nextNode();
      while (node) {
        const text = node.textContent?.trim() || '';
        if (text.length > 10) {
          const rect = node.parentElement?.getBoundingClientRect();
          if (rect && rect.bottom > 0 && rect.bottom <= window.innerHeight) {
            allTextNodes.push(node as Text);
          }
        }
        node = walker.nextNode();
      }
      
      if (allTextNodes.length > 0) {
        const lastNode = allTextNodes[allTextNodes.length - 1];
        return (lastNode.textContent || '').trim().substring(0, 200);
      }
      return '';
    });

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  } catch (e) {
    console.error('Error extracting first/last visible text:', e);
  }

  return { firstVisibleText, lastVisibleText };
}

/**
 * Helper function to find element using multiple fallback selectors
 */
async function findElementWithFallbacks(page: any, selectors: string[], fieldName: string = 'unknown'): Promise<any> {
  await logDebug({ message: `Finding element for ${fieldName}`, data: { selectors, fieldName } });
  
  for (const selector of selectors) {
    try {
      // Try waiting for selector first (with short timeout)
      try {
        await page.waitForSelector(selector, { timeout: 1000, state: 'attached' });
      } catch (e) {
        // Continue if selector not found, we'll try querySelector
      }
      
      const element = await page.$(selector);
      if (element) {
        // Verify element is visible and has content
        const isVisible = await element.isVisible().catch(() => true);
        const text = await element.textContent().catch(() => '');
        if (isVisible && text.trim().length > 0) {
          await logDebug({ message: `Element found for ${fieldName}`, data: { selector, found: true, textPreview: text.substring(0, 100), isVisible } });
          return element;
        } else {
          await logDebug({ message: `Element found but not usable for ${fieldName}`, data: { selector, isVisible, hasText: text.trim().length > 0 } });
        }
      } else {
        await logDebug({ message: `Selector returned null for ${fieldName}`, data: { selector, fieldName } });
      }
    } catch (e) {
      await logDebug({ message: `Selector error for ${fieldName}`, data: { selector, error: e instanceof Error ? e.message : String(e), fieldName } });
    }
  }
  
  // If no element found, try using evaluate as fallback for name field
  if (fieldName === 'name') {
    try {
      const nameHandle = await page.evaluateHandle(() => {
        // Try multiple strategies to find name
        const h1s = Array.from(document.querySelectorAll('h1'));
        for (const h1 of h1s) {
          const text = h1.textContent?.trim() || '';
          // Look for h1 that looks like a name (2-4 words, starts with letter, reasonable length)
          if (text.length > 3 && text.length < 100 && /^[A-Za-z]/.test(text) && text.split(/\s+/).length <= 5 && !text.toLowerCase().includes('sign in')) {
            return h1;
          }
        }
        return null;
      });
      if (nameHandle && nameHandle.asElement()) {
        const text = await nameHandle.asElement()!.textContent().catch(() => '');
        if (text.trim().length > 0) {
          await logDebug({ message: `Found name using evaluate fallback`, data: { name: text.substring(0, 50) } });
          return nameHandle.asElement();
        }
      }
    } catch (e) {
      await logDebug({ message: `Evaluate fallback failed for name`, data: { error: e instanceof Error ? e.message : String(e) } });
    }
  }
  
  // If no element found, try to get some context about what's on the page
  try {
    const pageTitle = await page.title().catch(() => '');
    const url = page.url();
    const hasMain = await page.$('main').catch(() => null);
    const mainText = hasMain ? await hasMain.textContent().catch(() => '') : '';
    
    await logDebug({ 
      message: `Element not found with any selector for ${fieldName}`, 
      data: { 
        selectors, 
        fieldName,
        pageTitle,
        url,
        hasMain: !!hasMain,
        mainTextPreview: mainText.substring(0, 200)
      } 
    });
  } catch (e) {
    await logDebug({ message: `Failed to get page context for ${fieldName}`, data: { error: e instanceof Error ? e.message : String(e) } });
  }
  
  return null;
}

/**
 * Helper function to get text content from element with fallbacks
 */
async function getTextWithFallbacks(page: any, selectors: string[], cleanText: boolean = true, fieldName: string = 'unknown'): Promise<string> {
  const element = await findElementWithFallbacks(page, selectors, fieldName);
  if (element) {
    try {
      let text = (await element.textContent())?.trim() || '';
      await logDebug({ message: `Raw text extracted for ${fieldName}`, data: { fieldName, length: text.length, preview: text.substring(0, 100) } });
      
      if (cleanText) {
        const originalLength = text.length;
        text = cleanLinkedInText(text);
        if (originalLength !== text.length) {
          await logDebug({ message: `Text cleaned for ${fieldName}`, data: { fieldName, originalLength, cleanedLength: text.length } });
        }
      }
      return text;
    } catch (e) {
      await logDebug({ message: `Error getting text for ${fieldName}`, data: { fieldName, error: e instanceof Error ? e.message : String(e) } });
      return '';
    }
  }
  await logDebug({ message: `No text extracted for ${fieldName}`, data: { fieldName } });
  return '';
}

/**
 * Expands all collapsed content on the page
 */
async function expandCollapsedContent(page: any) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    await page.waitForTimeout(200); // Reduced wait for faster execution

    const showMoreSelectors = [
      'button[aria-label*="Show more"]',
      'button[aria-label*="show more"]',
      'button:has-text("Show more")',
      'button:has-text("show more")',
      'button:has-text("See more")',
      'button:has-text("see more")',
      '.pvs-navigation__text:has-text("Show more")',
      'button.pvs-profile-actions__action--more',
      'button.pvs-list__paged-list-item button',
      'button[aria-expanded="false"]',
      'span:has-text("Show more")',
      'a:has-text("Show more")',
      '[data-control-name="show_more"]',
    ];

    let clickedCount = 0;
    for (const selector of showMoreSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const button of buttons) {
          try {
            const isVisible = await button.isVisible().catch(() => false);
            if (isVisible) {
              await button.click({ timeout: 500 });
              await page.waitForTimeout(100);
              clickedCount++;
            }
          } catch (e) {
            // Ignore errors
          }
        }
      } catch (e) {
        // Continue
      }
    }

    // Scroll to trigger lazy-loaded content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(200);
    
    // Scroll back up gradually
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(100);
    
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    
    await logDebug({ message: 'Expanded collapsed content', data: { clickedButtons: clickedCount } });
  } catch (e) {
    console.error('Error expanding collapsed content:', e);
    await logDebug({ message: 'Error expanding content', data: { error: e instanceof Error ? e.message : String(e) } });
  }
}

/**
 * Cleans text by removing login prompts, UI elements, and extra whitespace
 */
function cleanLinkedInText(text: string): string {
  if (!text) return '';
  
  // Remove login-related phrases
  const loginPhrases = [
    'Sign in to view',
    'Sign in',
    'Join now',
    'Welcome back',
    'Email or phone',
    'Password',
    'Forgot password',
    'New to LinkedIn',
    'User Agreement',
    'Privacy Policy',
    'Cookie Policy',
    'Contact Info',
    'see more',
    'Show more',
  ];
  
  let cleaned = text;
  
  // Remove login phrases
  for (const phrase of loginPhrases) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Remove excessive whitespace and newlines
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove text that's mostly login-related
  const loginKeywords = ['sign in', 'join now', 'email', 'password', 'welcome back'];
  const lowerText = cleaned.toLowerCase();
  const loginKeywordCount = loginKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  // If more than 2 login keywords found, likely a login wall
  if (loginKeywordCount > 2 && cleaned.length > 50) {
    return '';
  }
  
  return cleaned;
}

/**
 * Checks if LinkedIn is showing login wall or blocking access
 */
async function checkLinkedInLoginWall(page: any): Promise<boolean> {
  try {
    const pageUrl = page.url();
    
    // Check URL first
    if (pageUrl.includes('linkedin.com/login') || pageUrl.includes('authwall')) {
      await logDebug({ message: 'LinkedIn login wall detected via URL', data: { url: pageUrl } });
      return true;
    }
    
    // Check for login form elements
    const loginForm = await page.$('form[action*="login"], input[type="password"], button:has-text("Sign in")').catch(() => null);
    if (loginForm) {
      await logDebug({ message: 'LinkedIn login wall detected via form elements', data: { url: pageUrl } });
      return true;
    }
    
    // Check page title
    const pageTitle = await page.title().catch(() => '');
    if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
      await logDebug({ message: 'LinkedIn login wall detected via page title', data: { url: pageUrl, title: pageTitle } });
      return true;
    }
    
    // Check for specific login indicators in main content - but be less aggressive
    // Only trigger if we see multiple strong indicators
    const mainContent = await page.$('main').catch(() => null);
    if (mainContent) {
      const mainText = await mainContent.textContent().catch(() => '');
      const strongLoginIndicators = ['Welcome back', 'Email or phone', 'Password'];
      const strongIndicatorCount = strongLoginIndicators.filter(indicator => 
        mainText.toLowerCase().includes(indicator.toLowerCase())
      ).length;
      
      // Only consider it a login wall if we see multiple strong indicators AND the profile name is missing
      const hasProfileName = await page.$('main h1').catch(() => null);
      if (strongIndicatorCount >= 2 && !hasProfileName) {
        await logDebug({ message: 'LinkedIn login wall detected in main content', data: { url: pageUrl, indicatorCount: strongIndicatorCount } });
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Extracts LinkedIn profile data
 */
async function extractLinkedInProfile(page: any, url: string): Promise<LinkedInProfileData> {
  const data: LinkedInProfileData = {
    platform: 'linkedin',
    url,
    name: '',
    headline: '',
    location: '',
    about: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    recommendations: [],
  };

  try {
    // Fast loading strategy: use domcontentloaded and minimal waits
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await page.waitForTimeout(500); // Minimal wait for initial render
    
    // Use a single evaluate() call to extract all data at once - MUCH faster
    const extractedData = await page.evaluate(() => {
      const result: any = {
        name: '',
        headline: '',
        location: '',
        about: '',
        experience: [],
        education: [],
        skills: [],
        languages: [],
        profileImage: '',
      };

      // Name - try multiple selectors
      const nameSelectors = [
        'main h1.text-heading-xlarge',
        'h1.text-heading-xlarge',
        'main h1',
        'h1[data-generated-suggestion-target]',
        'h1.top-card-layout__title',
        'h1.break-words',
        'h1',
      ];
      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim() || '';
          if (text && text.length > 2 && text.length < 100) {
            result.name = text;
            break;
          }
        }
      }

      // Headline
      const headlineSelectors = [
        'main h1 + .text-body-medium.break-words',
        'main .top-card-layout__headline',
        '.text-body-medium.break-words',
        'main h1 ~ .text-body-medium',
        '.text-body-medium',
      ];
      for (const selector of headlineSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim() || '';
          if (text && text.length > 5) {
            result.headline = text;
            break;
          }
        }
      }

      // Location
      const locationSelectors = [
        'main .text-body-small.inline.t-black--light.break-words',
        'main .top-card-layout__first-subline',
        '.text-body-small.t-black--light',
      ];
      for (const selector of locationSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          let text = el.textContent?.trim() || '';
          // Remove "Contact Info" suffix if present
          const contactInfoIndex = text.indexOf('Contact Info');
          if (contactInfoIndex > -1) {
            text = text.substring(0, contactInfoIndex).trim();
          }
          if (text && text.length > 2 && text.length < 200 && !text.toLowerCase().includes('sign in')) {
            result.location = text;
            break;
          }
        }
      }

      // About section
      const aboutSection = document.querySelector('section#about, [data-section="summary"]');
      if (aboutSection) {
        const aboutText = aboutSection.querySelector('.inline-show-more-text, .break-words, span[aria-hidden="true"]');
        if (aboutText) {
          result.about = aboutText.textContent?.trim() || '';
        }
      }

      // Experience
      const expSection = document.querySelector('section#experience, [data-section="experience"]');
      if (expSection) {
        const expItems = expSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        expItems.forEach((item: any) => {
          const titleEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"], h3');
          const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"], .text-body-small');
          const dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
          const descEl = item.querySelector('.pvs-list__outer-container span[aria-hidden="true"]');
          
          if (titleEl) {
            result.experience.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl?.textContent?.trim() || '',
              startDate: dateEl?.textContent?.trim() || '',
              description: descEl?.textContent?.trim() || '',
            });
          }
        });
      }

      // Education
      const eduSection = document.querySelector('section#education, [data-section="education"]');
      if (eduSection) {
        const eduItems = eduSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        eduItems.forEach((item: any) => {
          const schoolEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], h3');
          const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
          const dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
          
          if (schoolEl) {
            result.education.push({
              school: schoolEl.textContent?.trim() || '',
              degree: degreeEl?.textContent?.trim() || '',
              startDate: dateEl?.textContent?.trim() || '',
            });
          }
        });
      }

      // Skills
      const skillsSection = document.querySelector('section#skills, [data-section="skills"]');
      if (skillsSection) {
        const skillItems = skillsSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        skillItems.forEach((item: any) => {
          const skillEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], span');
          if (skillEl) {
            const skill = skillEl.textContent?.trim() || '';
            if (skill) result.skills.push(skill);
          }
        });
      }

      // Profile Image
      const imgEl = document.querySelector('main img[alt*="profile"], .pv-top-card-profile-picture img, img.profile-photo-edit__preview');
      if (imgEl) {
        result.profileImage = (imgEl as HTMLImageElement).src || '';
      }

      return result;
    });

    // Populate data from extracted results
    data.name = extractedData.name || '';
    data.headline = extractedData.headline || '';
    data.location = extractedData.location || '';
    data.about = extractedData.about || '';
    data.experience = extractedData.experience || [];
    data.education = extractedData.education || [];
    data.skills = extractedData.skills || [];
    data.profileImage = extractedData.profileImage || '';

    // If name is still empty, try page title
    if (!data.name) {
      const pageTitle = await page.title().catch(() => '');
      if (pageTitle) {
        const titleParts = pageTitle.split('|');
        if (titleParts.length > 0) {
          const potentialName = titleParts[0].trim();
          if (potentialName && potentialName.length > 2 && potentialName.length < 100) {
            data.name = potentialName;
          }
        }
      }
    }

    // Log extraction results
    await logDebug({ 
      message: 'LinkedIn extraction complete', 
      data: { 
        url,
        name: { found: !!data.name, length: data.name.length },
        headline: { found: !!data.headline, length: data.headline.length },
        location: { found: !!data.location, length: data.location.length },
        about: { found: !!data.about, length: data.about.length },
        experienceCount: data.experience.length,
        educationCount: data.education.length,
        skillsCount: data.skills.length,
      } 
    });
  } catch (e) {
    console.error('Error extracting LinkedIn data:', e);
    await logDebug({ message: 'Error in extractLinkedInProfile', data: { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined } });
  }

  return data;
}

/**
 * Extracts Instagram profile data
 */
async function extractInstagramProfile(page: any, url: string): Promise<InstagramProfileData> {
  const data: InstagramProfileData = {
    platform: 'instagram',
    url,
    username: '',
  };

  try {
    // Extract username from URL
    const urlMatch = url.match(/instagram\.com\/([^/?]+)/);
    if (urlMatch) {
      data.username = urlMatch[1];
    }

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    // Full name
    try {
      const fullNameElement = await page.$('h2, h1[dir="auto"]');
      if (fullNameElement) {
        const text = (await fullNameElement.textContent())?.trim();
        if (text && text !== data.username) {
          data.fullName = text;
        }
      }
    } catch (e) {}

    // Biography
    try {
      const bioElement = await page.$('div.-vDIg span, header section span');
      if (bioElement) {
        data.biography = (await bioElement.textContent())?.trim() || undefined;
      }
    } catch (e) {}

    // Profile stats (followers, following, posts)
    try {
      const stats = await page.$$('header section ul li');
      for (let i = 0; i < Math.min(stats.length, 3); i++) {
        const statText = (await stats[i].textContent())?.trim() || '';
        const match = statText.match(/([\d,]+)\s+(\w+)/);
        if (match) {
          const count = match[1];
          const label = match[2].toLowerCase();
          if (label.includes('post')) {
            data.posts = count;
          } else if (label.includes('follower')) {
            data.followers = count;
          } else if (label.includes('following')) {
            data.following = count;
          }
        }
      }
    } catch (e) {}

    // Verified badge
    try {
      const verifiedBadge = await page.$('svg[aria-label*="Verified"]');
      data.isVerified = !!verifiedBadge;
    } catch (e) {}

    // Private account indicator
    try {
      const privateIndicator = await page.$(':has-text("This account is private")');
      data.isPrivate = !!privateIndicator;
    } catch (e) {}

    // Profile image
    try {
      const profileImg = await page.$('header img[alt*="profile picture"], header img');
      if (profileImg) {
        data.profileImage = await profileImg.getAttribute('src') || undefined;
      }
    } catch (e) {}

    // Website link
    try {
      const websiteLink = await page.$('header a[href^="http"]');
      if (websiteLink) {
        data.website = await websiteLink.getAttribute('href') || undefined;
      }
    } catch (e) {}
  } catch (e) {
    console.error('Error extracting Instagram data:', e);
  }

  return data;
}

/**
 * Extracts person/profile data from a general website
 */
async function extractWebsitePersonData(page: any, url: string): Promise<WebsitePersonData> {
  const data: WebsitePersonData = {
    platform: 'website',
    url,
  };

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    // Page title
    data.title = await page.title();

    // Extract structured data (JSON-LD)
    try {
      const jsonLdElements = await page.$$('script[type="application/ld+json"]');
      for (const element of jsonLdElements) {
        try {
          const jsonText = await element.textContent();
          if (jsonText && jsonText.trim()) {
            // Validate that the text looks like JSON before parsing
            const trimmedText = jsonText.trim();
            if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
              try {
                const jsonData = JSON.parse(trimmedText);
                if (Array.isArray(jsonData)) {
                  data.structuredData = { items: jsonData };
                } else {
                  data.structuredData = jsonData;
                }

                // Extract person data from structured data
                const personData = Array.isArray(jsonData) 
                  ? jsonData.find((item: any) => item['@type'] === 'Person')
                  : (jsonData['@type'] === 'Person' ? jsonData : null);

                if (personData) {
                  data.name = personData.name || data.name;
                  data.email = personData.email || data.email;
                  data.jobTitle = personData.jobTitle || data.jobTitle;
                  if (personData.address) {
                    data.location = typeof personData.address === 'string' 
                      ? personData.address 
                      : personData.address.addressLocality;
                  }
                }
              } catch (parseError) {
                // Skip invalid JSON - log but don't throw
                console.error('Failed to parse JSON-LD:', parseError);
              }
            }
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }
    } catch (e) {}

    // Extract from meta tags
    try {
      // Open Graph and Twitter Card meta tags
      const metaTags = await page.$$('meta[property], meta[name]');
      const metadata: { [key: string]: string } = {};
      
      for (const meta of metaTags) {
        const property = await meta.getAttribute('property') || await meta.getAttribute('name');
        const content = await meta.getAttribute('content');
        if (property && content) {
          metadata[property] = content;

          // Extract common person fields
          if (property.includes('name') || property === 'og:title') {
            data.name = data.name || content;
          }
          if (property.includes('description')) {
            data.description = data.description || content;
          }
          if (property.includes('email')) {
            data.email = data.email || content;
          }
          if (property.includes('phone')) {
            data.phone = data.phone || content;
          }
          if (property.includes('location') || property.includes('address')) {
            data.location = data.location || content;
          }
          if (property.includes('job') || property.includes('title')) {
            data.jobTitle = data.jobTitle || content;
          }
        }
      }
      data.metadata = metadata;
    } catch (e) {}

    // Extract text content (for finding person info)
    try {
      const bodyText = await page.$eval('body', (el: any) => el.innerText);
      data.textContent = bodyText.substring(0, 5000); // Limit to 5000 chars

      // Try to find email
      if (!data.email) {
        const emailMatch = bodyText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        if (emailMatch) {
          data.email = emailMatch[0];
        }
      }

      // Try to find phone
      if (!data.phone) {
        const phoneMatch = bodyText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch) {
          data.phone = phoneMatch[0];
        }
      }
    } catch (e) {}

    // Extract images
    try {
      const images = await page.$$('img[src]');
      const imageUrls: string[] = [];
      for (const img of images.slice(0, 10)) { // Limit to 10 images
        const src = await img.getAttribute('src');
        if (src && !src.startsWith('data:')) {
          try {
            const fullUrl = new URL(src, url).href;
            imageUrls.push(fullUrl);
          } catch {
            imageUrls.push(src);
          }
        }
      }
      data.images = imageUrls;
    } catch (e) {}

    // Extract social links
    try {
      const socialLinks: Array<{ platform: string; url: string }> = [];
      const links = await page.$$('a[href]');
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href) {
          try {
            const fullUrl = new URL(href, url).href;
            if (fullUrl.includes('linkedin.com')) {
              socialLinks.push({ platform: 'LinkedIn', url: fullUrl });
            } else if (fullUrl.includes('twitter.com') || fullUrl.includes('x.com')) {
              socialLinks.push({ platform: 'Twitter', url: fullUrl });
            } else if (fullUrl.includes('instagram.com')) {
              socialLinks.push({ platform: 'Instagram', url: fullUrl });
            } else if (fullUrl.includes('facebook.com')) {
              socialLinks.push({ platform: 'Facebook', url: fullUrl });
            } else if (fullUrl.includes('github.com')) {
              socialLinks.push({ platform: 'GitHub', url: fullUrl });
            }
          } catch {}
        }
      }
      if (socialLinks.length > 0) {
        data.socialLinks = socialLinks;
      }
    } catch (e) {}
  } catch (e) {
    console.error('Error extracting website data:', e);
  }

  return data;
}

/**
 * Progressive LinkedIn profile extraction with section tracking
 */
async function extractLinkedInProfileProgressive(
  page: any,
  url: string,
  continuation: ScrapeContinuation
): Promise<LinkedInProfileData> {
  // Start with existing partial data or create new
  const existingData = continuation.partialData as Partial<LinkedInProfileData> || {};
  const data: LinkedInProfileData = {
    platform: 'linkedin',
    url,
    name: existingData.name || '',
    headline: existingData.headline || '',
    location: existingData.location || '',
    about: existingData.about || '',
    experience: existingData.experience || [],
    education: existingData.education || [],
    skills: existingData.skills || [],
    languages: existingData.languages || [],
    recommendations: existingData.recommendations || [],
    profileImage: existingData.profileImage,
  };

  try {
    // Fast loading strategy: use domcontentloaded and minimal waits
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await page.waitForTimeout(500); // Minimal wait for initial render
    
    // Use a single evaluate() call to extract all data at once - MUCH faster
    const extractedData = await page.evaluate(() => {
      const result: any = {
        name: '',
        headline: '',
        location: '',
        about: '',
        experience: [],
        education: [],
        skills: [],
        languages: [],
        profileImage: '',
      };

      // Name
      const nameSelectors = ['main h1.text-heading-xlarge', 'h1.text-heading-xlarge', 'main h1', 'h1'];
      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim() || '';
          if (text && text.length > 2 && text.length < 100) {
            result.name = text;
            break;
          }
        }
      }

      // Headline
      const headlineSelectors = ['main h1 + .text-body-medium.break-words', 'main .top-card-layout__headline', '.text-body-medium.break-words'];
      for (const selector of headlineSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim() || '';
          if (text && text.length > 5) {
            result.headline = text;
            break;
          }
        }
      }

      // Location
      const locationSelectors = ['main .text-body-small.inline.t-black--light.break-words', 'main .top-card-layout__first-subline'];
      for (const selector of locationSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          let text = el.textContent?.trim() || '';
          const contactInfoIndex = text.indexOf('Contact Info');
          if (contactInfoIndex > -1) text = text.substring(0, contactInfoIndex).trim();
          if (text && text.length > 2 && text.length < 200 && !text.toLowerCase().includes('sign in')) {
            result.location = text;
            break;
          }
        }
      }

      // About
      const aboutSection = document.querySelector('section#about, [data-section="summary"]');
      if (aboutSection) {
        const aboutText = aboutSection.querySelector('.inline-show-more-text, .break-words');
        if (aboutText) result.about = aboutText.textContent?.trim() || '';
      }

      // Experience
      const expSection = document.querySelector('section#experience, [data-section="experience"]');
      if (expSection) {
        const expItems = expSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        expItems.forEach((item: any) => {
          const titleEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], h3');
          const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
          const dateEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
          if (titleEl) {
            result.experience.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl?.textContent?.trim() || '',
              startDate: dateEl?.textContent?.trim() || '',
            });
          }
        });
      }

      // Education
      const eduSection = document.querySelector('section#education, [data-section="education"]');
      if (eduSection) {
        const eduItems = eduSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        eduItems.forEach((item: any) => {
          const schoolEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], h3');
          const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
          if (schoolEl) {
            result.education.push({
              school: schoolEl.textContent?.trim() || '',
              degree: degreeEl?.textContent?.trim() || '',
            });
          }
        });
      }

      // Skills
      const skillsSection = document.querySelector('section#skills, [data-section="skills"]');
      if (skillsSection) {
        const skillItems = skillsSection.querySelectorAll('.pvs-list__paged-list-item, .pvs-list li');
        skillItems.forEach((item: any) => {
          const skillEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"], span');
          if (skillEl) {
            const skill = skillEl.textContent?.trim() || '';
            if (skill) result.skills.push(skill);
          }
        });
      }

      return result;
    });

    // Populate data from extracted results
    if (!continuation.scrapedSections.includes('name') && extractedData.name) {
      data.name = extractedData.name;
      continuation.scrapedSections.push('name');
    }
    if (!continuation.scrapedSections.includes('headline') && extractedData.headline) {
      data.headline = extractedData.headline;
      continuation.scrapedSections.push('headline');
    }
    if (!continuation.scrapedSections.includes('location') && extractedData.location) {
      data.location = extractedData.location;
      continuation.scrapedSections.push('location');
    }
    if (!continuation.scrapedSections.includes('about') && extractedData.about) {
      data.about = extractedData.about;
      continuation.scrapedSections.push('about');
    }
    if (!continuation.scrapedSections.includes('experience')) {
      data.experience = extractedData.experience || [];
      if (data.experience.length > 0) continuation.scrapedSections.push('experience');
    }
    if (!continuation.scrapedSections.includes('education')) {
      data.education = extractedData.education || [];
      if (data.education.length > 0) continuation.scrapedSections.push('education');
    }
    if (!continuation.scrapedSections.includes('skills')) {
      data.skills = extractedData.skills || [];
      if (data.skills.length > 0) continuation.scrapedSections.push('skills');
    }

    // If name is still empty, try page title
    if (!data.name) {
      const pageTitle = await page.title().catch(() => '');
      if (pageTitle) {
        const titleParts = pageTitle.split('|');
        if (titleParts.length > 0) {
          const potentialName = titleParts[0].trim();
          if (potentialName && potentialName.length > 2 && potentialName.length < 100) {
            data.name = potentialName;
            continuation.scrapedSections.push('name');
          }
        }
      }
    }

    // Extract name if not already scraped
    if (!continuation.scrapedSections.includes('name')) {
      const nameSelectors = [
        'main h1.text-heading-xlarge',
        'h1.text-heading-xlarge',
        'main h1',
        'h1[data-generated-suggestion-target]',
        'h1.top-card-layout__title',
        'main section:first-of-type h1',
        'h1.pv-text-details__left-panel h1',
        'h1.text-heading-xlarge.inline',
        'h1.break-words',
        'h1',
        '.ph5 h1',
        '[data-test-id="profile-name"] h1',
        '.pv-text-details__left-panel h1',
      ];
      const name = await getTextWithFallbacks(page, nameSelectors, true, 'name');
      if (name) {
        data.name = name;
        continuation.scrapedSections.push('name');
      } else {
        // Try using page title as fallback
        const pageTitle = await page.title().catch(() => '');
        if (pageTitle) {
          const titleParts = pageTitle.split('|');
          if (titleParts.length > 0) {
            const potentialName = titleParts[0].trim();
            if (potentialName && potentialName.length > 2 && potentialName.length < 100) {
              data.name = potentialName;
              continuation.scrapedSections.push('name');
              await logDebug({ message: 'Using page title as name fallback in progressive extraction', data: { name: data.name } });
            }
          }
        }
      }
    }

    // Extract headline if not already scraped
    if (!continuation.scrapedSections.includes('headline')) {
      const headlineSelectors = [
        'main h1 + .text-body-medium.break-words',
        'main .top-card-layout__headline',
        'main section:first-of-type .text-body-medium',
        '.pv-text-details__left-panel .text-body-medium',
        'main h1 ~ .text-body-medium',
        '.text-body-medium.break-words',
        '.text-body-medium',
        'main h1 + div .text-body-medium',
        '.ph5 .text-body-medium',
        '[data-test-id="profile-headline"]',
        'main section .text-body-medium:first-of-type',
      ];
      const headline = await getTextWithFallbacks(page, headlineSelectors, true, 'headline');
      if (headline) {
        data.headline = headline;
        continuation.scrapedSections.push('headline');
      }
    }

    // Extract location if not already scraped
    if (!continuation.scrapedSections.includes('location')) {
      const locationSelectors = [
        'main .text-body-small.inline.t-black--light.break-words',
        'main .top-card-layout__first-subline',
        'main section:first-of-type .text-body-small',
        'main span[aria-label*="location"]',
        '.pv-text-details__left-panel .text-body-small:first-of-type',
        'main .text-body-small.t-black--light',
        '.ph5 .text-body-small.t-black--light',
        '[data-test-id="profile-location"]',
        'main section .text-body-small:first-of-type',
      ];
      let locationText = await getTextWithFallbacks(page, locationSelectors);
      // Additional cleaning for location
      if (locationText) {
        const contactInfoIndex = locationText.indexOf('Contact Info');
        if (contactInfoIndex > -1) {
          locationText = locationText.substring(0, contactInfoIndex).trim();
        }
        if (locationText.toLowerCase().includes('sign in') || locationText.length > 200) {
          locationText = '';
        }
      }
      if (locationText) {
        data.location = locationText;
        continuation.scrapedSections.push('location');
      }
    }

    // Extract about section if not already scraped
    if (!continuation.scrapedSections.includes('about')) {
      try {
        const aboutSectionSelectors = [
          'section#about',
          '[data-section="summary"]',
          'section[data-section="summary"]',
          '#about',
          'section.about',
        ];
        
        const aboutSection = await findElementWithFallbacks(page, aboutSectionSelectors);
        if (aboutSection) {
          // Try to expand "Show more" in about section
          try {
            const showMoreBtn = await aboutSection.$('button:has-text("Show more"), button[aria-label*="Show more"]');
            if (showMoreBtn) {
              await showMoreBtn.click({ timeout: 1000 });
              await page.waitForTimeout(500);
            }
          } catch (e) {
            // Continue if button not found
          }
          
          const aboutTextSelectors = [
            '.inline-show-more-text',
            '.pv-about-section .pv-about__summary-text',
            '.break-words',
            'span[aria-hidden="true"]',
            'div[data-generated-suggestion-target]',
          ];
          
          for (const selector of aboutTextSelectors) {
            try {
              const aboutText = await aboutSection.$(selector);
              if (aboutText) {
                const text = (await aboutText.textContent())?.trim() || '';
                if (text.length > 10) {
                  data.about = text;
                  continuation.scrapedSections.push('about');
                  break;
                }
              }
            } catch (e) {
              // Continue to next selector
            }
          }
        }
      } catch (e) {
        await logDebug({ message: 'Error extracting about section progressively', data: { error: e instanceof Error ? e.message : String(e) } });
      }
    }

    // Extract experience (continue from last index)
    if (!continuation.scrapedSections.includes('experience-complete')) {
      try {
        const experienceSectionSelectors = [
          'section#experience',
          '[data-section="experience"]',
          'section[data-section="experience"]',
          '#experience',
        ];
        
        const experienceSection = await findElementWithFallbacks(page, experienceSectionSelectors);
        if (experienceSection) {
          const experienceItems = await experienceSection.$$('.pvs-list__paged-list-item, .pvs-list li, ul.pvs-list > li');
          const startIndex = continuation.lastScrapedIndex;
          
          for (let i = startIndex; i < experienceItems.length; i++) {
            try {
              const item = experienceItems[i];
              
              const titleSelectors = [
                '.mr1.t-bold span[aria-hidden="true"]',
                'h3 span[aria-hidden="true"]',
                'h3',
                '.t-bold span',
                'span[aria-hidden="true"]',
              ];
              
              const companySelectors = [
                '.t-14.t-normal span[aria-hidden="true"]',
                '.t-14 span[aria-hidden="true"]',
                '.text-body-small',
                'span.t-14',
              ];
              
              const dateSelectors = [
                '.t-14.t-normal.t-black--light span[aria-hidden="true"]',
                '.t-14.t-black--light span[aria-hidden="true"]',
                '.text-body-small.t-black--light',
                'span.t-black--light',
              ];
              
              const descSelectors = [
                '.inline-show-more-text',
                '.pvs-list__outer-container .t-14',
                '.t-14',
                '.break-words',
              ];

              const title = await getTextWithFallbacks(item, titleSelectors);
              
              // Try to expand description (skip to save time)
              // Skipping expansion for now to prevent timeout
              // try {
              //   const showMoreBtn = await item.$('button:has-text("Show more"), button[aria-label*="Show more"]');
              //   if (showMoreBtn) {
              //     await showMoreBtn.click({ timeout: 500 });
              //     await page.waitForTimeout(300);
              //   }
              // } catch (e) {
              //   // Continue
              // }
              
              const company = await getTextWithFallbacks(item, companySelectors);
              const startDate = await getTextWithFallbacks(item, dateSelectors);
              const description = await getTextWithFallbacks(item, descSelectors);

              if (title) {
                data.experience.push({
                  title,
                  company,
                  startDate,
                  description,
                });
                continuation.scrapedSections.push(`experience-${i}`);
                continuation.lastScrapedIndex = i + 1;
              }
            } catch (e) {
              // Skip malformed entries
            }
          }
          
          if (startIndex >= experienceItems.length) {
            continuation.scrapedSections.push('experience-complete');
          }
        }
      } catch (e) {
        await logDebug({ message: 'Error extracting experience progressively', data: { error: e instanceof Error ? e.message : String(e) } });
      }
    }

    // Extract education if not already scraped
    if (!continuation.scrapedSections.includes('education')) {
      try {
        const educationSectionSelectors = [
          'section#education',
          '[data-section="education"]',
          'section[data-section="education"]',
          '#education',
        ];
        
        const educationSection = await findElementWithFallbacks(page, educationSectionSelectors);
        if (educationSection) {
          const educationItems = await educationSection.$$('.pvs-list__paged-list-item, .pvs-list li, ul.pvs-list > li');
          
          for (const item of educationItems) {
            try {
              const schoolSelectors = [
                '.mr1.t-bold span[aria-hidden="true"]',
                'h3 span[aria-hidden="true"]',
                'h3',
                '.t-bold span',
              ];
              
              const degreeSelectors = [
                '.t-14.t-normal span[aria-hidden="true"]',
                '.t-14 span[aria-hidden="true"]',
                '.text-body-small',
              ];
              
              const dateSelectors = [
                '.t-14.t-normal.t-black--light span[aria-hidden="true"]',
                '.t-14.t-black--light span[aria-hidden="true"]',
                'span.t-black--light',
              ];

              const school = await getTextWithFallbacks(item, schoolSelectors);
              const degree = await getTextWithFallbacks(item, degreeSelectors);
              const startDate = await getTextWithFallbacks(item, dateSelectors);

              if (school) {
                data.education.push({
                  school,
                  degree,
                  startDate,
                });
              }
            } catch (e) {
              // Skip malformed entries
            }
          }
          continuation.scrapedSections.push('education');
        }
      } catch (e) {
        await logDebug({ message: 'Error extracting education progressively', data: { error: e instanceof Error ? e.message : String(e) } });
      }
    }

    // Extract skills if not already scraped
    if (!continuation.scrapedSections.includes('skills')) {
      try {
        const skillsSectionSelectors = [
          'section#skills',
          '[data-section="skills"]',
          'section[data-section="skills"]',
          '#skills',
        ];
        
        const skillsSection = await findElementWithFallbacks(page, skillsSectionSelectors);
        if (skillsSection) {
          const skillSelectors = [
            '.mr1.t-bold span[aria-hidden="true"]',
            'h3 span[aria-hidden="true"]',
            'h3',
            '.t-bold span',
            'span[aria-hidden="true"]',
            'li span',
          ];
          
          // Try multiple approaches
          for (const selector of skillSelectors) {
            try {
              const skillElements = await skillsSection.$$(selector);
              for (const element of skillElements) {
                const skill = (await element.textContent())?.trim();
                if (skill && skill.length > 1 && !data.skills.includes(skill)) {
                  data.skills.push(skill);
                }
              }
            } catch (e) {
              // Continue to next selector
            }
          }
          continuation.scrapedSections.push('skills');
        }
      } catch (e) {
        await logDebug({ message: 'Error extracting skills progressively', data: { error: e instanceof Error ? e.message : String(e) } });
      }
    }

    // Extract profile image if not already scraped
    if (!continuation.scrapedSections.includes('profileImage')) {
      try {
        const profileImgSelectors = [
          '.pv-top-card-profile-picture__image',
          'img.pv-top-card-profile-picture__image',
          'img[alt*="profile"]',
          'main img[alt*="profile picture"]',
          'header img',
          'img.profile-photo',
        ];
        
        const profileImg = await findElementWithFallbacks(page, profileImgSelectors);
        if (profileImg) {
          data.profileImage = await profileImg.getAttribute('src') || undefined;
          continuation.scrapedSections.push('profileImage');
        }
      } catch (e) {
        await logDebug({ message: 'Error extracting profile image progressively', data: { error: e instanceof Error ? e.message : String(e) } });
      }
    }
    
    await logDebug({ 
      message: 'LinkedIn progressive extraction update', 
      data: { 
        scrapedSections: continuation.scrapedSections,
        name: data.name ? 'found' : 'empty',
        experienceCount: data.experience.length,
        educationCount: data.education.length,
        skillsCount: data.skills.length,
      } 
    });
  } catch (e) {
    console.error('Error extracting LinkedIn data progressively:', e);
    await logDebug({ message: 'Error in extractLinkedInProfileProgressive', data: { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined } });
  }

  return data;
}

/**
 * Progressive Instagram profile extraction with section tracking
 */
async function extractInstagramProfileProgressive(
  page: any,
  url: string,
  continuation: ScrapeContinuation
): Promise<InstagramProfileData> {
  const existingData = continuation.partialData as Partial<InstagramProfileData> || {};
  const data: InstagramProfileData = {
    platform: 'instagram',
    url,
    username: existingData.username || '',
    fullName: existingData.fullName,
    biography: existingData.biography,
    profileImage: existingData.profileImage,
    followers: existingData.followers,
    following: existingData.following,
    posts: existingData.posts,
    isVerified: existingData.isVerified,
    isPrivate: existingData.isPrivate,
    website: existingData.website,
  };

  try {
    // Extract username if not already scraped
    if (!continuation.scrapedSections.includes('username')) {
      const urlMatch = url.match(/instagram\.com\/([^/?]+)/);
      if (urlMatch) {
        data.username = urlMatch[1];
        continuation.scrapedSections.push('username');
      }
    }

    // Extract full name if not already scraped
    if (!continuation.scrapedSections.includes('fullName')) {
      try {
        const fullNameElement = await page.$('h2, h1[dir="auto"]');
        if (fullNameElement) {
          const text = (await fullNameElement.textContent())?.trim();
          if (text && text !== data.username) {
            data.fullName = text;
            continuation.scrapedSections.push('fullName');
          }
        }
      } catch (e) {}
    }

    // Extract biography if not already scraped
    if (!continuation.scrapedSections.includes('biography')) {
      try {
        const bioElement = await page.$('div.-vDIg span, header section span');
        if (bioElement) {
          data.biography = (await bioElement.textContent())?.trim() || undefined;
          continuation.scrapedSections.push('biography');
        }
      } catch (e) {}
    }

    // Extract stats if not already scraped
    if (!continuation.scrapedSections.includes('stats')) {
      try {
        const stats = await page.$$('header section ul li');
        for (let i = 0; i < Math.min(stats.length, 3); i++) {
          const statText = (await stats[i].textContent())?.trim() || '';
          const match = statText.match(/([\d,]+)\s+(\w+)/);
          if (match) {
            const count = match[1];
            const label = match[2].toLowerCase();
            if (label.includes('post')) {
              data.posts = count;
            } else if (label.includes('follower')) {
              data.followers = count;
            } else if (label.includes('following')) {
              data.following = count;
            }
          }
        }
        continuation.scrapedSections.push('stats');
      } catch (e) {}
    }

    // Extract verified status if not already scraped
    if (!continuation.scrapedSections.includes('isVerified')) {
      try {
        const verifiedBadge = await page.$('svg[aria-label*="Verified"]');
        data.isVerified = !!verifiedBadge;
        continuation.scrapedSections.push('isVerified');
      } catch (e) {}
    }

    // Extract private status if not already scraped
    if (!continuation.scrapedSections.includes('isPrivate')) {
      try {
        const privateIndicator = await page.$(':has-text("This account is private")');
        data.isPrivate = !!privateIndicator;
        continuation.scrapedSections.push('isPrivate');
      } catch (e) {}
    }

    // Extract profile image if not already scraped
    if (!continuation.scrapedSections.includes('profileImage')) {
      try {
        const profileImg = await page.$('header img[alt*="profile picture"], header img');
        if (profileImg) {
          data.profileImage = await profileImg.getAttribute('src') || undefined;
          continuation.scrapedSections.push('profileImage');
        }
      } catch (e) {}
    }

    // Extract website if not already scraped
    if (!continuation.scrapedSections.includes('website')) {
      try {
        const websiteLink = await page.$('header a[href^="http"]');
        if (websiteLink) {
          data.website = await websiteLink.getAttribute('href') || undefined;
          continuation.scrapedSections.push('website');
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('Error extracting Instagram data progressively:', e);
  }

  return data;
}

/**
 * Progressive website person data extraction with section tracking
 */
async function extractWebsitePersonDataProgressive(
  page: any,
  url: string,
  continuation: ScrapeContinuation
): Promise<WebsitePersonData> {
  const existingData = continuation.partialData as Partial<WebsitePersonData> || {};
  const data: WebsitePersonData = {
    platform: 'website',
    url,
    title: existingData.title,
    name: existingData.name,
    description: existingData.description,
    email: existingData.email,
    phone: existingData.phone,
    location: existingData.location,
    jobTitle: existingData.jobTitle,
    company: existingData.company,
    socialLinks: existingData.socialLinks,
    images: existingData.images,
    textContent: existingData.textContent,
    metadata: existingData.metadata,
    structuredData: existingData.structuredData,
  };

  try {
    // Extract title if not already scraped
    if (!continuation.scrapedSections.includes('title')) {
      data.title = await page.title();
      continuation.scrapedSections.push('title');
    }

    // Extract structured data if not already scraped
    if (!continuation.scrapedSections.includes('structuredData')) {
      try {
        const jsonLdElements = await page.$$('script[type="application/ld+json"]');
        for (const element of jsonLdElements) {
          try {
            const jsonText = await element.textContent();
            if (jsonText && jsonText.trim()) {
              // Validate that the text looks like JSON before parsing
              const trimmedText = jsonText.trim();
              if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
                try {
                  const jsonData = JSON.parse(trimmedText);
                  if (Array.isArray(jsonData)) {
                    data.structuredData = { items: jsonData };
                  } else {
                    data.structuredData = jsonData;
                  }

                  const personData = Array.isArray(jsonData) 
                    ? jsonData.find((item: any) => item['@type'] === 'Person')
                    : (jsonData['@type'] === 'Person' ? jsonData : null);

                  if (personData) {
                    data.name = personData.name || data.name;
                    data.email = personData.email || data.email;
                    data.jobTitle = personData.jobTitle || data.jobTitle;
                    if (personData.address) {
                      data.location = typeof personData.address === 'string' 
                        ? personData.address 
                        : personData.address.addressLocality;
                    }
                  }
                } catch (parseError) {
                  // Skip invalid JSON - log but don't throw
                  console.error('Failed to parse JSON-LD:', parseError);
                }
              }
            }
          } catch (e) {}
        }
        continuation.scrapedSections.push('structuredData');
      } catch (e) {}
    }

    // Extract meta tags if not already scraped
    if (!continuation.scrapedSections.includes('meta')) {
      try {
        const metaTags = await page.$$('meta[property], meta[name]');
        const metadata: { [key: string]: string } = {};
        
        for (const meta of metaTags) {
          const property = await meta.getAttribute('property') || await meta.getAttribute('name');
          const content = await meta.getAttribute('content');
          if (property && content) {
            metadata[property] = content;

            if (property.includes('name') || property === 'og:title') {
              data.name = data.name || content;
            }
            if (property.includes('description')) {
              data.description = data.description || content;
            }
            if (property.includes('email')) {
              data.email = data.email || content;
            }
            if (property.includes('phone')) {
              data.phone = data.phone || content;
            }
            if (property.includes('location') || property.includes('address')) {
              data.location = data.location || content;
            }
            if (property.includes('job') || property.includes('title')) {
              data.jobTitle = data.jobTitle || content;
            }
          }
        }
        data.metadata = metadata;
        continuation.scrapedSections.push('meta');
      } catch (e) {}
    }

    // Extract text content if not already scraped
    if (!continuation.scrapedSections.includes('textContent')) {
      try {
        const bodyText = await page.$eval('body', (el: any) => el.innerText);
        data.textContent = bodyText.substring(0, 5000);

        if (!data.email) {
          const emailMatch = bodyText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
          if (emailMatch) {
            data.email = emailMatch[0];
          }
        }

        if (!data.phone) {
          const phoneMatch = bodyText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          if (phoneMatch) {
            data.phone = phoneMatch[0];
          }
        }
        continuation.scrapedSections.push('textContent');
      } catch (e) {}
    }

    // Extract images if not already scraped
    if (!continuation.scrapedSections.includes('images')) {
      try {
        const images = await page.$$('img[src]');
        const imageUrls: string[] = [];
        for (const img of images.slice(0, 10)) {
          const src = await img.getAttribute('src');
          if (src && !src.startsWith('data:')) {
            try {
              const fullUrl = new URL(src, url).href;
              imageUrls.push(fullUrl);
            } catch {
              imageUrls.push(src);
            }
          }
        }
        data.images = imageUrls;
        continuation.scrapedSections.push('images');
      } catch (e) {}
    }

    // Extract social links if not already scraped
    if (!continuation.scrapedSections.includes('socialLinks')) {
      try {
        const socialLinks: Array<{ platform: string; url: string }> = [];
        const links = await page.$$('a[href]');
        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href) {
            try {
              const fullUrl = new URL(href, url).href;
              if (fullUrl.includes('linkedin.com')) {
                socialLinks.push({ platform: 'LinkedIn', url: fullUrl });
              } else if (fullUrl.includes('twitter.com') || fullUrl.includes('x.com')) {
                socialLinks.push({ platform: 'Twitter', url: fullUrl });
              } else if (fullUrl.includes('instagram.com')) {
                socialLinks.push({ platform: 'Instagram', url: fullUrl });
              } else if (fullUrl.includes('facebook.com')) {
                socialLinks.push({ platform: 'Facebook', url: fullUrl });
              } else if (fullUrl.includes('github.com')) {
                socialLinks.push({ platform: 'GitHub', url: fullUrl });
              }
            } catch {}
          }
        }
        if (socialLinks.length > 0) {
          data.socialLinks = socialLinks;
        }
        continuation.scrapedSections.push('socialLinks');
      } catch (e) {}
    }
  } catch (e) {
    console.error('Error extracting website data progressively:', e);
  }

  return data;
}

/**
 * Progressive scraping function that supports continuation tokens
 * Extracts first/last visible text immediately, then continues scraping sections
 */
export async function scrapeProfileProgressive(
  url: string,
  continuation?: ScrapeContinuation
): Promise<ProgressiveScrapeResult> {
  if (!validateUrl(url)) {
    throw new Error('Invalid URL format');
  }

  const platform = detectPlatform(url);
  
  // PRIORITY 1: Check static profiles first (instant, no scraping needed)
  if (platform === 'linkedin') {
    const staticProfile = getStaticLinkedInProfile(url);
    if (staticProfile) {
      await logDebug({ message: 'Returning static profile', data: { url, name: staticProfile.name } });
      // Also cache the static profile for faster future access
      setCachedProfile(url, staticProfile);
      return {
        data: staticProfile,
        isComplete: true,
        firstVisibleText: staticProfile.name,
        lastVisibleText: staticProfile.about,
      };
    }
  }

  // PRIORITY 2: Check cache (fast, no scraping needed)
  const cachedProfile = getCachedProfile(url);
  if (cachedProfile) {
    await logDebug({ message: 'Returning cached profile', data: { url, platform: cachedProfile.platform } });
    const linkedInData = cachedProfile.platform === 'linkedin' ? cachedProfile as any : null;
    return {
      data: cachedProfile,
      isComplete: true,
      firstVisibleText: linkedInData?.name || '',
      lastVisibleText: linkedInData?.about || '',
    };
  }

  let browser: any = null;
  let context: any = null;
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 8500; // 8.5 seconds max, 1.5s buffer for Vercel's 10s limit

  // Initialize or load continuation state
  let continuationState: ScrapeContinuation = continuation || {
    url,
    platform,
    sessionId: generateToken(url),
    scrapedSections: [],
    lastScrapedIndex: 0,
    partialData: {},
    timestamp: Date.now(),
  };

  let firstVisibleText = continuationState.firstVisibleText || '';
  let lastVisibleText = continuationState.lastVisibleText || '';

  try {
    // Detect environment - prioritize Vercel detection
    const hasAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const hasVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    const hasLambdaRoot = !!process.env.LAMBDA_TASK_ROOT;
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    // Always use serverless mode if on Vercel or if not in dev mode on Linux
    const isServerless = hasAwsLambda || hasVercel || hasLambdaRoot || (!isDev && process.platform === 'linux');

    // Use @sparticuz/chromium for serverless - optimized for Vercel/Lambda
    // This is the only reliable option for serverless environments
    let launchOptions: any;

    if (isServerless) {
      try {
        // Configure Chromium for serverless environment (Vercel/Lambda)
        chromium.setGraphicsMode = false;
        
        const execPath = await chromium.executablePath();
        const chromiumArgs = chromium.args || [];

        if (!execPath) {
          throw new Error('Failed to get Chromium executable path from @sparticuz/chromium');
        }

        // Optimized args for speed - minimal flags for faster startup
        const serverlessArgs = [
          ...chromiumArgs,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process', // Faster startup
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
        ];

        launchOptions = {
          args: serverlessArgs,
          executablePath: execPath,
          headless: true,
        };
      } catch (chromiumError) {
        console.error('Error configuring @sparticuz/chromium:', chromiumError);
        throw new Error(`Failed to configure Chromium for serverless environment: ${chromiumError instanceof Error ? chromiumError.message : String(chromiumError)}`);
      }
    } else {
      // Local development - use system Chromium or installed Playwright browsers
      launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      };
    }

    browser = await playwrightChromium.launch(launchOptions);
    // In Playwright 1.57.0+, setUserAgent is not available on Page object
    // Instead, create a context with userAgent and create pages from that context
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Navigate with longer timeout and wait for network idle
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForTimeout(500); // Minimal wait for initial render

    // PRIORITY: Extract first and last visible text immediately
    if (!firstVisibleText || !lastVisibleText) {
      const firstLast = await extractFirstLastVisibleText(page);
      firstVisibleText = firstLast.firstVisibleText;
      lastVisibleText = firstLast.lastVisibleText;
      continuationState.firstVisibleText = firstVisibleText;
      continuationState.lastVisibleText = lastVisibleText;
    }

    // Check if we have time remaining
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_EXECUTION_TIME) {
      await browser.close();
      const token = continuationState.sessionId;
      continuationState.timestamp = Date.now();
      setContinuation(token, continuationState);
      
      return {
        data: continuationState.partialData as ProfileData,
        isComplete: false,
        continuation: continuationState,
        firstVisibleText,
        lastVisibleText,
      };
    }

    // Continue scraping sections based on platform
    let profileData: ProfileData;
    const remainingTime = MAX_EXECUTION_TIME - elapsed;

    switch (platform) {
      case 'linkedin':
        if (!validateLinkedInUrl(url)) {
          throw new Error('Invalid LinkedIn profile URL');
        }
        // Skip expansion for speed - extract data directly
        profileData = await extractLinkedInProfileProgressive(page, url, continuationState);
        break;

      case 'instagram':
        if (!validateInstagramUrl(url)) {
          throw new Error('Invalid Instagram profile URL');
        }
        profileData = await extractInstagramProfileProgressive(page, url, continuationState);
        break;

      case 'website':
        profileData = await extractWebsitePersonDataProgressive(page, url, continuationState);
        break;

      default:
        throw new Error('Unsupported platform');
    }

    await browser.close();

    // Check if scraping is complete (all sections scraped)
    const isComplete = checkScrapingComplete(platform, continuationState.scrapedSections);

    // Cache the result if complete
    if (isComplete) {
      setCachedProfile(url, profileData);
      await logDebug({ message: 'Scraping complete, cached result', data: { url, platform } });
      return {
        data: profileData,
        isComplete: true,
        firstVisibleText,
        lastVisibleText,
      };
    } else {
      // Update continuation state with latest data
      continuationState.partialData = profileData;
      continuationState.timestamp = Date.now();
      const token = continuationState.sessionId;
      setContinuation(token, continuationState);

      return {
        data: profileData,
        isComplete: false,
        continuation: continuationState,
        firstVisibleText,
        lastVisibleText,
      };
    }
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    // Return partial data if we have any
    if (continuationState.partialData && Object.keys(continuationState.partialData).length > 0) {
      const token = continuationState.sessionId;
      continuationState.timestamp = Date.now();
      setContinuation(token, continuationState);
      
      return {
        data: continuationState.partialData as ProfileData,
        isComplete: false,
        continuation: continuationState,
        firstVisibleText,
        lastVisibleText,
      };
    }
    
    throw new Error(`Failed to scrape profile: ${error.message}`);
  }
}

/**
 * Check if scraping is complete based on scraped sections
 */
function checkScrapingComplete(platform: PlatformType, scrapedSections: string[]): boolean {
  const requiredSections: { [key in PlatformType]: string[] } = {
    linkedin: ['name', 'headline', 'about', 'experience', 'education', 'skills'],
    instagram: ['username', 'fullName', 'biography', 'stats'],
    website: ['title', 'textContent'],
  };

  const required = requiredSections[platform];
  return required.every(section => scrapedSections.some(s => s.startsWith(section)));
}

/**
 * Main scraping function that detects platform and routes to appropriate scraper
 * Maintains backward compatibility, uses progressive scraping internally
 */
export async function scrapeProfile(url: string): Promise<ProfileData> {
  const result = await scrapeProfileProgressive(url);
  return result.data;
}
