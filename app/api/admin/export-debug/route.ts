import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const sessionData = JSON.parse(sessionCookie.value);

    const { data: user } = await supabaseAdmin
      .from('users').select('email').eq('id', sessionData.userId).single();
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles').select('tier, vertical, roles').eq('email', user.email).eq('is_active', true).single();
    if (!adminRole) return NextResponse.json({ error: 'Not an admin' }, { status: 403 });

    // 1. Check employees — ALL statuses
    const { data: allEmps, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, business_unit, employment_status')
      .limit(10);

    // 2. Check distinct employment_status values
    const { data: statuses } = await supabaseAdmin
      .from('employees')
      .select('employment_status');

    const distinctStatuses = [...new Set((statuses || []).map((r: any) => r.employment_status))];
    const totalEmployees = (statuses || []).length;

    // 3. Count Active specifically
    const { data: activeEmps } = await supabaseAdmin
      .from('employees')
      .select('employee_number')
      .eq('employment_status', 'Active');

    // 4. Count Working specifically
    const { data: workingEmps } = await supabaseAdmin
      .from('employees')
      .select('employee_number')
      .eq('employment_status', 'Working');

    // 5. B2B row count
    const { data: b2bSample } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select('"RM Emp ID", "RM", "Total Net Sales (COB 100%)"')
      .limit(3);

    // 6. B2C row count
    const { data: b2cSample } = await supabaseAdmin
      .from('b2c')
      .select('advisor, "net_inflow_mtd[cr]"')
      .limit(3);

    return NextResponse.json({
      admin: { email: user.email, tier: adminRole.tier, vertical: adminRole.vertical },
      employees: {
        totalRows: totalEmployees,
        distinctStatuses,
        activeCount: (activeEmps || []).length,
        workingCount: (workingEmps || []).length,
        sampleRows: allEmps || [],
        error: empErr?.message,
      },
      b2bMTD: {
        sampleRows: b2bSample || [],
      },
      b2c: {
        sampleRows: b2cSample || [],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
