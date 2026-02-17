import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const VALID_TIERS = ['dev', 'super', 'co', 'vertical'];
const VALID_VERTICALS = ['B2B', 'B2C', 'PW', null];
const ALL_ROLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    // Fetch caller user
    const { data: callerUser } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();

    if (!callerUser) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Verify caller has assign permissions
    const { data: callerAdmin } = await supabaseAdmin
      .from('admin_roles')
      .select('can_assign_admins, tier')
      .eq('email', callerUser.email)
      .eq('is_active', true)
      .single();

    if (!callerAdmin?.can_assign_admins) {
      return NextResponse.json({ error: 'Insufficient permissions to assign admin roles' }, { status: 403 });
    }

    const { email, employeeId, tier, vertical, roles } = await request.json();

    // Validate inputs
    if (!email || !employeeId || !tier) {
      return NextResponse.json({ error: 'email, employeeId, and tier are required' }, { status: 400 });
    }
    if (!VALID_TIERS.includes(tier)) {
      return NextResponse.json({ error: `tier must be one of: ${VALID_TIERS.join(', ')}` }, { status: 400 });
    }
    if (tier === 'vertical' && !['B2B', 'B2C', 'PW'].includes(vertical)) {
      return NextResponse.json({ error: 'vertical is required for vertical tier (B2B, B2C, or PW)' }, { status: 400 });
    }
    if (!Array.isArray(roles) || roles.some(r => !ALL_ROLE_IDS.includes(r))) {
      return NextResponse.json({ error: 'roles must be an array of valid role IDs (1-13)' }, { status: 400 });
    }

    // Prevent non-dev admins from assigning dev tier
    if (tier === 'dev' && callerAdmin.tier !== 'dev') {
      return NextResponse.json({ error: 'Only Dev Admin can assign Dev Admin tier' }, { status: 403 });
    }

    // Verify email domain
    if (!email.endsWith('@fundsindia.com')) {
      return NextResponse.json({ error: 'Only @fundsindia.com emails allowed' }, { status: 400 });
    }

    // Verify employee exists
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, employee_number')
      .eq('employee_number', employeeId)
      .single();

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found with that ID' }, { status: 404 });
    }

    // Upsert admin role
    const { error: upsertError } = await supabaseAdmin
      .from('admin_roles')
      .upsert({
        employee_id: employeeId,
        email,
        tier,
        vertical: vertical || null,
        roles,
        can_impersonate: tier === 'dev',
        can_assign_admins: ['dev', 'super', 'co'].includes(tier),
        assigned_by: callerUser.email,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (upsertError) {
      console.error('[ASSIGN ROLE] Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to assign admin role' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Admin role assigned to ${employee.full_name} (${email})`,
    });
  } catch (error: any) {
    console.error('[ASSIGN ROLE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
