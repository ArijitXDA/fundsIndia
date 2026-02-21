// POST /api/agent/chat/engine3
// Thinking Engine 3 (Grok/xAI) — full independent tool-calling loop.
// Receives the user message + system prompt from the client, then runs its own
// tool-calling rounds (identical pattern to Engine 1) before streaming its response.
// This gives Engine 3 genuinely independent data access for strategic analysis.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';
import { AGENT_TOOLS, executeTool, ToolContext } from '@/lib/agent/tools';

export const dynamic = 'force-dynamic';

const GROK_API   = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3-mini';
const MAX_TOOL_ROUNDS = 5;

// ── Auth + context resolution ─────────────────────────────────────────────────

async function resolveContext(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return null;

  let session: any;
  try { session = JSON.parse(sessionCookie.value); } catch { return null; }
  const { userId, employeeId: sessionEmployeeId } = session;

  const { data: user } = await supabaseAdmin
    .from('users').select('id, employee_id').eq('id', userId).single();
  if (!user) return null;

  const resolvedEmployeeId = user.employee_id ?? sessionEmployeeId ?? null;
  if (!resolvedEmployeeId) return null;

  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('id, employee_number, full_name, work_email, job_title, business_unit, department')
    .eq('id', resolvedEmployeeId)
    .single();
  if (!employee) return null;

  const { data: access } = await supabaseAdmin
    .from('agent_access_view')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('is_active', true)
    .single();
  if (!access) return null;

  return { employee, access };
}

// ── Tool filter (mirrors Engine 1) ────────────────────────────────────────────

