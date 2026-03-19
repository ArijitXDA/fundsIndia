// POST /api/admin/sync-b2b
// Syncs B2B MIS data from Google Sheets into Supabase.
//
//   b2b_mtd → b2b_sales_current_month      (tab stored in sheet_sync_configs: 'b2b_mtd')
//   b2b_ytd → btb_sales_YTD_minus_current_month (tab stored in sheet_sync_configs: 'b2b_ytd')
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

function toStr(v: any): string {
  return String(v ?? '').trim();
}

// ── Column mappers ─────────────────────────────────────────────────────────────
// Column names match the "Final Net Sales" tab exactly — same as Excel upload route.

function mapB2bMtdRow(row: Record<string, string>) {
  return {
    'Arn':                             toStr(row['Arn']),
    'Partner Name':                    toStr(row['Partner Name']),
    'MF+SIF+MSCI':                     toNum(row['MF+SIF+MSCI']),
    'COB (100%)':                      toNum(row['COB (100%)']),
    'COB (50%)':                       toNum(row['COB (50%)']),
    'AIF+PMS+LAS+DYNAMO (TRAIL)':      toNum(row['AIF+PMS+LAS+DYNAMO (TRAIL)']),
    'MF Total (COB 100%)':             toNum(row['MF Total (COB 100%)']),
    'MF Total (COB 50%)':              toNum(row['MF Total (COB 50%)']),
    'ALTERNATE':                       toNum(row['ALTERNATE']),
    'ALT Total':                       toNum(row['ALT Total']),
    'Total Net Sales (COB 100%)':      toNum(row['Total Net Sales (COB 100%)']),
    'Total Net Sales (COB 50%)':       toNum(row['Total Net Sales (COB 50%)']),
    'RM':                              toStr(row['RM']),
    'BM':                              toStr(row['BM']),
    'Branch':                          toStr(row['Branch']),
    'Zone':                            toStr(row['Zone']),
    'RGM':                             toStr(row['RGM']),
    'ZM':                              toStr(row['ZM']),
    'RM Emp ID':                       toStr(row['RM Emp ID']),
  };
}

// YTD column mapping — matches btb_sales_YTD_minus_current_month schema
// Column names from the B2B YTD Google Sheet tab
function mapB2bYtdRow(row: Record<string, string>) {
  return {
    'Arn':                             toStr(row['Arn']),
    'Partner Name':                    toStr(row['Partner Name']),
    'MF+SIF+MSCI':                     toNum(row['MF+SIF+MSCI']),
    'SUM of COB (100%)':               toNum(row['SUM of COB (100%)']),
    'COB (50%)':                       toNum(row['COB (50%)']),
    'SUM of AIF+PMS+LAS (TRAIL)':      toNum(row['SUM of AIF+PMS+LAS (TRAIL)']),
    'MF Total (COB 100%)':             toNum(row['MF Total (COB 100%)']),
    'MF Total (COB 50%)':              toNum(row['MF Total (COB 50%)']),
    'SUM of ALT':                      toNum(row['SUM of ALT']),
    'ALT Total':                       toNum(row['ALT Total']),
    'Total Net Sales (COB 100%)':      toNum(row['Total Net Sales (COB 100%)']),
    'Total Net Sales (COB 50%)':       toNum(row['Total Net Sales (COB 50%)']),
    'RM':                              toStr(row['RM']),
    'BM':                              toStr(row['BM']),
    'Branch':                          toStr(row['Branch']),
    'Zone':                            toStr(row['Zone']),
    'RGM':                             toStr(row['RGM']),
    'ZM':                              toStr(row['ZM']),
    'RM Emp ID':                       toStr(row['RM Emp ID']),
  };
}

// ── Core sync function ────────────────────────────────────────────────────────

async function syncMisTable(opts: {
  token: string;
  sourceKey: 'b2b_mtd' | 'b2b_ytd';
  config: { sheet_id: string; tab_name: string; display_name: string };
  tableName: string;
  mapRow: (row: Record<string, string>) => Record<string, any>;
  filterRow: (row: Record<string, any>) => boolean;
}): Promise<{ synced: number; total: number; errors: string[] }> {
  const { token, config, tableName, mapRow, filterRow } = opts;

  // Fetch rows from Google Sheet
  const rawRows = await fetchSheetRows(token, config.sheet_id, config.tab_name);

  if (rawRows.length === 0) {
    throw new Error(`Sheet returned 0 rows — aborting to protect existing data. Check tab name "${config.tab_name}" and sheet access.`);
  }

  const rows = rawRows.map(mapRow).filter(filterRow);
  const total = rows.length;
  const errors: string[] = [];
  let synced = 0;

  // Safety check: refuse to wipe if mapping produced 0 valid rows
  if (total === 0) {
    throw new Error(`Column mapping produced 0 valid rows from ${rawRows.length} raw rows — check that column headers match expected format.`);
  }

  // DELETE all existing records
  const { error: deleteError } = await supabaseAdmin
    .from(tableName)
    .delete()
    .neq('Arn', '__never__'); // matches all rows

  if (deleteError) {
    throw new Error(`Failed to clear ${tableName}: ${deleteError.message}`);
  }

  // INSERT in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin.from(tableName).insert(batch);
    if (error) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  return { synced, total, errors };
}

