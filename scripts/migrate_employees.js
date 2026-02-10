// Migrate Employee Master Excel to Supabase
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './rnr-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'YOUR_SERVICE_ROLE_KEY_HERE') {
  console.error('❌ Environment variables not properly configured!');
  console.error('Please update .env.local with actual Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Default password for all users
const DEFAULT_PASSWORD = 'Pass@123';

async function migrateEmployees() {
  try {
    console.log('📖 Reading Employee Master Excel file...\n');

    // Read the Excel file
    const workbook = XLSX.readFile('Employee Master as on 09.02.2026.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const employees = XLSX.utils.sheet_to_json(worksheet);

    console.log(`✅ Found ${employees.length} employees in Excel file\n`);
    console.log('Sample row:', employees[0]);
    console.log('\n📊 Column names:', Object.keys(employees[0]).join(', '));
    console.log('\n');

    // Hash the default password once (same for all users)
    console.log('🔐 Hashing default password...');
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    console.log('✅ Password hash generated\n');

    let insertedEmployees = 0;
    let insertedUsers = 0;
    let errors = [];

    console.log('🚀 Starting migration...\n');

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];

      // Map Excel columns to database columns
      // Adjust these field names based on actual Excel column names
      const employeeData = {
        employee_number: emp['Employee Number'] || emp['Emp No'] || emp['EmpNo'],
        full_name: emp['Full Name'] || emp['Name'] || emp['Employee Name'],
        work_email: emp['Email'] || emp['Work Email'] || emp['Official Email'],
        gender: emp['Gender'],
        mobile_phone: emp['Mobile'] || emp['Phone'] || emp['Contact Number'],
        location: emp['Location'] || emp['City'] || emp['Office Location'],
        business_unit: emp['Business Unit'] || emp['BU'] || emp['Division'],
        department: emp['Department'] || emp['Dept'],
        sub_department: emp['Sub Department'] || emp['Sub Dept'],
        job_title: emp['Job Title'] || emp['Designation'] || emp['Position'],
        secondary_job_title: emp['Secondary Job Title'] || emp['Secondary Designation'],
        reporting_manager_emp_number: emp['Reporting Manager'] || emp['Manager Emp No'] || emp['Manager'],
        date_joined: emp['Date of Joining'] || emp['DOJ'] || emp['Joining Date'],
        employment_status: emp['Status'] || emp['Employment Status'] || 'Working',
        is_placeholder: false,
      };

      // Skip if no email
      if (!employeeData.work_email) {
        console.log(`⚠️  Skipping row ${i + 1}: No email found`);
        continue;
      }

      // Ensure email ends with @fundsindia.com
      if (!employeeData.work_email.includes('@')) {
        employeeData.work_email = `${employeeData.work_email}@fundsindia.com`;
      }

      try {
        // Insert employee
        const { data: employee, error: empError } = await supabase
          .from('employees')
          .upsert(employeeData, {
            onConflict: 'work_email',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (empError) {
          errors.push({ row: i + 1, email: employeeData.work_email, error: empError.message });
          console.log(`❌ Error inserting employee ${i + 1}: ${empError.message}`);
          continue;
        }

        insertedEmployees++;

        // Determine role
        let role = 'rm'; // Default
        const jobTitle = (employeeData.job_title || '').toLowerCase();

        if (employeeData.employee_number === 'W2661') {
          role = 'admin';
        } else if (jobTitle.includes('ceo') && employeeData.business_unit !== 'Corporate') {
          role = 'ceo';
        } else if ((employeeData.full_name || '').toLowerCase().includes('akshay sapru')) {
          role = 'group_ceo';
        } else if (jobTitle.includes('manager') || jobTitle.includes('head')) {
          role = 'manager';
        }

        // Create user account with default password
        const { data: user, error: userError } = await supabase
          .from('users')
          .upsert({
            employee_id: employee.id,
            email: employeeData.work_email,
            password_hash: passwordHash,
            is_first_login: false, // Set to false since we're using default password
            role: role,
          }, {
            onConflict: 'email',
            ignoreDuplicates: false
          })
          .select();

        if (userError) {
          errors.push({ row: i + 1, email: employeeData.work_email, error: userError.message });
          console.log(`❌ Error creating user ${i + 1}: ${userError.message}`);
        } else {
          insertedUsers++;
        }

        // Progress indicator
        if ((i + 1) % 50 === 0) {
          console.log(`✅ Processed ${i + 1}/${employees.length} employees...`);
        }

      } catch (err) {
        errors.push({ row: i + 1, email: employeeData.work_email, error: err.message });
        console.log(`❌ Error processing row ${i + 1}: ${err.message}`);
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 Migration Summary');
    console.log('═══════════════════════════════════════════');
    console.log(`Total rows in Excel: ${employees.length}`);
    console.log(`✅ Employees inserted/updated: ${insertedEmployees}`);
    console.log(`✅ Users created: ${insertedUsers}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log('═══════════════════════════════════════════\n');

    if (errors.length > 0) {
      console.log('❌ Errors encountered:');
      errors.slice(0, 10).forEach(e => {
        console.log(`   Row ${e.row} (${e.email}): ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }

    console.log('\n🎉 Migration complete!');
    console.log(`\n🔑 Default password for all users: ${DEFAULT_PASSWORD}`);
    console.log('   Users can login with: <email>@fundsindia.com / Pass@123\n');

    // Verify a sample user
    console.log('🔍 Verifying sample user...');
    const { data: sampleUser, error: verifyError } = await supabase
      .from('users')
      .select('email, role, employees(full_name, employee_number, business_unit)')
      .limit(1)
      .single();

    if (sampleUser) {
      console.log('✅ Sample user verified:');
      console.log('   Email:', sampleUser.email);
      console.log('   Role:', sampleUser.role);
      console.log('   Name:', sampleUser.employees?.full_name);
      console.log('   Employee #:', sampleUser.employees?.employee_number);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
console.log('═══════════════════════════════════════════');
console.log('🚀 FundsIndia RNR Dashboard - Employee Migration');
console.log('═══════════════════════════════════════════\n');

migrateEmployees();