function filterTools(tools: any[], access: any) {
  const canOrgStructure  = false; // Engine 3 stays focused on data & strategy
  const canProactive     = (access.override_can_proactively_surface_insights ?? false);
  const canQueryDatabase = access.can_query_database ?? false;
  const rowScope         = (access.row_scope as any)?.default ?? 'own_only';
  const isAllScope       = rowScope === 'all';

  return tools.filter(t => {
    if (t.function.name === 'get_org_structure'      && !canOrgStructure)  return false;
    if (t.function.name === 'get_proactive_insights' && !canProactive)     return false;
    if (t.function.name === 'get_company_summary'    && !isAllScope)       return false;
    if (t.function.name === 'query_database'         && !canQueryDatabase) return false;
    return true;
  });
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseToken(token: string) {
  return `data: ${JSON.stringify({ type: 'token', token })}\n\n`;
}
function sseDone() {
  return `data: ${JSON.stringify({ type: 'done', engine: 'engine3', tokensUsed: 0 })}\n\n`;
}
function sseError(msg: string) {
  return `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return engineUnavailable('Thinking Engine 3 is not configured.');

  // Resolve auth + employee + access
  const ctx = await resolveContext(request);
  if (!ctx) return engineUnavailable('Not authenticated');
  const { employee, access } = ctx;

  let body: {
    messages:          Array<{ role: string; content: string }>;
    systemPrompt:      string;
    userMessage:       string;
    conversationId?:   string;
    webSearchResults?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, systemPrompt, userMessage, conversationId, webSearchResults } = body;
  if (!userMessage) {
    return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
  }

  // Fetch conversation history if conversationId provided (gives E3 context for follow-ups)
  let historyMessages: Array<{ role: string; content: string }> = messages ?? [];
  if (conversationId && historyMessages.length === 0) {
    const { data: msgs } = await supabaseAdmin
      .from('agent_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(6);
    historyMessages = (msgs ?? []).reverse().map(m => ({ role: m.role, content: m.content }));
  }

  // Build tool context
  const toolCtx: ToolContext = {
    employeeNumber: employee.employee_number,
    employeeId:     employee.id,
    businessUnit:   employee.business_unit,
    workEmail:      (employee.work_email ?? '').trim().toLowerCase(),
    rowScope:       access.row_scope as any,
    allowedTables:  access.allowed_tables,
    queryDbConfig:  access.can_query_database ? (access.query_db_config as any ?? {}) : null,
  };

  const availableTools = filterTools(AGENT_TOOLS, access);

  // Engine 3 instruction — strategic analyst, uses its own tool calls
  const webSearchBlock = webSearchResults
    ? `\n\nThe following LIVE WEB RESEARCH data was retrieved for this query. Use it to enrich your analysis with current market context:\n\n${webSearchResults}`
    : '';

  const engineInstruction = `You are Thinking Engine 3, an independent strategic AI analyst. You have access to the same tools as other engines and should use them to independently fetch data. Focus on strategic implications, risk factors, and actionable leadership recommendations. Explore angles and insights others may have missed. Do NOT mention your model name. Use the same formatting rules (charts via \`\`\`chart blocks, bullets, bold) as described in the system prompt.

⚠️ CRITICAL DATABASE RULES — FOLLOW EXACTLY OR QUERIES WILL FAIL:

1. COLUMN NAME: The employee tenure/joining date column is called \`date_joined\` (NOT hire_date, NOT join_date, NOT joining_date). Always use \`date_joined\` for any tenure, vintage, or joining-date analysis.

2. CHART FORMAT: Charts MUST use this exact format with a single-line JSON:
\`\`\`chart
{"type":"bar","title":"Title Here","xKey":"field_name","yKey":"value_field","data":[{"field_name":"Label","value_field":123}]}
\`\`\`
Do NOT use Chart.js format (labels/datasets). The xKey and yKey must match exact keys in the data objects.

3. NAMES NOT IDs: Never show raw employee IDs (W1234) in responses. Always JOIN with the employees table to get full_name, or use get_rankings/get_team_performance tools that already resolve names.

4. LARGE TABLES: When analysing employees (1100+ rows), ALWAYS use COUNT/GROUP BY aggregation queries — never SELECT * or fetch raw rows. Use LIMIT only on aggregated results, not on the input data before aggregation.

5. EMPLOYMENT STATUS: Filter active employees with \`WHERE employment_status = 'Working'\` (NOT 'Active').

6. B2B SALES: Columns like "Total Net Sales (COB 100%)" are stored as TEXT — always cast: \`NULLIF("Total Net Sales (COB 100%)", '')::numeric\`. Always GROUP BY "RM Emp ID" and SUM — never use single-row lookups on B2B tables.${webSearchBlock}`;

  // Build initial messages: system prompt + engine instruction + prior conversation context + new user message
  let currentMessages: any[] = [
    { role: 'system', content: `${systemPrompt}\n\n${engineInstruction}` },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ];

  // ── Tool-calling loop (non-streaming) ─────────────────────────────────────
  let round = 0;
  let finalText: string | null = null;

  while (round < MAX_TOOL_ROUNDS) {
    let grokRes: Response;
    try {
      grokRes = await fetch(GROK_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model:       GROK_MODEL,
          messages:    currentMessages,
          tools:       availableTools.length > 0 ? availableTools : undefined,
          tool_choice: availableTools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,
          max_tokens:  1500,
          stream:      false,
        }),
      });
    } catch {
      return engineUnavailable('Thinking Engine 3 could not connect.');
    }

    if (!grokRes.ok) {
      const friendlyMsg = grokRes.status === 401 || grokRes.status === 400
        ? 'Thinking Engine 3 is not authorised — check GROK_API_KEY (must start with "xai-").'
        : grokRes.status === 402
        ? 'Thinking Engine 3 is temporarily unavailable (insufficient credits).'
        : `Thinking Engine 3 error (status ${grokRes.status}).`;
      return engineUnavailable(friendlyMsg);
    }

    const completion   = await grokRes.json();
    const assistantMsg = completion.choices?.[0]?.message;
    if (!assistantMsg) break;

    currentMessages.push(assistantMsg);

    // No tool calls → this is the final text response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = assistantMsg.content ?? '';
      break;
    }

    // Execute tool calls
    const toolResults: any[] = [];
    for (const tc of assistantMsg.tool_calls) {
      let result: any;
      try {
        result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments ?? '{}'), toolCtx);
      } catch (err: any) {
        result = { error: err.message ?? 'Tool execution failed' };
      }
      toolResults.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
    currentMessages.push(...toolResults);
    round++;
  }

  // ── Stream the response ───────────────────────────────────────────────────
  // If finalText was already collected during the tool loop (the model returned
  // a text response mid-loop), stream it directly — do NOT make another API call,
  // which would cause the model to ignore its own tool results.
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      if (finalText !== null) {
        // Already have the answer — stream it char-by-char, no extra API call needed
        await streamTextFallback(writer, encoder, finalText);
        await writer.write(encoder.encode(sseDone()));
        await writer.close();
        return;
      }

      // Tool rounds exhausted — ask Grok to synthesise what it found
      let streamRes: Response;
      try {
        streamRes = await fetch(GROK_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model:       GROK_MODEL,
            messages:    currentMessages,
            tool_choice: 'none',
            temperature: 0.7,
            max_tokens:  1500,
            stream:      true,
          }),
        });
      } catch {
        await writer.write(encoder.encode(sseToken('⚠️ Thinking Engine 3 could not complete the analysis.')));
        await writer.write(encoder.encode(sseDone()));
        await writer.close();
        return;
      }

      if (!streamRes.ok || !streamRes.body) {
        await writer.write(encoder.encode(sseToken('⚠️ Thinking Engine 3 is temporarily unavailable.')));
        await writer.write(encoder.encode(sseDone()));
        await writer.close();
        return;
      }

      const reader  = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content ?? '';
            if (token) await writer.write(encoder.encode(sseToken(token)));
          } catch { /* ignore malformed */ }
        }
      }

      await writer.write(encoder.encode(sseDone()));
    } catch (err: any) {
      await writer.write(encoder.encode(sseError(err.message ?? 'Engine 3 stream error')));
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function streamTextFallback(writer: WritableStreamDefaultWriter, encoder: TextEncoder, text: string) {
  const CHUNK = 4;
  for (let i = 0; i < text.length; i += CHUNK) {
    await writer.write(encoder.encode(sseToken(text.slice(i, i + CHUNK))));
    await new Promise(r => setTimeout(r, 8));
  }
}

function engineUnavailable(message: string): NextResponse {
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseToken(`⚠️ ${message}`)));
      controller.enqueue(encoder.encode(sseDone()));
      controller.close();
    },
  });
  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
