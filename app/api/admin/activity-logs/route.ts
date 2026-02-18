import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ALLOWED_TIERS = ['dev', 'super', 'co'];

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const sessionData = JSON.parse(sessionCookie.value);

    // 1. Verify caller is an authorized admin (dev, super, or co)
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles')
      .select('tier')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();

    if (!adminRole || !ALLOWED_TIERS.includes(adminRole.tier)) {
      return NextResponse.json({ error: 'Access denied — Dev, Super, or CO Admin only' }, { status: 403 });
    }

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const page    = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit   = Math.min(100, parseInt(searchParams.get('limit') || '50'));
    const offset  = (page - 1) * limit;
    const search  = (searchParams.get('search') || '').trim();
    const filter  = searchParams.get('filter') || 'all'; // action_type filter

    // 3. Fetch activity logs with user join
    // We do two queries: count + paginated data
    let query = supabaseAdmin
      .from('activity_logs')
      .select(`
        id,
        user_id,
        employee_id,
        action_type,
        action_details,
        ip_address,
        created_at,
        user:users!activity_logs_user_id_fkey (
          email,
          employee:employees!users_employee_id_fkey (
            employee_number,
            full_name,
            business_unit,
            job_title
          )
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('action_type', filter);
    }

    const { data: logs, error: logsError, count } = await query
      .range(offset, offset + limit - 1);

    if (logsError) {
      // Fallback: join might not work if foreign key names differ — try without join
      const { data: plainLogs, error: plainError, count: plainCount } = await supabaseAdmin
        .from('activity_logs')
        .select('id, user_id, employee_id, action_type, action_details, ip_address, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (plainError) {
        return NextResponse.json({ error: 'Failed to fetch logs', details: plainError.message }, { status: 500 });
      }

      // Enrich with user info
      const userIds = [...new Set(plainLogs?.map(l => l.user_id).filter(Boolean))];
      const { data: usersData } = await supabaseAdmin
        .from('users')
        .select('id, email, employee_id, employee:employees!users_employee_id_fkey(employee_number, full_name, business_unit, job_title)')
        .in('id', userIds as string[]);

      const userMap = new Map((usersData || []).map(u => [u.id, u]));

      return NextResponse.json({
        logs: (plainLogs || []).map(log => ({
          ...log,
          user: userMap.get(log.user_id) || null,
        })),
        total: plainCount || 0,
        page,
        limit,
        totalPages: Math.ceil((plainCount || 0) / limit),
      });
    }

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
