// POST /api/admin/sync-sheets
// Syncs data from Google Sheets into Supabase tables:
//   overall_aum  → gs_overall_aum
//   overall_sales → gs_overall_sales
//
// Can be called:
//   - Manually from the admin panel ("Sync Now" button)
//   - Automatically by Vercel cron job (vercel.json)
//   - With ?tab=overall_aum or ?tab=overall_sales to sync just one tab

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleAccessToken, fetchSheetRows, toNum, toInt, toText } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // allow up to 60s for large syncs

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const BATCH_SIZE = 500; // upsert in batches to avoid payload limits

// ── Auth: must be admin session or cron secret ────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  // Vercel cron calls include this header automatically
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true;

  // Admin session cookie check
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return false;
  try {
    const session = JSON.parse(sessionCookie.value);
    return !!session.userId; // any logged-in user can trigger sync (tighten if needed)
  } catch {
    return false;
  }
}

// ── Normalize business_segment values to match employees.business_unit ────────
// The Google Sheet stores abbreviated/variant values (e.g. "PW", "B2B ", "b2c").
// Normalize them so gs tables always match employees table values exactly.
function normalizeSegment(raw: string): string {
  const s = (raw ?? '').trim();
  const upper = s.toUpperCase();
  if (upper === 'PW' || upper === 'PRIVATE WEALTH' || upper === 'PRIVATEWEALTH') return 'Private Wealth';
  if (upper === 'B2B') return 'B2B';
  if (upper === 'B2C') return 'B2C';
  if (upper === 'CORPORATE') return 'Corporate';
  if (upper === 'SUPPORT FUNCTIONS' || upper === 'SUPPORT') return 'Support Functions';
  return s; // return as-is if unrecognised (don't silently drop data)
}

// ── Sync overall_aum ──────────────────────────────────────────────────────────

