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
      .select('can_assign_admins')
      .eq('email', callerUser.email)
      .eq('is_active', true)
      .single();

    if (!callerAdmin) {
      return NextResponse.json({ error: 'Not an admin' }, { status: 403 });
    }

    const { data: admins, error } = await supabaseAdmin
      .from('admin_roles')
      .select('id, employee_id, email, tier, vertical, roles, can_impersonate, can_assign_admins, assigned_by, created_at, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
    }

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('[LIST ADMINS] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
