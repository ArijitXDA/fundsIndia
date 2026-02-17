import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    // Get all employees with their reporting structure
    // Paginate to bypass PostgREST's server-side max_rows limit (default 1000)
    // DB has 1167+ employees so we must fetch in batches
    const PAGE_SIZE = 1000;
    let allEmployees: any[] = [];
    let totalCount: number | null = null;
    let page = 0;

    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: batch, error: batchError, count } = await supabaseAdmin
        .from('employees')
        .select('*', { count: page === 0 ? 'exact' : 'planned' })
        .order('employee_number')
        .range(from, to);

      if (batchError) {
        return NextResponse.json({
          error: 'Failed to fetch employees',
          details: batchError,
        }, { status: 500 });
      }

      if (page === 0 && count !== null) totalCount = count;
      if (batch && batch.length > 0) allEmployees = allEmployees.concat(batch);

      // Stop if we got fewer rows than PAGE_SIZE (last page) or no data
      if (!batch || batch.length < PAGE_SIZE) break;

      page++;
    }

    const employees = allEmployees;

    // Get B2B sales data
    const { data: b2bCurrent } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select('*');

    const { data: b2bYTD } = await supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select('*');

    // Get B2C data
    const { data: b2cData } = await supabaseAdmin
      .from('b2c')
      .select('*');

    // Create performance map
    const performanceMap: any = {};

    // Process B2B data
    if (b2bCurrent || b2bYTD) {
      const b2bMap: any = {};

      b2bCurrent?.forEach((row: any) => {
        const empId = row['RM Emp ID'];
        if (empId && empId !== '#N/A') {
          if (!b2bMap[empId]) b2bMap[empId] = { mtd: 0, ytd: 0 };
          b2bMap[empId].mtd += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
        }
      });

      b2bYTD?.forEach((row: any) => {
        const empId = row['RM Emp ID'];
        if (empId && empId !== '#N/A') {
          if (!b2bMap[empId]) b2bMap[empId] = { mtd: 0, ytd: 0 };
          b2bMap[empId].ytd += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
        }
      });

      Object.keys(b2bMap).forEach(empId => {
        performanceMap[empId] = {
          type: 'B2B',
          ytd: (b2bMap[empId].mtd + b2bMap[empId].ytd).toFixed(2),
          unit: 'Cr',
        };
      });
    }

    // Process B2C data (map by email)
    if (b2cData) {
      b2cData.forEach((row: any) => {
        const advisor = row.advisor;
        if (advisor) {
          performanceMap[advisor] = {
            type: 'B2C',
            ytd: parseFloat(row['net_inflow_ytd[cr]'] || 0).toFixed(2),
            unit: 'Cr',
          };
        }
      });
    }

    // Create a set of all valid employee numbers for validation
    const validEmployeeNumbers = new Set(employees?.map(e => e.employee_number) || []);

    // Enrich employees with performance data
    const enrichedEmployees = employees?.map((emp: any) => {
      const perfByEmpId = performanceMap[emp.employee_number];
      const perfByEmail = performanceMap[emp.work_email];
      const performance = perfByEmpId || perfByEmail || null;

      // Fix circular references: if employee reports to themselves, set to null
      let reportingManager = emp.reporting_manager_emp_number;
      if (reportingManager === emp.employee_number) {
        reportingManager = null;
      }

      // Fix broken references: if manager doesn't exist, set to null
      if (reportingManager && !validEmployeeNumbers.has(reportingManager)) {
        reportingManager = null;
      }

      return {
        id: emp.id,
        employeeNumber: emp.employee_number,
        name: emp.full_name,
        email: emp.work_email,
        mobile: emp.mobile_phone,
        designation: emp.job_title,
        businessUnit: emp.business_unit,
        reportingManagerEmpNo: reportingManager,
        location: emp.location,
        ytdPerformance: performance?.ytd || '0.00',
        performanceType: performance?.type || null,
      };
    });

    // Calculate aggregated YTD for each employee (self + all subordinates)
    const calculateTeamYTD = (empNo: string, visited = new Set<string>()): number => {
      if (visited.has(empNo)) return 0; // Prevent circular references
      visited.add(empNo);

      const employee = enrichedEmployees?.find(e => e.employeeNumber === empNo);
      if (!employee) return 0;

      // Start with own performance
      let total = parseFloat(employee.ytdPerformance || '0');

      // Add direct reports' team YTD (recursive)
      const directReports = enrichedEmployees?.filter(e => e.reportingManagerEmpNo === empNo) || [];
      directReports.forEach(report => {
        total += calculateTeamYTD(report.employeeNumber, new Set(visited));
      });

      return total;
    };

    // Add aggregated YTD to each employee
    const enrichedWithTeamYTD = enrichedEmployees?.map(emp => ({
      ...emp,
      teamYTD: calculateTeamYTD(emp.employeeNumber).toFixed(2),
    }));

    // Find current employee
    const currentEmployee = employeeId
      ? enrichedWithTeamYTD?.find(e => e.employeeNumber === employeeId)
      : null;

    // Debug info for W2225A
    const debugInfo = employeeId === 'W2225A' ? {
      requestedEmployeeId: employeeId,
      totalRawEmployees: employees?.length || 0,
      totalEnrichedEmployees: enrichedWithTeamYTD?.length || 0,
      totalCountInDB: totalCount,
      rawEmployeeExists: employees?.some(e => e.employee_number === 'W2225A'),
      enrichedEmployeeExists: enrichedWithTeamYTD?.some(e => e.employeeNumber === 'W2225A'),
      currentEmployeeFound: !!currentEmployee,
      currentEmployeeData: currentEmployee,
      // Check for similar employee numbers
      similarEmployeeNumbers: employees?.filter(e =>
        e.employee_number?.toLowerCase().includes('w2225') ||
        e.employee_number?.toLowerCase().includes('2225a')
      ).map(e => ({ empNo: e.employee_number, name: e.full_name })),
      // Check for Akshay by name
      akshayEmployees: employees?.filter(e =>
        e.full_name?.toLowerCase().includes('akshay') &&
        e.full_name?.toLowerCase().includes('sapru')
      ).map(e => ({ empNo: e.employee_number, name: e.full_name, manager: e.reporting_manager_emp_number })),
      // List all raw direct reports of W2225A
      rawDirectReports: employees?.filter(e => e.reporting_manager_emp_number === 'W2225A')
        .map(e => ({ empNo: e.employee_number, name: e.full_name })),
      // List all enriched direct reports of W2225A
      enrichedDirectReports: enrichedWithTeamYTD?.filter(e => e.reportingManagerEmpNo === 'W2225A')
        .map(e => ({ empNo: e.employeeNumber, name: e.name })),
    } : undefined;

    return NextResponse.json({
      success: true,
      employees: enrichedWithTeamYTD,
      currentEmployee,
      totalEmployees: enrichedWithTeamYTD?.length || 0,
      ...(debugInfo && { debug: debugInfo }),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
