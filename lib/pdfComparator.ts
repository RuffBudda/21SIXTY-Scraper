import { promises as fs } from 'fs';
import { join } from 'path';
import { LinkedInProfileData, ExperienceItem, EducationItem } from './types';

// pdf-parse uses CommonJS export
const pdfParse = require('pdf-parse');

const PROFILE_PDF_PATH = join(process.cwd(), 'Profile.pdf');

export interface ComparisonResult {
  matches: boolean;
  fields: {
    name: { matches: boolean; expected?: string; actual?: string };
    headline: { matches: boolean; expected?: string; actual?: string };
    location: { matches: boolean; expected?: string; actual?: string };
    about: { matches: boolean; similarity?: number; expected?: string; actual?: string };
    experience: { matches: boolean; expectedCount?: number; actualCount?: number; details?: string[] };
    education: { matches: boolean; expectedCount?: number; actualCount?: number; details?: string[] };
    skills: { matches: boolean; expectedCount?: number; actualCount?: number; missing?: string[]; extra?: string[] };
  };
  errors: string[];
}

/**
 * Extract text from Profile.pdf
 */
export async function extractPdfText(): Promise<string> {
  try {
    const dataBuffer = await fs.readFile(PROFILE_PDF_PATH);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract text from Profile.pdf: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse extracted PDF text into structured LinkedInProfileData
 * This function attempts to extract structured data from the PDF text
 */
export async function parsePdfToProfile(): Promise<Partial<LinkedInProfileData>> {
  const text = await extractPdfText();
  const profile: Partial<LinkedInProfileData> = {
    platform: 'linkedin',
    url: 'https://www.linkedin.com/in/abubakrsajith',
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

  // Split text into lines for easier processing
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Try to extract name (usually at the top)
  // Look for lines that look like names (2-4 words, capitalized)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    if (line.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/) && line.length < 50) {
      profile.name = line;
      break;
    }
  }

  // Extract headline (often after name, contains job title or description)
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];
    if (line.length > 10 && line.length < 200 && 
        (line.toLowerCase().includes('at') || line.includes('•') || 
         line.match(/[A-Z][a-z]+.*(?:Engineer|Manager|Developer|Executive|Director|Specialist|Analyst)/))) {
      profile.headline = line;
      break;
    }
  }

  // Extract location (often contains city and country)
  const locationPatterns = [
    /(?:Dubai|Abu Dhabi|Sharjah|Riyadh|London|New York|San Francisco).*(?:United Arab Emirates|UAE|Saudi Arabia|UK|USA|United States)/i,
    /(?:Dubai|Abu Dhabi|Sharjah|Riyadh|London|New York|San Francisco),?\s*(?:United Arab Emirates|UAE|Saudi Arabia|UK|USA|United States)?/i,
  ];
  
  for (const line of lines) {
    for (const pattern of locationPatterns) {
      if (pattern.test(line)) {
        profile.location = line.trim();
        break;
      }
    }
    if (profile.location) break;
  }

  // Extract about section (usually longer text block)
  const aboutStartIndicators = ['About', 'Summary', 'Profile Summary'];
  let aboutStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (aboutStartIndicators.some(indicator => lines[i].toLowerCase().includes(indicator.toLowerCase()))) {
      aboutStartIndex = i;
      break;
    }
  }

  if (aboutStartIndex >= 0) {
    const aboutLines: string[] = [];
    for (let i = aboutStartIndex + 1; i < Math.min(aboutStartIndex + 20, lines.length); i++) {
      if (lines[i].length > 20) {
        aboutLines.push(lines[i]);
      } else if (aboutLines.length > 0 && lines[i].length < 5) {
        break;
      }
    }
    profile.about = aboutLines.join(' ').trim();
  }

  // Extract experience items
  const experienceStartIndicators = ['Experience', 'Work Experience', 'Employment'];
  let expStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (experienceStartIndicators.some(indicator => lines[i].toLowerCase().includes(indicator.toLowerCase()))) {
      expStartIndex = i;
      break;
    }
  }

  if (expStartIndex >= 0) {
    const experience: ExperienceItem[] = [];
    let currentExp: Partial<ExperienceItem> = {};
    
    for (let i = expStartIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if we've reached another section
      if (line.match(/^(Education|Skills|Education|Languages|Recommendations)/i)) {
        if (currentExp.title) {
          experience.push(currentExp as ExperienceItem);
        }
        break;
      }

      // Look for job titles (often capitalized, shorter lines)
      if (line.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Executive|Manager|Engineer|Developer|Analyst|Specialist|Associate|Host|Intern))$/)) {
        if (currentExp.title) {
          experience.push(currentExp as ExperienceItem);
        }
        currentExp = { title: line };
      }
      // Look for company names (often after title, may contain special chars)
      else if (currentExp.title && !currentExp.company && line.length > 2 && line.length < 100) {
        currentExp.company = line.replace(/^at\s+/i, '').trim();
      }
      // Look for dates (contain month names or year patterns)
      else if (line.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|Present|–|-\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|^\d{4}\s*[-–]/i)) {
        currentExp.startDate = line;
      }
      // Longer lines might be descriptions
      else if (currentExp.title && line.length > 50) {
        if (currentExp.description) {
          currentExp.description += ' ' + line;
        } else {
          currentExp.description = line;
        }
      }
    }
    
    if (currentExp.title) {
      experience.push(currentExp as ExperienceItem);
    }
    
    profile.experience = experience;
  }

  // Extract education
  const educationStartIndicators = ['Education', 'Academic'];
  let eduStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (educationStartIndicators.some(indicator => lines[i].toLowerCase().includes(indicator.toLowerCase()))) {
      eduStartIndex = i;
      break;
    }
  }

  if (eduStartIndex >= 0) {
    const education: EducationItem[] = [];
    let currentEdu: Partial<EducationItem> = {};
    
    for (let i = eduStartIndex + 1; i < Math.min(eduStartIndex + 30, lines.length); i++) {
      const line = lines[i];
      
      // Check if we've reached another section
      if (line.match(/^(Skills|Languages|Recommendations|Experience)/i)) {
        if (currentEdu.school) {
          education.push(currentEdu as EducationItem);
        }
        break;
      }

      // Look for university names (often contain "University", "College", "Institute")
      if (line.match(/University|College|Institute|School/i)) {
        if (currentEdu.school) {
          education.push(currentEdu as EducationItem);
        }
        currentEdu = { school: line };
      }
      // Look for degrees
      else if (currentEdu.school && line.match(/Bachelor|Master|PhD|Doctorate|Diploma|Certificate/i)) {
        currentEdu.degree = line;
      }
      // Look for dates
      else if (line.match(/\d{4}\s*[-–]\s*\d{4}/)) {
        currentEdu.startDate = line;
      }
    }
    
    if (currentEdu.school) {
      education.push(currentEdu as EducationItem);
    }
    
    profile.education = education;
  }

  // Extract skills (often in a list or section)
  const skillsStartIndicators = ['Skills', 'Technical Skills', 'Core Skills'];
  let skillsStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (skillsStartIndicators.some(indicator => lines[i].toLowerCase().includes(indicator.toLowerCase()))) {
      skillsStartIndex = i;
      break;
    }
  }

  if (skillsStartIndex >= 0) {
    const skills: string[] = [];
    for (let i = skillsStartIndex + 1; i < Math.min(skillsStartIndex + 50, lines.length); i++) {
      const line = lines[i].trim();
      
      // Check if we've reached another section
      if (line.match(/^(Languages|Recommendations|Experience|Education)/i)) {
        break;
      }

      // Skills are often short phrases or words
      if (line.length > 1 && line.length < 50 && !line.match(/^[a-z]+\s+\d+$/)) {
        // Split by common delimiters
        const items = line.split(/[,•·\-\|]/).map(s => s.trim()).filter(s => s.length > 0);
        skills.push(...items);
      }
    }
    profile.skills = skills.filter(skill => skill.length > 0);
  }

  return profile;
}

