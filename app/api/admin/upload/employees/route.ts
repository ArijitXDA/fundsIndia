import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// Expected columns in the uploaded file (Formatted_Employee Master format)
const REQUIRED_COLS = [
  'Employee Number', 'Full Name', 'Work Email', 'Business Unit',
  'Job Title', 'Employment Status',
];

// Map Excel column → DB column
function mapRow(row: any) {
  const empNum = String(row['Employee Number'] ?? '').trim();
  return {
    employee_number: empNum.startsWith('W') ? empNum : `W${empNum}`,
    full_name: String(row['Full Name'] ?? '').trim(),
    work_email: String(row['Work Email'] ?? '').trim().toLowerCase(),
    gender: row['Gender'] ? String(row['Gender']).trim() : null,
    mobile_phone: row['Mobile Phone'] ? String(row['Mobile Phone']).trim() : null,
    location: row['Location'] ? String(row['Location']).trim() : null,
    business_unit: row['Business Unit'] ? String(row['Business Unit']).trim() : null,
    department: row['Department'] ? String(row['Department']).trim() : null,
    sub_department: row['Sub Department'] ? String(row['Sub Department']).trim() : null,
    job_title: row['Job Title'] ? String(row['Job Title']).trim() : null,
    secondary_job_title: row['Secondary Job Title'] ? String(row['Secondary Job Title']).trim() : null,
    reporting_manager_emp_number: row['Reporting Manager Employee Number']
      ? (() => {
          const v = String(row['Reporting Manager Employee Number']).trim();
          return v.startsWith('W') ? v : `W${v}`;
        })()
      : null,
    date_joined: row['Date Joined']
      ? (row['Date Joined'] instanceof Date
          ? row['Date Joined'].toISOString().split('T')[0]
          : String(row['Date Joined']).trim())
      : null,
    employment_status: row['Employment Status'] ? String(row['Employment Status']).trim() : 'Working',
    exit_date: row['Exit Date']
      ? (row['Exit Date'] instanceof Date
          ? row['Exit Date'].toISOString().split('T')[0]
          : String(row['Exit Date']).trim())
      : null,
  };
}

