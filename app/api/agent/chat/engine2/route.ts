// POST /api/agent/chat/engine2
// Thinking Engine 2 (DeepSeek) — receives pre-fetched tool results from Engine 1,
// generates its own independent analysis via streaming SSE.
// No tool calls — pure language model analysis on the shared data context.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DEEPSEEK_API  = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // deepseek-chat = DeepSeek-V3

export async function POST(request: NextRequest) {
  // Auth check — same custom session cookie used by the rest of the app
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) {
    return engineUnavailable('Not authenticated');
  }
  let sessionData: any;
  try {
    sessionData = JSON.parse(sessionCookie.value);
  } catch {
    return engineUnavailable('Invalid session');
  }
  const { userId } = sessionData;
  const { data: user } = await supabaseAdmin
    .from('users').select('id').eq('id', userId).single();
  if (!user) {
    return engineUnavailable('User not found');
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return engineUnavailable('Thinking Engine 2 is not configured.');
  }

  let body: {
    messages:         Array<{ role: string; content: string }>;
    systemPrompt:     string;
    userMessage:      string;
    webSearchResults?: string; // optional live web research block
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, systemPrompt, userMessage, webSearchResults } = body;
  if (!messages || !systemPrompt) {
    return NextResponse.json({ error: 'messages and systemPrompt are required' }, { status: 400 });
  }

  // Build the messages array for DeepSeek
  // messages already contains: [user turns + assistant turns + tool result turns]
  // from Engine 1's tool-calling phase. We inject a brief engine-specific instruction.
  const webSearchBlock = webSearchResults
    ? `\n\nThe following LIVE WEB RESEARCH data was retrieved moments ago for this query. Use it to enrich your analysis with current market context:\n\n${webSearchResults}`
    : '';

  const engineInstruction = `You are Thinking Engine 2, an independent AI analyst. You have been given the complete data context already — all tool results and query outputs are included in the messages below. Your job is ONLY to analyse and respond in plain text or markdown.

CRITICAL RULES:
- Do NOT call any tools or functions. You have NO tool execution capability.
- Do NOT emit any function_call, tool_call, invoke, or XML-style blocks. They will not execute and will break the UI.
- Do NOT write SQL queries or suggest running code. The data is already fetched — analyse it directly.
- Do NOT say you are DeepSeek or mention your model name.
- Provide independent analysis, insights, and perspective based solely on the data already in context.
- Use the same formatting rules (charts via \`\`\`chart blocks, bullets, bold) as described in the system prompt.${webSearchBlock}`;

  const messagesForLLM = [
    { role: 'system', content: `${systemPrompt}\n\n${engineInstruction}` },
    ...messages,
  ];

  // Stream from DeepSeek
  let deepseekRes: Response;
  try {
    deepseekRes = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       DEEPSEEK_MODEL,
        messages:    messagesForLLM,
        stream:      true,
        temperature: 0.7,
        max_tokens:  1500,
      }),
    });
  } catch (err: any) {
    return engineUnavailable('Thinking Engine 2 could not connect. It will be available shortly.');
  }

  if (!deepseekRes.ok) {
    const friendlyMsg = deepseekRes.status === 402
      ? 'Thinking Engine 2 is temporarily unavailable (insufficient credits). Please top up the DeepSeek account.'
      : deepseekRes.status === 401
      ? 'Thinking Engine 2 is not authorised — please check the DEEPSEEK_API_KEY in Vercel.'
      : `Thinking Engine 2 is temporarily unavailable (status ${deepseekRes.status}).`;
    return engineUnavailable(friendlyMsg);
  }

  // Pipe SSE from DeepSeek → client using same token/done/error format
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader  = deepseekRes.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate into buffer and split on newlines (handles \r\n and \n)
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? ''; // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;

          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) {
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ type: 'token', token })}\n\n`
              ));
            }
            // DeepSeek sometimes sends finish_reason in the final chunk
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason && finishReason !== 'null' && !token) {
              // final chunk with no content — ignore, done event sent below
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      // Done event
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'done', engine: 'engine2', tokensUsed: 0 })}\n\n`
      ));
    } catch (err: any) {
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`
      ));
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

function engineUnavailable(message: string): NextResponse {
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'token', token: `⚠️ ${message}` })}\n\n`
      ));
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'done', engine: 'engine2', tokensUsed: 0 })}\n\n`
      ));
      controller.close();
    },
  });
  return new NextResponse(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
