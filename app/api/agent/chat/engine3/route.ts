// POST /api/agent/chat/engine3
// Thinking Engine 3 (Grok/xAI) — receives pre-fetched tool results from Engine 1,
// generates its own independent analysis via streaming SSE.
// No tool calls — pure language model analysis on the shared data context.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const GROK_API   = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3-mini'; // xAI Grok model

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

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    return engineUnavailable('Thinking Engine 3 is not configured.');
  }

  let body: {
    messages:     Array<{ role: string; content: string }>;
    systemPrompt: string;
    userMessage:  string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, systemPrompt } = body;
  if (!messages || !systemPrompt) {
    return NextResponse.json({ error: 'messages and systemPrompt are required' }, { status: 400 });
  }

  // Engine 3 specific instruction
  const engineInstruction = `You are Thinking Engine 3, an independent AI analyst. You have been given the same data context as other thinking engines. Provide your own independent analysis, insights, and perspective — focus on strategic implications and actionable recommendations. Do NOT say you are Grok or mention your model name. Use the same formatting rules (charts, bullets, bold) as described in the system prompt.`;

  const messagesForLLM = [
    { role: 'system', content: `${systemPrompt}\n\n${engineInstruction}` },
    ...messages,
  ];

  // Stream from Grok (xAI API is OpenAI-compatible)
  let grokRes: Response;
  try {
    grokRes = await fetch(GROK_API, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       GROK_MODEL,
        messages:    messagesForLLM,
        stream:      true,
        temperature: 0.7,
        max_tokens:  1500,
      }),
    });
  } catch (err: any) {
    return engineUnavailable(`Thinking Engine 3 connection failed: ${err.message}`);
  }

  if (!grokRes.ok) {
    const errText = await grokRes.text().catch(() => 'unknown error');
    return engineUnavailable(`Thinking Engine 3 error (${grokRes.status}): ${errText.slice(0, 200)}`);
  }

  // Pipe SSE from Grok → client using same token/done/error format
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader  = grokRes.body!.getReader();
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
        `data: ${JSON.stringify({ type: 'done', engine: 'engine3', tokensUsed: 0 })}\n\n`
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
        `data: ${JSON.stringify({ type: 'done', engine: 'engine3', tokensUsed: 0 })}\n\n`
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
