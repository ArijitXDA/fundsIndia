// Verify Supabase Connection and Schema
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './rnr-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Verifying Supabase Configuration...\n');
console.log('Supabase URL:', supabaseUrl);
console.log('Service Key:', supabaseServiceKey ? '✅ Set' : '❌ Missing');
console.log('');

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

async function verifyDatabase() {
  try {
    console.log('📊 Checking database tables...\n');

    // Check employees table
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('count')
      .limit(1);

    if (empError) {
      console.log('❌ employees table:', empError.message);
    } else {
      console.log('✅ employees table: Exists');
    }

    // Check users table
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('email, role')
      .limit(5);

    if (userError) {
      console.log('❌ users table:', userError.message);
    } else {
      console.log('✅ users table: Exists');
      console.log(`   Found ${users?.length || 0} user(s)`);
      if (users && users.length > 0) {
        console.log('   Users:');
        users.forEach(u => console.log(`   - ${u.email} (${u.role})`));
      }
    }

    // Check sales_data table
    const { data: sales, error: salesError } = await supabase
      .from('sales_data')
      .select('count')
      .limit(1);

    if (salesError) {
      console.log('❌ sales_data table:', salesError.message);
    } else {
      console.log('✅ sales_data table: Exists');
    }

    // Check if test user exists
    console.log('\n👤 Checking for test user...');
    const { data: testUser, error: testError } = await supabase
      .from('users')
      .select('*, employees(*)')
      .eq('email', 'arijit.chowdhury@fundsindia.com')
      .single();

    if (testError || !testUser) {
      console.log('❌ Test user not found: arijit.chowdhury@fundsindia.com');
      console.log('   You need to run create_test_user.sql in Supabase SQL Editor');
    } else {
      console.log('✅ Test user exists: arijit.chowdhury@fundsindia.com');
      console.log('   Password: Test@123');
      console.log('   Role:', testUser.role);
    }

    console.log('\n✅ Database verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyDatabase();
