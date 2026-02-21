'use client';

// components/AgentWidget.tsx
// FundsAgent chat widget — supports:
//   • Inline bubble mode  (single engine, bottom-right fixed)
//   • Popout modal mode   (3 engines side-by-side, draggable/resizable)
// Features: streaming SSE, upvote/downvote, copy, PDF export, Excel export per chart.

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Bot, X, Send, Loader2, Sparkles,
  MessageSquare, RefreshCw, AlertCircle, Maximize2,
  Clock, Database, History, ArrowLeft, ThumbsUp, ThumbsDown,
  Copy, Check, FileDown, FileSpreadsheet, Eye, EyeOff,
} from 'lucide-react';
import AgentChart, { ChartSpec } from '@/components/AgentChart';
import AgentModal             from '@/components/AgentModal';
import { exportChatToPdf }    from '@/lib/exportPdf';
import { exportChartToExcel } from '@/lib/exportExcel';
import type { RawDataRow }    from '@/lib/exportExcel';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:          string;
  role:        'user' | 'assistant' | 'system';
  content:     string;
  createdAt:   Date;
  tokensUsed?: number;
  dataSources?: string[];
  isProactive?: boolean;
  isStreaming?: boolean;
  engine?:     'engine1' | 'engine2' | 'engine3';
  feedback?:   'up' | 'down';
}

interface AgentConfig {
  persona: {
    agentName: string;
    tone:      string;
  } | null;
  capabilities: {
    proactiveInsights:  boolean;
    recommendations:    boolean;
  };
  widget: {
    showOnDashboard: boolean;
    greeting:        string | null;
  };
  employee: {
    full_name:       string;
    employee_number: string;
    job_title:       string;
    business_unit:   string;
  };
}

interface Conversation {
  id:             string;
  title:          string;
  started_at:     string;
  last_active_at: string;
  message_count:  number;
}

// ─── AgentWidget ───────────────────────────────────────────────────────────────

