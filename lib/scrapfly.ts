/**
 * Scrapfly API integration for web scraping
 * Uses Scrapfly's Web Scraping API to bypass anti-bot systems
 */
import { LinkedInProfileData } from './types';
import * as cheerio from 'cheerio';

const SCRAPFLY_API_KEY = 'scp-live-9b6441cf33634b60a943ca8479cfb10e';
const SCRAPFLY_API_URL = 'https://api.scrapfly.io/scrape';

/**
 * Scrapes LinkedIn profile using Scrapfly API
 */
export async function scrapeLinkedInProfileWithScrapfly(url: string): Promise<LinkedInProfileData> {
  const params = new URLSearchParams({
    key: SCRAPFLY_API_KEY,
    url: url,
    asp: 'true', // Enable anti-scraping protection bypass
    render_js: 'true', // Enable JavaScript rendering
    format: 'clean_html', // Get clean HTML format
  });

  const apiUrl = `${SCRAPFLY_API_URL}?${params.toString()}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Scrapfly API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  // Scrapfly returns the HTML in result.result.content or result.content
  const html = result.result?.content || result.content || result.result || '';
  
  if (!html || typeof html !== 'string') {
    throw new Error('No HTML content returned from Scrapfly API. Response: ' + JSON.stringify(result).substring(0, 200));
  }

  // Parse HTML with Cheerio
  const $ = cheerio.load(html);

  // Extract LinkedIn profile data using the same selectors as before
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

  // Extract experience
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

  // Extract education
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

  // Extract skills
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

  // Extract about section
  let about = $('section#about .inline-show-more-text').text().trim() ||
              $('section#about .break-words').text().trim() ||
              $('[data-section="summary"] .inline-show-more-text').text().trim() ||
              $('[data-section="summary"]').text().trim() ||
              '';
  
  // Clean about text
  if (about) {
    const loginPhrases = ['sign in', 'join now', 'welcome back', 'email or phone', 'password'];
    const lowerAbout = about.toLowerCase();
    const loginKeywordCount = loginPhrases.filter(phrase => lowerAbout.includes(phrase)).length;
    
    if (loginKeywordCount > 2 && about.length > 50) {
      about = '';
    } else {
      about = about
        .replace(/see more/gi, '')
        .replace(/show more/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Extract location
  let location = $('main .text-body-small.inline.t-black--light.break-words')
    .first()
    .text()
    .trim()
    .replace(/Contact Info.*$/i, '')
    .trim();

  if (!location) {
    location = $('main .top-card-layout__first-subline').text().trim() ||
               $('.text-body-small.t-black--light').first().text().trim() ||
               '';
  }

  // Extract profile image
  const profileImage = $('main img[alt*="profile"]').attr('src') ||
                       $('.pv-top-card-profile-picture img').attr('src') ||
                       $('img.profile-photo-edit__preview').attr('src') ||
                       '';

  // Use meta tags as fallback for name
  if (!name) {
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const pageTitle = $('title').text() || '';
    
    if (ogTitle) {
      const titleName = ogTitle.split('|')[0].trim();
      if (titleName && titleName.length > 2 && titleName.length < 100 && /^[A-Za-z]/.test(titleName)) {
        name = titleName;
      }
    }
    if (!name && pageTitle) {
      const titleName = pageTitle.split('|')[0].trim();
      if (titleName && titleName.length > 2 && titleName.length < 100 && /^[A-Za-z]/.test(titleName)) {
        name = titleName;
      }
    }
  }

  // Use meta description as fallback for headline
  const finalHeadline = headline || $('meta[property="og:description"]').attr('content') || '';

  return {
    platform: 'linkedin',
    url,
    name: name || '',
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

