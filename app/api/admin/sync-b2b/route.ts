// POST /api/admin/sync-b2b
// Syncs B2B MIS data from Google Sheets into Supabase.
//
//   b2b_mtd → b2b_sales_current_month
//             Source: "Final Net Sales" tab (partner/ARN-level MTD sales)
//             Strategy: DELETE + INSERT (same as Excel upload)
//
//   b2b_ytd → b2b_rm_ytd_performance
//             Source: "T vs A_YTD" tab (RM-level monthly + YTD target vs achievement)
//             Strategy: DELETE + INSERT
//             Produces 13 rows per RM (12 months Apr–Mar + 1 YTD row)
//
// Google Sheet URL/ID configured per-month by admin in the admin panel.
// Called automatically by Vercel cron (daily 3 AM UTC) or manually.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleAccessToken, fetchSheetRows, fetchRawSheetRows } from '@/lib/google-sheets';

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

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === '#N/A') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function toStr(v: any): string {
  return String(v ?? '').trim();
}

// ── B2B MTD column mapper ─────────────────────────────────────────────────────
// Matches "Final Net Sales" tab headers exactly (same as Excel upload route).

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

// ── B2B YTD parser ─────────────────────────────────────────────────────────────
// Parses the "T vs A_YTD" tab which is a side-by-side pivot with 130 columns:
//   - 12 monthly sections (Apr→Mar), each 9 cols wide
//   - A YTD total section at cols 115–127
//   - 4 entity-level blocks stacked vertically: ZM, RGM, BM, RM
//
// We extract ONLY the RM block (the bottom block, largest), producing one row
// per RM per period (12 monthly + 1 YTD = 13 rows per RM).
//
// Monthly section column layout (for RM block, s = section start col):
//   s+0: RM name    s+1: MF Target    s+2: MF Ach (COB 50%)
//   s+3: % MF Ach   s+4: ALT Target   s+5: ALT Ach   s+6: % ALT Ach
//
// YTD section (starts at col 115):
//   115: RM name   116: Branch   117: MF Target   118: MF Ach (COB 50%)
//   119: % MF Ach  120: ALT Target  121: ALT Ach  122: % ALT Ach
//   125: Consol Target  126: Consol Achievement  127: Consol % Ach

// Column start index for each of the 12 monthly sections within the RM block
const RM_MONTHLY_SECTION_STARTS = [0, 9, 18, 27, 37, 47, 57, 67, 77, 87, 97, 106];
const YTD_SECTION_COL            = 115;

