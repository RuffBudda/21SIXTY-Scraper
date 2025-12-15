import { LinkedInProfileData } from './types';

function normalizeLinkedInUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Normalize pathname: remove trailing slash and ensure it starts with /
    let pathname = parsed.pathname.trim();
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    // Always use www.linkedin.com (standardize)
    return `https://www.linkedin.com${pathname}`;
  } catch {
    // If URL parsing fails, try to extract path manually
    const match = url.match(/linkedin\.com(\/in\/[^/?]+)/i);
    if (match) {
      return `https://www.linkedin.com${match[1]}`;
    }
    return url;
  }
}

const abubakrBase: LinkedInProfileData = {
  platform: 'linkedin',
  url: 'https://www.linkedin.com/in/abubakrsajith',
  name: 'Abubakr Sajith',
  headline: 'I do various things.',
  location: 'Dubai, United Arab Emirates',
  about:
    'Nobody reads this. Not going to fill it with a bunch of bluffs. Will update this if I doubt my job security.',
  skills: ['Media Producer', 'Broadcasting', 'Video Podcasts'],
  languages: ['English (Native or Bilingual)'],
  recommendations: [],
  experience: [
    {
      title: 'Operations Executive',
      company: 'Contractors.Direct',
      startDate: 'October 2024 – Present (1 year 3 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Built and manage HubSpot CRM infrastructure including workflows, custom properties, and integrations with Zoho CRM and Salesforce; automated lead qualification and deal creation reducing sales admin time by 60%; developed email campaign automation with enrichment and analytics; created LinkedIn content automation across multiple company accounts; built HubSpot dashboards with Google Analytics; designed digital asset management; established CRM data quality SOPs; partnered on financial modeling and operational analytics; co-producer of Turnkey & Trimmings podcast; strategized and produced the company’s first awareness campaign.',
    },
    {
      title: 'Podcast Host',
      company: 'The Dollar Diaries',
      startDate: 'August 2023 – Present (2 years 5 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Host of The Dollar Diaries – the #1 podcast for young adults in the UAE, covering personal life, entrepreneurship, career, jobs, and lifestyle with a focus on money.',
    },
    {
      title: 'Operations',
      company: 'neuliv',
      startDate: 'June 2023 – October 2023 (5 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Drove end-to-end product development for an interior design & fit-out platform; led a team of developers and designers; created company-wide policies for the design and fit-out lifecycle.',
    },
    {
      title: 'Management Associate',
      company: 'Vianet Capital',
      startDate: 'March 2022 – October 2023 (1 year 8 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Evaluated 30+ pre-revenue and early-stage SaaS/technology startups; performed technical and financial due diligence on qualified startups; developed corporate identity and investment materials for a green-tech portfolio company raising a $1.8M seed round; managed business operations for multiple portfolio startups including registration, accounting, and marketing.',
    },
    {
      title: 'Product Manager',
      company: 'E Concept Systems',
      startDate: 'December 2021 – March 2022 (4 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Managed five software offerings from inception to expand SaaS solutions; streamlined internal operations with digital tools improving deliverable completion by 87%.',
    },
    {
      title: 'Marketing Intern',
      company: 'Navitas',
      startDate: 'April 2021 – August 2021 (5 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Influenced prospects to attend information sessions with ~79% conversion; supported over 127 recruits to adapt to the learning environment through in-person consultation.',
    },
    {
      title: 'Finance and Accounting Specialist',
      company: 'eWhale.co',
      startDate: 'June 2020 – September 2020 (4 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Enabled a team of junior accountants to record receipts and perform monthly internal auditing exercises.',
    },
    {
      title: 'Business Analyst Intern',
      company: 'Meta Byte Technologies FZ-LLC',
      startDate: 'May 2018 – July 2018 (3 months)',
      location: 'Dubai, United Arab Emirates',
      description:
        'Collaborated with business partners to raise project status to BIS/ISO standards; initiated reverse-engineering efforts on proprietary SaaS solutions to improve offerings.',
    },
  ],
  education: [
    {
      school: 'Murdoch University',
      degree:
        'Bachelor of Commerce - BCom, Finance and Business Information System',
      startDate: 'September 2018 – August 2021',
    },
  ],
};

const staticLinkedInProfiles: Record<string, LinkedInProfileData> = {
  [abubakrBase.url]: abubakrBase,
  [`${abubakrBase.url}/`]: { ...abubakrBase, url: `${abubakrBase.url}/` },
};

export function getStaticLinkedInProfile(url: string): LinkedInProfileData | null {
  const normalized = normalizeLinkedInUrl(url);
  if (staticLinkedInProfiles[normalized]) {
    return staticLinkedInProfiles[normalized];
  }
  return null;
}

