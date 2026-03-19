// GET  /api/admin/sheet-configs  — return all 3 MIS sync configs
// POST /api/admin/sheet-configs  — update one config (source_key + sheet_url + tab_name + notes)
//
// The admin pastes a full Google Sheet URL; this route extracts the sheet ID automatically.
// The sheet ID is stored in sheet_sync_configs and used by the sync routes.

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
      .from('admin_roles').select('tier, roles').eq('email', user.email).eq('is_active', true).single();
    if (!role) return null;
    return { userId: session.userId, email: user.email, tier: role.tier, roles: role.roles };
  } catch {
    return null;
  }
}

// Only dev/super/co admins can update sheet configs (not vertical admins)
function canManageSheetConfigs(tier: string): boolean {
  return ['dev', 'super', 'co'].includes(tier);
}

// Vertical admins with relevant roles can trigger syncs but not edit configs
function canTriggerSync(tier: string, roles: number[]): boolean {
  if (['dev', 'super', 'co'].includes(tier)) return true;
  // B2B vertical can trigger B2B sync; B2C can trigger B2C
  if (tier === 'vertical-B2B' && (roles.includes(1) || roles.includes(2))) return true;
  if (tier === 'vertical-B2C' && roles.includes(3)) return true;
  return false;
}

// ── Extract sheet ID from a Google Sheets URL ─────────────────────────────────
// Handles URLs like:
//   https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=...
//   https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=...
//   SHEET_ID (bare ID pasted directly)

function extractSheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Try to extract from full URL
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // If it looks like a bare ID (alphanumeric + _ -)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// ── GET — return all configs ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('sheet_sync_configs')
    .select('*')
    .order('source_key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configs: data ?? [] });
}

// ── POST — update one config ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!canManageSheetConfigs(session.tier)) {
    return NextResponse.json({ error: 'Insufficient permissions — dev/super/co admin required' }, { status: 403 });
  }

  const body = await request.json();
  const { source_key, sheet_url, tab_name, notes, is_active } = body;

  if (!source_key) {
    return NextResponse.json({ error: 'source_key is required' }, { status: 400 });
  }

  // Extract sheet ID from URL
  const sheet_id = extractSheetId(sheet_url ?? '');
  if (sheet_url && !sheet_id) {
    return NextResponse.json({
      error: 'Could not extract sheet ID from the URL. Paste the full Google Sheets URL or just the sheet ID.',
    }, { status: 400 });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: session.email,
  };

  if (sheet_url !== undefined) updates.sheet_url = sheet_url;
  if (sheet_id !== undefined)  updates.sheet_id  = sheet_id;
  if (tab_name !== undefined)  updates.tab_name  = tab_name;
  if (notes !== undefined)     updates.notes     = notes;
  if (is_active !== undefined) updates.is_active = is_active;

  // Auto-activate if a valid sheet_id is being set
  if (sheet_id) updates.is_active = true;

  const { data, error } = await supabaseAdmin
    .from('sheet_sync_configs')
    .update(updates)
    .eq('source_key', source_key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    config: data,
    extracted_sheet_id: sheet_id,
  });
}
