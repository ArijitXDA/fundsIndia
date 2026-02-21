// POST /api/agent/chat/engine2
// Thinking Engine 2 (DeepSeek) — receives pre-fetched tool results from Engine 1,
// generates its own independent analysis via streaming SSE.
// No tool calls — pure language model analysis on the shared data context.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient }        from '@supabase/ssr';
import { cookies }                   from 'next/headers';

export const dynamic = 'force-dynamic';

const DEEPSEEK_API  = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // deepseek-chat = DeepSeek-V3

export async function POST(request: NextRequest) {
  // Auth check
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return engineUnavailable('Thinking Engine 2 is not configured.');
  }

  let body: {
    messages:    Array<{ role: string; content: string }>;
    systemPrompt: string;
    userMessage: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, systemPrompt, userMessage } = body;
  if (!messages || !systemPrompt) {
    return NextResponse.json({ error: 'messages and systemPrompt are required' }, { status: 400 });
  }

  // Build the messages array for DeepSeek
  // messages already contains: [user turns + assistant turns + tool result turns]
  // from Engine 1's tool-calling phase. We inject a brief engine-specific instruction.
  const engineInstruction = `You are Thinking Engine 2, an independent AI analyst. You have been given the same data context as other thinking engines. Provide your own independent analysis, insights, and perspective. Do NOT say you are DeepSeek or mention your model name. Use the same formatting rules (charts, bullets, bold) as described in the system prompt.`;

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
    return engineUnavailable(`Thinking Engine 2 connection failed: ${err.message}`);
  }

  if (!deepseekRes.ok) {
    const errText = await deepseekRes.text().catch(() => 'unknown error');
    return engineUnavailable(`Thinking Engine 2 error (${deepseekRes.status}): ${errText.slice(0, 200)}`);
  }

  // Pipe SSE from DeepSeek → client using same token/done/error format
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = deepseekRes.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content ?? '';
            if (token) {
              fullContent += token;
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ type: 'token', token })}\n\n`
              ));
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
