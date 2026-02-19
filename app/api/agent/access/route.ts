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

// ── GET — list all access records with employee + persona details ─
export async function GET(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('agent_access')
    .select(`
      *,
      employee:employees(id, employee_number, full_name, work_email, job_title, business_unit),
      persona:agent_personas(id, name, tone, model, temperature)
    `)
    .order('granted_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ access: data });
}

// ── POST — grant agent access to an employee ──────────────────
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
    // Live schema uses the full capability names as column names
    override_can_proactively_surface_insights,
    override_can_make_recommendations,
    show_widget_on_dashboard = true,
    widget_greeting,
  } = body;

  if (!employee_id) {
    return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
  }

  // Upsert — if employee already has access, update instead of error
  const { data, error } = await supabaseAdmin
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
      show_widget_on_dashboard,
      widget_greeting: widget_greeting || null,
      is_active: true,
      granted_by: admin.userId,
      granted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' })
    .select(`
      *,
      employee:employees(id, employee_number, full_name, work_email, job_title, business_unit),
      persona:agent_personas(id, name, tone, model, temperature)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ access: data }, { status: 201 });
}

// ── PUT — update access record ────────────────────────────────
export async function PUT(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('agent_access')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`
      *,
      employee:employees(id, employee_number, full_name, work_email, job_title, business_unit),
      persona:agent_personas(id, name, tone, model, temperature)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ access: data });
}

// ── DELETE — revoke access ────────────────────────────────────
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