export default function AgentWidget() {
  const [config, setConfig]               = useState<AgentConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [hasAccess, setHasAccess]         = useState(false);

  const [isOpen, setIsOpen]       = useState(false);
  const [isPopout, setIsPopout]   = useState(false);   // true = floating modal
  const [view, setView]           = useState<'chat' | 'history'>('chat');

  // ── Inline / Engine-1 messages ──────────────────────────────────────────────
  const [messages, setMessages]   = useState<Message[]>([]);
  // ── Engine 2 & 3 messages (only active in popout) ──────────────────────────
  const [e2Messages, setE2Messages] = useState<Message[]>([]);
  const [e3Messages, setE3Messages] = useState<Message[]>([]);

  const [inputValue, setInputValue] = useState('');
  const [sending, setSending]       = useState(false);
  const [e2Sending, setE2Sending]   = useState(false);
  const [e3Sending, setE3Sending]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [proactiveLoading, setProactiveLoading] = useState(false);
  const [hasLoadedProactive, setHasLoadedProactive] = useState(false);

  // History
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Engine enable / visible toggles ─────────────────────────────────────────
  const [e2Enabled, setE2Enabled] = useState(true);   // checkbox: send to E2
  const [e3Enabled, setE3Enabled] = useState(true);   // checkbox: send to E3
  const [e1Visible, setE1Visible] = useState(true);   // panel show/hide
  const [e2Visible, setE2Visible] = useState(true);
  const [e3Visible, setE3Visible] = useState(true);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const e2EndRef        = useRef<HTMLDivElement>(null);
  const e3EndRef        = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const abortE2Ref      = useRef<AbortController | null>(null);
  const abortE3Ref      = useRef<AbortController | null>(null);
  const chatContainerRef  = useRef<HTMLDivElement>(null);  // E1 PDF capture
  const e2ContainerRef    = useRef<HTMLDivElement>(null);  // E2 PDF capture
  const e3ContainerRef    = useRef<HTMLDivElement>(null);  // E3 PDF capture

  // ── Load config ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/agent/config')
      .then(r => r.json())
      .then(data => {
        if (data.config && data.config.widget?.showOnDashboard !== false) {
          setConfig(data.config);
          setHasAccess(true);
        }
        setConfigLoading(false);
      })
      .catch(() => setConfigLoading(false));
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, view]);

  useEffect(() => { e2EndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [e2Messages]);
  useEffect(() => { e3EndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [e3Messages]);

  // ── Focus input ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && view === 'chat' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  // ── Proactive insights ──────────────────────────────────────────────────────

  useEffect(() => {
    if (
      isOpen && view === 'chat' && !hasLoadedProactive &&
      config?.capabilities?.proactiveInsights && messages.length === 0
    ) {
      loadProactiveInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Greeting (no proactive) ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && view === 'chat' && messages.length === 0 && !config?.capabilities?.proactiveInsights) {
      const greeting = config?.widget?.greeting
        ?? `Hi ${config?.employee?.full_name?.split(' ')[0] ?? 'there'}! I'm ${config?.persona?.agentName ?? 'FundsAgent'}. Ask me anything.`;
      setMessages([{ id: 'greeting', role: 'assistant', content: greeting, createdAt: new Date() }]);
    }
  }, [isOpen, config]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── History ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (view === 'history' && conversations.length === 0 && !historyLoading) loadHistory();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load proactive ──────────────────────────────────────────────────────────

  const loadProactiveInsights = useCallback(async () => {
    if (hasLoadedProactive || proactiveLoading) return;
    setProactiveLoading(true);
    setHasLoadedProactive(true);
    const firstName = config?.employee?.full_name?.split(' ')[0] ?? 'there';
    const agentName = config?.persona?.agentName ?? 'FundsAgent';
    setMessages([{
      id: 'greeting', role: 'assistant', createdAt: new Date(), isProactive: true,
      content: config?.widget?.greeting ?? `Hi ${firstName}! I'm ${agentName}. Let me check your latest performance data…`,
    }]);
    try {
      await streamEngine1(
        'Run proactive insight checks and give me a brief summary of anything I should know right now — target gap, team outliers, and my current rank. Keep it concise.',
        null, true
      );
    } catch { /* silent */ }
    setProactiveLoading(false);
  }, [config, hasLoadedProactive, proactiveLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load history ────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res  = await fetch('/api/agent/chat');
      const data = await res.json();
      if (res.ok) setConversations(data.conversations ?? []);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, []);

  // ── Restore conversation ────────────────────────────────────────────────────

  const restoreConversation = useCallback(async (conv: Conversation) => {
    setView('chat');
    setSending(true);
    setMessages([]);
    setConversationId(conv.id);
    setError(null);
    try {
      const res  = await fetch(`/api/agent/chat?conversationId=${conv.id}`);
      const data = await res.json();
      if (res.ok && data.messages) {
        setMessages(
          (data.messages as any[])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              id:          m.id,
              role:        m.role,
              content:     m.content,
              createdAt:   new Date(m.created_at),
              dataSources: m.data_sources_used,
              isProactive: m.is_proactive,
            }))
        );
      }
    } catch { setError('Failed to load conversation.'); }
    setSending(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Engine 1 (OpenAI) streaming — returns toolResultsForEngines + systemPrompt
  // ─────────────────────────────────────────────────────────────────────────────

  const streamEngine1 = useCallback(async (
    text:           string,
    existingConvId: string | null,
    isProactive    = false
  ): Promise<{ toolResultsForEngines: any[]; systemPrompt: string } | null> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const streamingId  = `e1-streaming-${Date.now()}`;
    const streamingMsg: Message = {
      id: streamingId, role: 'assistant', content: '', createdAt: new Date(),
      isStreaming: true, isProactive, engine: 'engine1',
    };
    setMessages(prev => [...prev, streamingMsg]);

    const res = await fetch('/api/agent/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: text, conversationId: existingConvId, isProactive, stream: true }),
      signal:  ctrl.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error ?? 'Failed to get response');
    }

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   toolResultsForEngines: any[] = [];
    let   systemPromptOut              = '';
    let   finalMsgId: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          const event = JSON.parse(raw);
          if (event.type === 'token') {
            setMessages(prev => prev.map(m =>
              m.id === streamingId ? { ...m, content: m.content + event.token } : m
            ));
          } else if (event.type === 'done') {
            setConversationId(event.conversationId);
            finalMsgId = event.messageId as string | undefined;
            toolResultsForEngines = event.toolResultsForEngines ?? [];
            systemPromptOut       = event.systemPrompt ?? '';
            setMessages(prev => prev.map(m =>
              m.id === streamingId
                ? { ...m, isStreaming: false, dataSources: event.dataSources, tokensUsed: event.tokensUsed,
                    id: finalMsgId ?? streamingId }
                : m
            ));
            loadHistory();
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        } catch (parseErr: any) {
          if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
        }
      }
    }

    return { toolResultsForEngines, systemPrompt: systemPromptOut };
  }, [loadHistory]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Engine 2 (DeepSeek) streaming
  // ─────────────────────────────────────────────────────────────────────────────

  const streamEngine2 = useCallback(async (
    messages2Fire:    any[],
    systemPromptText: string,
    userText:         string
  ) => {
    abortE2Ref.current?.abort();
    const ctrl = new AbortController();
    abortE2Ref.current = ctrl;

    const sId = `e2-streaming-${Date.now()}`;
    setE2Messages(prev => [...prev, {
      id: sId, role: 'assistant', content: '', createdAt: new Date(), isStreaming: true, engine: 'engine2',
    }]);
    setE2Sending(true);

    try {
      const res = await fetch('/api/agent/chat/engine2', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: messages2Fire, systemPrompt: systemPromptText, userMessage: userText }),
        signal:  ctrl.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Engine 2 error ${res.status}`);
      }

      const reader  = res.body!.getReader();
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
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'token') {
              setE2Messages(prev => prev.map(m =>
                m.id === sId ? { ...m, content: m.content + event.token } : m
              ));
            } else if (event.type === 'done') {
              setE2Messages(prev => prev.map(m =>
                m.id === sId ? { ...m, isStreaming: false } : m
              ));
            } else if (event.type === 'error') {
              setE2Messages(prev => prev.map(m =>
                m.id === sId
                  ? { ...m, isStreaming: false, content: m.content + `\n\n⚠️ ${event.message}` }
                  : m
              ));
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setE2Messages(prev => prev.map(m =>
          m.id === sId ? { ...m, isStreaming: false, content: '⚠️ Thinking Engine 2 unavailable.' } : m
        ));
      }
    } finally {
      setE2Sending(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Engine 3 (Grok) streaming
  // ─────────────────────────────────────────────────────────────────────────────

  const streamEngine3 = useCallback(async (
    messages2Fire:    any[],
    systemPromptText: string,
    userText:         string
  ) => {
    abortE3Ref.current?.abort();
    const ctrl = new AbortController();
    abortE3Ref.current = ctrl;

    const sId = `e3-streaming-${Date.now()}`;
    setE3Messages(prev => [...prev, {
      id: sId, role: 'assistant', content: '', createdAt: new Date(), isStreaming: true, engine: 'engine3',
    }]);
    setE3Sending(true);

    try {
      const res = await fetch('/api/agent/chat/engine3', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: messages2Fire, systemPrompt: systemPromptText, userMessage: userText }),
        signal:  ctrl.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Engine 3 error ${res.status}`);
      }

      const reader  = res.body!.getReader();
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
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'token') {
              setE3Messages(prev => prev.map(m =>
                m.id === sId ? { ...m, content: m.content + event.token } : m
              ));
            } else if (event.type === 'done') {
              setE3Messages(prev => prev.map(m =>
                m.id === sId ? { ...m, isStreaming: false } : m
              ));
            } else if (event.type === 'error') {
              setE3Messages(prev => prev.map(m =>
                m.id === sId
                  ? { ...m, isStreaming: false, content: m.content + `\n\n⚠️ ${event.message}` }
                  : m
              ));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setE3Messages(prev => prev.map(m =>
          m.id === sId ? { ...m, isStreaming: false, content: '⚠️ Thinking Engine 3 unavailable.' } : m
        ));
      }
    } finally {
      setE3Sending(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // ── handleSend — fires all 3 engines when in popout, only engine1 in inline
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setInputValue('');
    setError(null);
    setSending(true);

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text, createdAt: new Date() };
    setMessages(prev => [...prev, userMsg]);

    if (isPopout) {
      if (e2Enabled) setE2Messages(prev => [...prev, { ...userMsg, id: `user-e2-${Date.now()}` }]);
      if (e3Enabled) setE3Messages(prev => [...prev, { ...userMsg, id: `user-e3-${Date.now()}` }]);
    }

    try {
      const result = await streamEngine1(text, conversationId);

      // Fire enabled engines in parallel after engine 1 completes (has tool results)
      if (isPopout && result) {
        const { toolResultsForEngines, systemPrompt } = result;
        const parallel: Promise<void>[] = [];
        if (e2Enabled) parallel.push(streamEngine2(toolResultsForEngines, systemPrompt, text));
        if (e3Enabled) parallel.push(streamEngine3(toolResultsForEngines, systemPrompt, text));
        if (parallel.length > 0) Promise.all(parallel);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message ?? 'Something went wrong. Please try again.');
        setMessages(prev => prev.filter(m => !m.isStreaming));
      }
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleOpen = () => { setIsOpen(true); setUnreadCount(0); };

  const handleClear = () => {
    abortRef.current?.abort();
    abortE2Ref.current?.abort();
    abortE3Ref.current?.abort();
    setMessages([]);
    setE2Messages([]);
    setE3Messages([]);
    setConversationId(null);
    setError(null);
    setHasLoadedProactive(false);
    setSending(false);
    setE2Sending(false);
    setE3Sending(false);
  };

  // ── Feedback (upvote / downvote) ────────────────────────────────────────────

  const handleFeedback = useCallback(async (
    msg:    Message,
    rating: 'up' | 'down'
  ) => {
    // Optimistically update UI
    const updateFn = (prev: Message[]) =>
      prev.map(m => m.id === msg.id ? { ...m, feedback: rating } : m);
    setMessages(updateFn);
    setE2Messages(updateFn);
    setE3Messages(updateFn);

    try {
      await fetch('/api/agent/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messageId:      msg.id,
          engine:         msg.engine ?? 'engine1',
          rating,
          messageContent: msg.content,
        }),
      });
    } catch { /* ignore network errors — optimistic update stays */ }
  }, []);

  // ── Copy helpers ────────────────────────────────────────────────────────────

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
  }, []);

  const copyFullChat = useCallback((msgs: Message[]) => {
    const text = msgs
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'You' : 'Agent'}: ${m.content}`)
      .join('\n\n---\n\n');
    copyText(text);
  }, [copyText]);

  // ── PDF export (per engine) ──────────────────────────────────────────────────

  const handleExportPdf = useCallback(async (
    containerRef: React.RefObject<HTMLDivElement>,
    msgs: Message[],
    label = 'FundsAgent'
  ) => {
    if (!containerRef.current) return;
    await exportChatToPdf(
      containerRef.current,
      msgs.map(m => ({ role: m.role as any, content: m.content, createdAt: m.createdAt })),
      label
    );
  }, []);

  // ── Don't render if no access ───────────────────────────────────────────────

  if (configLoading || !hasAccess) return null;

  const agentName   = config?.persona?.agentName ?? 'FundsAgent';
  const suggestions = getSuggestions(config?.employee?.business_unit, config?.capabilities);
  const anySending  = sending || e2Sending || e3Sending;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button — shown when widget is fully closed */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all hover:shadow-xl active:scale-95 px-4 py-3"
          title={`Open ${agentName}`}
        >
          <Bot className="w-5 h-5" />
          <span className="text-sm font-semibold">{agentName}</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* ── Inline bubble (non-popout) ──────────────────────────────────────── */}
      {isOpen && !isPopout && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden w-[420px] h-[640px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
            <div className="flex items-center space-x-2">
              {view === 'history' && (
                <button onClick={() => setView('chat')} className="p-1 hover:bg-white/10 rounded-lg" title="Back">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                {view === 'history' ? <History className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{view === 'history' ? 'History' : agentName}</p>
                <p className="text-xs text-indigo-200">FundsIndia AI Assistant</p>
              </div>
              {proactiveLoading && view === 'chat' && (
                <span className="flex items-center space-x-1 text-xs text-indigo-200 ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" /><span>Checking…</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1">
              {view === 'chat' && (
                <>
                  {/* Copy full chat */}
                  <CopyButton onClick={() => copyFullChat(messages)} title="Copy full chat" />
                  {/* Export PDF */}
                  <button
                    onClick={() => handleExportPdf(chatContainerRef, messages, agentName)}
                    className="p-1.5 hover:bg-white/10 rounded-lg"
                    title="Export PDF"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setView('history'); loadHistory(); }} className="p-1.5 hover:bg-white/10 rounded-lg" title="History">
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleClear} className="p-1.5 hover:bg-white/10 rounded-lg" title="New chat">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {/* Expand to popout */}
              <button onClick={() => setIsPopout(true)} className="p-1.5 hover:bg-white/10 rounded-lg" title="Pop out">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg" title="Close">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* History view */}
          {view === 'history' && (
            <HistoryView
              loading={historyLoading}
              conversations={conversations}
              onRestore={restoreConversation}
            />
          )}

          {/* Chat view — single engine */}
          {view === 'chat' && (
            <ChatView
              messages={messages}
              sending={sending}
              error={error}
              suggestions={suggestions}
              proactiveLoading={proactiveLoading}
              inputValue={inputValue}
              inputRef={inputRef}
              messagesEndRef={messagesEndRef}
              chatContainerRef={chatContainerRef}
              setInputValue={setInputValue}
              handleSend={handleSend}
              handleKeyDown={handleKeyDown}
              onFeedback={handleFeedback}
              onCopyMessage={copyText}
            />
          )}
        </div>
      )}

      {/* ── Popout modal (3-engine layout) ─────────────────────────────────── */}
      {isOpen && isPopout && (
        <AgentModal
          title={agentName}
          onClose={() => { setIsPopout(false); setIsOpen(true); }}
        >
          <div className="flex flex-col h-full">

            {/* ── Sub-header: engine toggles + global actions ──────────────── */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-indigo-50 shrink-0 gap-2 flex-wrap">
              {/* Engine enable checkboxes */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mr-1">Engines:</span>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked readOnly disabled
                    className="accent-indigo-600 w-3.5 h-3.5 cursor-not-allowed" />
                  <span className="text-xs text-indigo-700 font-medium">E1</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={e2Enabled}
                    onChange={e => setE2Enabled(e.target.checked)}
                    className="accent-indigo-600 w-3.5 h-3.5" />
                  <span className={`text-xs font-medium ${e2Enabled ? 'text-indigo-700' : 'text-gray-400'}`}>E2</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={e3Enabled}
                    onChange={e => setE3Enabled(e.target.checked)}
                    className="accent-indigo-600 w-3.5 h-3.5" />
                  <span className={`text-xs font-medium ${e3Enabled ? 'text-indigo-700' : 'text-gray-400'}`}>E3</span>
                </label>
                {anySending && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin ml-1" />}
              </div>

              {/* Global actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  title="New conversation (all engines)"
                >
                  <RefreshCw className="w-3 h-3" /><span>New</span>
                </button>
                <button
                  onClick={() => setView('history')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <History className="w-3 h-3" /><span>History</span>
                </button>
              </div>
            </div>

            {/* ── 3-column engine layout with draggable dividers ───────────── */}
            <div className="flex-1 overflow-hidden flex min-h-0">

              {/* Engine 1 */}
              {e1Visible && (
                <EnginePanel
                  engineLabel="Thinking Engine 1"
                  messages={messages}
                  sending={sending}
                  endRef={messagesEndRef}
                  containerRef={chatContainerRef}
                  onFeedback={handleFeedback}
                  onCopyMessage={copyText}
                  onCopyChat={() => copyFullChat(messages)}
                  onExportPdf={() => handleExportPdf(chatContainerRef, messages, 'Engine 1')}
                  visible={e1Visible}
                  onToggleVisible={() => setE1Visible(v => !v)}
                  isFirst
                />
              )}
              {!e1Visible && (
                <CollapsedEngineTab label="E1" onShow={() => setE1Visible(true)} />
              )}

              <DragDivider />

              {/* Engine 2 */}
              {e2Visible ? (
                <EnginePanel
                  engineLabel="Thinking Engine 2"
                  messages={e2Messages}
                  sending={e2Sending}
                  endRef={e2EndRef}
                  containerRef={e2ContainerRef}
                  onFeedback={handleFeedback}
                  onCopyMessage={copyText}
                  onCopyChat={() => copyFullChat(e2Messages)}
                  onExportPdf={() => handleExportPdf(e2ContainerRef, e2Messages, 'Engine 2')}
                  visible={e2Visible}
                  onToggleVisible={() => setE2Visible(v => !v)}
                  disabled={!e2Enabled}
                />
              ) : (
                <CollapsedEngineTab label="E2" onShow={() => setE2Visible(true)} />
              )}

              <DragDivider />

              {/* Engine 3 */}
              {e3Visible ? (
                <EnginePanel
                  engineLabel="Thinking Engine 3"
                  messages={e3Messages}
                  sending={e3Sending}
                  endRef={e3EndRef}
                  containerRef={e3ContainerRef}
                  onFeedback={handleFeedback}
                  onCopyMessage={copyText}
                  onCopyChat={() => copyFullChat(e3Messages)}
                  onExportPdf={() => handleExportPdf(e3ContainerRef, e3Messages, 'Engine 3')}
                  visible={e3Visible}
                  onToggleVisible={() => setE3Visible(v => !v)}
                  disabled={!e3Enabled}
                />
              ) : (
                <CollapsedEngineTab label="E3" onShow={() => setE3Visible(true)} />
              )}
            </div>

            {/* ── Shared input bar ─────────────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
              {error && (
                <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2 text-xs text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex items-end space-x-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${[e2Enabled, e3Enabled].filter(Boolean).length === 2 ? 'all 3 thinking engines' : e2Enabled || e3Enabled ? '2 thinking engines' : 'Thinking Engine 1'} simultaneously…`}
                  rows={1}
                  className="flex-1 resize-none text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white leading-relaxed max-h-32 overflow-auto"
                  style={{ minHeight: '42px' }}
                  disabled={anySending}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || anySending}
                  className="shrink-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl transition-colors"
                >
                  {anySending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-300 mt-1.5 text-center">
                Enter to send · Shift+Enter for newline
              </p>
            </div>
          </div>
        </AgentModal>
      )}
    </>
  );
}

