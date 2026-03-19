// GET  /api/admin/hof-config   — list all quarter configs (newest first)
// POST /api/admin/hof-config   — create or update a quarter config
//
// Auth: any logged-in admin with role 11 (Contest management), or dev/super/co.
// Non-admin users (regular employees) cannot access this route.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAdminSession(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return null;
  try {
    const session = JSON.parse(sessionCookie.value);
    const { data: user } = await supabaseAdmin
      .from('users').select('email').eq('id', session.userId).single();
    if (!user) return null;
    const { data: role } = await supabaseAdmin
      .from('admin_roles')
      .select('tier, roles')
      .eq('email', user.email)
      .eq('is_active', true)
      .single();
    if (!role) return null;
    return { userId: session.userId, email: user.email, tier: role.tier, roles: role.roles as number[] };
  } catch {
    return null;
  }
}

function canManageContests(tier: string, roles: number[]): boolean {
  if (['dev', 'super', 'co'].includes(tier)) return true;
  return roles.includes(11);
}

// ── GET — list all quarter configs ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContests(session.tier, session.roles)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('hof_quarter_config')
    .select('*')
    .order('quarter_start', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quarters: data ?? [] });
}

// ── POST — create or update a quarter config ─────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContests(session.tier, session.roles)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const {
    id,                          // present → update; absent → create
    quarter_label,
    quarter_start,
    quarter_end,
    is_active,
    b2b_trail_target,
    b2b_fees_target,
    b2c_net_new_sales_target,
    b2c_net_new_sips_target,
    notes,
  } = body;

  if (!quarter_label || !quarter_start || !quarter_end) {
    return NextResponse.json(
      { error: 'quarter_label, quarter_start, and quarter_end are required' },
      { status: 400 }
    );
  }

  // If marking this quarter active, deactivate all others first
  if (is_active) {
    await supabaseAdmin
      .from('hof_quarter_config')
      .update({ is_active: false })
      .neq('id', id ?? '00000000-0000-0000-0000-000000000000');
  }

  const payload: Record<string, any> = {
    quarter_label,
    quarter_start,
    quarter_end,
    is_active:                  is_active ?? false,
    b2b_trail_target:           b2b_trail_target ?? 10,
    b2b_fees_target:            b2b_fees_target ?? 2.5,
    b2c_net_new_sales_target:   b2c_net_new_sales_target ?? 0,
    b2c_net_new_sips_target:    b2c_net_new_sips_target ?? 0,
    notes:                      notes ?? null,
    updated_at:                 new Date().toISOString(),
    updated_by:                 session.email,
  };

  let data, error;

  if (id) {
    // Update existing
    ({ data, error } = await supabaseAdmin
      .from('hof_quarter_config')
      .update(payload)
      .eq('id', id)
      .select()
      .single());
  } else {
    // Create new
    ({ data, error } = await supabaseAdmin
      .from('hof_quarter_config')
      .insert(payload)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, quarter: data });
}
