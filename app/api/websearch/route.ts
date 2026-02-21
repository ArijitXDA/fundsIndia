// POST /api/websearch
// Authenticated Serper.dev proxy.
// Accepts { query: string } and returns a formatted markdown block
// containing top web results for injection into LLM system prompts.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SERPER_API = 'https://google.serper.dev/search';

// Number of organic results to include in the LLM context
const MAX_RESULTS = 5;

export async function POST(request: NextRequest) {
  // ── Auth check (same custom session cookie) ──────────────────────────────
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  let sessionData: any;
  try {
    sessionData = JSON.parse(sessionCookie.value);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const { userId } = sessionData;
  const { data: user } = await supabaseAdmin
    .from('users').select('id').eq('id', userId).single();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  // ── API key check ─────────────────────────────────────────────────────────
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Web search is not configured.' }, { status: 503 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query } = body;
  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return NextResponse.json({ error: 'query is required (min 3 chars)' }, { status: 400 });
  }

  // ── Call Serper.dev ───────────────────────────────────────────────────────
  let serperRes: Response;
  try {
    serperRes = await fetch(SERPER_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-API-KEY':     apiKey,
      },
      body: JSON.stringify({
        q:   query.trim(),
        num: MAX_RESULTS,
        gl:  'in',   // India geo
        hl:  'en',   // English
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Web search unavailable. Please try again.' },
      { status: 503 }
    );
  }

  if (!serperRes.ok) {
    const msg = serperRes.status === 403
      ? 'Web search API key invalid. Check SERPER_API_KEY in Vercel.'
      : serperRes.status === 429
      ? 'Web search quota exceeded for today.'
      : `Web search error (${serperRes.status}).`;
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const data = await serperRes.json();

  // ── Format results as markdown ────────────────────────────────────────────
  const results: string[] = [];

  // Answer box (Google's quick answer, if available)
  if (data.answerBox?.answer) {
    results.push(`**Quick Answer:** ${data.answerBox.answer}`);
  } else if (data.answerBox?.snippet) {
    results.push(`**Quick Answer:** ${data.answerBox.snippet}`);
  }

  // Knowledge graph snippet
  if (data.knowledgeGraph?.description) {
    results.push(`**Overview:** ${data.knowledgeGraph.description}`);
  }

  // Organic results
  const organic: any[] = data.organic ?? [];
  organic.slice(0, MAX_RESULTS).forEach((r: any, i: number) => {
    const title   = r.title   ?? '';
    const snippet = r.snippet ?? '';
    const link    = r.link    ?? '';
    if (snippet) {
      results.push(`${i + 1}. **${title}**\n   ${snippet}\n   Source: ${link}`);
    }
  });

  // News results (if any)
  const news: any[] = data.news ?? [];
  if (news.length > 0) {
    results.push('**Recent News:**');
    news.slice(0, 3).forEach((n: any) => {
      const title = n.title ?? '';
      const snip  = n.snippet ?? '';
      const date  = n.date ?? '';
      if (title) results.push(`• ${title}${date ? ` (${date})` : ''}${snip ? ` — ${snip}` : ''}`);
    });
  }

  if (results.length === 0) {
    return NextResponse.json({ results: '', query: query.trim() });
  }

  const formatted =
    `[LIVE WEB RESEARCH — query: "${query.trim()}"]\n` +
    results.join('\n') +
    '\n[END LIVE WEB RESEARCH]';

  return NextResponse.json({ results: formatted, query: query.trim() });
}
