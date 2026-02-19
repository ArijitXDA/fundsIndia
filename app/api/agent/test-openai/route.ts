// GET /api/agent/test-openai
// Quick smoke test — verifies the OPENAI_API_KEY env var is set and
// that OpenAI responds correctly. Dev admin only.
// DELETE THIS FILE after confirming the key works.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth: dev admin only
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { userId } = JSON.parse(sessionCookie.value);
  const { data: user } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 403 });
  const { data: role } = await supabaseAdmin
    .from('admin_roles').select('tier').eq('email', user.email).eq('is_active', true).single();
  if (!role || role.tier !== 'dev') {
    return NextResponse.json({ error: 'Dev admin only' }, { status: 403 });
  }

  // 1. Check env var is present
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      status: 'FAIL',
      step: 'env_var',
      error: 'OPENAI_API_KEY is not set in environment variables',
    }, { status: 500 });
  }

  const maskedKey = `${key.slice(0, 7)}...${key.slice(-4)}`;

  // 2. Ping OpenAI with a minimal 1-token request
  try {
    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    const latencyMs = Date.now() - start;
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        status: 'FAIL',
        step: 'openai_call',
        http_status: res.status,
        key_prefix: maskedKey,
        error: data.error?.message ?? 'Unknown OpenAI error',
        raw: data,
      }, { status: 500 });
    }

    const reply = data.choices?.[0]?.message?.content ?? '';
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return NextResponse.json({
      status: 'OK',
      message: 'OpenAI API key is working correctly',
      key_prefix: maskedKey,
      model: data.model,
      reply,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'FAIL',
      step: 'network',
      key_prefix: maskedKey,
      error: err.message ?? 'Network error reaching OpenAI',
    }, { status: 500 });
  }
}
