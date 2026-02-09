import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validate email domain
    if (!email.endsWith('@fundsindia.com')) {
      return NextResponse.json(
        { error: 'Only @fundsindia.com email addresses are allowed' },
        { status: 400 }
      );
    }

    // Check if user exists in database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*, employee:employees(*)')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Log activity
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: user.id,
        employee_id: user.employee_id,
        action_type: 'login',
        action_details: { success: true },
      });

    // Create session token (simplified - in production use proper JWT)
    const sessionData = {
      userId: user.id,
      email: user.email,
      employeeId: user.employee_id,
      role: user.role,
      isFirstLogin: user.is_first_login,
    };

    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        isFirstLogin: user.is_first_login,
        employee: user.employee,
      },
    });

    // Set HTTP-only cookie for session
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
