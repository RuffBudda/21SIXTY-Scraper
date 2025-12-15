#!/usr/bin/env ts-node
/**
 * Utility script to extract LinkedIn profile data and save as static profile
 * 
 * Usage:
 *   npm run extract-profile <linkedin-url>
 *   or
 *   npx ts-node scripts/extract-static-profile.ts <linkedin-url>
 * 
 * This script:
 * 1. Scrapes the LinkedIn profile (works locally with browser)
 * 2. Saves it as a static profile in lib/staticProfiles.ts
 * 3. Future requests will use the static profile (instant response)
 */

import { scrapeProfileProgressive } from '../lib/scraper';
import { addStaticProfile, exportProfileAsCode } from '../lib/staticProfileGenerator';
import { LinkedInProfileData } from '../lib/types';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: npm run extract-profile <linkedin-url>');
    console.error('Example: npm run extract-profile https://www.linkedin.com/in/username/');
    process.exit(1);
  }

  if (!url.includes('linkedin.com')) {
    console.error('Error: URL must be a LinkedIn profile URL');
    process.exit(1);
  }

  console.log(`\n🔍 Scraping LinkedIn profile: ${url}\n`);

  try {
    // Scrape the profile
    const result = await scrapeProfileProgressive(url);

    if (!result.data || result.data.platform !== 'linkedin') {
      throw new Error('Failed to scrape LinkedIn profile data');
    }

    const profile = result.data as LinkedInProfileData;

    // Check if we have essential data
    if (!profile.name || !profile.url) {
      throw new Error('Scraped profile is missing essential data (name or url)');
    }

    console.log('✅ Successfully scraped profile:');
    console.log(`   Name: ${profile.name}`);
    console.log(`   Headline: ${profile.headline || 'N/A'}`);
    console.log(`   Experience items: ${profile.experience.length}`);
    console.log(`   Education items: ${profile.education.length}`);
    console.log(`   Skills: ${profile.skills.length}\n`);

    // Try to add as static profile
    try {
      await addStaticProfile(profile);
      console.log('✅ Profile saved to lib/staticProfiles.ts');
      console.log('   Future requests for this URL will use the static profile (instant response)\n');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  Profile already exists in static profiles');
        console.log('   If you want to update it, manually edit lib/staticProfiles.ts\n');
      } else {
        console.error('❌ Error saving profile:', error.message);
        console.log('\n📋 Here is the profile data as code (you can manually add it):\n');
        console.log(exportProfileAsCode(profile));
        process.exit(1);
      }
    }
  } catch (error: any) {
    console.error('❌ Error scraping profile:', error.message);
    
    if (error.message.includes('login wall') || error.message.includes('Sign in')) {
      console.error('\n💡 Tip: LinkedIn is showing a login wall.');
      console.error('   Try:');
      console.error('   1. Open the profile in your browser while logged into LinkedIn');
      console.error('   2. Copy the HTML or use browser dev tools to extract data');
      console.error('   3. Manually create a static profile using the format in lib/staticProfiles.ts');
    }
    
    process.exit(1);
  }
}

main();

