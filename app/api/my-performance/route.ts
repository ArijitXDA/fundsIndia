import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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
    mfSifMsci: a.mfSifMsci + b.mfSifMsci,
    cob100: a.cob100 + b.cob100,
    aifPmsLasDynamo: a.aifPmsLasDynamo + b.aifPmsLasDynamo,
    alternate: a.alternate + b.alternate,
    total: a.total + b.total,
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

    const empNumber = user.employee.employee_number;
    const businessUnit = user.employee.business_unit;

    // 2. Fetch all B2B sales data (current month + YTD)
    const [{ data: currentMonth }, { data: ytdData }] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('*'),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select('*'),
    ]);

    // 3. Build B2B sales map by employee ID
    const b2bSalesMap = new Map<string, { mtd: SalesBreakdown; ytdPrev: SalesBreakdown; branch: string; zone: string }>();

    currentMonth?.forEach(row => {
      const empId = row['RM Emp ID'];
      if (!empId || empId === '#N/A') return;
      if (!b2bSalesMap.has(empId)) {
        b2bSalesMap.set(empId, { mtd: emptyBreakdown(), ytdPrev: emptyBreakdown(), branch: row['Branch'] || '', zone: row['Zone'] || '' });
      }
      const entry = b2bSalesMap.get(empId)!;
      entry.mtd.mfSifMsci += parseFloat(row['MF+SIF+MSCI'] || 0);
      entry.mtd.cob100 += parseFloat(row['COB (100%)'] || 0);
      entry.mtd.aifPmsLasDynamo += parseFloat(row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0);
      entry.mtd.alternate += parseFloat(row['ALTERNATE'] || 0);
      entry.mtd.total += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
    });

    ytdData?.forEach(row => {
      const empId = row['RM Emp ID'];
      if (!empId || empId === '#N/A') return;
      if (!b2bSalesMap.has(empId)) {
        b2bSalesMap.set(empId, { mtd: emptyBreakdown(), ytdPrev: emptyBreakdown(), branch: row['Branch'] || '', zone: row['Zone'] || '' });
      }
      const entry = b2bSalesMap.get(empId)!;
      entry.ytdPrev.mfSifMsci += parseFloat(row['MF+SIF+MSCI'] || 0);
      entry.ytdPrev.cob100 += parseFloat(row['COB (100%)'] || 0);
      entry.ytdPrev.aifPmsLasDynamo += parseFloat(row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0);
      entry.ytdPrev.alternate += parseFloat(row['ALTERNATE'] || 0);
      entry.ytdPrev.total += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
    });

    // 4. Fetch B2C data
    const { data: b2cRows } = await supabaseAdmin.from('b2c').select('*');
    const b2cByAdvisor = new Map<string, any>();
    b2cRows?.forEach(row => {
      const advisor = (row.advisor || '').trim().toLowerCase();
      if (!advisor) return;
      b2cByAdvisor.set(advisor, {
        netInflowMTD: parseFloat(row['net_inflow_mtd[cr]'] || 0),
        netInflowYTD: parseFloat(row['net_inflow_ytd[cr]'] || 0),
        currentAUM: parseFloat(row['current_aum_mtm [cr.]'] || 0),
        aumGrowthPct: parseFloat(row['aum_growth_mtm %'] || 0),
        assignedLeads: parseFloat(row.assigned_leads || 0),
        newSIPInflowYTD: parseFloat(row['new_sip_inflow_ytd[cr.]'] || 0),
        team: row.team || '',
      });
    });

    // 5. Check if user has direct B2B sales data
    const ownB2B = b2bSalesMap.get(empNumber);
    if (ownB2B) {
      const ytdTotal = addBreakdowns(ownB2B.mtd, ownB2B.ytdPrev);
      return NextResponse.json({
        type: 'direct',
        vertical: 'B2B',
        mtd: ownB2B.mtd,
        ytdTotal,
        branch: ownB2B.branch,
        zone: ownB2B.zone,
      });
    }

    // 6. Check if user has direct B2C sales data (match by full_name)
    const employeeName = (user.employee.full_name || '').trim().toLowerCase();
    const ownB2C = b2cByAdvisor.get(employeeName);
    if (ownB2C) {
      return NextResponse.json({
        type: 'direct',
        vertical: 'B2C',
        b2c: ownB2C,
      });
    }

    // 7. User has no direct data — check if they are a manager
    // Fetch all employees to build the reporting tree
    const { data: allEmployees } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, reporting_manager_emp_number, business_unit, employment_status')
      .eq('employment_status', 'Active');

    // Build manager → direct reports map
    const managerToReports = new Map<string, string[]>();
    allEmployees?.forEach(emp => {
      if (emp.reporting_manager_emp_number) {
        const existing = managerToReports.get(emp.reporting_manager_emp_number) || [];
        existing.push(emp.employee_number);
        managerToReports.set(emp.reporting_manager_emp_number, existing);
      }
    });

    // Get all reportees (recursively) under this manager
    const allReporteeIds = getAllReporteeIds(empNumber, managerToReports);

    if (allReporteeIds.length > 0) {
      // Check B2B reportees
      let teamMtd = emptyBreakdown();
      let teamYtdTotal = emptyBreakdown();
      let b2bReporteeCount = 0;

      for (const rid of allReporteeIds) {
        const data = b2bSalesMap.get(rid);
        if (data) {
          teamMtd = addBreakdowns(teamMtd, data.mtd);
          const ytd = addBreakdowns(data.mtd, data.ytdPrev);
          teamYtdTotal = addBreakdowns(teamYtdTotal, ytd);
          b2bReporteeCount++;
        }
      }

      // Check B2C reportees (match by name)
      const reporteeNameMap = new Map<string, string>();
      allEmployees?.forEach(emp => {
        if (allReporteeIds.includes(emp.employee_number)) {
          reporteeNameMap.set((emp.full_name || '').trim().toLowerCase(), emp.employee_number);
        }
      });

      let b2cTeamNetInflowMTD = 0;
      let b2cTeamNetInflowYTD = 0;
      let b2cTeamCurrentAUM = 0;
      let b2cTeamLeads = 0;
      let b2cTeamNewSIPYTD = 0;
      let b2cReporteeCount = 0;

      b2cByAdvisor.forEach((data, advisorName) => {
        if (reporteeNameMap.has(advisorName)) {
          b2cTeamNetInflowMTD += data.netInflowMTD;
          b2cTeamNetInflowYTD += data.netInflowYTD;
          b2cTeamCurrentAUM += data.currentAUM;
          b2cTeamLeads += data.assignedLeads;
          b2cTeamNewSIPYTD += data.newSIPInflowYTD;
          b2cReporteeCount++;
        }
      });

      const hasB2BTeamData = b2bReporteeCount > 0;
      const hasB2CTeamData = b2cReporteeCount > 0;

      if (hasB2BTeamData || hasB2CTeamData) {
        return NextResponse.json({
          type: 'manager',
          reporteeCount: allReporteeIds.length,
          b2b: hasB2BTeamData ? {
            reporteeCount: b2bReporteeCount,
            mtd: teamMtd,
            ytdTotal: teamYtdTotal,
          } : null,
          b2c: hasB2CTeamData ? {
            reporteeCount: b2cReporteeCount,
            netInflowMTD: b2cTeamNetInflowMTD,
            netInflowYTD: b2cTeamNetInflowYTD,
            currentAUM: b2cTeamCurrentAUM,
            assignedLeads: b2cTeamLeads,
            newSIPInflowYTD: b2cTeamNewSIPYTD,
          } : null,
        });
      }
    }

    // 8. Non-sales employee — compute org-level totals
    let orgMtdTotal = emptyBreakdown();
    let orgYtdTotal = emptyBreakdown();
    b2bSalesMap.forEach(entry => {
      orgMtdTotal = addBreakdowns(orgMtdTotal, entry.mtd);
      const ytd = addBreakdowns(entry.mtd, entry.ytdPrev);
      orgYtdTotal = addBreakdowns(orgYtdTotal, ytd);
    });

    let orgB2CNetInflowMTD = 0;
    let orgB2CNetInflowYTD = 0;
    let orgB2CCurrentAUM = 0;
    b2cByAdvisor.forEach(data => {
      orgB2CNetInflowMTD += data.netInflowMTD;
      orgB2CNetInflowYTD += data.netInflowYTD;
      orgB2CCurrentAUM += data.currentAUM;
    });

    return NextResponse.json({
      type: 'non-sales',
      totalB2BRMs: b2bSalesMap.size,
      totalB2CAdvisors: b2cByAdvisor.size,
      b2b: {
        mtd: orgMtdTotal,
        ytdTotal: orgYtdTotal,
      },
      b2c: {
        netInflowMTD: orgB2CNetInflowMTD,
        netInflowYTD: orgB2CNetInflowYTD,
        currentAUM: orgB2CCurrentAUM,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message,
    }, { status: 500 });
  }
}
