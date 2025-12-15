import { LinkedInProfileData } from './types';
import { promises as fs } from 'fs';
import { join } from 'path';

const STATIC_PROFILES_PATH = join(process.cwd(), 'lib', 'staticProfiles.ts');

/**
 * Generate TypeScript code for a single profile that can be added to staticProfiles.ts
 * Returns formatted code that follows the existing pattern
 */
export function generateStaticProfileCodeForFile(profile: LinkedInProfileData): string {
  const profileName = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30) || 'profile';

  // Format as TypeScript object literal with proper escaping
  // Convert JSON to TypeScript format
  const profileStr = JSON.stringify(profile, null, 2)
    .replace(/"([^"]+)":/g, '$1:')  // Remove quotes from keys
    .replace(/"/g, "'");  // Replace double quotes with single quotes

  return `const ${profileName}Profile: LinkedInProfileData = ${profileStr};

// Add these lines to the staticLinkedInProfiles object:
//   [normalizeLinkedInUrl('${profile.url}')]: ${profileName}Profile,
//   [normalizeLinkedInUrl('${profile.url}/')]: { ...${profileName}Profile, url: normalizeLinkedInUrl('${profile.url}/') },`;
}

/**
 * Generate static profile TypeScript code from LinkedIn profile data
 * @deprecated Use generateStaticProfileCodeForFile instead
 */
export function generateStaticProfileCode(profile: LinkedInProfileData): string {
  return generateStaticProfileCodeForFile(profile);
}

/**
 * Generate the full static profiles file content
 */
export function generateStaticProfilesFileContent(
  profiles: LinkedInProfileData[]
): string {
  const imports = `import { LinkedInProfileData } from './types';

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
    return \`https://www.linkedin.com\${pathname}\`;
  } catch {
    // If URL parsing fails, try to extract path manually
    const match = url.match(/linkedin\\.com(\\/in\\/[^/?]+)/i);
    if (match) {
      return \`https://www.linkedin.com\${match[1]}\`;
    }
    return url;
  }
}

`;

  // Generate profile declarations
  const profileDeclarations = profiles
    .map((profile, index) => {
      const profileName =
        profile.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 30) || `profile${index}`;
      return `const ${profileName}Profile: LinkedInProfileData = ${JSON.stringify(profile, null, 4)
        .replace(/"([^"]+)":/g, '$1:')
        .replace(/"/g, "'")
        .replace(/'/g, "'")};`;
    })
    .join('\n\n');

  // Generate the staticLinkedInProfiles object
  const profilesObject = `const staticLinkedInProfiles: Record<string, LinkedInProfileData> = {
${profiles
  .map((profile, index) => {
    const profileName =
      profile.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 30) || `profile${index}`;
    const normalized = normalizeLinkedInUrl(profile.url);
    return `  [normalizeLinkedInUrl('${profile.url}')]: ${profileName}Profile,\n  [normalizeLinkedInUrl('${profile.url}/')]: { ...${profileName}Profile, url: normalizeLinkedInUrl('${profile.url}/') },`;
  })
  .join('\n')}
};

export function getStaticLinkedInProfile(url: string): LinkedInProfileData | null {
  const normalized = normalizeLinkedInUrl(url);
  if (staticLinkedInProfiles[normalized]) {
    return staticLinkedInProfiles[normalized];
  }
  return null;
}
`;

  return imports + profileDeclarations + '\n\n' + profilesObject;
}

/**
 * Read existing static profiles from the file
 */
export async function readExistingStaticProfiles(): Promise<LinkedInProfileData[]> {
  try {
    const content = await fs.readFile(STATIC_PROFILES_PATH, 'utf-8');
    // Extract profile objects from the file using regex
    // This is a simple approach - for production, use a proper parser
    const profileMatches = content.match(
      /const \w+Profile: LinkedInProfileData = \{[\s\S]*?\};/g
    );
    
    if (!profileMatches) {
      return [];
    }

    // Parse each profile (this is basic - in production use a proper TS parser)
    const profiles: LinkedInProfileData[] = [];
    for (const match of profileMatches) {
      try {
        // Extract the JSON part and convert single quotes to double quotes
        const jsonStr = match
          .replace(/const \w+Profile: LinkedInProfileData = /, '')
          .replace(/;$/, '')
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":'); // Add quotes to keys
        
        const profile = JSON.parse(jsonStr);
        if (profile.url && profile.name) {
          profiles.push(profile);
        }
      } catch (e) {
        // Skip malformed profiles
        console.error('Error parsing profile:', e);
      }
    }

    return profiles;
  } catch (e) {
    // File doesn't exist or can't be read
    return [];
  }
}

/**
 * Add a new static profile to the file
 */
export async function addStaticProfile(
  newProfile: LinkedInProfileData
): Promise<void> {
  const existingProfiles = await readExistingStaticProfiles();
  
  // Check if profile already exists
  const normalizedUrl = newProfile.url.replace(/\/$/, '');
  const exists = existingProfiles.some(
    (p) => p.url.replace(/\/$/, '') === normalizedUrl
  );
  
  if (exists) {
    throw new Error(`Profile for ${normalizedUrl} already exists`);
  }

  // Add new profile
  const allProfiles = [...existingProfiles, newProfile];
  
  // Generate new file content
  const newContent = generateStaticProfilesFileContent(allProfiles);
  
  // Write to file
  await fs.writeFile(STATIC_PROFILES_PATH, newContent, 'utf-8');
}

/**
 * Export profile data as static profile code (for manual addition)
 * Returns code that can be directly added to staticProfiles.ts
 */
export function exportProfileAsCode(profile: LinkedInProfileData): string {
  return generateStaticProfileCodeForFile(profile);
}