async function syncOverallAum(token: string): Promise<{ synced: number; total: number; errors: string[] }> {
  const rows = await fetchSheetRows(token, SHEET_ID, 'overall_aum');
  const errors: string[] = [];
  let synced = 0;

  const records = rows
    .filter(r => r['Month'] && r['businesssegment']) // skip empty rows
    .map(r => ({
      month:                  toText(r['Month']),
      business_segment:       normalizeSegment(toText(r['businesssegment'])),
      mf_aum:                 toNum(r['MF_AUM']),
      mf_aum_cr:              toNum(r['MF_AUM_Cr']),
      eq_aum:                 toNum(r['EQ_AUM']),
      other_products:         toNum(r['Other_Products']),
      trail:                  toNum(r['Trail']),
      upfront:                toNum(r['Upfront']),
      aif:                    toNum(r['AIF']),
      bonds:                  toNum(r['Bonds']),
      fixed_deposits:         toNum(r['Fixed Deposits']),
      insurance:              toNum(r['Insurance']),
      mutual_funds:           toNum(r['Mutual Funds']),
      pms:                    toNum(r['PMS']),
      sif:                    toNum(r['SIF']),
      structured_product:     toNum(r['Structured Product']),
      unlisted_shares:        toNum(r['Unlisted Shares']),
      overall_aum:            toNum(r['overall AUM']),
      sipinflow_cr:           toNum(r['Sipinflow_Cr']),
      lumpsum_cr:             toNum(r['Lumpsum_Cr']),
      red_cr:                 toNum(r['Red_Cr']),
      cob_cr:                 toNum(r['Cob_Cr']),
      net_cr:                 toNum(r['Net_Cr']),
      monthly_net_sales:      toNum(r['Monthly_Net_sales']),
      overall_other_products: toNum(r['Overall_Other_Products']),
      overall_trail:          toNum(r['Overall_Trail']),
      synced_at:              new Date().toISOString(),
    }));

  // Upsert in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from('gs_overall_aum')
      .upsert(batch, { onConflict: 'month,business_segment' });

    if (error) {
      errors.push(`AUM batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  return { synced, total: records.length, errors };
}

// ── Sync overall_sales ────────────────────────────────────────────────────────

async function syncOverallSales(token: string): Promise<{ synced: number; total: number; errors: string[] }> {
  const rows = await fetchSheetRows(token, SHEET_ID, 'overall_sales');
  const errors: string[] = [];
  let synced = 0;

  const records = rows
    .filter(r => r['arn_rm'] && r['daywise']) // skip empty rows
    .map(r => ({
      arn_rm:                   toText(r['arn_rm']),
      name:                     toText(r['name']),
      team_region:              toText(r['team_region']),
      zone:                     toText(r['zone']),
      business_segment:         normalizeSegment(toText(r['businesssegment'])),
      daywise:                  toText(r['daywise']),
      users_count:              toInt(r['users_count']),
      reg_users_count:          toInt(r['reg_users_count']),
      accountholders_count:     toInt(r['accountholders_count']),
      firsttimeinvestors_count: toInt(r['firsttimeinvestors_count']),
      sipinflow_amount:         toNum(r['sipinflow_amount']),
      lumpsuminflow_amount:     toNum(r['lumpsuminflow_amount']),
      redemption_amount:        toNum(r['redemption_amount']),
      aum_amount:               toNum(r['aum_amount']),
      cob_amount:               toNum(r['cob_amount']),
      cob_out:                  toNum(r['cob_out']),
      switch_in_inflow:         toNum(r['switch_in_inflow']),
      switch_out_inflow:        toNum(r['switch_out_inflow']),
      synced_at:                new Date().toISOString(),
    }));

  // Upsert in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from('gs_overall_sales')
      .upsert(batch, { onConflict: 'arn_rm,daywise' });

    if (error) {
      errors.push(`Sales batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  return { synced, total: records.length, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SHEET_ID) {
    return NextResponse.json({ error: 'GOOGLE_SHEET_ID env var not set' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get('tab'); // optional: 'overall_aum' | 'overall_sales'

  const startedAt = new Date().toISOString();
  const results: Record<string, any> = { started_at: startedAt };

  try {
    const token = await getGoogleAccessToken();

    // Sync overall_aum
    if (!tab || tab === 'overall_aum') {
      try {
        const r = await syncOverallAum(token);
        results.overall_aum = { status: 'success', ...r };
        await supabaseAdmin.from('gs_sync_log').insert({
          sheet_tab: 'overall_aum',
          rows_synced: r.synced,
          rows_total: r.total,
          status: r.errors.length > 0 ? 'partial' : 'success',
          error_msg: r.errors.length > 0 ? r.errors.join('; ') : null,
        });
      } catch (e: any) {
        results.overall_aum = { status: 'error', error: e.message };
        await supabaseAdmin.from('gs_sync_log').insert({
          sheet_tab: 'overall_aum',
          rows_synced: 0,
          rows_total: 0,
          status: 'error',
          error_msg: e.message,
        });
      }
    }

    // Sync overall_sales
    if (!tab || tab === 'overall_sales') {
      try {
        const r = await syncOverallSales(token);
        results.overall_sales = { status: 'success', ...r };
        await supabaseAdmin.from('gs_sync_log').insert({
          sheet_tab: 'overall_sales',
          rows_synced: r.synced,
          rows_total: r.total,
          status: r.errors.length > 0 ? 'partial' : 'success',
          error_msg: r.errors.length > 0 ? r.errors.join('; ') : null,
        });
      } catch (e: any) {
        results.overall_sales = { status: 'error', error: e.message };
        await supabaseAdmin.from('gs_sync_log').insert({
          sheet_tab: 'overall_sales',
          rows_synced: 0,
          rows_total: 0,
          status: 'error',
          error_msg: e.message,
        });
      }
    }

    results.completed_at = new Date().toISOString();
    return NextResponse.json(results);

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — return last sync status from log
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('gs_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ recent_syncs: data ?? [] });
}
