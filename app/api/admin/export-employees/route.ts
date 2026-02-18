import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Which business units each admin vertical can see
const VERTICAL_BU_MAP: Record<string, string[]> = {
  B2B: ['B2B'],
  B2C: ['B2C'],
  PW:  ['Private Wealth'],
};

const ALL_ACCESS_TIERS = ['dev', 'super', 'co'];

function toN(v: any, dp = 4): string {
  const n = parseFloat(v ?? 0);
  return isNaN(n) ? '' : n.toFixed(dp);
}

function toI(v: any): string {
  const n = parseFloat(v ?? 0);
  return isNaN(n) ? '' : Math.round(n).toString();
}

function escapeCsv(val: string): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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

    // 3. Determine vertical scope
    const isAllAccess = ALL_ACCESS_TIERS.includes(adminRole.tier);
    const allowedBUs: string[] | null = isAllAccess
      ? null
      : (VERTICAL_BU_MAP[adminRole.vertical] ?? []);

    // 4. Fetch ALL employees (status 'Working' = active in this DB — not 'Inactive')
    const { data: allEmployees, error: empError } = await supabaseAdmin
      .from('employees')
      .select(
        'employee_number, full_name, work_email, business_unit, job_title, department, sub_department, location, reporting_manager_emp_number, employment_status, date_joined'
      )
      .neq('employment_status', 'Inactive');

    if (empError) {
      return NextResponse.json(
        { error: 'Failed to fetch employees', details: empError.message },
        { status: 500 }
      );
    }

    // Manager name lookup map: emp_number → full_name
    const empNameMap = new Map<string, string>(
      (allEmployees || []).map(e => [e.employee_number, e.full_name || ''])
    );

    // 5. Fetch all sales data in parallel
    const [
      { data: b2bMTD },
      { data: b2bYTD },
      { data: b2cRows },
    ] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('*'),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select('*'),
      supabaseAdmin.from('b2c').select('*'),
    ]);

    // ── B2B: aggregate by RM Emp ID ──────────────────────────────────────────
    // Structure: empId → { mtd_mf, mtd_cob, mtd_aif, mtd_alt, mtd_total,
    //                       ytd_mf, ytd_cob, ytd_aif, ytd_alt, ytd_total,
    //                       branch, zone, bm, rgm, zm }
    interface B2BEntry {
      mtd_mf: number; mtd_cob: number; mtd_aif: number; mtd_alt: number; mtd_total: number;
      ytdPrev_mf: number; ytdPrev_cob: number; ytdPrev_aif: number; ytdPrev_alt: number; ytdPrev_total: number;
      branch: string; zone: string; bm: string; rgm: string; zm: string;
    }

    const b2bMap = new Map<string, B2BEntry>();

    const ensureB2B = (id: string, row: any): B2BEntry => {
      if (!b2bMap.has(id)) {
        b2bMap.set(id, {
          mtd_mf: 0, mtd_cob: 0, mtd_aif: 0, mtd_alt: 0, mtd_total: 0,
          ytdPrev_mf: 0, ytdPrev_cob: 0, ytdPrev_aif: 0, ytdPrev_alt: 0, ytdPrev_total: 0,
          branch: row['Branch'] || '',
          zone: row['Zone'] || '',
          bm: row['BM'] || '',
          rgm: row['RGM'] || '',
          zm: row['ZM'] || '',
        });
      }
      return b2bMap.get(id)!;
    };

    (b2bMTD || []).forEach(row => {
      const id = String(row['RM Emp ID'] || '').trim();
      if (!id || id === '#N/A') return;
      const e = ensureB2B(id, row);
      e.mtd_mf    += parseFloat(row['MF+SIF+MSCI'] || 0) || 0;
      e.mtd_cob   += parseFloat(row['COB (100%)'] || 0) || 0;
      e.mtd_aif   += parseFloat(row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0;
      e.mtd_alt   += parseFloat(row['ALTERNATE'] || 0) || 0;
      e.mtd_total += parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0;
      // Keep branch/zone/bm from first MTD row encountered
      if (!e.branch) e.branch = row['Branch'] || '';
      if (!e.zone)   e.zone   = row['Zone']   || '';
      if (!e.bm)     e.bm     = row['BM']     || '';
      if (!e.rgm)    e.rgm    = row['RGM']    || '';
      if (!e.zm)     e.zm     = row['ZM']     || '';
    });

    (b2bYTD || []).forEach(row => {
      const id = String(row['RM Emp ID'] || '').trim();
      if (!id || id === '#N/A') return;
      const e = ensureB2B(id, row);
      e.ytdPrev_mf    += parseFloat(row['MF+SIF+MSCI'] || 0) || 0;
      e.ytdPrev_cob   += parseFloat(row['SUM of COB (100%)'] || row['COB (100%)'] || 0) || 0;
      e.ytdPrev_aif   += parseFloat(row['SUM of AIF+PMS+LAS (TRAIL)'] || row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0;
      e.ytdPrev_alt   += parseFloat(row['SUM of ALT'] || row['ALTERNATE'] || 0) || 0;
      e.ytdPrev_total += parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0;
    });

    // ── B2C: by advisor field (lowercase) ────────────────────────────────────
    // The 'advisor' column stores email addresses (e.g. venkatsri.ss@fundsindia.com)
    // so we match against the employee's work_email
    const b2cMap = new Map<string, any>();
    (b2cRows || []).forEach(row => {
      const advisor = String(row['advisor'] || '').trim().toLowerCase();
      if (advisor) b2cMap.set(advisor, row);
    });

    // ── Determine which employees to include in the report ───────────────────
    // We include:
    //   - Employees from allowed BUs (per vertical scope)
    //   - OR employees who appear in B2B/B2C sales data (they may be cross-BU)
    const scopedEmployees = (allEmployees || []).filter(emp => {
      if (!allowedBUs) return true; // all access
      return allowedBUs.includes(emp.business_unit || '');
    });

    // Sort by vertical then name
    scopedEmployees.sort((a, b) => {
      const buA = a.business_unit || '';
      const buB = b.business_unit || '';
      if (buA !== buB) return buA.localeCompare(buB);
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    // ────────────────────────────────────────────────────────────────────────
    // BUILD CSV
    // We produce a SINGLE report with all verticals together.
    // B2B-specific columns are blank for B2C/PW employees and vice versa.
    // ────────────────────────────────────────────────────────────────────────

    const headers = [
      // Identity
      'Emp ID',
      'Vertical',
      'Employee Name',
      'Employee Email',
      'Job Title',
      'Department',
      'Sub Department',
      'Location',
      'Reporting Manager Emp ID',
      'Reporting Manager Name',
      'Date Joined',

      // ── B2B Sales Metrics ────────────────────────────────────────────────
      // MTD
      'B2B Branch',
      'B2B Zone',
      'B2B BM',
      'B2B RGM',
      'B2B ZM',
      'B2B MTD — MF+SIF+MSCI (Cr)',
      'B2B MTD — COB 100% (Cr)',
      'B2B MTD — AIF+PMS+LAS+Dynamo Trail (Cr)',
      'B2B MTD — Alternate (Cr)',
      'B2B MTD — Total Net Sales COB 100% (Cr)',
      // YTD (full year = prior months + current MTD)
      'B2B YTD — MF+SIF+MSCI (Cr)',
      'B2B YTD — COB 100% (Cr)',
      'B2B YTD — AIF+PMS+LAS+Dynamo Trail (Cr)',
      'B2B YTD — Alternate (Cr)',
      'B2B YTD — Total Net Sales COB 100% (Cr)',
      // Targets (placeholder — tables not yet uploaded)
      'B2B MTD Target (Cr)',
      'B2B QTD Target (Cr)',
      'B2B YTD Target (Cr)',

      // ── B2C Sales Metrics ────────────────────────────────────────────────
      'B2C Team',
      'B2C Assigned Leads',
      'B2C Net Inflow MTD (Cr)',
      'B2C Net Inflow YTD (Cr)',
      'B2C Current AUM MTM (Cr)',
      'B2C AUM Growth MTM %',
      'B2C New SIP Inflow MTD (Cr)',
      'B2C New SIP Inflow YTD (Cr)',
      'B2C Total SIP Inflow MTD (Cr)',
      'B2C Total SIP Inflow YTD (Cr)',
      'B2C Gross Lumpsum Inflow MTD (Cr)',
      'B2C Gross Lumpsum Inflow YTD (Cr)',
      'B2C Total Outflow MTD (Cr)',
      'B2C Total Outflow YTD (Cr)',
      'B2C MSCI Inflow MTD (Cr)',
      'B2C MSCI Inflow YTD (Cr)',
      'B2C FD Inflow MTD (Cr)',
      'B2C FD Inflow YTD (Cr)',
      'B2C Total SIP Book AO 31 March (Cr)',
      'B2C Assigned AUM AO 31 March (Cr)',
      'B2C YTD Net AUM Growth %',
      // Targets (placeholder — tables not yet uploaded)
      'B2C MTD Target (Cr)',
      'B2C QTD Target (Cr)',
      'B2C YTD Target (Cr)',
    ];

    const csvRows: string[][] = scopedEmployees.map(emp => {
      const bu        = (emp.business_unit || '').trim();
      const vertical  = bu === 'Private Wealth' ? 'PW' : bu;
      const empNum    = emp.employee_number || '';
      const emailKey  = (emp.work_email || '').trim().toLowerCase();
      const mgrNum    = emp.reporting_manager_emp_number || '';
      const mgrName   = mgrNum ? (empNameMap.get(mgrNum) || '') : '';

      // Identity columns
      const identity = [
        empNum,
        vertical,
        emp.full_name || '',
        emp.work_email || '',
        emp.job_title || '',
        emp.department || '',
        emp.sub_department || '',
        emp.location || '',
        mgrNum,
        mgrName,
        emp.date_joined || '',
      ];

      // B2B columns — try with and without leading 'W' prefix to handle both formats
      const empNumW = empNum.startsWith('W') ? empNum : `W${empNum}`;
      const b2b = b2bMap.get(empNumW) || b2bMap.get(empNum);
      const ytd_mf    = b2b ? b2b.mtd_mf    + b2b.ytdPrev_mf    : 0;
      const ytd_cob   = b2b ? b2b.mtd_cob   + b2b.ytdPrev_cob   : 0;
      const ytd_aif   = b2b ? b2b.mtd_aif   + b2b.ytdPrev_aif   : 0;
      const ytd_alt   = b2b ? b2b.mtd_alt   + b2b.ytdPrev_alt   : 0;
      const ytd_total = b2b ? b2b.mtd_total + b2b.ytdPrev_total : 0;

      const b2bCols = b2b ? [
        b2b.branch,
        b2b.zone,
        b2b.bm,
        b2b.rgm,
        b2b.zm,
        b2b.mtd_mf.toFixed(4),
        b2b.mtd_cob.toFixed(4),
        b2b.mtd_aif.toFixed(4),
        b2b.mtd_alt.toFixed(4),
        b2b.mtd_total.toFixed(4),
        ytd_mf.toFixed(4),
        ytd_cob.toFixed(4),
        ytd_aif.toFixed(4),
        ytd_alt.toFixed(4),
        ytd_total.toFixed(4),
        '', // MTD Target — not yet available
        '', // QTD Target — not yet available
        '', // YTD Target — not yet available
      ] : Array(18).fill('');

      // B2C columns — match by work_email (advisor column stores emails)
      const b2c = b2cMap.get(emailKey);
      const b2cCols = b2c ? [
        b2c['team'] || '',
        toI(b2c['assigned_leads']),
        toN(b2c['net_inflow_mtd[cr]']),
        toN(b2c['net_inflow_ytd[cr]']),
        toN(b2c['current_aum_mtm [cr.]']),
        toN(b2c['aum_growth_mtm %'], 2),
        toN(b2c['new_sip_inflow_mtd[cr.]']),
        toN(b2c['new_sip_inflow_ytd[cr.]']),
        toN(b2c['total_sip_inflow_mtd[cr.]']),
        toN(b2c['total_sip_inflow_ytd[cr.]']),
        toN(b2c['gross_lumpsum_inflow_mtd[cr.]']),
        toN(b2c['gross_lumpsum_inflow_ytd[cr.]']),
        toN(b2c['total_outflow_mtd[cr.]']),
        toN(b2c['total_outflow_ytd[cr.]']),
        toN(b2c['msci_inflow_mtd[cr.]']),
        toN(b2c['msci_inflow_ytd[cr.]']),
        toN(b2c['fd_inflow_mtd[cr.]']),
        toN(b2c['fd_inflow_ytd[cr.]']),
        toN(b2c['total_sip_book_ao_31stmarch[cr.]']),
        toN(b2c['assigned_aum_ao_31stmarch[cr.]']),
        toN(b2c['ytd_net_aum_growth %'], 2),
        '', // MTD Target — not yet available
        '', // QTD Target — not yet available
        '', // YTD Target — not yet available
      ] : Array(24).fill('');

      return [...identity, ...b2bCols, ...b2cCols];
    });

    // Serialize
    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...csvRows.map(row => row.map(escapeCsv).join(',')),
    ];
    const csv = csvLines.join('\r\n');

    // Log the export action
    try {
      await supabaseAdmin.from('activity_logs').insert({
        user_id: sessionData.userId,
        action_type: 'employee_export_csv',
        action_details: {
          tier: adminRole.tier,
          vertical: adminRole.vertical || 'all',
          row_count: csvRows.length,
          allowed_bus: allowedBUs || 'all',
        },
      });
    } catch (_) {}

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Sales Dashboard Report.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[EXPORT SALES REPORT]', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
