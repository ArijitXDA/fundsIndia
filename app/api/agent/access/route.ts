// GET    /api/agent/access          — list all access records (dev admin)
// POST   /api/agent/access          — grant agent access to an employee
// PUT    /api/agent/access          — update access record
// DELETE /api/agent/access?id=...   — revoke access

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function getDevAdmin(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return null;
  const { userId } = JSON.parse(sessionCookie.value);

  const { data: user } = await supabaseAdmin
    .from('users').select('email').eq('id', userId).single();
  if (!user) return null;

  const { data: role } = await supabaseAdmin
    .from('admin_roles')
    .select('tier')
    .eq('email', user.email)
    .eq('is_active', true)
    .single();

  if (!role || role.tier !== 'dev') return null;
  return { userId, email: user.email };
}

// ── Helper: hydrate access rows with employee + persona data ──────────────────
// Avoids PostgREST join syntax entirely (bypasses schema cache issues)
async function hydrateAccessRows(rows: any[]) {
  if (!rows || rows.length === 0) return [];

  // Collect unique IDs
  const employeeIds = [...new Set(rows.map(r => r.employee_id).filter(Boolean))];
  const personaIds  = [...new Set(rows.map(r => r.persona_id).filter(Boolean))];

  // Parallel lookups
  const [empResult, personaResult] = await Promise.all([
    employeeIds.length > 0
      ? supabaseAdmin
          .from('employees')
          .select('id, employee_number, full_name, work_email, job_title, business_unit')
          .in('id', employeeIds)
      : { data: [] },
    personaIds.length > 0
      ? supabaseAdmin
          .from('agent_personas')
          .select('id, name, tone, model, temperature')
          .in('id', personaIds)
      : { data: [] },
  ]);

  const empMap     = Object.fromEntries((empResult.data    ?? []).map((e: any) => [e.id, e]));
  const personaMap = Object.fromEntries((personaResult.data ?? []).map((p: any) => [p.id, p]));

  return rows.map(row => ({
    ...row,
    employee: empMap[row.employee_id]   ?? null,
    persona:  personaMap[row.persona_id] ?? null,
  }));
}

// ── GET — list all access records ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  // Use RPC to bypass PostgREST schema cache entirely
  const { data, error } = await supabaseAdmin.rpc('get_agent_access_all');

  if (error) {
    console.error('[agent/access GET] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as any[]) ?? [];
  // Sort by granted_at descending (RPC doesn't guarantee order)
  rows.sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime());

  const hydrated = await hydrateAccessRows(rows);
  return NextResponse.json({ access: hydrated });
}

// ── POST — grant agent access to an employee ──────────────────────────────────
export async function POST(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const body = await request.json();
  const {
    employee_id,
    persona_id,
    access_description = '',
    no_access_description = '',
    allowed_tables = [],
    denied_tables = [],
    column_filters = {},
    row_scope = {},
    // Real DB column names (from agent_access schema)
    override_can_proactively_surface_insights,
    override_can_make_recommendations,
    can_query_database = false,
    query_db_config = {},
    show_widget_on_dashboard = true,
    widget_greeting,
  } = body;

  if (!employee_id) {
    return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
  }

  // Upsert — if employee already has access, update instead of error
  const { error: upsertError } = await supabaseAdmin
    .from('agent_access')
    .upsert({
      employee_id,
      persona_id: persona_id || null,
      access_description,
      no_access_description,
      allowed_tables,
      denied_tables,
      column_filters,
      row_scope,
      override_can_proactively_surface_insights: override_can_proactively_surface_insights ?? null,
      override_can_make_recommendations: override_can_make_recommendations ?? null,
      can_query_database,
      query_db_config,
      show_widget_on_dashboard,
      widget_greeting: widget_greeting || null,
      is_active: true,
      granted_by: admin.userId,
      granted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' });

  if (upsertError) {
    console.error('[agent/access POST] Supabase error:', upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Fetch the saved row via RPC (bypasses schema cache)
  const { data: saved, error: fetchError } = await supabaseAdmin
    .rpc('get_agent_access_by_employee', { p_employee_id: employee_id });

  if (fetchError || !saved) {
    return NextResponse.json({ error: fetchError?.message ?? 'Failed to fetch saved record' }, { status: 500 });
  }

  const [hydrated] = await hydrateAccessRows([saved]);
  return NextResponse.json({ access: hydrated }, { status: 201 });
}

// ── PUT — update access record ────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error: updateError } = await supabaseAdmin
    .from('agent_access')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    console.error('[agent/access PUT] Supabase error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Fetch updated row via RPC — need employee_id from updates or existing record
  const employeeId = updates.employee_id;
  let savedRow: any = null;
  if (employeeId) {
    const { data: saved } = await supabaseAdmin
      .rpc('get_agent_access_by_employee', { p_employee_id: employeeId });
    savedRow = saved;
  } else {
    // Fallback: fetch all and find by id
    const { data: all } = await supabaseAdmin.rpc('get_agent_access_all');
    savedRow = (all as any[])?.find((r: any) => r.id === id) ?? null;
  }

  if (!savedRow) return NextResponse.json({ error: 'Failed to fetch updated record' }, { status: 500 });

  const [hydrated] = await hydrateAccessRows([savedRow]);
  return NextResponse.json({ access: hydrated });
}

// ── DELETE — revoke access ────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('agent_access')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
