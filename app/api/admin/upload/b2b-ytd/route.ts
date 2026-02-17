import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const REQUIRED_COLS = ['Arn', 'RM Emp ID'];

function toNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '#N/A') return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function mapRow(row: any) {
  return {
    'Arn': String(row['Arn'] ?? '').trim(),
    'Partner Name': String(row['Partner Name'] ?? '').trim(),
    'MF+SIF+MSCI': toNum(row['MF+SIF+MSCI']),
    'SUM of COB (100%)': toNum(row['SUM of COB (100%)']),
    'COB (50%)': toNum(row['COB (50%)']),
    'SUM of AIF+PMS+LAS (TRAIL)': toNum(row['SUM of AIF+PMS+LAS (TRAIL)']),
    'MF Total (COB 100%)': toNum(row['MF Total (COB 100%)']),
    'MF Total (COB 50%)': toNum(row['MF Total (COB 50%)']),
    'SUM of ALT': toNum(row['SUM of ALT']),
    'ALT Total': toNum(row['ALT Total']),
    'Total Net Sales (COB 100%)': toNum(row['Total Net Sales (COB 100%)']),
    'Total Net Sales (COB 50%)': toNum(row['Total Net Sales (COB 50%)']),
    'RM': String(row['RM'] ?? '').trim(),
    'BM': String(row['BM'] ?? '').trim(),
    'Branch': String(row['Branch'] ?? '').trim(),
    'Zone': String(row['Zone'] ?? '').trim(),
    'RGM': String(row['RGM'] ?? '').trim(),
    'ZM': String(row['ZM'] ?? '').trim(),
    'RM Emp ID': String(row['RM Emp ID'] ?? '').trim(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const sessionData = JSON.parse(sessionCookie.value);

    const { data: callerUser } = await supabaseAdmin
      .from('users').select('email').eq('id', sessionData.userId).single();
    if (!callerUser) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles').select('roles').eq('email', callerUser.email).eq('is_active', true).single();

    if (!adminRole?.roles?.includes(2)) {
      return NextResponse.json({ error: 'Role 2 (B2B YTD MIS) required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const confirm = formData.get('confirm') === 'true';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawRows.length === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 });

    const fileColumns = Object.keys(rawRows[0]);
    const missingCols = REQUIRED_COLS.filter(c => !fileColumns.includes(c));
    if (missingCols.length > 0) {
      return NextResponse.json({ error: `Missing required columns: ${missingCols.join(', ')}` }, { status: 400 });
    }

    const rows = rawRows.map(mapRow).filter(r => r['Arn'] && r['Arn'] !== '');

    const totalRows = rows.length;
    const validRMs = rows.filter(r => r['RM Emp ID'] && r['RM Emp ID'] !== '#N/A' && r['RM Emp ID'] !== '').length;
    const totalCOB = rows.reduce((s, r) => s + r['SUM of COB (100%)'], 0);
    const totalMF = rows.reduce((s, r) => s + r['MF+SIF+MSCI'], 0);

    const zoneSummary = rows.reduce((acc: any, r) => {
      const z = r['Zone'] || 'Unknown';
      if (!acc[z]) acc[z] = 0;
      acc[z]++;
      return acc;
    }, {});

    if (!confirm) {
      return NextResponse.json({
        preview: true,
        stats: {
          totalRecords: totalRows,
          validRMRecords: validRMs,
          noRMRecords: totalRows - validRMs,
          totalCOB100YTD: totalCOB.toFixed(2),
          totalMFSIFMSCI: totalMF.toFixed(2),
        },
        zoneSummary,
        sampleRows: rows.slice(0, 5).map(r => ({
          arn: r['Arn'],
          partner: r['Partner Name'],
          rm: r['RM'] || '—',
          rmId: r['RM Emp ID'] || '—',
          branch: r['Branch'],
          zone: r['Zone'],
          cob100: r['SUM of COB (100%)'],
        })),
        message: `Ready to replace all ${totalRows} records in B2B YTD MIS table.`,
        warning: 'This will DELETE all existing records in btb_sales_YTD_minus_current_month and replace with new data.',
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .delete()
      .neq('Arn', '__never__');

    if (deleteError) {
      return NextResponse.json({ error: `Failed to clear table: ${deleteError.message}` }, { status: 500 });
    }

    let insertedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabaseAdmin.from('btb_sales_YTD_minus_current_month').insert(batch);
      if (error) errors.push(`Batch ${i / 100 + 1}: ${error.message}`);
      else insertedCount += batch.length;
    }

    try {
      await supabaseAdmin.from('activity_logs').insert({
        user_id: sessionData.userId,
        action_type: 'b2b_ytd_upload',
        action_details: { inserted: insertedCount, errors: errors.length, filename: file.name },
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      result: { inserted: insertedCount, filename: file.name },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error('[UPLOAD B2B YTD]', error);
    return NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
  }
}
