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

    // Validate domain — only @fundsindia.com allowed
    if (!normalizedEmail.endsWith('@fundsindia.com')) {
      return NextResponse.json(
        { error: 'Only @fundsindia.com email addresses are allowed to sign up' },
        { status: 400 }
      );
    }

    // Check if the email exists in the employees table (work_email column)
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, work_email')
      .eq('work_email', normalizedEmail)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        {
          error:
            'Your email is not registered in the employee directory. Please contact your administrator.',
        },
        { status: 404 }
      );
    }

    // Check if user already has an account in the users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    // Generate a Supabase Auth signup link (magic link style — no password needed at this stage)
    // This sends a confirmation email; user will set password on /set-password page
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://funds-india-8134.vercel.app';
    const redirectTo = `${siteUrl}/auth/callback?next=/set-password`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });

    if (linkError) {
      // If user already exists in Supabase Auth, generate a magic link instead
      if (linkError.message?.includes('already registered')) {
        const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: normalizedEmail,
          options: { redirectTo },
        });

        if (magicError) {
          console.error('[SIGNUP] Magic link error:', magicError);
          return NextResponse.json(
            { error: 'Failed to send verification email. Please try again.' },
            { status: 500 }
          );
        }

        // Send the magic link email via Supabase (it auto-sends when using generateLink with admin)
        return NextResponse.json({
          success: true,
          message: 'Verification email sent. Please check your inbox.',
          employeeName: employee.full_name,
          isExistingUser: true,
        });
      }

      console.error('[SIGNUP] Generate link error:', linkError);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
      employeeName: employee.full_name,
      isExistingUser: !!existingUser,
    });
  } catch (error: any) {
    console.error('[SIGNUP] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
