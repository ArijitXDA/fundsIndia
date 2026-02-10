// Create user accounts for all employees in database
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './rnr-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Default password for all users
const DEFAULT_PASSWORD = 'Pass@123';

console.log('═══════════════════════════════════════════');
console.log('🚀 Create Users for Existing Employees');
console.log('═══════════════════════════════════════════\n');

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

async function createUsers() {
  try {
    // Get all employees
    console.log('📖 Fetching all employees from database...\n');
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*')
      .order('employee_number');

    if (empError) {
      console.error('❌ Error fetching employees:', empError.message);
      return;
    }

    console.log(`✅ Found ${employees.length} employees\n`);

    // Hash password once
    console.log('🔐 Hashing default password...');
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    console.log('✅ Password hash generated\n');

    let created = 0;
    let skipped = 0;
    let errors = [];

    console.log('🚀 Creating user accounts...\n');

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];

      // Determine role
      let role = 'rm'; // Default
      const jobTitle = (emp.job_title || '').toLowerCase();
      const fullName = (emp.full_name || '').toLowerCase();

      if (emp.employee_number === 'W2661') {
        role = 'admin';
      } else if (fullName.includes('akshay sapru')) {
        role = 'group_ceo';
      } else if (jobTitle.includes('ceo') && emp.business_unit !== 'Corporate') {
        role = 'ceo';
      } else if (jobTitle.includes('manager') || jobTitle.includes('head')) {
        role = 'manager';
      }

      try {
        // Create user account
        const { data: user, error: userError } = await supabase
          .from('users')
          .upsert({
            employee_id: emp.id,
            email: emp.work_email,
            password_hash: passwordHash,
            is_first_login: false,
            role: role,
          }, {
            onConflict: 'email',
            ignoreDuplicates: false
          })
          .select();

        if (userError) {
          if (userError.message.includes('duplicate') || userError.code === '23505') {
            skipped++;
          } else {
            errors.push({ email: emp.work_email, error: userError.message });
            console.log(`❌ Error for ${emp.work_email}: ${userError.message}`);
          }
        } else {
          created++;
        }

        // Progress indicator
        if ((i + 1) % 100 === 0) {
          console.log(`✅ Processed ${i + 1}/${employees.length} employees...`);
        }

      } catch (err) {
        errors.push({ email: emp.work_email, error: err.message });
        console.log(`❌ Error processing ${emp.work_email}: ${err.message}`);
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 Summary');
    console.log('═══════════════════════════════════════════');
    console.log(`Total employees: ${employees.length}`);
    console.log(`✅ Users created: ${created}`);
    console.log(`⏭️  Users already existed: ${skipped}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log('═══════════════════════════════════════════\n');

    if (errors.length > 0) {
      console.log('❌ Errors:');
      errors.slice(0, 10).forEach(e => {
        console.log(`   ${e.email}: ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
      console.log('');
    }

    console.log('🎉 User creation complete!');
    console.log(`\n🔑 Default password for all users: ${DEFAULT_PASSWORD}\n`);

    // Verify
    const { data: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    console.log(`✅ Total users in database: ${userCount || 0}\n`);

    // Sample verification
    const { data: sample } = await supabase
      .from('users')
      .select('email, role, employees(full_name, employee_number)')
      .limit(5);

    if (sample && sample.length > 0) {
      console.log('👥 Sample users:');
      sample.forEach(u => {
        console.log(`   ${u.email} (${u.role}) - ${u.employees?.full_name}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

createUsers();
