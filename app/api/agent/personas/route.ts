// GET  /api/agent/personas      — list all personas (dev admin only)
// POST /api/agent/personas      — create new persona (dev admin only)
// PUT  /api/agent/personas      — update persona    (dev admin only)
// DELETE /api/agent/personas    — delete persona    (dev admin only)

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
    .select('tier, can_impersonate')
    .eq('email', user.email)
    .eq('is_active', true)
    .single();

  // Only dev admins can manage agent personas
  if (!role || role.tier !== 'dev') return null;
  return { userId, email: user.email, role };
}

// ── GET — list all personas ───────────────────────────────────
export async function GET(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('agent_personas')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ personas: data });
}

// ── POST — create persona ─────────────────────────────────────
export async function POST(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const body = await request.json();
  const {
    name, description,
    model = 'gpt-4o', temperature = 0.70, top_p = 0.90,
    max_tokens = 1500, presence_penalty = 0.00, frequency_penalty = 0.00,
    agent_name = 'FundsAgent', tone = 'professional',
    output_format = 'conversational', language = 'en',
    can_proactively_surface_insights = true,
    can_make_recommendations = true,
    can_do_forecasting = false,
    can_suggest_contest_strategy = false,
    can_discuss_org_structure = false,
    system_prompt_override,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Persona name is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('agent_personas')
    .insert({
      name: name.trim(), description,
      model, temperature, top_p, max_tokens,
      presence_penalty, frequency_penalty,
      agent_name, tone, output_format, language,
      can_proactively_surface_insights,
      can_make_recommendations,
      can_do_forecasting,
      can_suggest_contest_strategy,
      can_discuss_org_structure,
      system_prompt_override: system_prompt_override || null,
      created_by: admin.userId,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ persona: data }, { status: 201 });
}

// ── PUT — update persona ──────────────────────────────────────
export async function PUT(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('agent_personas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ persona: data });
}

// ── DELETE — delete persona ───────────────────────────────────
export async function DELETE(request: NextRequest) {
  const admin = await getDevAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Dev admin access required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Nullify persona_id on any access rows using this persona before deleting
  await supabaseAdmin
    .from('agent_access')
    .update({ persona_id: null })
    .eq('persona_id', id);

  const { error } = await supabaseAdmin
    .from('agent_personas')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