// ─── DragDivider ──────────────────────────────────────────────────────────────
// Draggable vertical divider between engine panels (horizontal resize).

function DragDivider() {
  const dividerRef = useRef<HTMLDivElement>(null);
  const dragging   = useRef(false);
  const startX     = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startX.current   = e.clientX;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !dividerRef.current) return;
      const parent = dividerRef.current.parentElement;
      if (!parent) return;
      const panels = Array.from(parent.children).filter(
        c => !(c as HTMLElement).dataset.divider
      ) as HTMLElement[];
      // Simple: split delta between left and right neighbour panel
      const idx    = Array.from(parent.children).indexOf(dividerRef.current);
      const left   = parent.children[idx - 1] as HTMLElement | undefined;
      const right  = parent.children[idx + 1] as HTMLElement | undefined;
      if (!left || !right) return;
      const dx = e.clientX - startX.current;
      startX.current = e.clientX;
      const lw = left.getBoundingClientRect().width  + dx;
      const rw = right.getBoundingClientRect().width - dx;
      if (lw > 80 && rw > 80) {
        left.style.flex  = 'none';
        left.style.width = `${lw}px`;
        right.style.flex = 'none';
        right.style.width= `${rw}px`;
      }
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  return (
    <div
      ref={dividerRef}
      data-divider="1"
      className="w-1.5 shrink-0 bg-gray-200 hover:bg-indigo-300 cursor-col-resize transition-colors"
      onMouseDown={onMouseDown}
      title="Drag to resize panels"
    />
  );
}

