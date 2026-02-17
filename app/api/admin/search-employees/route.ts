import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    const { data: callerUser } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();

    if (!callerUser) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Verify caller is an admin
    const { data: callerAdmin } = await supabaseAdmin
      .from('admin_roles')
      .select('id')
      .eq('email', callerUser.email)
      .eq('is_active', true)
      .single();

    if (!callerAdmin) {
      return NextResponse.json({ error: 'Not an admin' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (query.length < 2) {
      return NextResponse.json({ employees: [] });
    }

    const { data: employees, error } = await supabaseAdmin
      .from('employees')
      .select('id, employee_number, full_name, work_email, business_unit, job_title')
      .or(`full_name.ilike.%${query}%,employee_number.ilike.%${query}%,work_email.ilike.%${query}%`)
      .limit(10);

    if (error) {
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('[SEARCH EMPLOYEES] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
