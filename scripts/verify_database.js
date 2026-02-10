// Verify Database has employee data
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './rnr-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Verifying Database...\n');

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'YOUR_SERVICE_ROLE_KEY_HERE') {
  console.error('❌ Environment variables not configured!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function verifyDatabase() {
  try {
    // Check employees count
    const { data: empCount, error: empError } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true });

    if (empError) {
      console.log('❌ Error accessing employees table:', empError.message);
      return;
    }

    console.log('✅ Employees Table');
    console.log(`   Total employees: ${empCount || 0}`);

    // Check users count
    const { data: userCount, error: userError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (userError) {
      console.log('❌ Error accessing users table:', userError.message);
    } else {
      console.log('\n✅ Users Table');
      console.log(`   Total users: ${userCount || 0}`);
    }

    // Get sample employees
    const { data: sampleEmps, error: sampleError } = await supabase
      .from('employees')
      .select('employee_number, full_name, work_email, business_unit, job_title')
      .limit(10);

    if (sampleEmps && sampleEmps.length > 0) {
      console.log('\n📋 Sample Employees:');
      console.log('─────────────────────────────────────────────────────────');
      sampleEmps.forEach((emp, i) => {
        console.log(`${i + 1}. ${emp.full_name} (${emp.employee_number})`);
        console.log(`   Email: ${emp.work_email}`);
        console.log(`   ${emp.business_unit} - ${emp.job_title}`);
        console.log('');
      });
    }

    // Check for users
    const { data: sampleUsers, error: usersError } = await supabase
      .from('users')
      .select('email, role, employees(full_name, employee_number)')
      .limit(5);

    if (sampleUsers && sampleUsers.length > 0) {
      console.log('👥 Sample Users:');
      console.log('─────────────────────────────────────────────────────────');
      sampleUsers.forEach((user, i) => {
        console.log(`${i + 1}. ${user.email} (${user.role})`);
        console.log(`   Name: ${user.employees?.full_name || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('\n⚠️  No users found!');
      console.log('   Need to create user accounts for employees.');
      console.log('   Run: node create_users_for_employees.js\n');
    }

    // Check role distribution
    const { data: roleStats, error: roleError } = await supabase
      .from('users')
      .select('role');

    if (roleStats && roleStats.length > 0) {
      const roleCounts = roleStats.reduce((acc, { role }) => {
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      console.log('📊 User Role Distribution:');
      console.log('─────────────────────────────────────────────────────────');
      Object.entries(roleCounts).forEach(([role, count]) => {
        console.log(`   ${role}: ${count}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyDatabase();
