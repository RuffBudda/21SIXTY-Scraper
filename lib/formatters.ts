import { ProfileData, LinkedInProfileData, InstagramProfileData, WebsitePersonData } from './types';

/**
 * Formats data to pretty-printed JSON
 */
export function formatToJSON(data: ProfileData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats data to CSV format based on platform type
 */
export function formatToCSV(data: ProfileData): string {
  const rows: string[] = [];
  
  rows.push('Field,Value');
  rows.push(`Platform,"${data.platform}"`);
  rows.push(`URL,"${escapeCSV(data.url)}"`);
  
  if (data.platform === 'linkedin') {
    const linkedinData = data as LinkedInProfileData;
    rows.push(`Name,"${escapeCSV(linkedinData.name)}"`);
    rows.push(`Headline,"${escapeCSV(linkedinData.headline)}"`);
    rows.push(`Location,"${escapeCSV(linkedinData.location)}"`);
    rows.push(`About,"${escapeCSV(linkedinData.about)}"`);
    
    if (linkedinData.experience.length > 0) {
      rows.push('');
      rows.push('Experience');
      rows.push('Title,Company,Start Date,End Date,Description');
      linkedinData.experience.forEach(exp => {
        rows.push(
          `"${escapeCSV(exp.title)}","${escapeCSV(exp.company)}","${escapeCSV(exp.startDate || '')}","${escapeCSV(exp.endDate || '')}","${escapeCSV(exp.description || '')}"`
        );
      });
    }
    
    if (linkedinData.education.length > 0) {
      rows.push('');
      rows.push('Education');
      rows.push('School,Degree,Field of Study,Start Date,End Date');
      linkedinData.education.forEach(edu => {
        rows.push(
          `"${escapeCSV(edu.school)}","${escapeCSV(edu.degree || '')}","${escapeCSV(edu.fieldOfStudy || '')}","${escapeCSV(edu.startDate || '')}","${escapeCSV(edu.endDate || '')}"`
        );
      });
    }
    
    if (linkedinData.skills.length > 0) {
      rows.push('');
      rows.push('Skills');
      rows.push('Skill');
      linkedinData.skills.forEach(skill => {
        rows.push(`"${escapeCSV(skill)}"`);
      });
    }
  } else if (data.platform === 'instagram') {
    const instagramData = data as InstagramProfileData;
    rows.push(`Username,"${escapeCSV(instagramData.username)}"`);
    if (instagramData.fullName) rows.push(`Full Name,"${escapeCSV(instagramData.fullName)}"`);
    if (instagramData.biography) rows.push(`Biography,"${escapeCSV(instagramData.biography)}"`);
    if (instagramData.followers) rows.push(`Followers,"${escapeCSV(instagramData.followers)}"`);
    if (instagramData.following) rows.push(`Following,"${escapeCSV(instagramData.following)}"`);
    if (instagramData.posts) rows.push(`Posts,"${escapeCSV(instagramData.posts)}"`);
    if (instagramData.isVerified) rows.push(`Verified,Yes`);
    if (instagramData.isPrivate) rows.push(`Private Account,Yes`);
    if (instagramData.isBusinessAccount) rows.push(`Business Account,Yes`);
    if (instagramData.category) rows.push(`Category,"${escapeCSV(instagramData.category)}"`);
    if (instagramData.website) rows.push(`Website,"${escapeCSV(instagramData.website)}"`);
  } else if (data.platform === 'website') {
    const websiteData = data as WebsitePersonData;
    if (websiteData.title) rows.push(`Title,"${escapeCSV(websiteData.title)}"`);
    if (websiteData.name) rows.push(`Name,"${escapeCSV(websiteData.name)}"`);
    if (websiteData.description) rows.push(`Description,"${escapeCSV(websiteData.description)}"`);
    if (websiteData.email) rows.push(`Email,"${escapeCSV(websiteData.email)}"`);
    if (websiteData.phone) rows.push(`Phone,"${escapeCSV(websiteData.phone)}"`);
    if (websiteData.location) rows.push(`Location,"${escapeCSV(websiteData.location)}"`);
    if (websiteData.jobTitle) rows.push(`Job Title,"${escapeCSV(websiteData.jobTitle)}"`);
    if (websiteData.company) rows.push(`Company,"${escapeCSV(websiteData.company)}"`);
    
    if (websiteData.socialLinks && websiteData.socialLinks.length > 0) {
      rows.push('');
      rows.push('Social Links');
      rows.push('Platform,URL');
      websiteData.socialLinks.forEach(link => {
        rows.push(`"${escapeCSV(link.platform)}","${escapeCSV(link.url)}"`);
      });
    }
  }
  
  return rows.join('\n');
}

/**
 * Formats data to human-readable text format
 */
export function formatToTXT(data: ProfileData): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(60));
  lines.push('PROFILE DATA');
  lines.push('='.repeat(60));
  lines.push('');
  
  lines.push(`Platform: ${data.platform.toUpperCase()}`);
  lines.push(`URL: ${data.url}`);
  lines.push('');
  
  if (data.platform === 'linkedin') {
    const linkedinData = data as LinkedInProfileData;
    lines.push(`Name: ${linkedinData.name}`);
    lines.push(`Headline: ${linkedinData.headline}`);
    lines.push(`Location: ${linkedinData.location}`);
    lines.push('');
    
    if (linkedinData.about) {
      lines.push('About:');
      lines.push('-'.repeat(60));
      lines.push(linkedinData.about);
      lines.push('');
    }
    
    if (linkedinData.experience.length > 0) {
      lines.push('Experience:');
      lines.push('-'.repeat(60));
      linkedinData.experience.forEach((exp, idx) => {
        lines.push(`\n${idx + 1}. ${exp.title}`);
        lines.push(`   Company: ${exp.company}`);
        if (exp.startDate) lines.push(`   Period: ${exp.startDate}${exp.endDate ? ` - ${exp.endDate}` : ' - Present'}`);
        if (exp.location) lines.push(`   Location: ${exp.location}`);
        if (exp.description) {
          lines.push(`   Description: ${exp.description}`);
        }
      });
      lines.push('');
    }
    
    if (linkedinData.education.length > 0) {
      lines.push('Education:');
      lines.push('-'.repeat(60));
      linkedinData.education.forEach((edu, idx) => {
        lines.push(`\n${idx + 1}. ${edu.school}`);
        if (edu.degree) lines.push(`   Degree: ${edu.degree}`);
        if (edu.fieldOfStudy) lines.push(`   Field: ${edu.fieldOfStudy}`);
        if (edu.startDate) lines.push(`   Period: ${edu.startDate}${edu.endDate ? ` - ${edu.endDate}` : ''}`);
        if (edu.description) lines.push(`   ${edu.description}`);
      });
      lines.push('');
    }
    
    if (linkedinData.skills.length > 0) {
      lines.push('Skills:');
      lines.push('-'.repeat(60));
      lines.push(linkedinData.skills.join(', '));
      lines.push('');
    }
  } else if (data.platform === 'instagram') {
    const instagramData = data as InstagramProfileData;
    lines.push(`Username: ${instagramData.username}`);
    if (instagramData.fullName) lines.push(`Full Name: ${instagramData.fullName}`);
    if (instagramData.biography) {
      lines.push('\nBiography:');
      lines.push('-'.repeat(60));
      lines.push(instagramData.biography);
      lines.push('');
    }
    if (instagramData.followers) lines.push(`Followers: ${instagramData.followers}`);
    if (instagramData.following) lines.push(`Following: ${instagramData.following}`);
    if (instagramData.posts) lines.push(`Posts: ${instagramData.posts}`);
    if (instagramData.isVerified) lines.push('Verified: Yes');
    if (instagramData.isPrivate) lines.push('Private Account: Yes');
    if (instagramData.isBusinessAccount) lines.push('Business Account: Yes');
    if (instagramData.category) lines.push(`Category: ${instagramData.category}`);
    if (instagramData.website) lines.push(`Website: ${instagramData.website}`);
    lines.push('');
  } else if (data.platform === 'website') {
    const websiteData = data as WebsitePersonData;
    if (websiteData.title) lines.push(`Title: ${websiteData.title}`);
    if (websiteData.name) lines.push(`Name: ${websiteData.name}`);
    if (websiteData.description) {
      lines.push('\nDescription:');
      lines.push('-'.repeat(60));
      lines.push(websiteData.description);
      lines.push('');
    }
    if (websiteData.email) lines.push(`Email: ${websiteData.email}`);
    if (websiteData.phone) lines.push(`Phone: ${websiteData.phone}`);
    if (websiteData.location) lines.push(`Location: ${websiteData.location}`);
    if (websiteData.jobTitle) lines.push(`Job Title: ${websiteData.jobTitle}`);
    if (websiteData.company) lines.push(`Company: ${websiteData.company}`);
    
    if (websiteData.socialLinks && websiteData.socialLinks.length > 0) {
      lines.push('\nSocial Links:');
      lines.push('-'.repeat(60));
      websiteData.socialLinks.forEach(link => {
        lines.push(`${link.platform}: ${link.url}`);
      });
      lines.push('');
    }
  }
  
  lines.push('='.repeat(60));
  lines.push(`Generated: ${new Date().toISOString()}`);
  
  return lines.join('\n');
}

/**
 * Escapes CSV special characters
 */
function escapeCSV(text: string): string {
  if (!text) return '';
  return text.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
}
