import { NextRequest, NextResponse } from 'next/server';
import { exportProfileAsCode } from '@/lib/staticProfileGenerator';
import { LinkedInProfileData } from '@/lib/types';

/**
 * API endpoint to export a scraped profile as static profile code
 * 
 * POST /api/export-profile
 * Body: { profile: LinkedInProfileData }
 * 
 * Returns the profile data formatted as TypeScript code that can be added to staticProfiles.ts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile } = body;

    if (!profile || profile.platform !== 'linkedin') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid profile data. Must be a LinkedIn profile.',
        },
        { status: 400 }
      );
    }

    const profileData = profile as LinkedInProfileData;

    // Validate required fields
    if (!profileData.url || !profileData.name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Profile must have url and name fields',
        },
        { status: 400 }
      );
    }

    // Generate static profile code
    const code = exportProfileAsCode(profileData);

    return NextResponse.json({
      success: true,
      code,
      message: 'Profile code generated. Copy and paste into lib/staticProfiles.ts',
      profile: {
        url: profileData.url,
        name: profileData.name,
      },
    });
  } catch (error: any) {
    console.error('Error exporting profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to export profile',
      },
      { status: 500 }
    );
  }
}

