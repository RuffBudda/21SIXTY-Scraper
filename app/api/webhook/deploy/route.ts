import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { createHmac } from 'crypto';

// Max duration for webhook response (webhook runs deployment in background)
export const maxDuration = 30;

/**
 * GitHub Webhook endpoint for automatic deployment
 * 
 * This endpoint receives webhook events from GitHub and triggers
 * an automatic update of the application on the server.
 * 
 * Security:
 * - Validates webhook signature using HMAC SHA-256
 * - Requires DEPLOY_SECRET environment variable
 * - Only processes push events to main branch
 */
export async function POST(request: NextRequest) {
  try {
    // Get the webhook secret from environment
    const deploySecret = process.env.DEPLOY_SECRET;
    
    if (!deploySecret) {
      console.error('DEPLOY_SECRET not configured');
      return NextResponse.json(
        { error: 'Deployment not configured' },
        { status: 500 }
      );
    }

    // Get the signature from headers
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    // Get the raw body for signature verification
    const body = await request.text();
    
    // Verify the signature
    const expectedSignature = 'sha256=' + createHmac('sha256', deploySecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the webhook payload
    const payload = JSON.parse(body);
    
    // Only process push events to main branch
    if (payload.ref !== 'refs/heads/main') {
      return NextResponse.json(
        { message: 'Ignored: not main branch' },
        { status: 200 }
      );
    }

    // Log the deployment trigger
    console.log(`Deployment triggered by: ${payload.pusher?.name || 'unknown'}`);
    console.log(`Commit: ${payload.head_commit?.id || 'unknown'}`);
    console.log(`Message: ${payload.head_commit?.message || 'no message'}`);

    // Run the update script asynchronously
    // We don't wait for it to complete to avoid timeout
    const updateScript = '/var/www/scraper/scripts/update.sh';
    
    exec(`bash ${updateScript}`, {
      cwd: '/var/www/scraper',
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('Deployment error:', error);
        console.error('stderr:', stderr);
        return;
      }
      console.log('Deployment output:', stdout);
    });

    // Return immediately (deployment runs in background)
    return NextResponse.json({
      message: 'Deployment started',
      commit: payload.head_commit?.id,
      pusher: payload.pusher?.name,
    }, { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for webhook verification/testing
 * GitHub may send a GET request to verify the webhook endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Deployment webhook endpoint is active',
    method: 'POST',
    path: '/api/webhook/deploy',
  }, { status: 200 });
}