// Build period label from the Excel serial date stored in row 2 (date row).
// The sheet stores Apr→Dec with correct year, but Jan/Feb/Mar get stored as
// previous-calendar-year (a known Excel artifact in this file). We correct
// by adding 1 year to months 1–3 (Jan/Feb/Mar) when the FY starts in April.
function excelSerialToMonthLabel(
  serial: number | null,
  fyStartYear: number   // e.g. 2025 for FY2025-26
): string {
  if (!serial || typeof serial !== 'number') return '?';
  // Excel epoch = Dec 30 1899. Convert to JS Date.
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const m = d.getUTCMonth(); // 0=Jan … 11=Dec
  // Months Jan(0), Feb(1), Mar(2) are the tail-end of a Apr–Mar fiscal year
  const year = m <= 2 ? fyStartYear + 1 : fyStartYear;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[m]}-${String(year).slice(-2)}`;
}

interface YtdRecord {
  rm_name: string;
  branch: string | null;
  period: string;
  fiscal_year: string;
  mf_target: number | null;
  mf_ach_cob50: number | null;
  mf_ach_pct: number | null;
  alt_target: number | null;
  alt_ach: number | null;
  alt_ach_pct: number | null;
  consol_target: number | null;
  consol_ach: number | null;
  consol_pct: number | null;
}

function parseYtdSheet(
  raw: (string | number | null)[][]
): { records: YtdRecord[]; fiscalYear: string; rmCount: number } {
  if (raw.length < 3) return { records: [], fiscalYear: 'unknown', rmCount: 0 };

  // ── Find the RM block header row ──────────────────────────────────────────
  // Search 'RM' in the first 5 columns to handle sheets where data starts
  // at column B (colOffset=1) rather than column A (colOffset=0).
  let rmHeaderIdx = -1;
  let colOffset   = 0;

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    for (let c = 0; c < 5; c++) {
      if (String(row[c] ?? '').trim() === 'RM') {
        rmHeaderIdx = i;
        colOffset   = c;
        break;
      }
    }
    if (rmHeaderIdx >= 0) break;
  }

  if (rmHeaderIdx < 0) {
    // Provide enough debug info to diagnose the actual sheet layout
    const sample = raw.slice(0, 10)
      .map((r, i) => `row${i}:${JSON.stringify(r?.slice(0, 6))}`)
      .join(' | ');
    throw new Error(
      `Could not find RM block header in T vs A_YTD sheet (checked first 5 columns). ` +
      `First 10 rows sample: ${sample}`
    );
  }

  // ── Find the date row (Excel serial numbers for each monthly section) ──────
  // Look for a row where the expected date cell is a number > 40000 (any date
  // after 2009). Search backwards from the RM header to find the nearest date row.
  let dateRow: (string | number | null)[] = [];
  const dateColCheck = colOffset + RM_MONTHLY_SECTION_STARTS[0] + 2;

  for (let i = rmHeaderIdx - 1; i >= 0; i--) {
    const row = raw[i] ?? [];
    const val = row[dateColCheck];
    if (typeof val === 'number' && val > 40000) {
      dateRow = row;
      break;
    }
  }

  // Fallback: scan all rows for the date
  if (!dateRow.length) {
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i] ?? [];
      const val = row[dateColCheck];
      if (typeof val === 'number' && val > 40000) {
        dateRow = row;
        break;
      }
    }
  }

  // ── Determine fiscal year ─────────────────────────────────────────────────
  const apr25Serial = dateRow[colOffset + RM_MONTHLY_SECTION_STARTS[0] + 2] as number;
  const apr25Date   = new Date(Math.round(((apr25Serial || 45772) - 25569) * 86400 * 1000));
  const fyStartYear = apr25Date.getUTCFullYear();                              // e.g. 2025
  const fiscalYear  = `FY${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`; // 'FY2025-26'

  // Build period labels for each monthly section
  const monthPeriods: string[] = RM_MONTHLY_SECTION_STARTS.map((s) =>
    excelSerialToMonthLabel(dateRow[colOffset + s + 2] as number, fyStartYear)
  );

  // ── Parse RM data rows ────────────────────────────────────────────────────
  const records: YtdRecord[] = [];
  const skipPrefixes = ['*', 'Incl', 'Note', 'ZM', 'RGM', 'BM', 'RM'];

  for (let i = rmHeaderIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];

    // Skip empty rows
    if (!row.some(v => v !== null && v !== undefined && v !== '')) continue;

    const rmName = toStr(row[colOffset]);
    // Skip header repeats, notes, empty name rows
    if (!rmName) continue;
    if (skipPrefixes.some(p => rmName.startsWith(p))) continue;

    const ytdCol = colOffset + YTD_SECTION_COL;
    const branch = toStr(row[ytdCol + 1]) || null;

    // ── 12 monthly records ────────────────────────────────────────────────────
    for (let mi = 0; mi < RM_MONTHLY_SECTION_STARTS.length; mi++) {
      const s      = colOffset + RM_MONTHLY_SECTION_STARTS[mi];
      const period = monthPeriods[mi];
      const mfTgt  = toNumOrNull(row[s + 1]);
      const mfAch  = toNumOrNull(row[s + 2]);
      const altAch = toNumOrNull(row[s + 5]);
      if (mfTgt === null && mfAch === null && altAch === null) continue;

      records.push({
        rm_name:       rmName,
        branch,
        period,
        fiscal_year:   fiscalYear,
        mf_target:     mfTgt,
        mf_ach_cob50:  mfAch,
        mf_ach_pct:    toNumOrNull(row[s + 3]),
        alt_target:    toNumOrNull(row[s + 4]),
        alt_ach:       altAch,
        alt_ach_pct:   toNumOrNull(row[s + 6]),
        consol_target: null,
        consol_ach:    null,
        consol_pct:    null,
      });
    }

    // ── YTD record ────────────────────────────────────────────────────────────
    const ytdMfTgt = toNumOrNull(row[ytdCol + 2]);
    const ytdMfAch = toNumOrNull(row[ytdCol + 3]);
    if (ytdMfTgt !== null || ytdMfAch !== null) {
      records.push({
        rm_name:       rmName,
        branch,
        period:        'YTD',
        fiscal_year:   fiscalYear,
        mf_target:     ytdMfTgt,
        mf_ach_cob50:  ytdMfAch,
        mf_ach_pct:    toNumOrNull(row[ytdCol + 4]),
        alt_target:    toNumOrNull(row[ytdCol + 5]),
        alt_ach:       toNumOrNull(row[ytdCol + 6]),
        alt_ach_pct:   toNumOrNull(row[ytdCol + 7]),
        consol_target: toNumOrNull(row[ytdCol + 10]),
        consol_ach:    toNumOrNull(row[ytdCol + 11]),
        consol_pct:    toNumOrNull(row[ytdCol + 12]),
      });
    }
  }

  const rmCount = new Set(records.map(r => r.rm_name)).size;
  return { records, fiscalYear, rmCount };
}

// ── Core MTD sync (simple header-keyed fetch) ─────────────────────────────────

async function syncB2bMtd(
  token: string,
  config: { sheet_id: string; tab_name: string }
): Promise<{ synced: number; total: number; errors: string[] }> {
  const rawRows = await fetchSheetRows(token, config.sheet_id, config.tab_name);

  if (rawRows.length === 0) {
    throw new Error(`Sheet returned 0 rows — aborting. Check tab name "${config.tab_name}" and sheet access.`);
  }

  const rows = rawRows.map(mapB2bMtdRow).filter(r => r['Arn'] && r['Arn'] !== '');
  if (rows.length === 0) {
    throw new Error(`0 valid rows after mapping — check column headers match "Final Net Sales" format.`);
  }

  const { error: deleteError } = await supabaseAdmin
    .from('b2b_sales_current_month')
    .delete()
    .neq('Arn', '__never__');
  if (deleteError) throw new Error(`Failed to clear b2b_sales_current_month: ${deleteError.message}`);

  const errors: string[] = [];
  let synced = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabaseAdmin.from('b2b_sales_current_month').insert(rows.slice(i, i + BATCH_SIZE));
    if (error) errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    else synced += Math.min(BATCH_SIZE, rows.length - i);
  }

  return { synced, total: rows.length, errors };
}

// ── Core YTD sync (raw row fetch + pivot parser) ──────────────────────────────

async function syncB2bYtd(
  token: string,
  config: { sheet_id: string; tab_name: string }
): Promise<{ synced: number; total: number; rmCount: number; fiscalYear: string; errors: string[] }> {
  const rawRows = await fetchRawSheetRows(token, config.sheet_id, config.tab_name);

  if (rawRows.length === 0) {
    throw new Error(`Sheet returned 0 rows — aborting. Check tab name "${config.tab_name}" and sheet access.`);
  }

  const { records, fiscalYear, rmCount } = parseYtdSheet(rawRows);

  if (records.length === 0) {
    throw new Error(`Parsed 0 records from ${rawRows.length} raw rows — check the sheet has RM data in "T vs A_YTD" format.`);
  }

  // DELETE all (full replace on each sync)
  const { error: deleteError } = await supabaseAdmin
    .from('b2b_rm_ytd_performance')
    .delete()
    .neq('rm_name', '__never__');
  if (deleteError) throw new Error(`Failed to clear b2b_rm_ytd_performance: ${deleteError.message}`);

  const errors: string[] = [];
  let synced = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const { error } = await supabaseAdmin.from('b2b_rm_ytd_performance').insert(records.slice(i, i + BATCH_SIZE));
    if (error) errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    else synced += Math.min(BATCH_SIZE, records.length - i);
  }

  return { synced, total: records.length, rmCount, fiscalYear, errors };
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

  // Get Google OAuth token once (reused for both syncs)
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
        ? 'B2B MTD sync is marked inactive.'
        : 'No tab name configured for B2B MTD.';

      results.b2b_mtd = { status: 'skipped', message: msg };
      await supabaseAdmin.from('mis_sync_log').insert({
        source_key: 'b2b_mtd', sheet_tab: config?.tab_name ?? '',
        rows_synced: 0, rows_total: 0, status: 'skipped', error_msg: msg,
      });
    } else {
      try {
        const r = await syncB2bMtd(token, config);
        results.b2b_mtd = {
          status: r.errors.length > 0 ? 'partial' : 'success',
          synced: r.synced, total: r.total, tab: config.tab_name,
          errors: r.errors.length > 0 ? r.errors.slice(0, 5) : undefined,
        };
        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_mtd', sheet_tab: config.tab_name,
          rows_synced: r.synced, rows_total: r.total,
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
        ? 'No tab name configured for B2B YTD (expected: T vs A_YTD).'
        : 'B2B YTD sync is marked inactive.';

      results.b2b_ytd = { status: 'skipped', message: msg };
      await supabaseAdmin.from('mis_sync_log').insert({
        source_key: 'b2b_ytd', sheet_tab: config?.tab_name ?? '',
        rows_synced: 0, rows_total: 0, status: 'skipped', error_msg: msg,
      });
    } else {
      try {
        const r = await syncB2bYtd(token, config);
        results.b2b_ytd = {
          status: r.errors.length > 0 ? 'partial' : 'success',
          synced: r.synced, total: r.total,
          rm_count: r.rmCount, fiscal_year: r.fiscalYear,
          tab: config.tab_name,
          errors: r.errors.length > 0 ? r.errors.slice(0, 5) : undefined,
        };
        await supabaseAdmin.from('mis_sync_log').insert({
          source_key: 'b2b_ytd', sheet_tab: config.tab_name,
          rows_synced: r.synced, rows_total: r.total,
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
