// GET /api/test-sheets
// Diagnostic endpoint — verifies Google Sheets API connection and service account credentials.
// Remove or restrict this endpoint after confirming connection works.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  // Build JWT for Google OAuth2
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const unsigned = `${encode(header)}.${encode(claim)}`;

  // Sign with private key using Web Crypto
  const pemBody = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const keyBuffer = Buffer.from(pemBody, 'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(unsigned)
  );

  const jwt = `${unsigned}.${Buffer.from(signature).toString('base64url')}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check env vars are set
  results.env_check = {
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? `✅ Set (${process.env.GOOGLE_SERVICE_ACCOUNT_JSON.length} chars)`
      : '❌ NOT SET',
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID
      ? `✅ Set: ${process.env.GOOGLE_SHEET_ID}`
      : '❌ NOT SET',
  };

  // 2. Parse service account
  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '{}');
    results.service_account = {
      client_email: sa.client_email ?? '❌ missing',
      project_id: sa.project_id ?? '❌ missing',
      has_private_key: !!sa.private_key,
    };
  } catch (e: any) {
    results.service_account = { error: `JSON parse failed: ${e.message}` };
    return NextResponse.json(results);
  }

  // 3. Get access token
  let token: string;
  try {
    token = await getAccessToken();
    results.auth = { status: '✅ Access token obtained successfully' };
  } catch (e: any) {
    results.auth = { status: '❌ Failed', error: e.message };
    return NextResponse.json(results);
  }

  // 4. Fetch spreadsheet metadata
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    results.sheet_meta = { error: 'GOOGLE_SHEET_ID not set' };
    return NextResponse.json(results);
  }

  try {
    const metaRes = await fetch(`${SHEETS_BASE}/${sheetId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await metaRes.json();

    if (meta.error) {
      results.sheet_meta = { status: '❌ Failed', error: meta.error };
    } else {
      results.sheet_meta = {
        status: '✅ Connected',
        title: meta.properties?.title,
        sheets: meta.sheets?.map((s: any) => ({
          title: s.properties.title,
          sheetId: s.properties.sheetId,
          rows: s.properties.gridProperties?.rowCount,
          cols: s.properties.gridProperties?.columnCount,
        })),
      };
    }
  } catch (e: any) {
    results.sheet_meta = { status: '❌ Failed', error: e.message };
    return NextResponse.json(results);
  }

  // 5. Fetch first 3 rows of first sheet to verify data access
  try {
    const firstSheet = results.sheet_meta.sheets?.[0]?.title;
    if (firstSheet) {
      const dataRes = await fetch(
        `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(firstSheet)}!A1:Z3`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await dataRes.json();
      results.sample_data = {
        status: data.error ? '❌ Failed' : '✅ Data readable',
        range: data.range,
        rows: data.values ?? [],
        error: data.error ?? undefined,
      };
    }
  } catch (e: any) {
    results.sample_data = { error: e.message };
  }

  return NextResponse.json(results, { status: 200 });
}
