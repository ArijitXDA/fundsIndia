'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bot, X, Send, Loader2, ChevronDown, Sparkles,
  MessageSquare, RefreshCw, AlertCircle, Maximize2, Minimize2,
  Clock, Database,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  tokensUsed?: number;
  dataSources?: string[];
  isProactive?: boolean;
}

interface AgentConfig {
  persona: {
    agentName: string;
    tone: string;
  } | null;
  capabilities: {
    proactiveInsights: boolean;
    recommendations: boolean;
  };
  widget: {
    showOnDashboard: boolean;
    greeting: string | null;
  };
  employee: {
    full_name: string;
    employee_number: string;
    job_title: string;
    business_unit: string;
  };
}

// ─── AgentWidget ──────────────────────────────────────────────────────────────

export default function AgentWidget() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [proactiveLoading, setProactiveLoading] = useState(false);
  const [hasLoadedProactive, setHasLoadedProactive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load config ────────────────────────────────────────────────────────────

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

  // ── Auto-scroll to bottom ──────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // ── Focus input when opened ───────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Load proactive insights when first opened ─────────────────────────────

  useEffect(() => {
    if (isOpen && !hasLoadedProactive && config?.capabilities?.proactiveInsights && messages.length === 0) {
      loadProactiveInsights();
    }
  }, [isOpen]);

  // ── Show greeting when opened (if no proactive) ───────────────────────────

  useEffect(() => {
    if (isOpen && messages.length === 0 && !config?.capabilities?.proactiveInsights) {
      const greeting = config?.widget?.greeting
        ?? `Hi ${config?.employee?.full_name?.split(' ')[0] ?? 'there'}! I'm ${config?.persona?.agentName ?? 'FundsAgent'}. Ask me anything about your performance, rankings, or your team.`;

      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: greeting,
        createdAt: new Date(),
      }]);
    }
  }, [isOpen, config]);

  // ── Load proactive insights ───────────────────────────────────────────────

  const loadProactiveInsights = useCallback(async () => {
    if (hasLoadedProactive || proactiveLoading) return;
    setProactiveLoading(true);
    setHasLoadedProactive(true);

    // Greeting first
    const firstName = config?.employee?.full_name?.split(' ')[0] ?? 'there';
    const agentName = config?.persona?.agentName ?? 'FundsAgent';
    const greetingText = config?.widget?.greeting
      ?? `Hi ${firstName}! I'm ${agentName}. Let me check your latest performance data…`;

    const greetingMsg: Message = {
      id: 'greeting',
      role: 'assistant',
      content: greetingText,
      createdAt: new Date(),
      isProactive: true,
    };

    setMessages([greetingMsg]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Run proactive insight checks and give me a brief summary of anything I should know right now — target gap, team outliers, and my current rank. Keep it concise.',
          conversationId: null,
          isProactive: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        setConversationId(data.conversationId);
        const proactiveMsg: Message = {
          id: `proactive-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          createdAt: new Date(),
          dataSources: data.dataSources,
          tokensUsed: data.tokensUsed,
          isProactive: true,
        };
        setMessages(prev => [...prev, proactiveMsg]);
        if (!isOpen) setUnreadCount(1);
      }
    } catch {
      // Silently fail proactive load — don't show error for background check
    }

    setProactiveLoading(false);
  }, [config, hasLoadedProactive, proactiveLoading, isOpen]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setInputValue('');
    setError(null);
    setSending(true);

    // Optimistically add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to get response');
      }

      setConversationId(data.conversationId);

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        createdAt: new Date(),
        dataSources: data.dataSources,
        tokensUsed: data.tokensUsed,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
  };

  const handleClear = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setHasLoadedProactive(false);
  };

  // ── Don't render if no access ─────────────────────────────────────────────

  if (configLoading || !hasAccess) return null;

  const agentName = config?.persona?.agentName ?? 'FundsAgent';

  // ── Suggested prompts ─────────────────────────────────────────────────────

  const suggestions = getSuggestions(config?.employee?.business_unit, config?.capabilities);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button */}
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
          {proactiveLoading && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-400 rounded-full w-3 h-3 animate-ping" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-200 ${
            isExpanded
              ? 'w-[700px] h-[85vh]'
              : 'w-[400px] h-[600px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{agentName}</p>
                <p className="text-xs text-indigo-200 leading-none">FundsIndia AI Assistant</p>
              </div>
              {proactiveLoading && (
                <span className="flex items-center space-x-1 text-xs text-indigo-200 ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Checking insights…</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={handleClear}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="New conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(e => !e)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && !proactiveLoading && (
              <EmptyState agentName={agentName} />
            )}

            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {sending && <TypingIndicator />}

            {error && (
              <div className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions (show when messages are minimal) */}
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

          {/* Input area */}
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
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-300 mt-1.5 text-center">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isProactive = message.isProactive;

  // Parse markdown-style bold and line breaks for assistant messages
  const renderContent = (content: string) => {
    // Split on double newlines for paragraphs, single newlines for line breaks
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (!line.trim()) return <br key={i} />;

      // Bold text **...**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={i} className="block">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            // Bullet points starting with - or •
            if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('• ')) {
              return <span key={j}>{part}</span>;
            }
            return <span key={j}>{part}</span>;
          })}
        </span>
      );
    });
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
    <div className="flex justify-start">
      <div className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[92%] text-sm leading-relaxed space-y-0.5 ${
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
          {renderContent(message.content)}
        </div>
        {message.dataSources && message.dataSources.length > 0 && (
          <div className="flex items-center space-x-1 mt-2 pt-2 border-t border-gray-100">
            <Database className="w-2.5 h-2.5 text-gray-300" />
            <span className="text-xs text-gray-300">
              {message.dataSources.map(s => s.replace('get_', '').replace(/_/g, ' ')).join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

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

// ─── Suggested prompts by BU ──────────────────────────────────────────────────

function getSuggestions(bu?: string, capabilities?: any): string[] {
  const base = [
    'How am I performing this month?',
    "What's my current ranking?",
  ];

  if (bu === 'B2B') {
    return [
      ...base,
      'How much more do I need to hit my target?',
      "Who's the top performer this month?",
      'Show me my YTD vs MTD breakdown',
    ];
  }

  if (bu === 'B2C') {
    return [
      ...base,
      "What's my current AUM?",
      'How is my net inflow trending?',
    ];
  }

  if (capabilities?.proactiveInsights) {
    return [
      ...base,
      'Any insights I should know about?',
      "How is my team performing?",
    ];
  }

  return base;
}
