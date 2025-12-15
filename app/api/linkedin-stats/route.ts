import { NextResponse } from 'next/server';
import { getLinkedInScrapeStats } from '@/lib/linkedinLimit';

export async function GET() {
  try {
    const stats = getLinkedInScrapeStats();
    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get LinkedIn stats',
      },
      { status: 500 }
    );
  }
}