// ─── CollapsedEngineTab ───────────────────────────────────────────────────────
// Thin vertical tab shown when a panel is hidden.

function CollapsedEngineTab({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <div
      className="w-7 shrink-0 flex flex-col items-center justify-center bg-gray-100 hover:bg-indigo-50 border-r border-gray-200 cursor-pointer transition-colors group"
      onClick={onShow}
      title={`Show ${label}`}
    >
      <Eye className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 mb-1" />
      <span className="text-[10px] font-semibold text-gray-400 group-hover:text-indigo-600 [writing-mode:vertical-lr] tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ─── EnginePanel ───────────────────────────────────────────────────────────────
// A single scrollable engine column in the 3-engine popout layout.
// Includes: per-engine label bar with hide, copy, and PDF buttons.

interface EnginePanelProps {
  engineLabel:    string;
  messages:       Message[];
  sending:        boolean;
  endRef:         React.RefObject<HTMLDivElement>;
  containerRef?:  React.RefObject<HTMLDivElement>;
  onFeedback:     (msg: Message, rating: 'up' | 'down') => void;
  onCopyMessage:  (text: string) => void;
  onCopyChat:     () => void;
  onExportPdf:    () => void;
  visible:        boolean;
  onToggleVisible:() => void;
  isFirst?:       boolean;
  disabled?:      boolean;
}

function EnginePanel({
  engineLabel, messages, sending, endRef, containerRef,
  onFeedback, onCopyMessage, onCopyChat, onExportPdf,
  onToggleVisible, isFirst, disabled,
}: EnginePanelProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ minWidth: 80 }}>

      {/* ── Panel header bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-white border-b border-gray-100 shrink-0 gap-1">
        <span className="text-xs font-semibold text-indigo-700 truncate">{engineLabel}</span>
        {disabled && (
          <span className="text-[10px] text-gray-400 italic shrink-0">(off)</span>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Copy full chat */}
          <PanelCopyButton onClick={onCopyChat} title={`Copy ${engineLabel} chat`} />
          {/* Export PDF */}
          <button
            onClick={onExportPdf}
            className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
            title={`Export ${engineLabel} as PDF`}
          >
            <FileDown className="w-3 h-3" />
          </button>
          {/* Hide panel */}
          {!isFirst && (
            <button
              onClick={onToggleVisible}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Hide panel"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {isFirst && (
            <button
              onClick={onToggleVisible}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Hide panel"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50"
      >
        {disabled && messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <EyeOff className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-xs text-gray-400">Engine disabled</p>
            <p className="text-xs text-gray-300 mt-0.5">Enable via checkbox above</p>
          </div>
        )}
        {!disabled && messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <Bot className="w-7 h-7 text-indigo-300 mb-2" />
            <p className="text-xs text-gray-400">{engineLabel} awaiting your question</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onFeedback={onFeedback}
            onCopyMessage={onCopyMessage}
          />
        ))}
        {sending && !messages.some(m => m.isStreaming) && <TypingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── PanelCopyButton ──────────────────────────────────────────────────────────

function PanelCopyButton({ onClick, title }: { onClick: () => void; title?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button
      onClick={handle}
      className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
      title={title ?? 'Copy chat'}
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── ChatView ─────────────────────────────────────────────────────────────────
// Single-engine chat view (used in inline bubble mode).

interface ChatViewProps {
  messages:          Message[];
  sending:           boolean;
  error:             string | null;
  suggestions:       string[];
  proactiveLoading:  boolean;
  inputValue:        string;
  inputRef:          React.RefObject<HTMLTextAreaElement>;
  messagesEndRef:    React.RefObject<HTMLDivElement>;
  chatContainerRef:  React.RefObject<HTMLDivElement>;
  setInputValue:     (v: string) => void;
  handleSend:        () => void;
  handleKeyDown:     (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFeedback:        (msg: Message, rating: 'up' | 'down') => void;
  onCopyMessage:     (text: string) => void;
}

function ChatView({
  messages, sending, error, suggestions, proactiveLoading,
  inputValue, inputRef, messagesEndRef, chatContainerRef,
  setInputValue, handleSend, handleKeyDown, onFeedback, onCopyMessage,
}: ChatViewProps) {
  const agentName = 'FundsAgent';
  return (
    <>
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50"
      >
        {messages.length === 0 && !proactiveLoading && <EmptyState agentName={agentName} />}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} onFeedback={onFeedback} onCopyMessage={onCopyMessage} />
        ))}
        {sending && !messages.some(m => m.isStreaming) && <TypingIndicator />}
        {error && (
          <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && suggestions.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 bg-white shrink-0">
          <p className="text-xs text-gray-400 mb-1.5">Suggested questions</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 3).map((s, i) => (
              <button
                key={i}
                onClick={() => { setInputValue(s); inputRef.current?.focus(); }}
                className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-1 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 py-3 border-t border-gray-100 bg-white shrink-0">
        <div className="flex items-end space-x-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about performance, rankings, team…"
            rows={1}
            className="flex-1 resize-none text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white leading-relaxed max-h-32 overflow-auto"
            style={{ minHeight: '42px' }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className="shrink-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl transition-colors"
          >
            {sending && !messages.some(m => m.isStreaming)
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-300 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </>
  );
}

// ─── HistoryView ──────────────────────────────────────────────────────────────

function HistoryView({
  loading, conversations, onRestore,
}: {
  loading: boolean;
  conversations: Conversation[];
  onRestore: (c: Conversation) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-12 text-center px-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-3">
            <History className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-sm font-medium text-gray-600">No past conversations</p>
          <p className="text-xs text-gray-400 mt-1">Your conversation history will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onRestore(conv)}
              className="w-full text-left px-4 py-3.5 hover:bg-white transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate group-hover:text-indigo-700">
                    {conv.title}
                  </p>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-400">{formatRelativeTime(conv.last_active_at)}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{conv.message_count} message{conv.message_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <MessageSquare className="w-4 h-4 text-gray-300 shrink-0 mt-0.5 group-hover:text-indigo-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message:       Message;
  onFeedback:    (msg: Message, rating: 'up' | 'down') => void;
  onCopyMessage: (text: string) => void;
}

function MessageBubble({ message, onFeedback, onCopyMessage }: MessageBubbleProps) {
  const isUser      = message.role === 'user';
  const isProactive = message.isProactive;
  const isStreaming = message.isStreaming;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyMessage(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Inline text renderer ────────────────────────────────────────────────────

  const renderInline = (text: string, key: number) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return (
      <span key={key}>
        {parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**'))
            return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>;
          if (p.startsWith('`') && p.endsWith('`'))
            return <code key={j} className="bg-gray-100 text-indigo-700 rounded px-1 py-0.5 text-xs font-mono">{p.slice(1, -1)}</code>;
          if (p.startsWith('*') && p.endsWith('*'))
            return <em key={j}>{p.slice(1, -1)}</em>;
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  };

  // ── Full content renderer — charts, rawdata, code blocks, lists, text ───────

  const renderContent = (content: string) => {
    const elements: React.ReactNode[] = [];
    const segments = content.split(/(```[\s\S]*?```)/g);
    let pendingRawData: RawDataRow[] | null = null;

    segments.forEach((seg, si) => {
      if (seg.startsWith('```')) {
        const inner = seg.replace(/^```(\w*)\n?/, '').replace(/\n?```$/, '');
        const lang  = seg.match(/^```(\w+)/)?.[1] ?? '';

        // rawdata block — hidden visually, stored for Excel export
        if (lang === 'rawdata') {
          try {
            pendingRawData = JSON.parse(inner) as RawDataRow[];
          } catch {
            pendingRawData = null;
          }
          return; // don't render
        }

        // Chart block
        if (lang === 'chart') {
          try {
            const spec: ChartSpec = JSON.parse(inner);
            const rawForExport = pendingRawData; // capture before reset
            pendingRawData = null;
            elements.push(
              <div key={si} className="mt-2">
                <AgentChart spec={spec} />
                {/* Excel export button */}
                <button
                  onClick={() => exportChartToExcel(spec, rawForExport)}
                  className="mt-1.5 flex items-center space-x-1.5 text-xs text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 transition-colors"
                  title="Export chart data to Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export to Excel</span>
                </button>
              </div>
            );
          } catch {
            elements.push(
              <pre key={si} className="mt-2 p-2 bg-gray-100 rounded-lg text-xs font-mono overflow-x-auto text-red-600">
                ⚠️ Invalid chart JSON: {inner}
              </pre>
            );
          }
          return;
        }

        // SQL / other code block
        elements.push(
          <pre key={si} className="mt-2 mb-1 p-2.5 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
            <code>{inner}</code>
          </pre>
        );
        return;
      }

      // ── Plain text segment ───────────────────────────────────────────────
      const lines = seg.split('\n');
      let i = 0;
      while (i < lines.length) {
        const line    = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { elements.push(<br key={`${si}-${i}`} />); i++; continue; }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text  = headingMatch[2];
          const cls   = level === 1
            ? 'text-base font-bold text-gray-900 mt-2 mb-0.5'
            : level === 2
            ? 'text-sm font-bold text-gray-800 mt-1.5 mb-0.5'
            : 'text-sm font-semibold text-gray-700 mt-1 mb-0.5';
          elements.push(<p key={`${si}-${i}`} className={cls}>{renderInline(text, 0)}</p>);
          i++; continue;
        }

        if (/^[-*_]{3,}$/.test(trimmed)) {
          elements.push(<hr key={`${si}-${i}`} className="my-2 border-gray-200" />);
          i++; continue;
        }

        if (/^[-*•]\s/.test(trimmed)) {
          const items: string[] = [];
          while (i < lines.length && /^[-*•]\s/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
            i++;
          }
          elements.push(
            <ul key={`${si}-ul-${i}`} className="mt-0.5 mb-0.5 space-y-0.5 pl-3">
              {items.map((item, k) => (
                <li key={k} className="flex items-start gap-1.5 text-sm">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span>{renderInline(item, k)}</span>
                </li>
              ))}
            </ul>
          );
          continue;
        }

        if (/^\d+[.)]\s/.test(trimmed)) {
          const items: string[] = [];
          let num = 1;
          while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
            i++;
          }
          elements.push(
            <ol key={`${si}-ol-${i}`} className="mt-0.5 mb-0.5 space-y-0.5 pl-3">
              {items.map((item, k) => (
                <li key={k} className="flex items-start gap-1.5 text-sm">
                  <span className="mt-0 shrink-0 font-semibold text-indigo-500 text-xs min-w-[14px]">{num++}.</span>
                  <span>{renderInline(item, k)}</span>
                </li>
              ))}
            </ol>
          );
          continue;
        }

        elements.push(
          <span key={`${si}-${i}`} className="block text-sm leading-relaxed">
            {renderInline(trimmed, 0)}
          </span>
        );
        i++;
      }
    });

    return elements;
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start group/msg">
      <div className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[96%] text-sm leading-relaxed space-y-0.5 ${
        isProactive
          ? 'bg-amber-50 border border-amber-200 text-gray-800'
          : 'bg-white border border-gray-200 text-gray-800'
      }`}>
        {isProactive && (
          <div className="flex items-center space-x-1 mb-1.5">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-medium text-amber-600">Proactive insight</span>
          </div>
        )}

        <div className="text-sm leading-relaxed">
          {message.content ? renderContent(message.content) : null}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-indigo-400 rounded-sm animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {/* Data sources */}
        {!isStreaming && message.dataSources && message.dataSources.length > 0 && (
          <div className="flex items-center space-x-1 mt-2 pt-2 border-t border-gray-100">
            <Database className="w-2.5 h-2.5 text-gray-300" />
            <span className="text-xs text-gray-300">
              {message.dataSources.map(s => s.replace('get_', '').replace(/_/g, ' ')).join(', ')}
            </span>
          </div>
        )}

        {/* Feedback + copy toolbar — only when not streaming */}
        {!isStreaming && (
          <div className="flex items-center space-x-1 mt-2 pt-1.5 border-t border-gray-100 opacity-0 group-hover/msg:opacity-100 transition-opacity">
            {/* Upvote */}
            <button
              onClick={() => onFeedback(message, 'up')}
              className={`p-1 rounded-lg transition-colors ${
                message.feedback === 'up'
                  ? 'text-green-600 bg-green-50'
                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
              }`}
              title="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            {/* Downvote */}
            <button
              onClick={() => onFeedback(message, 'down')}
              className={`p-1 rounded-lg transition-colors ${
                message.feedback === 'down'
                  ? 'text-red-600 bg-red-50'
                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
              }`}
              title="Poor response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            {/* Copy single response */}
            <button
              onClick={handleCopy}
              className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Copy response"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ onClick, title, label }: { onClick: () => void; title?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button
      onClick={handle}
      className="flex items-center space-x-1 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
      title={title ?? 'Copy'}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {label && <span className="text-xs">{label}</span>}
    </button>
  );
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex space-x-1.5 items-center">
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-8 text-center">
      <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-3">
        <Bot className="w-7 h-7 text-indigo-600" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{agentName}</p>
      <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
        Your AI performance assistant. Ask anything about your sales, rankings, or team.
      </p>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const date    = new Date(isoString);
  const now     = new Date();
  const diffMs  = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH   < 24) return `${diffH}h ago`;
  if (diffD   === 1) return 'Yesterday';
  if (diffD   < 7)  return `${diffD} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getSuggestions(bu?: string, capabilities?: any): string[] {
  const base = ['How am I performing this month?', "What's my current ranking?"];
  if (bu === 'B2B')  return [...base, 'How much more do I need to hit my target?', "Who's the top performer?", 'Show my YTD vs MTD breakdown'];
  if (bu === 'B2C')  return [...base, "What's my current AUM?", 'How is my net inflow trending?'];
  if (capabilities?.proactiveInsights) return [...base, 'Any insights I should know about?', 'How is my team performing?'];
  return base;
}
