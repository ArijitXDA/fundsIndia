import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Which business units each admin vertical can see
const VERTICAL_BU_MAP: Record<string, string[]> = {
  B2B: ['B2B'],
  B2C: ['B2C'],
  PW:  ['Private Wealth'],
};

// Tiers that can see all verticals
const ALL_ACCESS_TIERS = ['dev', 'super', 'co'];

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const sessionData = JSON.parse(sessionCookie.value);

    // 1. Get caller's user record
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // 2. Check admin role
    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles')
      .select('tier, vertical, roles')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();
    if (!adminRole) return NextResponse.json({ error: 'Not an admin' }, { status: 403 });

    // 3. Determine which business units to include
    let allowedBUs: string[] | null = null; // null = all
    if (!ALL_ACCESS_TIERS.includes(adminRole.tier)) {
      // Vertical admin — restrict to their vertical
      const vert = adminRole.vertical; // 'B2B' | 'B2C' | 'PW'
      allowedBUs = VERTICAL_BU_MAP[vert] ?? [];
    }

    // 4. Fetch all active employees
    let employeeQuery = supabaseAdmin
      .from('employees')
      .select(`
        employee_number,
        full_name,
        work_email,
        business_unit,
        job_title,
        department,
        sub_department,
        location,
        reporting_manager_emp_number,
        reporting_to,
        employment_status,
        date_joined
      `)
      .eq('employment_status', 'Active')
      .order('business_unit')
      .order('full_name');

    if (allowedBUs) {
      employeeQuery = employeeQuery.in('business_unit', allowedBUs);
    }

    const { data: employees, error: empError } = await employeeQuery;
    if (empError) return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });

    // 5. Fetch all B2B sales (MTD + YTD) and B2C sales for metrics
    const [
      { data: b2bMTD },
      { data: b2bYTD },
      { data: b2cRows },
    ] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('*'),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select('*'),
      supabaseAdmin.from('b2c').select('*'),
    ]);

    // Build B2B sales map: emp_number → { mtd, ytd }
    const b2bMap = new Map<string, { mtdTotal: number; ytdTotal: number }>();
    b2bMTD?.forEach(row => {
      const id = row['RM Emp ID'];
      if (!id || id === '#N/A') return;
      const entry = b2bMap.get(id) ?? { mtdTotal: 0, ytdTotal: 0 };
      entry.mtdTotal += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
      b2bMap.set(id, entry);
    });
    b2bYTD?.forEach(row => {
      const id = row['RM Emp ID'];
      if (!id || id === '#N/A') return;
      const entry = b2bMap.get(id) ?? { mtdTotal: 0, ytdTotal: 0 };
      entry.ytdTotal += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
      b2bMap.set(id, entry);
    });
    // ytdTotal should include MTD
    b2bMap.forEach((v, k) => {
      b2bMap.set(k, { ...v, ytdTotal: v.mtdTotal + v.ytdTotal });
    });

    // Build B2C map: advisor name → row data
    const b2cMap = new Map<string, any>();
    b2cRows?.forEach(row => {
      const name = (row.advisor || '').trim().toLowerCase();
      if (name) b2cMap.set(name, row);
    });

    // 6. Build CSV rows
    const headers = [
      'Emp ID',
      'Vertical',
      'Employee Name',
      'Work Email',
      'Job Title',
      'Department',
      'Sub Department',
      'Location',
      'Reporting Manager Emp ID',
      'Reporting Manager Name',
      'Date Joined',
      // B2B metrics (filled for B2B employees)
      'B2B MTD Net Sales (Cr)',
      'B2B YTD Net Sales (Cr)',
      // B2C metrics (filled for B2C employees)
      'B2C Net Inflow MTD (Cr)',
      'B2C Net Inflow YTD (Cr)',
      'B2C Current AUM (Cr)',
      'B2C AUM Growth MTM %',
      'B2C Assigned Leads',
      'B2C New SIP Inflow YTD (Cr)',
    ];

    const rows: string[][] = employees!.map(emp => {
      const bu = (emp.business_unit || '').trim();
      const vertical = bu === 'Private Wealth' ? 'PW' : bu;
      const empNum = emp.employee_number || '';
      const empNameLower = (emp.full_name || '').trim().toLowerCase();

      // B2B sales
      const b2bSales = b2bMap.get(empNum);
      const b2bMTDVal = b2bSales ? b2bSales.mtdTotal.toFixed(4) : '';
      const b2bYTDVal = b2bSales ? b2bSales.ytdTotal.toFixed(4) : '';

      // B2C sales
      const b2cRow = b2cMap.get(empNameLower);
      const b2cMTD = b2cRow ? parseFloat(b2cRow['net_inflow_mtd[cr]'] || 0).toFixed(4) : '';
      const b2cYTD = b2cRow ? parseFloat(b2cRow['net_inflow_ytd[cr]'] || 0).toFixed(4) : '';
      const b2cAUM = b2cRow ? parseFloat(b2cRow['current_aum_mtm [cr.]'] || 0).toFixed(4) : '';
      const b2cAUMGrowth = b2cRow ? parseFloat(b2cRow['aum_growth_mtm %'] || 0).toFixed(2) : '';
      const b2cLeads = b2cRow ? Math.round(parseFloat(b2cRow['assigned_leads'] || 0)).toString() : '';
      const b2cNewSIP = b2cRow ? parseFloat(b2cRow['new_sip_inflow_ytd[cr.]'] || 0).toFixed(4) : '';

      return [
        empNum,
        vertical,
        emp.full_name || '',
        emp.work_email || '',
        emp.job_title || '',
        emp.department || '',
        emp.sub_department || '',
        emp.location || '',
        emp.reporting_manager_emp_number || '',
        emp.reporting_to || '',
        emp.date_joined || '',
        b2bMTDVal,
        b2bYTDVal,
        b2cMTD,
        b2cYTD,
        b2cAUM,
        b2cAUMGrowth,
        b2cLeads,
        b2cNewSIP,
      ];
    });

    // 7. Serialize to CSV
    const escapeCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(',')),
    ];
    const csv = csvLines.join('\r\n');

    // 8. Log this export action
    try {
      await supabaseAdmin.from('activity_logs').insert({
        user_id: sessionData.userId,
        action_type: 'employee_export_csv',
        action_details: {
          tier: adminRole.tier,
          vertical: adminRole.vertical || 'all',
          row_count: rows.length,
          allowed_bus: allowedBUs || 'all',
        },
      });
    } catch (_) {}

    // 9. Return as downloadable CSV
    const verticalLabel = adminRole.vertical ? `_${adminRole.vertical}` : '_ALL';
    const filename = `employees${verticalLabel}_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
