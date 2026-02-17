import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    // Fetch current user
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();

    if (!currentUser) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Verify caller is a Dev Admin with impersonation rights
    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles')
      .select('can_impersonate, tier')
      .eq('email', currentUser.email)
      .eq('is_active', true)
      .single();

    if (!adminRole?.can_impersonate) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { targetEmployeeNumber } = await request.json();
    if (!targetEmployeeNumber) {
      return NextResponse.json({ error: 'targetEmployeeNumber is required' }, { status: 400 });
    }

    // Find target employee
    const { data: targetEmployee } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, work_email, business_unit, employee_number')
      .eq('employee_number', targetEmployeeNumber)
      .single();

    if (!targetEmployee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Find or create target user row
    let { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .eq('email', targetEmployee.work_email)
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { error: 'This employee has not registered yet. They need to sign up first.' },
        { status: 404 }
      );
    }

    // Build impersonated session
    const impersonatedSession = {
      userId: targetUser.id,
      email: targetEmployee.work_email,
      employeeId: targetEmployee.id,
      role: targetUser.role || 'employee',
      isFirstLogin: false,
      impersonatedBy: currentUser.email,
    };

    const response = NextResponse.json({
      success: true,
      targetUser: {
        name: targetEmployee.full_name,
        email: targetEmployee.work_email,
        employeeNumber: targetEmployee.employee_number,
      },
    });

    // Save original admin session to admin_session cookie
    response.cookies.set('admin_session', sessionCookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    // Replace session cookie with impersonated user
    response.cookies.set('session', JSON.stringify(impersonatedSession), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error: any) {
    console.error('[ADMIN IMPERSONATE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