function detectChanges(existing: any, incoming: any): string[] {
  const changes: string[] = [];
  const fields: [string, string][] = [
    ['full_name', 'Full Name'],
    ['work_email', 'Work Email'],
    ['location', 'Location'],
    ['business_unit', 'Business Unit'],
    ['department', 'Department'],
    ['job_title', 'Job Title'],
    ['reporting_manager_emp_number', 'Reporting Manager'],
    ['employment_status', 'Employment Status'],
    ['mobile_phone', 'Mobile Phone'],
  ];
  for (const [col, label] of fields) {
    const a = existing[col] ?? null;
    const b = incoming[col] ?? null;
    if (String(a ?? '').trim() !== String(b ?? '').trim()) {
      changes.push(`${label}: "${a ?? '—'}" → "${b ?? '—'}"`);
    }
  }
  return changes;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const sessionData = JSON.parse(sessionCookie.value);

    const { data: callerUser } = await supabaseAdmin
      .from('users').select('email').eq('id', sessionData.userId).single();
    if (!callerUser) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { data: adminRole } = await supabaseAdmin
      .from('admin_roles')
      .select('roles')
      .eq('email', callerUser.email)
      .eq('is_active', true)
      .single();

    if (!adminRole?.roles?.includes(4)) {
      return NextResponse.json({ error: 'You do not have permission to upload employee data (Role 4 required)' }, { status: 403 });
    }

    // ── Parse file ───────────────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const confirm = formData.get('confirm') === 'true';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawRows.length === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 });

    // ── Validate required columns ────────────────────────────────────────────
    const fileColumns = Object.keys(rawRows[0]);
    const missingCols = REQUIRED_COLS.filter(c => !fileColumns.includes(c));
    if (missingCols.length > 0) {
      return NextResponse.json({
        error: `Missing required columns: ${missingCols.join(', ')}`,
        hint: `Expected columns include: ${REQUIRED_COLS.join(', ')}`,
      }, { status: 400 });
    }

    // ── Parse incoming rows ──────────────────────────────────────────────────
    const incoming = rawRows
      .map(mapRow)
      .filter(r => r.employee_number && r.employee_number !== 'W' && r.full_name);

    const incomingMap = new Map(incoming.map(r => [r.employee_number, r]));

    // ── Fetch existing employees ─────────────────────────────────────────────
    const { data: existingEmployees } = await supabaseAdmin
      .from('employees')
      .select('*');

    const existingMap = new Map((existingEmployees ?? []).map((e: any) => [e.employee_number, e]));

    // ── Compute diff ─────────────────────────────────────────────────────────
    const toAdd: any[] = [];
    const toUpdate: Array<{ employee_number: string; changes: string[]; data: any }> = [];
    const toDeactivate: Array<{ employee_number: string; full_name: string }> = [];

    // New employees in file not in DB
    for (const [empNum, row] of incomingMap) {
      if (!existingMap.has(empNum)) {
        toAdd.push(row);
      }
    }

    // Existing employees — check for updates
    for (const [empNum, existing] of existingMap) {
      if (!incomingMap.has(empNum)) {
        // In DB but not in new file → mark inactive
        if (existing.employment_status !== 'Inactive') {
          toDeactivate.push({ employee_number: empNum, full_name: existing.full_name });
        }
      } else {
        // In both → check for changes
        const incoming_row = incomingMap.get(empNum)!;
        const changes = detectChanges(existing, incoming_row);
        if (changes.length > 0) {
          toUpdate.push({ employee_number: empNum, changes, data: incoming_row });
        }
      }
    }

    // ── Preview mode (no confirm yet) ────────────────────────────────────────
    if (!confirm) {
      return NextResponse.json({
        preview: true,
        stats: {
          totalInFile: incoming.length,
          newEmployees: toAdd.length,
          updatedEmployees: toUpdate.length,
          deactivatedEmployees: toDeactivate.length,
          unchanged: incoming.length - toAdd.length - toUpdate.length,
        },
        additions: toAdd.slice(0, 20).map(r => ({
          employee_number: r.employee_number,
          full_name: r.full_name,
          business_unit: r.business_unit,
          job_title: r.job_title,
          location: r.location,
        })),
        updates: toUpdate.slice(0, 30).map(u => ({
          employee_number: u.employee_number,
          full_name: u.data.full_name,
          changes: u.changes,
        })),
        deactivations: toDeactivate.slice(0, 20),
        additionsTotal: toAdd.length,
        updatesTotal: toUpdate.length,
        deactivationsTotal: toDeactivate.length,
      });
    }

    // ── Execute confirmed changes ────────────────────────────────────────────
    const errors: string[] = [];
    let addedCount = 0, updatedCount = 0, deactivatedCount = 0;

    // Insert new employees (in batches of 50)
    for (let i = 0; i < toAdd.length; i += 50) {
      const batch = toAdd.slice(i, i + 50);
      const { error } = await supabaseAdmin.from('employees').insert(batch);
      if (error) errors.push(`Insert batch ${i / 50 + 1}: ${error.message}`);
      else addedCount += batch.length;
    }

    // Update changed employees
    for (const u of toUpdate) {
      const { error } = await supabaseAdmin
        .from('employees')
        .update({ ...u.data, updated_at: new Date().toISOString() })
        .eq('employee_number', u.employee_number);
      if (error) errors.push(`Update ${u.employee_number}: ${error.message}`);
      else updatedCount++;
    }

    // Deactivate missing employees
    for (const d of toDeactivate) {
      const { error } = await supabaseAdmin
        .from('employees')
        .update({ employment_status: 'Inactive', updated_at: new Date().toISOString() })
        .eq('employee_number', d.employee_number);
      if (error) errors.push(`Deactivate ${d.employee_number}: ${error.message}`);
      else deactivatedCount++;
    }

    // Log activity
    try {
      await supabaseAdmin.from('activity_logs').insert({
        user_id: sessionData.userId,
        action_type: 'employee_upload',
        action_details: { added: addedCount, updated: updatedCount, deactivated: deactivatedCount, errors: errors.length },
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      result: { added: addedCount, updated: updatedCount, deactivated: deactivatedCount },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error('[UPLOAD EMPLOYEES]', error);
    return NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
  }
}
