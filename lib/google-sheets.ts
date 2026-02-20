// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets API helper
// Uses a service account (GOOGLE_SERVICE_ACCOUNT_JSON env var) to authenticate
// and fetch data from Google Sheets via the Sheets API v4.
// ─────────────────────────────────────────────────────────────────────────────

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ── Get OAuth2 access token from service account JWT ─────────────────────────

export async function getGoogleAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

  const sa = JSON.parse(raw);

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

  const pemBody = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pemBody, 'base64'),
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
    throw new Error(`Google token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// ── Fetch all rows from a sheet tab ──────────────────────────────────────────
// Returns array of objects keyed by the header row (row 1).
// Empty string values are converted to null.

export async function fetchSheetRows(
  token: string,
  sheetId: string,
  tabName: string,
  range = 'A:ZZ'         // fetch all columns
): Promise<Record<string, string>[]> {
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tabName)}!${range}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Sheets API error: ${data.error.message} (${data.error.code})`);
  }

  const rows: string[][] = data.values ?? [];
  if (rows.length < 2) return []; // no data rows

  const headers = rows[0];
  return rows.slice(1).map(row =>
    Object.fromEntries(
      headers.map((h, i) => [h, row[i] ?? ''])
    )
  );
}

// ── Type helpers ─────────────────────────────────────────────────────────────

export function toNum(val: string | undefined): number | null {
  if (val === undefined || val === '' || val === null) return null;
  // Remove commas (e.g. "10,331.64")
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function toInt(val: string | undefined): number | null {
  if (val === undefined || val === '' || val === null) return null;
  const n = parseInt(String(val).replace(/,/g, '').trim(), 10);
  return isNaN(n) ? null : n;
}

export function toText(val: string | undefined): string | null {
  if (val === undefined || val === '') return null;
  return String(val).trim() || null;
}
