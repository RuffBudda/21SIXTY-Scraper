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
 * Expands all collapsed content on the page
 */
async function expandCollapsedContent(page: any) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

    const showMoreSelectors = [
      'button[aria-label*="Show more"]',
      'button:has-text("Show more")',
      'button:has-text("see more")',
      '.pvs-navigation__text:has-text("Show more")',
      'button.pvs-profile-actions__action--more',
      'button:has-text("more")',
      '[aria-expanded="false"]',
    ];

    for (const selector of showMoreSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const button of buttons) {
          try {
            await button.click({ timeout: 500 });
            await page.waitForTimeout(100);
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
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
  } catch (e) {
    console.error('Error expanding collapsed content:', e);
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
    // Name
    const nameElement = await page.$('h1.text-heading-xlarge, h1.pv-text-details__left-panel h1');
    if (nameElement) {
      data.name = (await nameElement.textContent())?.trim() || '';
    }

    // Headline
    const headlineElement = await page.$('.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium');
    if (headlineElement) {
      data.headline = (await headlineElement.textContent())?.trim() || '';
    }

    // Location
    const locationElement = await page.$('.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small');
    if (locationElement) {
      data.location = (await locationElement.textContent())?.trim() || '';
    }

    // About section
    try {
      const aboutSection = await page.$('section#about, [data-section="summary"]');
      if (aboutSection) {
        const aboutText = await aboutSection.$('.inline-show-more-text, .pv-about-section .pv-about__summary-text');
        if (aboutText) {
          data.about = (await aboutText.textContent())?.trim() || '';
        }
      }
    } catch (e) {
      // Continue if about section not found
    }

    // Experience
    try {
      const experienceSection = await page.$('section#experience, [data-section="experience"]');
      if (experienceSection) {
        const experienceItems = await experienceSection.$$('.pvs-list__paged-list-item, .pvs-list li');
        for (const item of experienceItems) {
          try {
            const titleElement = await item.$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
            const companyElement = await item.$('.t-14.t-normal span[aria-hidden="true"], .t-14 span[aria-hidden="true"]');
            const dateElement = await item.$('.t-14.t-normal.t-black--light span[aria-hidden="true"], .t-14.t-black--light span[aria-hidden="true"]');
            const descElement = await item.$('.inline-show-more-text, .pvs-list__outer-container .t-14');

            const experience: ExperienceItem = {
              title: (await titleElement?.textContent())?.trim() || '',
              company: (await companyElement?.textContent())?.trim() || '',
              startDate: (await dateElement?.textContent())?.trim() || '',
              description: (await descElement?.textContent())?.trim() || '',
            };

            if (experience.title) {
              data.experience.push(experience);
            }
          } catch (e) {
            // Skip malformed entries
          }
        }
      }
    } catch (e) {
      // Continue if experience section not found
    }

    // Education
    try {
      const educationSection = await page.$('section#education, [data-section="education"]');
      if (educationSection) {
        const educationItems = await educationSection.$$('.pvs-list__paged-list-item, .pvs-list li');
        for (const item of educationItems) {
          try {
            const schoolElement = await item.$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
            const degreeElement = await item.$('.t-14.t-normal span[aria-hidden="true"], .t-14 span[aria-hidden="true"]');
            const dateElement = await item.$('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

            const education: EducationItem = {
              school: (await schoolElement?.textContent())?.trim() || '',
              degree: (await degreeElement?.textContent())?.trim() || '',
              startDate: (await dateElement?.textContent())?.trim() || '',
            };

            if (education.school) {
              data.education.push(education);
            }
          } catch (e) {
            // Skip malformed entries
          }
        }
      }
    } catch (e) {
      // Continue if education section not found
    }

    // Skills
    try {
      const skillsSection = await page.$('section#skills, [data-section="skills"]');
      if (skillsSection) {
        const skillElements = await skillsSection.$$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
        for (const element of skillElements) {
          const skill = (await element.textContent())?.trim();
          if (skill) {
            data.skills.push(skill);
          }
        }
      }
    } catch (e) {
      // Continue if skills section not found
    }

    // Profile image
    try {
      const profileImg = await page.$('.pv-top-card-profile-picture__image, img.pv-top-card-profile-picture__image');
      if (profileImg) {
        data.profileImage = await profileImg.getAttribute('src') || undefined;
      }
    } catch (e) {
      // Continue if image not found
    }
  } catch (e) {
    console.error('Error extracting LinkedIn data:', e);
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
          if (jsonText) {
            const jsonData = JSON.parse(jsonText);
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
    // Extract name if not already scraped
    if (!continuation.scrapedSections.includes('name')) {
      try {
        const nameElement = await page.$('h1.text-heading-xlarge, h1.pv-text-details__left-panel h1');
        if (nameElement) {
          data.name = (await nameElement.textContent())?.trim() || '';
          continuation.scrapedSections.push('name');
        }
      } catch (e) {}
    }

    // Extract headline if not already scraped
    if (!continuation.scrapedSections.includes('headline')) {
      try {
        const headlineElement = await page.$('.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium');
        if (headlineElement) {
          data.headline = (await headlineElement.textContent())?.trim() || '';
          continuation.scrapedSections.push('headline');
        }
      } catch (e) {}
    }

    // Extract location if not already scraped
    if (!continuation.scrapedSections.includes('location')) {
      try {
        const locationElement = await page.$('.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small');
        if (locationElement) {
          data.location = (await locationElement.textContent())?.trim() || '';
          continuation.scrapedSections.push('location');
        }
      } catch (e) {}
    }

    // Extract about section if not already scraped
    if (!continuation.scrapedSections.includes('about')) {
      try {
        const aboutSection = await page.$('section#about, [data-section="summary"]');
        if (aboutSection) {
          const aboutText = await aboutSection.$('.inline-show-more-text, .pv-about-section .pv-about__summary-text');
          if (aboutText) {
            data.about = (await aboutText.textContent())?.trim() || '';
            continuation.scrapedSections.push('about');
          }
        }
      } catch (e) {}
    }

    // Extract experience (continue from last index)
    if (!continuation.scrapedSections.includes('experience-complete')) {
      try {
        const experienceSection = await page.$('section#experience, [data-section="experience"]');
        if (experienceSection) {
          const experienceItems = await experienceSection.$$('.pvs-list__paged-list-item, .pvs-list li');
          const startIndex = continuation.lastScrapedIndex;
          for (let i = startIndex; i < experienceItems.length; i++) {
            try {
              const item = experienceItems[i];
              const titleElement = await item.$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
              const companyElement = await item.$('.t-14.t-normal span[aria-hidden="true"], .t-14 span[aria-hidden="true"]');
              const dateElement = await item.$('.t-14.t-normal.t-black--light span[aria-hidden="true"], .t-14.t-black--light span[aria-hidden="true"]');
              const descElement = await item.$('.inline-show-more-text, .pvs-list__outer-container .t-14');

              const experience: ExperienceItem = {
                title: (await titleElement?.textContent())?.trim() || '',
                company: (await companyElement?.textContent())?.trim() || '',
                startDate: (await dateElement?.textContent())?.trim() || '',
                description: (await descElement?.textContent())?.trim() || '',
              };

              if (experience.title) {
                data.experience.push(experience);
                continuation.scrapedSections.push(`experience-${i}`);
                continuation.lastScrapedIndex = i + 1;
              }
            } catch (e) {}
          }
          if (startIndex >= experienceItems.length) {
            continuation.scrapedSections.push('experience-complete');
          }
        }
      } catch (e) {}
    }

    // Extract education if not already scraped
    if (!continuation.scrapedSections.includes('education')) {
      try {
        const educationSection = await page.$('section#education, [data-section="education"]');
        if (educationSection) {
          const educationItems = await educationSection.$$('.pvs-list__paged-list-item, .pvs-list li');
          for (const item of educationItems) {
            try {
              const schoolElement = await item.$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
              const degreeElement = await item.$('.t-14.t-normal span[aria-hidden="true"], .t-14 span[aria-hidden="true"]');
              const dateElement = await item.$('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

              const education: EducationItem = {
                school: (await schoolElement?.textContent())?.trim() || '',
                degree: (await degreeElement?.textContent())?.trim() || '',
                startDate: (await dateElement?.textContent())?.trim() || '',
              };

              if (education.school) {
                data.education.push(education);
              }
            } catch (e) {}
          }
          continuation.scrapedSections.push('education');
        }
      } catch (e) {}
    }

    // Extract skills if not already scraped
    if (!continuation.scrapedSections.includes('skills')) {
      try {
        const skillsSection = await page.$('section#skills, [data-section="skills"]');
        if (skillsSection) {
          const skillElements = await skillsSection.$$('.mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
          for (const element of skillElements) {
            const skill = (await element.textContent())?.trim();
            if (skill) {
              data.skills.push(skill);
            }
          }
          continuation.scrapedSections.push('skills');
        }
      } catch (e) {}
    }

    // Extract profile image if not already scraped
    if (!continuation.scrapedSections.includes('profileImage')) {
      try {
        const profileImg = await page.$('.pv-top-card-profile-picture__image, img.pv-top-card-profile-picture__image');
        if (profileImg) {
          data.profileImage = await profileImg.getAttribute('src') || undefined;
          continuation.scrapedSections.push('profileImage');
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('Error extracting LinkedIn data progressively:', e);
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
            if (jsonText) {
              const jsonData = JSON.parse(jsonText);
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
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

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
