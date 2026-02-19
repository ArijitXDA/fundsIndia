import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Business units that belong to a specific vertical
const VERTICAL_BUS = ['B2B', 'B2C', 'Private Wealth'];

interface SalesBreakdown {
  mfSifMsci: number;
  cob100: number;
  aifPmsLasDynamo: number;
  alternate: number;
  total: number;
}

function emptyBreakdown(): SalesBreakdown {
  return { mfSifMsci: 0, cob100: 0, aifPmsLasDynamo: 0, alternate: 0, total: 0 };
}

function addBreakdowns(a: SalesBreakdown, b: SalesBreakdown): SalesBreakdown {
  return {
    mfSifMsci:       a.mfSifMsci       + b.mfSifMsci,
    cob100:          a.cob100          + b.cob100,
    aifPmsLasDynamo: a.aifPmsLasDynamo + b.aifPmsLasDynamo,
    alternate:       a.alternate       + b.alternate,
    total:           a.total           + b.total,
  };
}

// Recursively collect all employee_numbers under a manager
function getAllReporteeIds(empNumber: string, empMap: Map<string, string[]>): string[] {
  const directReports = empMap.get(empNumber) || [];
  const all: string[] = [...directReports];
  for (const dr of directReports) {
    all.push(...getAllReporteeIds(dr, empMap));
  }
  return all;
}

