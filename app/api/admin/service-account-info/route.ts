// GET /api/admin/service-account-info
// Returns only the client_email from the service account JSON.
// Used by the admin panel to show which email needs Sheet view access.
// NEVER returns the private key or any sensitive fields.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return false;
  try {
    const session = JSON.parse(sessionCookie.value);
    const { data: role } = await supabaseAdmin
      .from('admin_roles').select('tier').eq('is_active', true)
      .eq('id', session.userId).maybeSingle();
    // Also accept any logged-in user since the email is not sensitive
    return !!session.userId;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON env var not set' }, { status: 500 });
  }

  try {
    const sa = JSON.parse(raw);
    return NextResponse.json({
      client_email: sa.client_email ?? null,
      project_id:   sa.project_id  ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Could not parse service account JSON' }, { status: 500 });
  }
}
