// POST /api/agent/chat
// FundsAgent chat endpoint — GPT-4o with tool calling, row-scope enforcement,
// conversation persistence, and memory injection.

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

  const { userId } = JSON.parse(sessionCookie.value);

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, employee:employees(id, employee_number, full_name, work_email, job_title, business_unit, department)')
    .eq('id', userId)
    .single();

  return user;
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
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
    const body = await request.json();
    const {
      message,           // string: user's latest message
      conversationId,    // string | null: existing conversation ID to continue
      isProactive,       // boolean: if true, this is a proactive agent-initiated message
    } = body;

    if (!message && !isProactive) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // 3. Fetch agent config for this user
    const { data: access } = await supabaseAdmin
      .from('agent_access')
      .select('*, persona:agent_personas(*)')
      .eq('employee_id', employee.id)
      .eq('is_active', true)
      .single();

    if (!access) {
      return NextResponse.json(
        { error: 'FundsAgent is not enabled for your account. Contact your administrator.' },
        { status: 403 }
      );
    }

    const persona = access.persona as any;

    // 4. Fetch or create conversation
    let convId = conversationId;
    let existingMessages: any[] = [];

    if (convId) {
      // Validate conversation belongs to this employee
      const { data: conv } = await supabaseAdmin
        .from('agent_conversations')
        .select('id, employee_id')
        .eq('id', convId)
        .eq('employee_id', employee.id)
        .single();

      if (!conv) convId = null; // reset if not found or wrong employee
    }

    if (!convId) {
      // Create a new conversation
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
      // Load recent message history (last 20 messages for context window)
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
    // Live schema uses: key, value, expires_at (not memory_key/memory_value/expiry_at)
    const { data: rawMemoryRows } = await supabaseAdmin
      .from('agent_memory')
      .select('key, value, memory_type')
      .eq('employee_id', employee.id)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(10);

    // Normalise to the interface expected by buildSystemPrompt
    const memoryRows = (rawMemoryRows ?? []).map(m => ({
      memory_key: m.key,
      memory_value: m.value,
      memory_type: m.memory_type,
    }));

    // 6. Build system prompt
    const scopeDefault = (access.row_scope as any)?.default ?? 'own_only';

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
        // Live schema uses override_can_proactively_surface_insights / override_can_make_recommendations
        proactiveInsights: access.override_can_proactively_surface_insights ?? persona?.can_proactively_surface_insights ?? false,
        recommendations:   access.override_can_make_recommendations ?? persona?.can_make_recommendations ?? false,
        forecasting:       persona?.can_do_forecasting ?? false,
        contestStrategy:   persona?.can_suggest_contest_strategy ?? false,
        discussOrgStructure: persona?.can_discuss_org_structure ?? false,
      },
      dataAccess: {
        accessDescription:   access.access_description,
        noAccessDescription: access.no_access_description,
        rowScope:            access.row_scope as any,
        allowedTables:       access.allowed_tables,
        deniedTables:        access.denied_tables,
      },
      memory: memoryRows ?? [],
    });

    // 7. Build tool context for row-scope enforcement
    const toolCtx: ToolContext = {
      employeeNumber: employee.employee_number,
      employeeId:     employee.id,
      businessUnit:   employee.business_unit,
      workEmail:      (employee.work_email ?? '').trim().toLowerCase(),
      rowScope:       access.row_scope as any,
      allowedTables:  access.allowed_tables,
    };

    // 8. Build messages array for OpenAI
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...existingMessages,
    ];

    if (message) {
      messages.push({ role: 'user', content: message });
    }

    // 9. Call GPT-4o with tool loop
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const model = persona?.model ?? 'gpt-4o';
    const temperature = persona?.temperature ?? 0.7;
    const topP = persona?.top_p ?? 1;
    const maxTokens = persona?.max_tokens ?? 1000;
    const presencePenalty = persona?.presence_penalty ?? 0;
    const frequencyPenalty = persona?.frequency_penalty ?? 0;

    // Filter tools based on capabilities and denied tables
    const availableTools = filterTools(AGENT_TOOLS, access, persona);

    let finalContent = '';
    let totalTokensUsed = 0;
    const dataSources: string[] = [];

    // Tool calling loop
    let round = 0;
    let currentMessages = [...messages];

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
          tools: availableTools,
          tool_choice: 'auto',
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
          presence_penalty: presencePenalty,
          frequency_penalty: frequencyPenalty,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(`OpenAI error ${response.status}: ${JSON.stringify(errBody)}`);
      }

      const completion = await response.json();
      totalTokensUsed += completion.usage?.total_tokens ?? 0;

      const choice = completion.choices?.[0];
      const assistantMsg = choice?.message;

      if (!assistantMsg) break;

      currentMessages.push(assistantMsg);

      // No tool calls → we have a final answer
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalContent = assistantMsg.content ?? '';
        break;
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

    // If we exhausted rounds without a final response, use last assistant message
    if (!finalContent) {
      const last = currentMessages.findLast((m: any) => m.role === 'assistant' && m.content);
      finalContent = last?.content ?? 'I was unable to complete your request. Please try again.';
    }

    // 10. Persist messages to DB
    if (convId) {
      const messagesToInsert: any[] = [];

      // Save user message
      if (message) {
        messagesToInsert.push({
          conversation_id: convId,
          role: 'user',
          content: message,
        });
      }

      // Save assistant response
      messagesToInsert.push({
        conversation_id: convId,
        role: 'assistant',
        content: finalContent,
        data_sources_used: dataSources,
        tokens_used: totalTokensUsed,
        model_used: model,
        is_proactive: isProactive ?? false,
      });

      await supabaseAdmin.from('agent_messages').insert(messagesToInsert);

      // Update conversation metadata
      await supabaseAdmin
        .from('agent_conversations')
        .update({
          last_active_at: new Date().toISOString(),
          message_count: existingMessages.length + messagesToInsert.length,
        })
        .eq('id', convId);
    }

    // 11. Return response
    return NextResponse.json({
      reply: finalContent,
      conversationId: convId,
      model,
      tokensUsed: totalTokensUsed,
      dataSources: [...new Set(dataSources)],
    });
  } catch (err: any) {
    console.error('[agent/chat] Error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Tool filter based on capabilities ────────────────────────────────────────

function filterTools(tools: any[], access: any, persona: any) {
  const canOrgStructure = persona?.can_discuss_org_structure ?? false;
  const canProactive    = (access.override_proactive_insights ?? persona?.can_proactively_surface_insights) ?? false;

  return tools.filter(t => {
    if (t.function.name === 'get_org_structure' && !canOrgStructure) return false;
    if (t.function.name === 'get_proactive_insights' && !canProactive) return false;
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
      // Fetch messages for a specific conversation
      const { data: conv } = await supabaseAdmin
        .from('agent_conversations')
        .select('id, title, created_at, last_active_at, message_count')
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

    // Fetch all conversations for this employee
    const { data: conversations } = await supabaseAdmin
      .from('agent_conversations')
      .select('id, title, created_at, last_active_at, message_count, is_archived')
      .eq('employee_id', employee.id)
      .eq('is_archived', false)
      .order('last_active_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ conversations: conversations ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
