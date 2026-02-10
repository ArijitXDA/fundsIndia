import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Test database connection
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('count', { count: 'exact', head: true });

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('count', { count: 'exact', head: true });

    // Test specific user
    const { data: testUser, error: testUserError } = await supabaseAdmin
      .from('users')
      .select('email, role')
      .eq('email', 'arijit.chowdhury@fundsindia.com')
      .single();

    return NextResponse.json({
      success: true,
      database: {
        employees: empError ? { error: empError.message } : { count: employees },
        users: userError ? { error: userError.message } : { count: users },
      },
      testUser: testUserError ? { error: testUserError.message } : testUser,
      env: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
