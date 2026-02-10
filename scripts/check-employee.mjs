import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmployee() {
  console.log('=== Checking Employee W2225A (Akshay Sapru) ===\n');

  // 1. Check if W2225A exists in employees table
  const { data: employeeByNumber, error: err1 } = await supabase
    .from('employees')
    .select('employee_number, full_name, work_email, business_unit, reporting_manager_emp_number')
    .eq('employee_number', 'W2225A');

  console.log('1. Employee with number W2225A:');
  console.log(JSON.stringify(employeeByNumber, null, 2));
  if (err1) console.error('Error:', err1);

  // 2. Search for Akshay Sapru by name
  const { data: employeeByName, error: err2 } = await supabase
    .from('employees')
    .select('employee_number, full_name, work_email, business_unit, reporting_manager_emp_number')
    .ilike('full_name', '%akshay%sapru%');

  console.log('\n2. Employees with name matching "Akshay Sapru":');
  console.log(JSON.stringify(employeeByName, null, 2));
  if (err2) console.error('Error:', err2);

  // 3. Check users table for Akshay
  const { data: userRecord, error: err3 } = await supabase
    .from('users')
    .select('email, employee_number, full_name')
    .or('email.ilike.%akshay%,email.eq.akshay.sapru@fundsindia.com');

  console.log('\n3. User record for Akshay:');
  console.log(JSON.stringify(userRecord, null, 2));
  if (err3) console.error('Error:', err3);

  // 4. Check who reports to W2225A
  const { data: directReports, error: err4 } = await supabase
    .from('employees')
    .select('employee_number, full_name, business_unit')
    .eq('reporting_manager_emp_number', 'W2225A')
    .limit(10);

  console.log('\n4. Employees reporting to W2225A:');
  console.log(JSON.stringify(directReports, null, 2));
  if (err4) console.error('Error:', err4);

  // 5. Total employee count
  const { count, error: err5 } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true });

  console.log('\n5. Total employees in table:', count);
  if (err5) console.error('Error:', err5);
}

checkEmployee().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
