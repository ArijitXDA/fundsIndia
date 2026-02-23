// POST /api/agent/chat/engine2
// Thinking Engine 2 (DeepSeek-V3) — full independent tool-calling loop.
// Receives the user message + system prompt from the client, then runs its own
// tool-calling rounds (identical pattern to Engine 1) before streaming its response.
// This gives Engine 2 genuinely independent data access rather than just re-analysing
// Engine 1's results.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';
import { AGENT_TOOLS, executeTool, ToolContext } from '@/lib/agent/tools';

export const dynamic = 'force-dynamic';

const DEEPSEEK_API   = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek-V3
const MAX_TOOL_ROUNDS = 8;

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
  const canOrgStructure  = true; // E2 enabled for org structure — useful for context
  const canProactive     = (access.override_can_proactively_surface_insights ?? false);
  const canQueryDatabase = access.can_query_database ?? false;
  const rowScope         = (access.row_scope as any)?.default ?? 'own_only';
  const isAllScope       = rowScope === 'all';
  const businessUnit     = access.business_unit ?? '';
  const canPWSummary     = isAllScope
    || businessUnit === 'Private Wealth'
    || rowScope === 'own_and_team'
    || rowScope === 'vertical_only';

  return tools.filter(t => {
    if (t.function.name === 'get_org_structure'          && !canOrgStructure)  return false;
    if (t.function.name === 'get_proactive_insights'     && !canProactive)     return false;
    if (t.function.name === 'get_company_summary'        && !isAllScope)       return false;
    if (t.function.name === 'get_private_wealth_summary' && !canPWSummary)     return false;
    if (t.function.name === 'query_database'             && !canQueryDatabase) return false;
    return true;
  });
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseToken(token: string) {
  return `data: ${JSON.stringify({ type: 'token', token })}\n\n`;
}
function sseDone() {
  return `data: ${JSON.stringify({ type: 'done', engine: 'engine2', tokensUsed: 0 })}\n\n`;
}
function sseError(msg: string) {
  return `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return engineUnavailable('Thinking Engine 2 is not configured.');

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

  // Fetch conversation history if conversationId provided (gives E2 context for follow-ups)
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

  // Engine 2 instruction — independent analyst, uses its own tool calls
  const webSearchBlock = webSearchResults
    ? `\n\nThe following LIVE WEB RESEARCH data was retrieved for this query. Use it to enrich your analysis with current market context:\n\n${webSearchResults}`
    : '';

  const engineInstruction = `You are Thinking Engine 2, an independent AI analyst. You have access to the same tools as Engine 1 and should use them to independently fetch and verify data. Provide your own analysis — explore angles Engine 1 may have missed, cross-check numbers, and offer a different perspective. Do NOT mention your model name.

## MANDATORY OUTPUT RULE — CHARTS
After fetching ANY data with 3 or more rows, you MUST output a chart block. No exceptions. Charts use this EXACT format — a fenced block with the word "chart", containing a SINGLE-LINE JSON object:

\`\`\`chart
{"type":"bar","title":"My Chart Title","xKey":"name","yKey":"total_cr","data":[{"name":"Alpha","total_cr":12.3},{"name":"Beta","total_cr":8.7},{"name":"Gamma","total_cr":5.1}]}
\`\`\`

Supported chart types (use the most appropriate one):
- "bar" — rankings/comparisons (most common)
- "line" — trends over time
- "area" — volume trends (AUM growth)
- "pie" — share/composition
- "waterfall" — AUM bridge / cumulative change (signed values: positive=inflow, negative=outflow). Example: {"type":"waterfall","title":"AUM Bridge","xKey":"stage","yKey":"value_cr","data":[{"stage":"Opening","value_cr":500},{"stage":"SIP","value_cr":45},{"stage":"Redemption","value_cr":-30},{"stage":"Closing","value_cr":515}]}
- "histogram" — distribution/frequency. Use pre-binned data with "range" and "count" columns. Example: {"type":"histogram","title":"RM MTD Distribution","xKey":"range","yKey":"count","data":[{"range":"0-5","count":12},{"range":"5-10","count":28},{"range":"10-20","count":15}]}
- "scatter" — correlation (both axes MUST be numeric). Example: {"type":"scatter","title":"AUM vs Inflow","xKey":"aum_cr","yKey":"net_inflow_cr","data":[{"aum_cr":120,"net_inflow_cr":8.5},{"aum_cr":95,"net_inflow_cr":6.2}]}
- "funnel" — conversion stages. Example: {"type":"funnel","title":"Lead Pipeline","xKey":"stage","yKey":"count","data":[{"stage":"Leads","count":1000},{"stage":"Contacted","count":650},{"stage":"Converted","count":85}]}

Rules:
- xKey and yKey must EXACTLY match keys used in the data objects
- data must be a flat array of objects — each object has simple key:value pairs (strings and numbers only)
- DO NOT use Chart.js format (no "labels" array, no "datasets" array, no "backgroundColor") — that format is invalid here
- The JSON must be on ONE LINE inside the code fence — no newlines within the JSON

After every chart block, add a rawdata block with the full query result (used for Excel export):
\`\`\`rawdata
[{"col1":"val","col2":123}]
\`\`\`

## CRITICAL DATABASE RULES

**1. Employee tenure column:** Always use \`date_joined\` — NOT hire_date, NOT join_date, NOT joining_date.

**2. Employee table — aggregation required:** The employees table has 1100+ rows. NEVER do SELECT * or fetch raw rows. ALWAYS use GROUP BY + COUNT/SUM/AVG to aggregate. Example for department breakdown:
\`\`\`sql
SELECT department, COUNT(*) as headcount
FROM employees
WHERE employment_status = 'Working'
GROUP BY department
ORDER BY headcount DESC
LIMIT 50
\`\`\`
Example for vintage/tenure breakdown:
\`\`\`sql
SELECT
  CASE
    WHEN date_joined >= CURRENT_DATE - INTERVAL '1 year' THEN '0-1 yr'
    WHEN date_joined >= CURRENT_DATE - INTERVAL '3 years' THEN '1-3 yrs'
    WHEN date_joined >= CURRENT_DATE - INTERVAL '5 years' THEN '3-5 yrs'
    ELSE '5+ yrs'
  END as tenure_band,
  COUNT(*) as headcount
FROM employees
WHERE employment_status = 'Working' AND date_joined IS NOT NULL
GROUP BY tenure_band
ORDER BY headcount DESC
LIMIT 10
\`\`\`

**3. Names not IDs:** Never display raw W-prefixed IDs in the response. Always JOIN employees table to get full_name:
\`\`\`sql
JOIN employees e ON e.employee_number = b."RM Emp ID"
\`\`\`
Or use get_rankings / get_team_performance tools which resolve names automatically.

**4. Employment status:** Filter active employees with \`WHERE employment_status = 'Working'\` (NOT 'Active').

**5. B2B sales text cast:** "Total Net Sales (COB 100%)" and other B2B columns are stored as TEXT. Always cast: \`NULLIF("Total Net Sales (COB 100%)", '')::numeric\`. Always GROUP BY "RM Emp ID" and SUM.

**6. gs_overall_sales DOES contain Private Wealth data — verified fact:**
IMPORTANT: Your training data may suggest gs_overall_sales only has B2B and B2C. THIS IS WRONG. The live table has three segments: "B2B", "B2C", and "Private Wealth". The \`business_segment\` column holds exactly these string values. NEVER say "gs_overall_sales only has B2B and B2C" — always query it with \`WHERE business_segment = 'Private Wealth'\`. Verified SQL:
\`\`\`sql
SELECT daywise as month,
  ROUND(SUM(aum_amount)::numeric / 10000000, 2) as aum_cr,
  ROUND(SUM(sipinflow_amount)::numeric / 10000000, 2) as sip_cr,
  ROUND(SUM(redemption_amount)::numeric / 10000000, 2) as redemption_cr,
  COUNT(DISTINCT arn_rm) as advisors
FROM gs_overall_sales
WHERE business_segment = 'Private Wealth'
GROUP BY daywise
ORDER BY daywise ASC
LIMIT 50
\`\`\`
Use \`get_private_wealth_summary\` tool for a pre-aggregated PW summary (faster, no query_database needed).

**7. Histogram and distribution questions — always query the FULL table:**
When asked for a histogram, distribution, performance brackets, or "how many RMs are in band X", you MUST query the full table for ALL employees — NOT just your own team. Use query_database with GROUP BY or CASE buckets:
\`\`\`sql
-- B2B RM MTD performance distribution (5 equal-width bins from 0 to max)
WITH rm_totals AS (
  SELECT "RM Emp ID",
         SUM(NULLIF("Total Net Sales (COB 100%)", '')::numeric) as mtd_cr
  FROM b2b_sales_current_month
  GROUP BY "RM Emp ID"
),
stats AS (SELECT MAX(mtd_cr) as max_val, MIN(mtd_cr) as min_val FROM rm_totals),
binned AS (
  SELECT
    FLOOR((r.mtd_cr - s.min_val) / NULLIF((s.max_val - s.min_val), 0) * 4.999)::int as bin_idx,
    s.min_val, s.max_val,
    (s.max_val - s.min_val) / 5 as bin_width,
    r.mtd_cr
  FROM rm_totals r, stats s
)
SELECT
  bin_idx,
  ROUND((min_val + bin_idx * bin_width)::numeric, 1) || '–' ||
  ROUND((min_val + (bin_idx + 1) * bin_width)::numeric, 1) as range,
  COUNT(*) as count
FROM binned
GROUP BY bin_idx, min_val, bin_width
ORDER BY bin_idx
LIMIT 10
\`\`\`
For B2C, use "net_inflow_mtd[cr]" from the b2c table. For PW, use aum_amount or sipinflow_amount from gs_overall_sales. NEVER scope distribution queries to your own team — always use the full table.

**8. Self-verification on empty results:** If a tool returns row_count:0 or empty array — retry with broader filters before reporting "no data". Explain what filter caused the empty result.

**MANDATORY: Always call at least one tool before writing your response.** Do not answer from the system prompt context alone — independently verify by calling get_private_wealth_summary, query_database, get_company_summary, get_team_performance, or get_rankings first.${webSearchBlock}`;

  // Build initial messages: system prompt + engine instruction + prior conversation context + new user message
  let currentMessages: any[] = [
    { role: 'system', content: `${systemPrompt}\n\n${engineInstruction}` },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ];

  // ── Tool-calling loop (non-streaming) ─────────────────────────────────────
  // Round 0: force a tool call so E2 always fetches live data before answering.
  // Subsequent rounds: 'auto' lets the model decide when to stop calling tools.
  let round = 0;
  let finalText: string | null = null;

  while (round < MAX_TOOL_ROUNDS) {
    const toolChoiceForRound = (availableTools.length > 0 && round === 0) ? 'required' : (availableTools.length > 0 ? 'auto' : undefined);
    let dsRes: Response;
    try {
      dsRes = await fetch(DEEPSEEK_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model:       DEEPSEEK_MODEL,
          messages:    currentMessages,
          tools:       availableTools.length > 0 ? availableTools : undefined,
          tool_choice: toolChoiceForRound,
          temperature: 0.7,
          max_tokens:  4000,
          stream:      false,
        }),
      });
    } catch {
      return engineUnavailable('Thinking Engine 2 could not connect.');
    }

    if (!dsRes.ok) {
      const friendlyMsg = dsRes.status === 402
        ? 'Thinking Engine 2 is temporarily unavailable (insufficient credits).'
        : dsRes.status === 401
        ? 'Thinking Engine 2 is not authorised — check DEEPSEEK_API_KEY.'
        : `Thinking Engine 2 error (status ${dsRes.status}).`;
      return engineUnavailable(friendlyMsg);
    }

    const completion  = await dsRes.json();
    const assistantMsg = completion.choices?.[0]?.message;
    if (!assistantMsg) break;

    currentMessages.push(assistantMsg);

    // No tool calls → this is the final text response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = assistantMsg.content ?? '';
      break;
    }

    // Some models emit both tool_calls AND content in the same message.
    // Only capture as candidate finalText if the content is a substantial complete-looking
    // answer (>200 chars) — short intermediate thoughts like "I see the issue, let me check"
    // should NOT be captured as the final answer.
    // IMPORTANT: Reset finalText here so a previous intermediate capture doesn't persist
    // if the model makes more tool calls in subsequent rounds.
    finalText = null;
    if (assistantMsg.content && assistantMsg.content.trim().length > 200) {
      finalText = assistantMsg.content;
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
  // which would cause DeepSeek to ignore its own tool results and say "let me check…"
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

      // Tool rounds exhausted without a text response — inject a synthesis instruction
      // then ask DeepSeek to write its final answer from the already-fetched data.
      // CRITICAL: Inject a user→assistant exchange that primes DeepSeek to synthesise,
      // not re-investigate. Without this, it says "I see the issue, let me check…"
      const synthesisMessages = [
        ...currentMessages,
        {
          role: 'user',
          content: 'You have already fetched all the data you need from the tools above. ' +
            'Now write your complete final answer. ' +
            'Do NOT call any more tools. Do NOT say "let me check" or "I see the issue". ' +
            'Use the tool results already in this conversation to produce your response. ' +
            'Include the appropriate chart block (waterfall/histogram/scatter/funnel/bar/line/area/pie) ' +
            'and a rawdata block as instructed.',
        },
      ];

      let streamRes: Response;
      try {
        streamRes = await fetch(DEEPSEEK_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model:       DEEPSEEK_MODEL,
            messages:    synthesisMessages,
            tool_choice: 'none',
            temperature: 0.3,   // lower temperature → less wandering, more direct synthesis
            max_tokens:  4000,
            stream:      true,
          }),
        });
      } catch {
        await writer.write(encoder.encode(sseToken('⚠️ Thinking Engine 2 could not complete the analysis.')));
        await writer.write(encoder.encode(sseDone()));
        await writer.close();
        return;
      }

      if (!streamRes.ok || !streamRes.body) {
        await writer.write(encoder.encode(sseToken('⚠️ Thinking Engine 2 is temporarily unavailable.')));
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
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) await writer.write(encoder.encode(sseToken(token)));
          } catch { /* ignore malformed */ }
        }
      }

      await writer.write(encoder.encode(sseDone()));
    } catch (err: any) {
      await writer.write(encoder.encode(sseError(err.message ?? 'Engine 2 stream error')));
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
