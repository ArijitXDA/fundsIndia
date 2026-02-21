// POST /api/agent/chat
// FundsAgent chat endpoint — GPT-4o with tool calling, row-scope enforcement,
// conversation persistence, memory injection, and SSE streaming.
//
// Protocol:
//   Tool-call rounds run non-streaming (OpenAI doesn't stream tool calls well).
//   Once the final text response is ready, we stream it token-by-token via SSE.
//
// SSE event types sent to the client:
//   data: {"type":"token","token":"..."}      — incremental text token
//   data: {"type":"done","conversationId":"...","dataSources":[...],"tokensUsed":N}
//   data: {"type":"error","message":"..."}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { AGENT_TOOLS, executeTool, ToolContext } from '@/lib/agent/tools';
import { buildSystemPrompt } from '@/lib/agent/system-prompt';

export const dynamic = 'force-dynamic';

// Maximum tool call rounds per request (prevents infinite loops)
const MAX_TOOL_ROUNDS = 5;

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUser(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return null;

  const session = JSON.parse(sessionCookie.value);
  const { userId, employeeId: sessionEmployeeId } = session;

  // Fetch user row
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, employee_id')
    .eq('id', userId)
    .single();

  if (!user) return null;

  // Resolve employee ID — prefer DB value, fall back to session cookie
  // (session cookie always has employeeId set at login/impersonation time)
  const resolvedEmployeeId = user.employee_id ?? sessionEmployeeId ?? null;
  if (!resolvedEmployeeId) return null;

  // Fetch employee by PK
  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('id, employee_number, full_name, work_email, job_title, business_unit, department')
    .eq('id', resolvedEmployeeId)
    .single();

  return { ...user, employee: employee ?? null };
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function sseEvent(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const employee = user.employee as any;
  if (!employee) {
    return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });
  }

  // 2. Parse request body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    message,           // string: user's latest message
    conversationId,    // string | null: existing conversation ID to continue
    isProactive,       // boolean: if true, this is a proactive agent-initiated message
    stream = true,     // boolean: opt-in to SSE streaming (default true)
  } = body;

  if (!message && !isProactive) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // 3. Fetch agent config via view (fresh schema cache, bypasses stale agent_access cache)
  const { data: access } = await supabaseAdmin
    .from('agent_access_view')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('is_active', true)
    .single();

  if (!access) {
    return NextResponse.json(
      { error: 'FundsAgent is not enabled for your account. Contact your administrator.' },
      { status: 403 }
    );
  }

  // Fetch persona separately if assigned
  let persona: any = null;
  if (access.persona_id) {
    const { data: p } = await supabaseAdmin
      .from('agent_personas')
      .select('*')
      .eq('id', access.persona_id)
      .single();
    persona = p ?? null;
  }

  // 4. Fetch or create conversation
  let convId = conversationId;
  let existingMessages: any[] = [];

  if (convId) {
    const { data: conv } = await supabaseAdmin
      .from('agent_conversations')
      .select('id, employee_id')
      .eq('id', convId)
      .eq('employee_id', employee.id)
      .single();

    if (!conv) convId = null;
  }

  if (!convId) {
    const title = message
      ? message.slice(0, 80).replace(/\n/g, ' ')
      : 'Proactive insight session';

    const { data: newConv } = await supabaseAdmin
      .from('agent_conversations')
      .insert({
        employee_id: employee.id,
        persona_id: persona?.id ?? null,
        title,
        message_count: 0,
      })
      .select('id')
      .single();

    convId = newConv?.id ?? null;
  } else {
    const { data: msgs } = await supabaseAdmin
      .from('agent_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    existingMessages = (msgs ?? []).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  // 5. Fetch user memory
  const { data: rawMemoryRows } = await supabaseAdmin
    .from('agent_memory')
    .select('key, value, memory_type')
    .eq('employee_id', employee.id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(10);

  const memoryRows = (rawMemoryRows ?? []).map(m => ({
    memory_key: m.key,
    memory_value: m.value,
    memory_type: m.memory_type,
  }));

  // 6. Build system prompt
  const systemPrompt = buildSystemPrompt({
    agentName: persona?.agent_name ?? 'FundsAgent',
    employee: {
      full_name: employee.full_name,
      employee_number: employee.employee_number,
      job_title: employee.job_title,
      business_unit: employee.business_unit,
      department: employee.department,
    },
    persona: {
      tone: persona?.tone ?? 'professional',
      outputFormat: persona?.output_format ?? 'conversational',
      systemPromptOverride: persona?.system_prompt_override,
    },
    capabilities: {
      proactiveInsights:   access.override_can_proactively_surface_insights ?? persona?.can_proactively_surface_insights ?? false,
      recommendations:     access.override_can_make_recommendations ?? persona?.can_make_recommendations ?? false,
      forecasting:         persona?.can_do_forecasting ?? false,
      contestStrategy:     persona?.can_suggest_contest_strategy ?? false,
      discussOrgStructure: persona?.can_discuss_org_structure ?? false,
      queryDatabase:       access.can_query_database ?? false,
    },
    dataAccess: {
      accessDescription:   access.access_description,
      noAccessDescription: access.no_access_description,
      rowScope:            access.row_scope as any,
      allowedTables:       access.allowed_tables,
      deniedTables:        access.denied_tables,
    },
    queryDbConfig: (access.query_db_config as any) ?? null,
    memory: memoryRows ?? [],
  });

  // 7. Build tool context
  const toolCtx: ToolContext = {
    employeeNumber:  employee.employee_number,
    employeeId:      employee.id,
    businessUnit:    employee.business_unit,
    workEmail:       (employee.work_email ?? '').trim().toLowerCase(),
    rowScope:        access.row_scope as any,
    allowedTables:   access.allowed_tables,
    queryDbConfig:   access.can_query_database ? (access.query_db_config as any ?? {}) : null,
  };

  // 8. Build messages array for OpenAI
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...existingMessages,
  ];
  if (message) messages.push({ role: 'user', content: message });

  // 9. API config
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const model              = persona?.model ?? 'gpt-4o';
  const temperature        = persona?.temperature ?? 0.7;
  const topP               = persona?.top_p ?? 1;
  const maxTokens          = persona?.max_tokens ?? 1000;
  const presencePenalty    = persona?.presence_penalty ?? 0;
  const frequencyPenalty   = persona?.frequency_penalty ?? 0;

  const availableTools = filterTools(AGENT_TOOLS, access, persona);

  let totalTokensUsed = 0;
  const dataSources: string[] = [];
  let currentMessages = [...messages];

  // ── Phase A: Tool-call rounds (non-streaming) ───────────────────────────────
  // Run tool calls until the model produces a final text response or max rounds.
  // We stop one step early — instead of collecting the final text here,
  // we let Phase B stream it.

  let round = 0;
  let needsFinalStream = true; // will be false if we got a non-tool answer early

  while (round < MAX_TOOL_ROUNDS) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: currentMessages,
        ...(availableTools.length > 0 ? { tools: availableTools, tool_choice: 'auto' } : {}),
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
        // No stream here — tool-call parsing needs complete JSON
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = `OpenAI error ${response.status}: ${JSON.stringify(errBody)}`;

      if (stream) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const enc = new TextEncoder();
        writer.write(enc.encode(sseEvent({ type: 'error', message: errMsg })));
        writer.close();
        return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    const completion = await response.json();
    totalTokensUsed += completion.usage?.total_tokens ?? 0;

    const choice       = completion.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) break;

    currentMessages.push(assistantMsg);

    // No tool calls → model already gave us the final text in this non-streaming call.
    // We'll stream it character-by-character from memory instead of re-calling OpenAI.
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      const finalText = assistantMsg.content ?? '';

      // Persist to DB
      await persistMessages({
        convId, employeeId: employee.id, message, isProactive, finalContent: finalText,
        dataSources, totalTokensUsed, model, existingMessages,
      });

      if (!stream) {
        return NextResponse.json({
          reply: finalText,
          conversationId: convId,
          model,
          tokensUsed: totalTokensUsed,
          dataSources: [...new Set(dataSources)],
        });
      }

      // Stream the already-collected text token-by-token
      return streamTextResponse(finalText, convId, dataSources, totalTokensUsed);
    }

    // Execute all tool calls in this round
    const toolResultMsgs: any[] = [];
    for (const tc of assistantMsg.tool_calls) {
      const toolName = tc.function.name;
      const toolArgs = JSON.parse(tc.function.arguments ?? '{}');

      let toolResult: any;
      try {
        toolResult = await executeTool(toolName, toolArgs, toolCtx);
        dataSources.push(toolName);
      } catch (err: any) {
        toolResult = { error: err.message ?? 'Tool execution failed' };
      }

      toolResultMsgs.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    currentMessages.push(...toolResultMsgs);
    round++;
  }

  // ── Phase B: Final streaming response ──────────────────────────────────────
  // All tool rounds are done; now ask OpenAI to generate the final answer with stream=true.

  if (!stream) {
    // Non-streaming fallback (e.g. proactive calls from server side)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: currentMessages,
        ...(availableTools.length > 0 ? { tools: availableTools, tool_choice: 'none' } : {}),
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
      }),
    });

    const completion = await response.json();
    totalTokensUsed += completion.usage?.total_tokens ?? 0;
    const finalContent = completion.choices?.[0]?.message?.content
      ?? 'I was unable to complete your request. Please try again.';

    await persistMessages({
      convId, employeeId: employee.id, message, isProactive, finalContent,
      dataSources, totalTokensUsed, model, existingMessages,
    });

    return NextResponse.json({
      reply: finalContent,
      conversationId: convId,
      model,
      tokensUsed: totalTokensUsed,
      dataSources: [...new Set(dataSources)],
    });
  }

  // Streaming: call OpenAI with stream=true, pipe SSE tokens to client
  const streamResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: currentMessages,
      // Force text-only response in final step — no more tool calls.
      // Only send tool_choice when tools are actually present (OpenAI 400s otherwise).
      ...(availableTools.length > 0 ? { tools: availableTools, tool_choice: 'none' } : {}),
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      stream: true,
    }),
  });

  if (!streamResponse.ok || !streamResponse.body) {
    const errBody = await streamResponse.json().catch(() => ({}));
    const errMsg = `OpenAI stream error ${streamResponse.status}: ${JSON.stringify(errBody)}`;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    writer.write(enc.encode(sseEvent({ type: 'error', message: errMsg })));
    writer.close();
    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  // Pipe OpenAI SSE → our SSE, collect full text for DB persist
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  let fullContent = '';
  let streamTokens = 0;

  (async () => {
    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const chunk = JSON.parse(raw);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              writer.write(enc.encode(sseEvent({ type: 'token', token: delta })));
            }
            // Accumulate usage if present (some models send it in the final chunk)
            if (chunk.usage?.total_tokens) {
              streamTokens = chunk.usage.total_tokens;
            }
          } catch {
            // Malformed chunk — skip
          }
        }
      }
    } catch (err: any) {
      writer.write(enc.encode(sseEvent({ type: 'error', message: err.message ?? 'Stream read error' })));
    } finally {
      totalTokensUsed += streamTokens;

      // Persist to DB after streaming completes
      await persistMessages({
        convId, employeeId: employee.id, message, isProactive, finalContent: fullContent,
        dataSources, totalTokensUsed, model, existingMessages,
      }).catch(console.error);

      // Build engine context for engines 2 & 3:
      // Strip the system message (index 0) — engines get their own system prompt.
      // Include all user + assistant + tool result messages so engines have full data context.
      const messagesForEngines = currentMessages.filter(
        (m: any) => m.role !== 'system'
      );

      writer.write(enc.encode(sseEvent({
        type: 'done',
        conversationId: convId,
        dataSources: [...new Set(dataSources)],
        tokensUsed: totalTokensUsed,
        // Engines 2 & 3 receive these to generate their independent analyses
        toolResultsForEngines: messagesForEngines,
        systemPrompt,
      })));
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── Persist helper ────────────────────────────────────────────────────────────

async function persistMessages({
  convId, employeeId, message, isProactive, finalContent,
  dataSources, totalTokensUsed, model, existingMessages,
}: {
  convId: string | null;
  employeeId: string;
  message: string | undefined;
  isProactive: boolean | undefined;
  finalContent: string;
  dataSources: string[];
  totalTokensUsed: number;
  model: string;
  existingMessages: any[];
}) {
  if (!convId) return;

  const messagesToInsert: any[] = [];

  if (message) {
    messagesToInsert.push({
      conversation_id: convId,
      employee_id: employeeId,
      role: 'user',
      content: message,
    });
  }

  messagesToInsert.push({
    conversation_id: convId,
    employee_id: employeeId,
    role: 'assistant',
    content: finalContent,
    data_sources_used: dataSources,
    tokens_used: totalTokensUsed,
    model_used: model,
    is_proactive: isProactive ?? false,
  });

  await supabaseAdmin.from('agent_messages').insert(messagesToInsert);

  await supabaseAdmin
    .from('agent_conversations')
    .update({
      last_active_at: new Date().toISOString(),
      message_count: existingMessages.length + messagesToInsert.length,
    })
    .eq('id', convId);
}

// ── Stream text from memory (when model already answered in tool-round) ───────

function streamTextResponse(
  text: string,
  convId: string | null,
  dataSources: string[],
  tokensUsed: number
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    // Stream in ~4-character chunks to simulate typing
    const CHUNK = 4;
    for (let i = 0; i < text.length; i += CHUNK) {
      writer.write(enc.encode(sseEvent({ type: 'token', token: text.slice(i, i + CHUNK) })));
      await new Promise(r => setTimeout(r, 8)); // ~8ms between chunks → ~120 chars/sec
    }
    writer.write(enc.encode(sseEvent({
      type: 'done',
      conversationId: convId,
      dataSources: [...new Set(dataSources)],
      tokensUsed,
    })));
    writer.close();
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── Tool filter based on capabilities ────────────────────────────────────────

function filterTools(tools: any[], access: any, persona: any) {
  const canOrgStructure   = persona?.can_discuss_org_structure ?? false;
  const canProactive      = (access.override_can_proactively_surface_insights ?? persona?.can_proactively_surface_insights) ?? false;
  const canQueryDatabase  = access.can_query_database ?? false;
  const rowScope          = (access.row_scope as any)?.default ?? 'own_only';
  const isAllScope        = rowScope === 'all';

  return tools.filter(t => {
    if (t.function.name === 'get_org_structure'      && !canOrgStructure)  return false;
    if (t.function.name === 'get_proactive_insights' && !canProactive)     return false;
    if (t.function.name === 'get_company_summary'    && !isAllScope)       return false;
    // query_database only available when explicitly enabled per-user in agent_access
    if (t.function.name === 'query_database'         && !canQueryDatabase) return false;
    return true;
  });
}

// ── GET: fetch conversation history ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const employee = user.employee as any;
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const { data: conv } = await supabaseAdmin
        .from('agent_conversations')
        .select('id, title, started_at, last_active_at, message_count')
        .eq('id', conversationId)
        .eq('employee_id', employee.id)
        .single();

      if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      const { data: msgs } = await supabaseAdmin
        .from('agent_messages')
        .select('id, role, content, created_at, tokens_used, data_sources_used, is_proactive')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      return NextResponse.json({ conversation: conv, messages: msgs ?? [] });
    }

    // List all conversations
    const { data: conversations } = await supabaseAdmin
      .from('agent_conversations')
      .select('id, title, started_at, last_active_at, message_count, is_archived')
      .eq('employee_id', employee.id)
      .eq('is_archived', false)
      .order('last_active_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ conversations: conversations ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
