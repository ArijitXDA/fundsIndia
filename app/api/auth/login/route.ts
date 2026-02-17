import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAnon } from '@/lib/supabase';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validate email domain
    if (!email || !email.endsWith('@fundsindia.com')) {
      return NextResponse.json(
        { error: 'Only @fundsindia.com email addresses are allowed' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Authenticate via Supabase Auth (anon client so it uses the proper auth pipeline)
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Fetch our custom user row (for role, employee link, etc.)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (userError || !user) {
      // User authenticated with Supabase but no row in our users table yet
      // This can happen if they signed up via OTP but never completed set-password
      return NextResponse.json(
        { error: 'Account setup incomplete. Please use the sign-up link sent to your email.' },
        { status: 403 }
      );
    }

    // Fetch employee details
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('id', user.employee_id)
      .single();

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Log activity
    try {
      await supabaseAdmin
        .from('activity_logs')
        .insert({
          user_id: user.id,
          employee_id: user.employee_id,
          action_type: 'login',
          action_details: { success: true, method: 'supabase_auth' },
        });
    } catch (_) {
      // Non-fatal
    }

    // Issue our custom session cookie (dashboard reads this via /api/auth/me)
    const sessionData = {
      userId: user.id,
      email: user.email,
      employeeId: user.employee_id,
      role: user.role,
      isFirstLogin: false,
    };

    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        isFirstLogin: false,
        employee,
      },
    });

    response.cookies.set('session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
