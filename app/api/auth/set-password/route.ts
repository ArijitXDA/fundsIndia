import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, supabaseUserId } = await request.json();

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

    // Look up employee record by email
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, work_email, business_unit, job_title')
      .eq('work_email', normalizedEmail)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee record not found for this email address' },
        { status: 404 }
      );
    }

    // Look up or create the user row in our custom users table
    const { data: existingUser, error: userLookupError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    let userId: string;
    let userRole: string;

    if (existingUser) {
      // User already exists — update is_first_login and last_login
      userId = existingUser.id;
      userRole = existingUser.role || 'employee';

      await supabaseAdmin
        .from('users')
        .update({
          is_first_login: false,
          last_login: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      // New user — create a row in our users table
      userRole = 'employee'; // default role; admin can change later

      // Generate a placeholder password hash (Supabase Auth manages the real password)
      const placeholderHash = await bcrypt.hash(
        `supabase_auth_${supabaseUserId || Date.now()}`,
        10
      );

      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          email: normalizedEmail,
          password_hash: placeholderHash,
          role: userRole,
          employee_id: employee.id,
          is_first_login: false,
          last_login: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError || !newUser) {
        console.error('[SET-PASSWORD] Failed to create user row:', createError);
        return NextResponse.json(
          { error: 'Failed to create user account. Please contact support.' },
          { status: 500 }
        );
      }

      userId = newUser.id;
    }

    // Log the activity
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: userId,
        employee_id: employee.id,
        action_type: 'password_set',
        action_details: { method: 'supabase_auth', isNewUser: !existingUser },
      })
      .catch(() => {}); // Don't fail if logging fails

    // Issue our custom session cookie (same format as login route)
    const sessionData = {
      userId,
      email: normalizedEmail,
      employeeId: employee.id,
      role: userRole,
      isFirstLogin: false,
    };

    const response = NextResponse.json({
      success: true,
      user: {
        email: normalizedEmail,
        role: userRole,
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
  } catch (error: any) {
    console.error('[SET-PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
