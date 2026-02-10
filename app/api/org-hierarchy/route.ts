import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    // Get all employees with their reporting structure
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('*')
      .order('employee_number');

    if (empError) {
      return NextResponse.json({
        error: 'Failed to fetch employees',
        details: empError,
      }, { status: 500 });
    }

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

    // Enrich employees with performance data
    const enrichedEmployees = employees?.map((emp: any) => {
      const perfByEmpId = performanceMap[emp.employee_number];
      const perfByEmail = performanceMap[emp.work_email];
      const performance = perfByEmpId || perfByEmail || null;

      return {
        id: emp.id,
        employeeNumber: emp.employee_number,
        name: emp.full_name,
        email: emp.work_email,
        mobile: emp.mobile_phone,
        designation: emp.job_title,
        businessUnit: emp.business_unit,
        reportingManagerEmpNo: emp.reporting_manager_emp_number,
        location: emp.location,
        ytdPerformance: performance?.ytd || '0.00',
        performanceType: performance?.type || null,
      };
    });

    // Find current employee
    const currentEmployee = employeeId
      ? enrichedEmployees?.find(e => e.employeeNumber === employeeId)
      : null;

    return NextResponse.json({
      success: true,
      employees: enrichedEmployees,
      currentEmployee,
      totalEmployees: enrichedEmployees?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