// Normalise emp ID for B2B lookup: DB stores '2690', sales table stores 'W2690'
function b2bKey(id: string): string {
  return id.startsWith('W') ? id : `W${id}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    // 1. Fetch user + employee data
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*, employee:employees(*)')
      .eq('id', sessionData.userId)
      .single();

    if (userError || !user?.employee) {
      return NextResponse.json({ error: 'User or employee not found' }, { status: 404 });
    }

    const empNumber   = user.employee.employee_number;  // e.g. "2690" (no W prefix)
    const businessUnit = user.employee.business_unit;   // 'B2B' | 'B2C' | 'Private Wealth' | 'Corporate' | etc.
    const workEmail   = (user.employee.work_email || '').trim().toLowerCase();

    // 2. Fetch all B2B sales data (MTD + prior-months YTD) in parallel with B2C
    const [
      { data: currentMonth },
      { data: ytdData },
      { data: b2cRows },
      { data: allEmployees },
    ] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('*'),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select('*'),
      supabaseAdmin.from('b2c').select('*'),
      supabaseAdmin
        .from('employees')
        .select('employee_number, full_name, work_email, reporting_manager_emp_number, business_unit, employment_status')
        .neq('employment_status', 'Inactive'),
    ]);

    // 3. Build B2B sales map keyed by W-prefixed emp ID
    const b2bSalesMap = new Map<string, { mtd: SalesBreakdown; ytdPrev: SalesBreakdown; branch: string; zone: string }>();

    currentMonth?.forEach(row => {
      const id = String(row['RM Emp ID'] || '').trim();
      if (!id || id === '#N/A') return;
      if (!b2bSalesMap.has(id)) {
        b2bSalesMap.set(id, { mtd: emptyBreakdown(), ytdPrev: emptyBreakdown(), branch: row['Branch'] || '', zone: row['Zone'] || '' });
      }
      const e = b2bSalesMap.get(id)!;
      e.mtd.mfSifMsci       += parseFloat(row['MF+SIF+MSCI'] || 0) || 0;
      e.mtd.cob100          += parseFloat(row['COB (100%)'] || 0) || 0;
      e.mtd.aifPmsLasDynamo += parseFloat(row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0;
      e.mtd.alternate       += parseFloat(row['ALTERNATE'] || 0) || 0;
      e.mtd.total           += parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0;
    });

    ytdData?.forEach(row => {
      const id = String(row['RM Emp ID'] || '').trim();
      if (!id || id === '#N/A') return;
      if (!b2bSalesMap.has(id)) {
        b2bSalesMap.set(id, { mtd: emptyBreakdown(), ytdPrev: emptyBreakdown(), branch: row['Branch'] || '', zone: row['Zone'] || '' });
      }
      const e = b2bSalesMap.get(id)!;
      e.ytdPrev.mfSifMsci       += parseFloat(row['MF+SIF+MSCI'] || 0) || 0;
      e.ytdPrev.cob100          += parseFloat(row['SUM of COB (100%)'] || row['COB (100%)'] || 0) || 0;
      e.ytdPrev.aifPmsLasDynamo += parseFloat(row['SUM of AIF+PMS+LAS (TRAIL)'] || row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0;
      e.ytdPrev.alternate       += parseFloat(row['SUM of ALT'] || row['ALTERNATE'] || 0) || 0;
      e.ytdPrev.total           += parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0;
    });

    // 4. Build B2C map keyed by advisor email (lowercase)
    //    The b2c.advisor column stores work email addresses.
    const b2cByEmail = new Map<string, any>();
    b2cRows?.forEach(row => {
      const key = (row.advisor || '').trim().toLowerCase();
      if (!key) return;
      b2cByEmail.set(key, {
        netInflowMTD:   parseFloat(row['net_inflow_mtd[cr]']     || 0) || 0,
        netInflowYTD:   parseFloat(row['net_inflow_ytd[cr]']     || 0) || 0,
        currentAUM:     parseFloat(row['current_aum_mtm [cr.]']  || 0) || 0,
        aumGrowthPct:   parseFloat(row['aum_growth_mtm %']       || 0) || 0,
        assignedLeads:  parseFloat(row.assigned_leads            || 0) || 0,
        newSIPInflowYTD:parseFloat(row['new_sip_inflow_ytd[cr.]']|| 0) || 0,
        team: row.team || '',
      });
    });

    // 5. Check if user has direct B2B sales data
    //    Try W-prefixed key first (sales table format), then bare number
    const ownB2B = b2bSalesMap.get(b2bKey(empNumber)) ?? b2bSalesMap.get(empNumber);
    if (ownB2B) {
      const ytdTotal = addBreakdowns(ownB2B.mtd, ownB2B.ytdPrev);
      return NextResponse.json({
        type: 'direct',
        vertical: 'B2B',
        businessUnit,
        mtd: ownB2B.mtd,
        ytdTotal,
        branch: ownB2B.branch,
        zone: ownB2B.zone,
      });
    }

    // 6. Check if user has direct B2C sales data (match by work_email)
    const ownB2C = b2cByEmail.get(workEmail);
    if (ownB2C) {
      return NextResponse.json({
        type: 'direct',
        vertical: 'B2C',
        businessUnit,
        b2c: ownB2C,
      });
    }

    // 7. Build manager → direct reports map (from all active/working employees)
    const managerToReports = new Map<string, string[]>();
    allEmployees?.forEach(emp => {
      if (emp.reporting_manager_emp_number) {
        const existing = managerToReports.get(emp.reporting_manager_emp_number) || [];
        existing.push(emp.employee_number);
        managerToReports.set(emp.reporting_manager_emp_number, existing);
      }
    });

    // Get all reportees (recursively) under this employee
    const allReporteeIds = getAllReporteeIds(empNumber, managerToReports);

    if (allReporteeIds.length > 0) {
      // Sum B2B numbers across all downstream reportees
      let teamMtd = emptyBreakdown();
      let teamYtdTotal = emptyBreakdown();
      let b2bReporteeCount = 0;

      for (const rid of allReporteeIds) {
        const data = b2bSalesMap.get(b2bKey(rid)) ?? b2bSalesMap.get(rid);
        if (data) {
          teamMtd      = addBreakdowns(teamMtd, data.mtd);
          teamYtdTotal = addBreakdowns(teamYtdTotal, addBreakdowns(data.mtd, data.ytdPrev));
          b2bReporteeCount++;
        }
      }

      // Sum B2C numbers for downstream reportees (match by work_email)
      const reporteeEmailSet = new Set<string>();
      allEmployees?.forEach(emp => {
        if (allReporteeIds.includes(emp.employee_number) && emp.work_email) {
          reporteeEmailSet.add(emp.work_email.trim().toLowerCase());
        }
      });

      let b2cTeamNetInflowMTD  = 0;
      let b2cTeamNetInflowYTD  = 0;
      let b2cTeamCurrentAUM    = 0;
      let b2cTeamLeads         = 0;
      let b2cTeamNewSIPYTD     = 0;
      let b2cReporteeCount     = 0;

      b2cByEmail.forEach((data, email) => {
        if (reporteeEmailSet.has(email)) {
          b2cTeamNetInflowMTD += data.netInflowMTD;
          b2cTeamNetInflowYTD += data.netInflowYTD;
          b2cTeamCurrentAUM   += data.currentAUM;
          b2cTeamLeads        += data.assignedLeads;
          b2cTeamNewSIPYTD    += data.newSIPInflowYTD;
          b2cReporteeCount++;
        }
      });

      const hasB2BTeamData = b2bReporteeCount > 0;
      const hasB2CTeamData = b2cReporteeCount > 0;

      if (hasB2BTeamData || hasB2CTeamData) {
        return NextResponse.json({
          type: 'manager',
          businessUnit,
          reporteeCount: allReporteeIds.length,
          b2b: hasB2BTeamData ? {
            reporteeCount: b2bReporteeCount,
            mtd: teamMtd,
            ytdTotal: teamYtdTotal,
          } : null,
          b2c: hasB2CTeamData ? {
            reporteeCount: b2cReporteeCount,
            netInflowMTD:   b2cTeamNetInflowMTD,
            netInflowYTD:   b2cTeamNetInflowYTD,
            currentAUM:     b2cTeamCurrentAUM,
            assignedLeads:  b2cTeamLeads,
            newSIPInflowYTD: b2cTeamNewSIPYTD,
          } : null,
        });
      }
    }

    // 8. No personal or team data — support function employee
    //    Rule:
    //    (A) business_unit ∈ {B2B, B2C, Private Wealth}
    //        → show only that vertical's performance
    //    (B) any other business_unit (Corporate, Support Functions, etc.)
    //        → show full org-level performance (B2B + B2C)

    const isVerticalBU = VERTICAL_BUS.includes(businessUnit);

    // Compute vertical-scoped B2B totals
    // For B2B scope: all b2bSalesMap entries (they're all B2B RMs)
    let scopedB2BMTD    = emptyBreakdown();
    let scopedB2BYTDTot = emptyBreakdown();
    let b2bRMCount      = 0;
    b2bSalesMap.forEach(entry => {
      scopedB2BMTD    = addBreakdowns(scopedB2BMTD, entry.mtd);
      scopedB2BYTDTot = addBreakdowns(scopedB2BYTDTot, addBreakdowns(entry.mtd, entry.ytdPrev));
      b2bRMCount++;
    });

    // Compute vertical-scoped B2C totals
    let scopedB2CNetInflowMTD = 0;
    let scopedB2CNetInflowYTD = 0;
    let scopedB2CCurrentAUM   = 0;
    let b2cAdvisorCount       = 0;
    b2cByEmail.forEach(data => {
      scopedB2CNetInflowMTD += data.netInflowMTD;
      scopedB2CNetInflowYTD += data.netInflowYTD;
      scopedB2CCurrentAUM   += data.currentAUM;
      b2cAdvisorCount++;
    });

    if (isVerticalBU) {
      // (A) Vertical support function — show only their vertical's numbers
      if (businessUnit === 'B2B') {
        return NextResponse.json({
          type: 'vertical-support',
          businessUnit,
          vertical: 'B2B',
          label: 'B2B Vertical — Overall Performance',
          totalRMs: b2bRMCount,
          b2b: { mtd: scopedB2BMTD, ytdTotal: scopedB2BYTDTot },
        });
      }
      if (businessUnit === 'B2C') {
        return NextResponse.json({
          type: 'vertical-support',
          businessUnit,
          vertical: 'B2C',
          label: 'B2C Vertical — Overall Performance',
          totalAdvisors: b2cAdvisorCount,
          b2c: {
            netInflowMTD: scopedB2CNetInflowMTD,
            netInflowYTD: scopedB2CNetInflowYTD,
            currentAUM:   scopedB2CCurrentAUM,
          },
        });
      }
      if (businessUnit === 'Private Wealth') {
        // PW data not yet in system — show placeholder
        return NextResponse.json({
          type: 'vertical-support',
          businessUnit,
          vertical: 'PW',
          label: 'Private Wealth — Overall Performance',
          b2b: null,
          b2c: null,
        });
      }
    }

    // (B) Non-vertical employee (Corporate, Support Functions, Group CEO, etc.)
    //     → full org-level performance
    return NextResponse.json({
      type: 'non-sales',
      businessUnit,
      totalB2BRMs:      b2bRMCount,
      totalB2CAdvisors: b2cAdvisorCount,
      b2b: { mtd: scopedB2BMTD, ytdTotal: scopedB2BYTDTot },
      b2c: {
        netInflowMTD: scopedB2CNetInflowMTD,
        netInflowYTD: scopedB2CNetInflowYTD,
        currentAUM:   scopedB2CCurrentAUM,
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
