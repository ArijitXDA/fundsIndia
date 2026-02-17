import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Mark this route as dynamic since it uses cookies
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const sessionData = JSON.parse(sessionCookie.value);

    // Fetch user data from database
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*, employee:employees(*)')
      .eq('id', sessionData.userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Check if this user has an active admin role
    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles')
      .select('tier, vertical, roles, can_impersonate, can_assign_admins')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();

    // Check if currently impersonating (impersonatedBy field in session cookie)
    const impersonatedBy = sessionData.impersonatedBy || null;

    return NextResponse.json({
      user: {
        email: user.email,
        role: user.role,
        isFirstLogin: user.is_first_login,
        employee: user.employee,
        impersonatedBy,
      },
      adminRole: adminRole ?? null,
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
