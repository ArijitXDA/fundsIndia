// POST /api/agent/feedback
// Records upvote/downvote on an agent message and updates agent_memory
// so future responses reflect the user's preferences.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── Memory key constants ──────────────────────────────────────────────────────
const MEMORY_KEY_POSITIVE = 'response_style_positive';
const MEMORY_KEY_NEGATIVE = 'response_style_feedback';

export async function POST(request: NextRequest) {
  // Auth check — same custom session cookie used by the rest of the app
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let sessionData: any;
  try {
    sessionData = JSON.parse(sessionCookie.value);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const { userId, employeeId: sessionEmployeeId } = sessionData;

  // Resolve employee
  const { data: user } = await supabaseAdmin
    .from('users').select('id, employee_id').eq('id', userId).single();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  let body: { messageId: string; engine: string; rating: 'up' | 'down'; messageContent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messageId, engine, rating, messageContent } = body;
  if (!messageId || !rating || !engine) {
    return NextResponse.json({ error: 'messageId, engine, and rating are required' }, { status: 400 });
  }
  if (!['up', 'down'].includes(rating)) {
    return NextResponse.json({ error: 'rating must be "up" or "down"' }, { status: 400 });
  }
  if (!['engine1', 'engine2', 'engine3'].includes(engine)) {
    return NextResponse.json({ error: 'engine must be engine1, engine2, or engine3' }, { status: 400 });
  }

  // Resolve employee from DB (prefer DB, fall back to session)
  const resolvedEmployeeId = user.employee_id ?? sessionEmployeeId ?? null;
  if (!resolvedEmployeeId) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }
  const { data: emp } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('id', resolvedEmployeeId)
    .single();

  if (!emp) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  const employeeId = emp.id;
  const dateStr    = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // ── 1. Upsert feedback record ─────────────────────────────────────────────
  const { error: fbError } = await supabaseAdmin
    .from('agent_message_feedback')
    .upsert(
      { message_id: messageId, employee_id: employeeId, engine, rating },
      { onConflict: 'message_id,employee_id,engine' }
    );

  if (fbError) {
    console.error('[feedback] DB upsert error:', fbError);
    return NextResponse.json({ error: fbError.message }, { status: 500 });
  }

  // ── 2. Update agent_memory for personalisation ────────────────────────────
  // We store a rolling preference note. Future conversations inject this
  // into the system prompt via buildMemoryBlock().

  const snippet = messageContent
    ? messageContent.slice(0, 120).replace(/\n/g, ' ') + (messageContent.length > 120 ? '…' : '')
    : null;

  if (rating === 'up') {
    // Positive signal — reinforce this style
    const memValue = snippet
      ? `On ${dateStr}, user upvoted a response. Appreciated style: "${snippet}". Continue delivering this level of depth, format, and insight.`
      : `On ${dateStr}, user upvoted a response. Continue using similar depth and format.`;

    await supabaseAdmin.from('agent_memory').upsert(
      {
        employee_id:  employeeId,
        memory_type:  'preference',
        memory_key:   MEMORY_KEY_POSITIVE,
        memory_value: memValue,
        source:       'user_stated',
        confidence:   1.0,
      },
      { onConflict: 'employee_id,memory_key' }
    );

  } else {
    // Negative signal — adjust style
    const memValue = snippet
      ? `On ${dateStr}, user downvoted a response. Avoid this kind of answer: "${snippet}". Prefer more concise responses with direct numbers and cleaner formatting.`
      : `On ${dateStr}, user downvoted a response. Prefer more concise, direct answers with clear data points. Avoid verbose explanations.`;

    await supabaseAdmin.from('agent_memory').upsert(
      {
        employee_id:  employeeId,
        memory_type:  'preference',
        memory_key:   MEMORY_KEY_NEGATIVE,
        memory_value: memValue,
        source:       'user_stated',
        confidence:   1.0,
      },
      { onConflict: 'employee_id,memory_key' }
    );
  }

  return NextResponse.json({ ok: true, rating, engine });
}