/**
 * Calculate text similarity between two strings (simple Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  // Simple similarity based on common words
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  
  return commonWords.length / Math.max(words1.length, words2.length);
}

/**
 * Compare scraped profile data with PDF reference data
 */
export async function compareWithPdf(scrapedData: LinkedInProfileData): Promise<ComparisonResult> {
  const pdfProfile = await parsePdfToProfile();
  const errors: string[] = [];
  const fields: ComparisonResult['fields'] = {
    name: { matches: false },
    headline: { matches: false },
    location: { matches: false },
    about: { matches: false },
    experience: { matches: false },
    education: { matches: false },
    skills: { matches: false },
  };

  // Compare name
  if (pdfProfile.name && scrapedData.name) {
    fields.name.expected = pdfProfile.name;
    fields.name.actual = scrapedData.name;
    fields.name.matches = scrapedData.name.trim().toLowerCase() === pdfProfile.name.trim().toLowerCase();
  } else if (!pdfProfile.name) {
    errors.push('PDF name not found');
  } else if (!scrapedData.name) {
    errors.push('Scraped name not found');
  }

  // Compare headline
  if (pdfProfile.headline && scrapedData.headline) {
    fields.headline.expected = pdfProfile.headline;
    fields.headline.actual = scrapedData.headline;
    const similarity = calculateSimilarity(pdfProfile.headline, scrapedData.headline);
    fields.headline.matches = similarity > 0.7;
  }

  // Compare location
  if (pdfProfile.location && scrapedData.location) {
    fields.location.expected = pdfProfile.location;
    fields.location.actual = scrapedData.location;
    const similarity = calculateSimilarity(pdfProfile.location, scrapedData.location);
    fields.location.matches = similarity > 0.7;
  }

  // Compare about
  if (pdfProfile.about && scrapedData.about) {
    fields.about.expected = pdfProfile.about;
    fields.about.actual = scrapedData.about;
    fields.about.similarity = calculateSimilarity(pdfProfile.about, scrapedData.about);
    fields.about.matches = fields.about.similarity > 0.6;
  }

  // Compare experience
  if (pdfProfile.experience && scrapedData.experience) {
    fields.experience.expectedCount = pdfProfile.experience.length;
    fields.experience.actualCount = scrapedData.experience.length;
    
    const details: string[] = [];
    if (pdfProfile.experience.length !== scrapedData.experience.length) {
      details.push(`Count mismatch: expected ${pdfProfile.experience.length}, got ${scrapedData.experience.length}`);
    }
    
    // Compare each experience item
    const minLength = Math.min(pdfProfile.experience.length, scrapedData.experience.length);
    for (let i = 0; i < minLength; i++) {
      const pdfExp = pdfProfile.experience[i];
      const scrapedExp = scrapedData.experience[i];
      
      if (pdfExp.title && scrapedExp.title && 
          pdfExp.title.toLowerCase() !== scrapedExp.title.toLowerCase()) {
        details.push(`Exp ${i + 1} title mismatch: "${pdfExp.title}" vs "${scrapedExp.title}"`);
      }
      if (pdfExp.company && scrapedExp.company && 
          pdfExp.company.toLowerCase() !== scrapedExp.company.toLowerCase()) {
        details.push(`Exp ${i + 1} company mismatch: "${pdfExp.company}" vs "${scrapedExp.company}"`);
      }
    }
    
    fields.experience.details = details;
    fields.experience.matches = details.length === 0 && 
                                 pdfProfile.experience.length === scrapedData.experience.length;
  }

  // Compare education
  if (pdfProfile.education && scrapedData.education) {
    fields.education.expectedCount = pdfProfile.education.length;
    fields.education.actualCount = scrapedData.education.length;
    
    const details: string[] = [];
    if (pdfProfile.education.length !== scrapedData.education.length) {
      details.push(`Count mismatch: expected ${pdfProfile.education.length}, got ${scrapedData.education.length}`);
    }
    
    // Compare each education item
    const minLength = Math.min(pdfProfile.education.length, scrapedData.education.length);
    for (let i = 0; i < minLength; i++) {
      const pdfEdu = pdfProfile.education[i];
      const scrapedEdu = scrapedData.education[i];
      
      if (pdfEdu.school && scrapedEdu.school && 
          pdfEdu.school.toLowerCase() !== scrapedEdu.school.toLowerCase()) {
        details.push(`Edu ${i + 1} school mismatch: "${pdfEdu.school}" vs "${scrapedEdu.school}"`);
      }
    }
    
    fields.education.details = details;
    fields.education.matches = details.length === 0 && 
                                pdfProfile.education.length === scrapedData.education.length;
  }

  // Compare skills
  if (pdfProfile.skills && scrapedData.skills) {
    fields.skills.expectedCount = pdfProfile.skills.length;
    fields.skills.actualCount = scrapedData.skills.length;
    
    const pdfSkillsLower = pdfProfile.skills.map(s => s.toLowerCase().trim());
    const scrapedSkillsLower = scrapedData.skills.map(s => s.toLowerCase().trim());
    
    const missing = pdfSkillsLower.filter(s => !scrapedSkillsLower.some(ss => ss.includes(s) || s.includes(ss)));
    const extra = scrapedSkillsLower.filter(s => !pdfSkillsLower.some(ps => ps.includes(s) || s.includes(ps)));
    
    fields.skills.missing = missing.length > 0 ? missing : undefined;
    fields.skills.extra = extra.length > 0 ? extra : undefined;
    fields.skills.matches = missing.length === 0;
  }

  const matches = Object.values(fields).every(field => field.matches);

  return {
    matches,
    fields,
    errors,
  };
}

