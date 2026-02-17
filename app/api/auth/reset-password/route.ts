import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate domain
    if (!normalizedEmail.endsWith('@fundsindia.com')) {
      return NextResponse.json(
        { error: 'Only @fundsindia.com email addresses are supported' },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://funds-india-8134.vercel.app';
    const redirectTo = `${siteUrl}/auth/callback?next=/set-password`;

    // Send password reset email via Supabase Auth
    // We always return success to avoid email enumeration attacks
    await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    return NextResponse.json({
      success: true,
      message: 'If this email is registered, a password reset link has been sent.',
    });
  } catch (error: any) {
    console.error('[RESET PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
