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
async function findElementWithFallbacks(page: any, selectors: string[]): Promise<any> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await logDebug({ message: 'Element found', selector, data: { found: true } });
        return element;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  await logDebug({ message: 'Element not found with any selector', selectors, data: { found: false } });
  return null;
}

/**
 * Helper function to get text content from element with fallbacks
 */
async function getTextWithFallbacks(page: any, selectors: string[], cleanText: boolean = true): Promise<string> {
  const element = await findElementWithFallbacks(page, selectors);
  if (element) {
    try {
      let text = (await element.textContent())?.trim() || '';
      if (cleanText) {
        text = cleanLinkedInText(text);
      }
      return text;
    } catch (e) {
      return '';
    }
  }
  return '';
}

/**
 * Expands all collapsed content on the page
 */
async function expandCollapsedContent(page: any) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await page.waitForTimeout(500); // Additional wait for dynamic content

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
              await button.click({ timeout: 1000 });
              await page.waitForTimeout(200);
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
    await page.waitForTimeout(500);
    
    // Scroll back up gradually
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(200);
    
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    
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
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await page.waitForTimeout(2000); // Give more time for dynamic content
    
    // Check for login wall after page loads
    const isLoginWall = await checkLinkedInLoginWall(page);
    if (isLoginWall) {
      await logDebug({ message: 'LinkedIn login wall detected, returning empty data', data: { url } });
      return data;
    }
    
    // Wait for main content to load
    try {
      await page.waitForSelector('main', { timeout: 5000 });
    } catch (e) {
      await logDebug({ message: 'Main content not found, may be login wall', data: { url } });
    }

    // Name - try multiple selectors
    const nameSelectors = [
      'main h1.text-heading-xlarge',
      'main h1',
      'h1.text-heading-xlarge',
      'h1[data-generated-suggestion-target]',
      'h1.top-card-layout__title',
      'main section:first-of-type h1',
      'h1.pv-text-details__left-panel h1',
      'h1.text-heading-xlarge.inline',
      'h1.break-words',
    ];
    data.name = await getTextWithFallbacks(page, nameSelectors);
    await logDebug({ message: 'Name extraction', data: { found: !!data.name, name: data.name.substring(0, 50) } });

    // Headline - try multiple selectors
    const headlineSelectors = [
      'main h1 + .text-body-medium.break-words',
      'main .top-card-layout__headline',
      'main section:first-of-type .text-body-medium',
      '.pv-text-details__left-panel .text-body-medium',
      'main h1 ~ .text-body-medium',
      '.text-body-medium.break-words',
      '.text-body-medium',
    ];
    data.headline = await getTextWithFallbacks(page, headlineSelectors);
    await logDebug({ message: 'Headline extraction', data: { found: !!data.headline, length: data.headline.length } });

    // Location - try multiple selectors (more specific, avoid login prompts)
    const locationSelectors = [
      'main .text-body-small.inline.t-black--light.break-words:not([aria-label*="Sign"])',
      'main .top-card-layout__first-subline',
      'main section:first-of-type .text-body-small:not([aria-label*="Sign"]):not(:has-text("Sign in"))',
      'main span[aria-label*="location"]',
      '.pv-text-details__left-panel .text-body-small:first-of-type',
    ];
    let locationText = await getTextWithFallbacks(page, locationSelectors);
    // Additional cleaning for location - remove everything after "Contact Info" or login prompts
    if (locationText) {
      const contactInfoIndex = locationText.indexOf('Contact Info');
      if (contactInfoIndex > -1) {
        locationText = locationText.substring(0, contactInfoIndex).trim();
      }
      // Remove if it contains login prompts
      if (locationText.toLowerCase().includes('sign in') || locationText.length > 200) {
        locationText = '';
      }
    }
    data.location = locationText;

    // About section
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
        const aboutTextSelectors = [
          '.inline-show-more-text',
          '.pv-about-section .pv-about__summary-text',
          '.break-words',
          'span[aria-hidden="true"]',
          'div[data-generated-suggestion-target]',
        ];
        
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
        
        for (const selector of aboutTextSelectors) {
          try {
            const aboutText = await aboutSection.$(selector);
            if (aboutText) {
              let text = (await aboutText.textContent())?.trim() || '';
              text = cleanLinkedInText(text);
              
              // Skip if it looks like login content
              if (text.length > 10 && 
                  !text.toLowerCase().includes('sign in to view') &&
                  !text.toLowerCase().includes('welcome back') &&
                  !text.toLowerCase().includes('email or phone')) {
                data.about = text;
                break;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }
    } catch (e) {
      await logDebug({ message: 'Error extracting about section', data: { error: e instanceof Error ? e.message : String(e) } });
    }

    // Experience - scroll to section first, then extract
    try {
      // Scroll to experience section
      await page.evaluate(() => {
        const experienceSection = document.querySelector('section#experience, [data-section="experience"]');
        if (experienceSection) {
          experienceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      await page.waitForTimeout(1000);
      
      const experienceSectionSelectors = [
        'section#experience',
        '[data-section="experience"]',
        'section[data-section="experience"]',
        '#experience',
        'main section:has(h2:has-text("Experience"))',
      ];
      
      const experienceSection = await findElementWithFallbacks(page, experienceSectionSelectors);
      await logDebug({ message: 'Experience section', data: { found: !!experienceSection } });
      if (experienceSection) {
        // Wait a bit for content to load
        await page.waitForTimeout(1000);
        
        const experienceItems = await experienceSection.$$('.pvs-list__paged-list-item, .pvs-list li, ul.pvs-list > li, .pvs-list__outer-container > li');
        await logDebug({ message: 'Experience items found', data: { count: experienceItems.length } });
        
        for (const item of experienceItems) {
          try {
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
            const company = await getTextWithFallbacks(item, companySelectors);
            const startDate = await getTextWithFallbacks(item, dateSelectors);
            
            // Try to expand description
            let description = '';
            try {
              const showMoreBtn = await item.$('button:has-text("Show more"), button[aria-label*="Show more"]');
              if (showMoreBtn) {
                await showMoreBtn.click({ timeout: 500 });
                await page.waitForTimeout(300);
              }
            } catch (e) {
              // Continue
            }
            
            description = await getTextWithFallbacks(item, descSelectors);

            if (title) {
              data.experience.push({
                title,
                company,
                startDate,
                description,
              });
            }
          } catch (e) {
            // Skip malformed entries
          }
        }
      }
    } catch (e) {
      await logDebug({ message: 'Error extracting experience', data: { error: e instanceof Error ? e.message : String(e) } });
    }

    // Education - scroll to section first, then extract
    try {
      // Scroll to education section
      await page.evaluate(() => {
        const educationSection = document.querySelector('section#education, [data-section="education"]');
        if (educationSection) {
          educationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      await page.waitForTimeout(1000);
      
      const educationSectionSelectors = [
        'section#education',
        '[data-section="education"]',
        'section[data-section="education"]',
        '#education',
        'main section:has(h2:has-text("Education"))',
      ];
      
      const educationSection = await findElementWithFallbacks(page, educationSectionSelectors);
      if (educationSection) {
        // Wait a bit for content to load
        await page.waitForTimeout(500);
        
        const educationItems = await educationSection.$$('.pvs-list__paged-list-item, .pvs-list li, ul.pvs-list > li, .pvs-list__outer-container > li');
        
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
      }
    } catch (e) {
      await logDebug({ message: 'Error extracting education', data: { error: e instanceof Error ? e.message : String(e) } });
    }

    // Skills - scroll to section first, then extract
    try {
      // Scroll to skills section
      await page.evaluate(() => {
        const skillsSection = document.querySelector('section#skills, [data-section="skills"]');
        if (skillsSection) {
          skillsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      await page.waitForTimeout(1000);
      
      const skillsSectionSelectors = [
        'section#skills',
        '[data-section="skills"]',
        'section[data-section="skills"]',
        '#skills',
        'main section:has(h2:has-text("Skills"))',
      ];
      
      const skillsSection = await findElementWithFallbacks(page, skillsSectionSelectors);
      if (skillsSection) {
        // Wait a bit for content to load
        await page.waitForTimeout(500);
        
        // Try to expand "Show more" for skills
        try {
          const showMoreBtn = await skillsSection.$('button:has-text("Show more"), button[aria-label*="Show more"]');
          if (showMoreBtn) {
            await showMoreBtn.click({ timeout: 1000 });
            await page.waitForTimeout(500);
          }
        } catch (e) {
          // Continue if button not found
        }
        
        const skillSelectors = [
          '.pvs-list__paged-list-item .mr1.t-bold span[aria-hidden="true"]',
          '.pvs-list li .mr1.t-bold span[aria-hidden="true"]',
          '.pvs-list__paged-list-item h3 span[aria-hidden="true"]',
          '.pvs-list li h3 span[aria-hidden="true"]',
          '.pvs-list__paged-list-item .t-bold span',
          '.pvs-list li .t-bold span',
        ];
        
        // Try multiple approaches
        for (const selector of skillSelectors) {
          try {
            const skillElements = await skillsSection.$$(selector);
            for (const element of skillElements) {
              const skill = (await element.textContent())?.trim();
              // Filter out login prompts and ensure it's a valid skill
              if (skill && 
                  skill.length > 1 && 
                  skill.length < 100 &&
                  !skill.toLowerCase().includes('sign in') &&
                  !skill.toLowerCase().includes('show more') &&
                  !data.skills.includes(skill)) {
                data.skills.push(skill);
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }
    } catch (e) {
      await logDebug({ message: 'Error extracting skills', data: { error: e instanceof Error ? e.message : String(e) } });
    }

    // Profile image - be more specific to get actual profile image, not login page images
    try {
      const profileImgSelectors = [
        'main .pv-top-card-profile-picture__image',
        'main img.pv-top-card-profile-picture__image',
        'main img[alt*="profile picture"]',
        'main .top-card-layout__entity-image img',
      ];
      
      const profileImg = await findElementWithFallbacks(page, profileImgSelectors);
      if (profileImg) {
        const imgSrc = await profileImg.getAttribute('src') || '';
        // Filter out placeholder/default images
        if (imgSrc && 
            !imgSrc.includes('static.licdn.com/aero-v1/sc/h/') && 
            !imgSrc.includes('media.licdn.com/dms/image/') &&
            imgSrc.length > 50) {
          data.profileImage = imgSrc;
        }
      }
    } catch (e) {
      await logDebug({ message: 'Error extracting profile image', data: { error: e instanceof Error ? e.message : String(e) } });
    }
    
    await logDebug({ 
      message: 'LinkedIn extraction complete', 
      data: { 
        name: data.name ? 'found' : 'empty',
        headline: data.headline ? 'found' : 'empty',
        location: data.location ? 'found' : 'empty',
        about: data.about ? 'found' : 'empty',
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
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await page.waitForTimeout(2000); // Give more time for dynamic content
    
    // Check for login wall after page loads
    const isLoginWall = await checkLinkedInLoginWall(page);
    if (isLoginWall) {
      await logDebug({ message: 'LinkedIn login wall detected in progressive extraction', data: { url } });
      return data;
    }
    
    // Wait for main content to load
    try {
      await page.waitForSelector('main', { timeout: 5000 });
    } catch (e) {
      await logDebug({ message: 'Main content not found in progressive extraction', data: { url } });
    }

    // Extract name if not already scraped
    if (!continuation.scrapedSections.includes('name')) {
      const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1[data-generated-suggestion-target]',
        'main h1',
        'h1.top-card-layout__title',
        'main section:first-of-type h1',
        'h1.pv-text-details__left-panel h1',
        'h1.text-heading-xlarge.inline',
        'h1.break-words',
      ];
      const name = await getTextWithFallbacks(page, nameSelectors);
      if (name) {
        data.name = name;
        continuation.scrapedSections.push('name');
      }
    }

    // Extract headline if not already scraped
    if (!continuation.scrapedSections.includes('headline')) {
      const headlineSelectors = [
        'main h1 + .text-body-medium.break-words',
        'main .top-card-layout__headline',
        'main section:first-of-type .text-body-medium:not([aria-label*="Sign"])',
        '.pv-text-details__left-panel .text-body-medium',
        'main h1 ~ .text-body-medium',
      ];
      const headline = await getTextWithFallbacks(page, headlineSelectors);
      if (headline) {
        data.headline = headline;
        continuation.scrapedSections.push('headline');
      }
    }

    // Extract location if not already scraped
    if (!continuation.scrapedSections.includes('location')) {
      const locationSelectors = [
        'main .text-body-small.inline.t-black--light.break-words:not([aria-label*="Sign"])',
        'main .top-card-layout__first-subline',
        'main section:first-of-type .text-body-small:not([aria-label*="Sign"]):not(:has-text("Sign in"))',
        'main span[aria-label*="location"]',
        '.pv-text-details__left-panel .text-body-small:first-of-type',
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
              
              // Try to expand description
              try {
                const showMoreBtn = await item.$('button:has-text("Show more"), button[aria-label*="Show more"]');
                if (showMoreBtn) {
                  await showMoreBtn.click({ timeout: 500 });
                  await page.waitForTimeout(300);
                }
              } catch (e) {
                // Continue
              }
              
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
  let browser: any = null;
  let context: any = null;
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 9000; // 9 seconds max, 1s buffer

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
    // Detect environment
    const hasAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const hasVercel = !!process.env.VERCEL;
    const hasLambdaRoot = !!process.env.LAMBDA_TASK_ROOT;
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const isServerless = hasAwsLambda || hasVercel || hasLambdaRoot || (!isDev && process.platform === 'linux');

    let launchOptions: any;

    if (isServerless) {
      // Configure Chromium for serverless environment
      chromium.setGraphicsMode = false;
      
      // Get executable path - this will extract the bundled Chromium if needed
      const execPath = await chromium.executablePath();
      const chromiumArgs = chromium.args || [];
      // In serverless, always use headless mode
      const headlessMode = true;

      // Note: existsSync check removed - it can fail in serverless environments
      // even when the bundled Chromium from @sparticuz/chromium is valid.
      // The bundled Chromium includes all necessary libraries and should work without this check.
      
      if (!execPath) {
        throw new Error('Failed to get Chromium executable path from @sparticuz/chromium');
      }

      // Ensure we have the necessary args for serverless
      const serverlessArgs = [
        ...chromiumArgs,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-gpu',
      ];

      launchOptions = {
        args: serverlessArgs,
        executablePath: execPath,
        headless: headlessMode,
      };
    } else {
      launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4000 });

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
        // Quick expansion with time limit
        try {
          await Promise.race([
            expandCollapsedContent(page),
            new Promise(resolve => setTimeout(resolve, Math.min(remainingTime - 2000, 2000)))
          ]);
        } catch (e) {}
        profileData = await extractLinkedInProfileProgressive(page, url, continuationState);
        break;

      case 'instagram':
        if (!validateInstagramUrl(url)) {
          throw new Error('Invalid Instagram profile URL');
        }
        try {
          await Promise.race([
            expandCollapsedContent(page),
            new Promise(resolve => setTimeout(resolve, Math.min(remainingTime - 2000, 2000)))
          ]);
        } catch (e) {}
        profileData = await extractInstagramProfileProgressive(page, url, continuationState);
        break;

      case 'website':
        try {
          await Promise.race([
            expandCollapsedContent(page),
            new Promise(resolve => setTimeout(resolve, Math.min(remainingTime - 2000, 2000)))
          ]);
        } catch (e) {}
        profileData = await extractWebsitePersonDataProgressive(page, url, continuationState);
        break;

      default:
        throw new Error('Unsupported platform');
    }

    await browser.close();

    // Check if scraping is complete (all sections scraped)
    const isComplete = checkScrapingComplete(platform, continuationState.scrapedSections);

    if (isComplete) {
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
