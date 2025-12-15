/**
 * Fast HTTP-based LinkedIn scraper using fetch + cheerio
 * Works on Vercel free plan without browser overhead
 */
import * as cheerio from 'cheerio';
import { LinkedInProfileData, InstagramProfileData, WebsitePersonData, ProfileData } from './types';

/**
 * Scrapes LinkedIn profile using HTTP + Cheerio (no browser)
 */
export async function scrapeLinkedInProfileHTTP(url: string): Promise<LinkedInProfileData> {
  // 1. Fetch HTML with proper headers
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(5000) // 5 second timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();

  // 2. Load HTML into Cheerio
  const $ = cheerio.load(html);

  // 3. Check for login walls
  const isLoginWall = $('form[action*="login"]').length > 0 ||
                      $('input[type="password"]').length > 0 ||
                      url.includes('linkedin.com/login') ||
                      url.includes('authwall') ||
                      $('body').text().toLowerCase().includes('sign in');

  if (isLoginWall) {
    throw new Error('LinkedIn login wall detected - profile requires authentication');
  }

  // 4. Extract data using multiple strategies

  // Strategy 1: Direct HTML selectors (LinkedIn's structure)
  // Try multiple selectors with validation
  let name = '';
  const nameSelectors = [
    'main h1.text-heading-xlarge',
    'main h1',
    'h1.text-heading-xlarge',
    'h1[data-generated-suggestion-target]',
    'h1.top-card-layout__title',
    'h1.break-words',
    'h1'
  ];
  
  for (const selector of nameSelectors) {
    const text = $(selector).first().text().trim();
    // Validate it looks like a name (2-5 words, reasonable length, starts with letter)
    if (text && 
        text.length > 2 && 
        text.length < 100 && 
        /^[A-Za-z]/.test(text) && 
        text.split(/\s+/).length <= 5 &&
        !text.toLowerCase().includes('sign in') &&
        !text.toLowerCase().includes('join now')) {
      name = text;
      break;
    }
  }

  const headline = $('main h1 + .text-body-medium.break-words').text().trim() ||
                   $('main .top-card-layout__headline').text().trim() ||
                   $('.text-body-medium.break-words').first().text().trim() ||
                   $('main h1 ~ .text-body-medium').text().trim();

  // Strategy 2: Meta tags (Open Graph, Twitter Card)
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const pageTitle = $('title').text() || '';

  // Strategy 3: JSON-LD structured data
  let structuredData = null;
  const jsonLdScript = $('script[type="application/ld+json"]').html();
  if (jsonLdScript) {
    try {
      structuredData = JSON.parse(jsonLdScript);
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  // Strategy 4: Extract experience items
  const experience = $('section#experience .pvs-list__paged-list-item, section#experience .pvs-list li')
    .map((i, el) => {
      const $el = $(el);
      const title = $el.find('.mr1.t-bold span[aria-hidden="true"]').text().trim() ||
                    $el.find('h3 span[aria-hidden="true"]').text().trim() ||
                    $el.find('h3').text().trim() ||
                    $el.find('.t-bold span').text().trim();
      
      if (!title) return null;

      return {
        title,
        company: $el.find('.t-14.t-normal span[aria-hidden="true"]').text().trim() ||
                 $el.find('.text-body-small').text().trim() ||
                 '',
        startDate: $el.find('.t-14.t-normal.t-black--light span[aria-hidden="true"]').text().trim() ||
                  $el.find('.t-black--light').text().trim() ||
                  '',
        description: $el.find('.inline-show-more-text').text().trim() ||
                     $el.find('.pvs-list__outer-container span[aria-hidden="true"]').text().trim() ||
                     ''
      };
    })
    .get()
    .filter((exp): exp is NonNullable<typeof exp> => exp !== null);

  // Strategy 5: Extract education
  const education = $('section#education .pvs-list__paged-list-item, section#education .pvs-list li')
    .map((i, el) => {
      const $el = $(el);
      const school = $el.find('.mr1.t-bold span[aria-hidden="true"]').text().trim() ||
                     $el.find('h3 span[aria-hidden="true"]').text().trim() ||
                     $el.find('h3').text().trim();
      
      if (!school) return null;

      return {
        school,
        degree: $el.find('.t-14.t-normal span[aria-hidden="true"]').text().trim() ||
                $el.find('.text-body-small').text().trim() ||
                '',
        startDate: $el.find('.t-14.t-normal.t-black--light span[aria-hidden="true"]').text().trim() ||
                   $el.find('.t-black--light').text().trim() ||
                   ''
      };
    })
    .get()
    .filter((edu): edu is NonNullable<typeof edu> => edu !== null);

  // Strategy 6: Extract skills
  const skills = $('section#skills .pvs-list__paged-list-item, section#skills .pvs-list li')
    .map((i, el) => {
      const skill = $(el).find('.mr1.t-bold span[aria-hidden="true"]').text().trim() ||
                    $(el).find('h3 span[aria-hidden="true"]').text().trim() ||
                    $(el).find('span[aria-hidden="true"]').text().trim() ||
                    $(el).find('li span').text().trim();
      return skill;
    })
    .get()
    .filter(skill => skill.length > 0);

  // Strategy 7: Extract about section
  let about = $('section#about .inline-show-more-text').text().trim() ||
              $('section#about .break-words').text().trim() ||
              $('[data-section="summary"] .inline-show-more-text').text().trim() ||
              $('[data-section="summary"]').text().trim() ||
              '';
  
  // Clean about text - remove login prompts and UI elements
  if (about) {
    const loginPhrases = ['sign in', 'join now', 'welcome back', 'email or phone', 'password'];
    const lowerAbout = about.toLowerCase();
    const loginKeywordCount = loginPhrases.filter(phrase => lowerAbout.includes(phrase)).length;
    
    // If too many login keywords, likely a login wall
    if (loginKeywordCount > 2 && about.length > 50) {
      about = '';
    } else {
      // Remove common UI phrases
      about = about
        .replace(/see more/gi, '')
        .replace(/show more/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Strategy 8: Extract location
  let location = $('main .text-body-small.inline.t-black--light.break-words')
    .first()
    .text()
    .trim()
    .replace(/Contact Info.*$/i, '') // Remove "Contact Info" suffix
    .trim();

  // Try alternative location selectors
  if (!location) {
    location = $('main .top-card-layout__first-subline').text().trim() ||
               $('.text-body-small.t-black--light').first().text().trim() ||
               '';
  }

  // Strategy 9: Extract profile image
  const profileImage = $('main img[alt*="profile"]').attr('src') ||
                       $('.pv-top-card-profile-picture img').attr('src') ||
                       $('img.profile-photo-edit__preview').attr('src') ||
                       '';

  // Use page title as fallback for name (with validation)
  let finalName = name;
  if (!finalName && ogTitle) {
    const titleName = ogTitle.split('|')[0].trim();
    // Validate title looks like a name
    if (titleName && titleName.length > 2 && titleName.length < 100 && /^[A-Za-z]/.test(titleName)) {
      finalName = titleName;
    }
  }
  if (!finalName && pageTitle) {
    const titleName = pageTitle.split('|')[0].trim();
    // Validate title looks like a name
    if (titleName && titleName.length > 2 && titleName.length < 100 && /^[A-Za-z]/.test(titleName)) {
      finalName = titleName;
    }
  }

  // Use meta description as fallback for headline
  const finalHeadline = headline || ogDescription || '';

  // 5. Return ProfileData structure
  return {
    platform: 'linkedin',
    url,
    name: finalName || '',
    headline: finalHeadline,
    location: location || '',
    about: about || '',
    experience: experience,
    education: education,
    skills: skills,
    languages: [],
    recommendations: [],
    profileImage: profileImage || undefined
  };
}

/**
 * Scrapes Instagram profile using HTTP + Cheerio
 */
export async function scrapeInstagramProfileHTTP(url: string): Promise<InstagramProfileData> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract username from URL
  const urlMatch = url.match(/instagram\.com\/([^/?]+)/);
  const username = urlMatch ? urlMatch[1] : '';

  const data: InstagramProfileData = {
    platform: 'instagram',
    url,
    username,
  };

  // Full name
  const fullName = $('h2, h1[dir="auto"]').text().trim();
  if (fullName && fullName !== username) {
    data.fullName = fullName;
  }

  // Biography
  const biography = $('div.-vDIg span, header section span').text().trim();
  if (biography) {
    data.biography = biography;
  }

  // Profile stats
  const stats = $('header section ul li');
  stats.each((i, el) => {
    if (i >= 3) return false; // Only first 3
    const statText = $(el).text().trim();
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
  });

  // Verified badge
  const verifiedBadge = $('svg[aria-label*="Verified"]');
  if (verifiedBadge.length > 0) {
    data.isVerified = true;
  }

  // Private account
  const privateIndicator = $(':contains("This account is private")');
  if (privateIndicator.length > 0) {
    data.isPrivate = true;
  }

  // Profile image
  const profileImg = $('header img[alt*="profile picture"], header img').attr('src');
  if (profileImg) {
    data.profileImage = profileImg;
  }

  // Website link
  const websiteLink = $('header a[href^="http"]').attr('href');
  if (websiteLink) {
    data.website = websiteLink;
  }

  return data;
}

/**
 * Scrapes general website person data using HTTP + Cheerio
 */
export async function scrapeWebsitePersonHTTP(url: string): Promise<WebsitePersonData> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const data: WebsitePersonData = {
    platform: 'website',
    url,
  };

  // Page title
  data.title = $('title').text() || '';

  // Extract structured data (JSON-LD)
  const jsonLdElements = $('script[type="application/ld+json"]');
  jsonLdElements.each((i, el) => {
    try {
      const jsonText = $(el).html();
      if (jsonText && jsonText.trim()) {
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
            // Skip invalid JSON
          }
        }
      }
    } catch (e) {
      // Skip invalid elements
    }
  });

  // Extract from meta tags
  const metaTags = $('meta[property], meta[name]');
  const metadata: { [key: string]: string } = {};

  metaTags.each((i, el) => {
    const property = $(el).attr('property') || $(el).attr('name') || '';
    const content = $(el).attr('content') || '';
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
  });

  if (Object.keys(metadata).length > 0) {
    data.metadata = metadata;
  }

  // Extract text content
  const bodyText = $('body').text();
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

  // Extract images
  const images: string[] = [];
  $('img[src]').each((i, el) => {
    if (i >= 10) return false; // Limit to 10 images
    const src = $(el).attr('src');
    if (src && !src.startsWith('data:')) {
      try {
        const fullUrl = new URL(src, url).href;
        images.push(fullUrl);
      } catch {
        images.push(src);
      }
    }
  });
  if (images.length > 0) {
    data.images = images;
  }

  // Extract social links
  const socialLinks: Array<{ platform: string; url: string }> = [];
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
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
      } catch {
        // Skip invalid URLs
      }
    }
  });
  if (socialLinks.length > 0) {
    data.socialLinks = socialLinks;
  }

  return data;
}

