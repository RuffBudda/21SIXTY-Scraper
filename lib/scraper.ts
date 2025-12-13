import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
import { 
  ProfileData, 
  LinkedInProfileData, 
  InstagramProfileData, 
  WebsitePersonData,
  PlatformType,
  ExperienceItem, 
  EducationItem 
} from './types';

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
      urlObj.pathname.match(/^\/[a-zA-Z0-9._]+$/)
    );
  } catch {
    return false;
  }
}

/**
 * Expands all collapsed content on the page
 */
async function expandCollapsedContent(page: any) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });

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
            await button.click({ timeout: 2000 });
            await page.waitForTimeout(500);
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
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
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
    await page.waitForLoadState('networkidle', { timeout: 15000 });

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
    await page.waitForLoadState('networkidle', { timeout: 10000 });

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
 * Main scraping function that detects platform and routes to appropriate scraper
 */
export async function scrapeProfile(url: string): Promise<ProfileData> {
  if (!validateUrl(url)) {
    throw new Error('Invalid URL format');
  }

  const platform = detectPlatform(url);
  let browser: any = null;

  try {
    chromium.setGraphicsMode(false);

    browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    let profileData: ProfileData;

    switch (platform) {
      case 'linkedin':
        if (!validateLinkedInUrl(url)) {
          throw new Error('Invalid LinkedIn profile URL');
        }
        await expandCollapsedContent(page);
        profileData = await extractLinkedInProfile(page, url);
        break;

      case 'instagram':
        if (!validateInstagramUrl(url)) {
          throw new Error('Invalid Instagram profile URL');
        }
        await expandCollapsedContent(page);
        profileData = await extractInstagramProfile(page, url);
        break;

      case 'website':
        await expandCollapsedContent(page);
        profileData = await extractWebsitePersonData(page, url);
        break;

      default:
        throw new Error('Unsupported platform');
    }

    await browser.close();
    return profileData;
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw new Error(`Failed to scrape profile: ${error.message}`);
  }
}
