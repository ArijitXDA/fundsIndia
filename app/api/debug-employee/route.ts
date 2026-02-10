import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeNumber = searchParams.get('employeeNumber') || 'W2225A';

    const results: any = {};

    // 1. Check if employee exists by number
    const { data: byNumber, error: err1 } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, work_email, business_unit, reporting_manager_emp_number')
      .eq('employee_number', employeeNumber);

    results.employeeByNumber = { data: byNumber, error: err1 };

    // 2. Search by name
    const { data: byName, error: err2 } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, work_email, business_unit, reporting_manager_emp_number')
      .ilike('full_name', '%akshay%sapru%');

    results.employeeByName = { data: byName, error: err2 };

    // 3. Check users table
    const { data: userRecord, error: err3 } = await supabaseAdmin
      .from('users')
      .select('email, employee_number, full_name')
      .or('email.ilike.%akshay%,email.eq.akshay.sapru@fundsindia.com');

    results.userRecord = { data: userRecord, error: err3 };

    // 4. Check direct reports
    const { data: directReports, error: err4 } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, business_unit')
      .eq('reporting_manager_emp_number', employeeNumber)
      .limit(10);

    results.directReports = { data: directReports, error: err4 };

    // 5. Total count
    const { count, error: err5 } = await supabaseAdmin
      .from('employees')
      .select('*', { count: 'exact', head: true });

    results.totalEmployees = { count, error: err5 };

    // 6. Check what org-hierarchy API returns for this employee
    const { data: allEmployees } = await supabaseAdmin
      .from('employees')
      .select('*')
      .order('employee_number');

    const enrichedEmployees = allEmployees?.map((emp: any) => ({
      employeeNumber: emp.employee_number,
      name: emp.full_name,
      reportingManagerEmpNo: emp.reporting_manager_emp_number,
    }));

    const currentEmployee = enrichedEmployees?.find(e => e.employeeNumber === employeeNumber);

    results.orgHierarchyCheck = {
      currentEmployee,
      foundInEmployees: !!currentEmployee,
    };

    return NextResponse.json({
      success: true,
      searchedFor: employeeNumber,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
