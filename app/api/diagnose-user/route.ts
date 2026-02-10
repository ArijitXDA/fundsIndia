import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');

    if (!sessionCookie) {
      return NextResponse.json({
        error: 'Not authenticated',
      }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    // 1. Get user record with employee join
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, employee_id, role, employee:employees(*)')
      .eq('id', sessionData.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({
        error: 'User not found',
        details: userError,
      }, { status: 404 });
    }

    // Handle employee join - it might be an object or array depending on relationship
    const employeeData = Array.isArray(user.employee) ? user.employee[0] : user.employee;

    const diagnosis: any = {
      userFound: true,
      userEmail: user.email,
      userRole: user.role,
      employeeIdInUsersTable: user.employee_id,
      employeeJoinSuccessful: !!employeeData,
    };

    if (employeeData) {
      diagnosis.employeeData = {
        employeeNumber: employeeData.employee_number,
        fullName: employeeData.full_name,
        workEmail: employeeData.work_email,
        businessUnit: employeeData.business_unit,
        jobTitle: employeeData.job_title,
        reportingManagerEmpNo: employeeData.reporting_manager_emp_number,
      };

      // Check if this employee number exists in org-hierarchy API
      const { data: orgData } = await supabaseAdmin
        .from('employees')
        .select('employee_number, full_name')
        .eq('employee_number', employeeData.employee_number);

      diagnosis.employeeFoundInOrgHierarchy = orgData && orgData.length > 0;

      // Check direct reports
      const { data: reports } = await supabaseAdmin
        .from('employees')
        .select('employee_number, full_name')
        .eq('reporting_manager_emp_number', employeeData.employee_number);

      diagnosis.directReportsCount = reports?.length || 0;
      diagnosis.directReports = reports;

      // Check if manager exists
      if (employeeData.reporting_manager_emp_number) {
        const { data: manager } = await supabaseAdmin
          .from('employees')
          .select('employee_number, full_name')
          .eq('employee_number', employeeData.reporting_manager_emp_number);

        diagnosis.managerExists = manager && manager.length > 0;
        diagnosis.managerData = manager?.[0];
      }
    } else {
      diagnosis.issue = 'Employee join failed - employee_id in users table may not point to valid employee record';

      // Try to find employee by email
      const { data: employeeByEmail } = await supabaseAdmin
        .from('employees')
        .select('*')
        .eq('work_email', user.email);

      if (employeeByEmail && employeeByEmail.length > 0) {
        diagnosis.employeeFoundByEmail = true;
        diagnosis.employeeByEmailData = {
          employeeNumber: employeeByEmail[0].employee_number,
          fullName: employeeByEmail[0].full_name,
          id: employeeByEmail[0].id,
        };
        diagnosis.suggestion = `Employee record found by email but not linked in users table. The employee_id in users table should be: ${employeeByEmail[0].id}`;
      } else {
        diagnosis.employeeFoundByEmail = false;
        diagnosis.suggestion = 'No employee record found. Please create an employee record for this user.';
      }
    }

    return NextResponse.json({
      success: true,
      diagnosis,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