// ── GET — return recent sync log ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('mis_sync_log')
    .select('*')
    .in('source_key', ['b2b_mtd', 'b2b_ytd'])
    .order('synced_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ recent_syncs: data ?? [] });
}

// ── POST — run sync ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Which sources to sync? Default = both. Allow ?source=b2b_mtd or ?source=b2b_ytd
  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get('source'); // 'b2b_mtd' | 'b2b_ytd' | null

  const startedAt = new Date().toISOString();
  const results: Record<string, any> = { started_at: startedAt };

  // Load configs from DB
  const { data: configs, error: configError } = await supabaseAdmin
    .from('sheet_sync_configs')
    .select('*')
    .in('source_key', ['b2b_mtd', 'b2b_ytd']);

  if (configError) {
    return NextResponse.json({ error: `Failed to load sheet configs: ${configError.message}` }, { status: 500 });
  }

  const configMap: Record<string, any> = {};
  for (const c of configs ?? []) configMap[c.source_key] = c;

  // Get Google OAuth token once (reuse for both syncs)
  let token: string;
  try {
    token = await getGoogleAccessToken();
  } catch (e: any) {
    return NextResponse.json({ error: `Google auth failed: ${e.message}` }, { status: 500 });
  }

  // ── Sync B2B MTD ────────────────────────────────────────────────────────────
  if (!sourceParam || sourceParam === 'b2b_mtd') {
    const config = configMap['b2b_mtd'];

    if (!config?.sheet_id || !config?.tab_name || !config?.is_active) {
      const msg = !config?.sheet_id
        ? 'No sheet URL configured — go to Admin → Google Sheets Sync → B2B MTD MIS and paste the sheet URL.'
        : !config?.is_active
        ? 'B2B MTD sync is marked inactive in sheet_sync_configs.'
        : 'No tab name configured for B2B MTD.';

      results.b2b_mtd = { status: 'skipped', message: msg };
      await supabaseAdmin.from('mis_sync_log').insert({
        source_key: 'b2b_mtd', sheet_tab: config?.tab_name ?? '',
        rows_synced: 0, rows_total: 0, status: 'skipped', error_msg: msg,
      });
    } else {
      try {
        const r = await syncMisTable({
          token,
          sourceKey: 'b2b_mtd',
          config,
          tableName: 'b2b_sales_current_month',
          mapRow: mapB2bMtdRow,
          filterRow: (row) => !!row['Arn'] && row['Arn'] !== '',
        });

        results.b2b_mtd = {
          status: r.errors.length > 0 ? 'partial' : 'success',
          synced: r.synced,
          total: r.total,
          tab: config.tab_name,
          errors: r.errors.length > 0 ? r.errors.slice(0, 5) : undefined,
        };

        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_mtd',
          sheet_tab: config.tab_name,
          rows_synced: r.synced,
          rows_total: r.total,
          status: r.errors.length > 0 ? 'partial' : 'success',
          error_msg: r.errors.length > 0 ? r.errors.join('; ') : null,
        });
      } catch (e: any) {
        results.b2b_mtd = { status: 'error', error: e.message };
        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_mtd', sheet_tab: config.tab_name,
          rows_synced: 0, rows_total: 0, status: 'error', error_msg: e.message,
        });
      }
    }
  }

  // ── Sync B2B YTD ────────────────────────────────────────────────────────────
  if (!sourceParam || sourceParam === 'b2b_ytd') {
    const config = configMap['b2b_ytd'];

    if (!config?.sheet_id || !config?.tab_name || !config?.is_active) {
      const msg = !config?.sheet_id
        ? 'No sheet URL configured for B2B YTD — paste the URL in Admin → Google Sheets Sync.'
        : !config?.tab_name
        ? 'No tab name configured for B2B YTD.'
        : 'B2B YTD sync is marked inactive.';

      results.b2b_ytd = { status: 'skipped', message: msg };
      await supabaseAdmin.from('mis_sync_log').insert({
        source_key: 'b2b_ytd', sheet_tab: config?.tab_name ?? '',
        rows_synced: 0, rows_total: 0, status: 'skipped', error_msg: msg,
      });
    } else {
      try {
        const r = await syncMisTable({
          token,
          sourceKey: 'b2b_ytd',
          config,
          tableName: 'btb_sales_YTD_minus_current_month',
          mapRow: mapB2bYtdRow,
          filterRow: (row) => !!row['Arn'] && row['Arn'] !== '',
        });

        results.b2b_ytd = {
          status: r.errors.length > 0 ? 'partial' : 'success',
          synced: r.synced,
          total: r.total,
          tab: config.tab_name,
          errors: r.errors.length > 0 ? r.errors.slice(0, 5) : undefined,
        };

        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_ytd',
          sheet_tab: config.tab_name,
          rows_synced: r.synced,
          rows_total: r.total,
          status: r.errors.length > 0 ? 'partial' : 'success',
          error_msg: r.errors.length > 0 ? r.errors.join('; ') : null,
        });
      } catch (e: any) {
        results.b2b_ytd = { status: 'error', error: e.message };
        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_ytd', sheet_tab: config?.tab_name ?? '',
          rows_synced: 0, rows_total: 0, status: 'error', error_msg: e.message,
        });
      }
    }
  }

  results.completed_at = new Date().toISOString();
  return NextResponse.json(results);
}
