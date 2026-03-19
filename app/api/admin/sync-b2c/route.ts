// POST /api/admin/sync-b2c
// Syncs B2C Advisory MIS data from Google Sheets into Supabase `b2c` table.
//
// The Google Sheet URL/ID is configured per-month by the admin in the admin panel.
// Called automatically by Vercel cron (daily 3 AM UTC) or manually via "Sync Now" button.
//
// Sync strategy: DESTRUCTIVE (DELETE all → INSERT new), matching existing Excel upload behaviour.
// Safety guard: if 0 rows fetched from sheet, sync is aborted — table is NOT cleared.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleAccessToken, fetchSheetRows } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 100;

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true;
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return false;
  try {
    const session = JSON.parse(sessionCookie.value);
    return !!session.userId;
  } catch {
    return false;
  }
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function toNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '#N/A') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Column mapper ─────────────────────────────────────────────────────────────
// Column names match the B2C MIS Google Sheet tab — same as the existing Excel upload route.
// The Google Sheet is expected to use the same header row as the Excel file.

function mapB2cRow(row: Record<string, string>) {
  return {
    'team':                                    String(row['team'] ?? '').trim(),
    'advisor':                                 String(row['advisor'] ?? '').trim().toLowerCase(),
    'assigned_leads':                          toNum(row['assigned_leads']),
    'total_sip_book_ao_31stmarch[cr.]':        toNum(row['total_sip_book_ao_31stmarch[cr.]']),
    'assigned_aum_ao_31stmarch[cr.]':          toNum(row['assigned_aum_ao_31stmarch[cr.]']),
    'ytd_net_aum_growth %':                    toNum(row['ytd_net_aum_growth %']),
    'net_inflow_mtd[cr]':                      toNum(row['net_inflow_mtd[cr]']),
    'net_inflow_ytd[cr]':                      toNum(row['net_inflow_ytd[cr]']),
    'gross_lumpsum_inflow_mtd[cr.]':           toNum(row['gross_lumpsum_inflow_mtd[cr.]']),
    'gross_lumpsum_inflow_ytd[cr.]':           toNum(row['gross_lumpsum_inflow_ytd[cr.]']),
    'total_sip_inflow_mtd[cr.]':               toNum(row['total_sip_inflow_mtd[cr.]']),
    'total_sip_inflow_ytd[cr.]':               toNum(row['total_sip_inflow_ytd[cr.]']),
    'new_sip_inflow_mtd[cr.]':                 toNum(row['new_sip_inflow_mtd[cr.]']),
    'new_sip_inflow_ytd[cr.]':                 toNum(row['new_sip_inflow_ytd[cr.]']),
    'total_outflow_mtd[cr.]':                  toNum(row['total_outflow_mtd[cr.]']),
    'total_outflow_ytd[cr.]':                  toNum(row['total_outflow_ytd[cr.]']),
    'current_aum_mtm [cr.]':                   toNum(row['current_aum_mtm [cr.]']),
    'aum_growth_mtm %':                        toNum(row['aum_growth_mtm %']),
    'msci_inflow_mtd[cr.]':                    toNum(row['msci_inflow_mtd[cr.]']),
    'msci_inflow_ytd[cr.]':                    toNum(row['msci_inflow_ytd[cr.]']),
    'fd_inflow_mtd[cr.]':                      toNum(row['fd_inflow_mtd[cr.]']),
    'fd_inflow_ytd[cr.]':                      toNum(row['fd_inflow_ytd[cr.]']),
  };
}

// ── GET — return recent sync log ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('mis_sync_log')
    .select('*')
    .eq('source_key', 'b2c')
    .order('synced_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ recent_syncs: data ?? [] });
}

// ── POST — run sync ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  // Load B2C config from DB
  const { data: config, error: configError } = await supabaseAdmin
    .from('sheet_sync_configs')
    .select('*')
    .eq('source_key', 'b2c')
    .single();

  if (configError) {
    return NextResponse.json({ error: `Failed to load B2C sheet config: ${configError.message}` }, { status: 500 });
  }

  // Not configured yet
  if (!config?.sheet_id || !config?.tab_name || !config?.is_active) {
    const msg = !config?.sheet_id
      ? 'No sheet URL configured for B2C MIS — go to Admin → Google Sheets Sync → B2C MIS and paste the sheet URL.'
      : !config?.tab_name
      ? 'No tab name configured for B2C MIS.'
      : 'B2C MIS sync is marked inactive.';

    await supabaseAdmin.from('mis_sync_log').insert({
      source_key: 'b2c', sheet_tab: config?.tab_name ?? '',
      rows_synced: 0, rows_total: 0, status: 'skipped', error_msg: msg,
    });

    return NextResponse.json({ started_at: startedAt, b2c: { status: 'skipped', message: msg } });
  }

  // Google OAuth token
  let token: string;
  try {
    token = await getGoogleAccessToken();
  } catch (e: any) {
    return NextResponse.json({ error: `Google auth failed: ${e.message}` }, { status: 500 });
  }

  let result: any;

  try {
    // Fetch rows from Google Sheet
    const rawRows = await fetchSheetRows(token, config.sheet_id, config.tab_name);

    if (rawRows.length === 0) {
      throw new Error(`Sheet returned 0 rows — aborting to protect existing data. Check tab name "${config.tab_name}" and sheet access.`);
    }

    const rows = rawRows
      .map(mapB2cRow)
      .filter(r => r['advisor'] && r['advisor'] !== '');

    if (rows.length === 0) {
      throw new Error(`Column mapping produced 0 valid rows from ${rawRows.length} raw rows — check column headers match B2C MIS format.`);
    }

    const total = rows.length;
    const errors: string[] = [];
    let synced = 0;

    // DELETE all existing
    const { error: deleteError } = await supabaseAdmin
      .from('b2c')
      .delete()
      .neq('advisor', '__never__');

    if (deleteError) throw new Error(`Failed to clear b2c table: ${deleteError.message}`);

    // INSERT in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('b2c').insert(batch);
      if (error) errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      else synced += batch.length;
    }

    result = {
      status: errors.length > 0 ? 'partial' : 'success',
      synced,
      total,
      tab: config.tab_name,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    };

    await supabaseAdmin.from('mis_sync_log').insert({
      source_key: 'b2c',
      sheet_tab: config.tab_name,
      rows_synced: synced,
      rows_total: total,
      status: errors.length > 0 ? 'partial' : 'success',
      error_msg: errors.length > 0 ? errors.join('; ') : null,
    });

  } catch (e: any) {
    result = { status: 'error', error: e.message };
    await supabaseAdmin.from('mis_sync_log').insert({
      source_key: 'b2c',
      sheet_tab: config.tab_name,
      rows_synced: 0,
      rows_total: 0,
      status: 'error',
      error_msg: e.message,
    });
  }

  return NextResponse.json({
    started_at: startedAt,
    b2c: result,
    completed_at: new Date().toISOString(),
  });
}
