import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAnon } from '@/lib/supabase';

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

    // Use signInWithOtp on the anon client — this actually triggers Supabase's email pipeline.
    // The admin/service role client bypasses email sending; anon client sends the OTP email correctly.
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://funds-india-8134.vercel.app';
    const redirectTo = `${siteUrl}/auth/callback?next=/set-password`;

    const { error: otpError } = await supabaseAnon.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true, // create Supabase Auth user if not already exists
      },
    });

    if (otpError) {
      console.error('[SIGNUP] OTP error:', otpError);
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
