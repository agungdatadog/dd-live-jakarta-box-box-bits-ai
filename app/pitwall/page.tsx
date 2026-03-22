'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bot, Radio, Send, User } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import Markdown from 'react-markdown';
import { PageIntro } from '@/components/PageIntro';
import { DriverNameGate } from '@/components/DriverNameGate';
import { datadogRum } from '@datadog/browser-rum';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
}

export default function PitwallPage() {
  const { userId, username } = useUserStore();
  return (
    <>
      <DriverNameGate />
      <PitwallContent userId={userId} username={username} />
    </>
  );
}

function PitwallContent({ userId, username }: { userId: string; username: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Woof! I'm Bits AI on the pitwall. Ask me anything about F1 history, strategy, or legendary drivers!",
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SUGGESTED_QUERIES = [
    "Who won the last F1 race?",
    "What are the current driver standings?",
    "Tell me about Ayrton Senna's career stats."
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    startTransition(() => {
      setMessages(prev => [...prev, userMsg]);
    });
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/pitwall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          userId,
          username,
          sessionId: datadogRum.getInternalContext()?.session_id ?? '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Pitwall request failed with status ${response.status}`);
      }

      const data = await response.json();
      const replyText = data.reply || "Bark! I couldn't process that.";
      const sources = Array.isArray(data.sources) ? data.sources : undefined;

      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'assistant', 
        content: replyText,
        sources: sources.length > 0 ? sources : undefined
      }]);
    } catch (error) {
      console.error('Pitwall error:', error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'assistant', 
        content: "Bark! We lost telemetry. The radio is down, try again later." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-shell pb-32 md:pb-14">
      <PageIntro
        eyebrow="Race Engineer Channel"
        title="Pitwall"
        accent="Radio"
        summary="Talk to Bits AI like a live race engineer. The answers stay concise, search-grounded, and logged like a telemetry feed."
        aside={
          <div className="surface-panel rounded-[1.4rem] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
              Driver Link
            </p>
            <p className="mt-2 brand-wordmark text-[1.7rem] leading-none text-white">{username}</p>
          </div>
        }
      />

      <div className="grid gap-6 pt-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="surface-panel rounded-[1.8rem] p-5">
          <p className="section-kicker">Prompt Stack</p>
          <h2 className="section-title mt-3 text-[1.8rem]">Open with a fast radio call.</h2>
          <p className="muted-copy mt-3 text-sm leading-7">
            Use a direct question and let the assistant pull recent results,
            standings, or historical race notes into one response.
          </p>
          <div className="mt-6 space-y-3">
            {SUGGESTED_QUERIES.map((query, idx) => (
              <button
                key={idx}
                onClick={() => setInput(query)}
                className="surface-rail block w-full rounded-2xl px-4 py-3 text-left text-sm text-white/90 hover:text-white"
              >
                {query}
              </button>
            ))}
          </div>
          <div className="telemetry-divider my-6" />
          <div className="flex items-start gap-3">
            <Radio className="mt-1 h-4 w-4 text-[var(--brand-primary)]" />
            <p className="muted-copy text-sm leading-7">
              Source links appear inline whenever live search grounding is available.
            </p>
          </div>
        </aside>

        <section className="surface-panel-strong rounded-[2rem] p-4 md:p-5">
          <div className="surface-rail rounded-[1.4rem] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                  Channel Status
                </p>
                <p className="mt-1 text-sm text-white">Pitwall open. Search-enabled commentary active.</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-[var(--brand-secondary)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/80">
                  Live
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex max-h-[58svh] min-h-[26rem] flex-col gap-4 overflow-y-auto pr-1 no-scrollbar md:max-h-[62svh]">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`grid gap-3 ${msg.role === 'user' ? 'justify-items-end' : ''}`}
              >
                <div
                  className={`flex w-full max-w-3xl gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                      msg.role === 'user'
                        ? 'border-white/10 bg-white/6'
                        : 'border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/16'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User className="h-4 w-4 text-white/86" />
                    ) : (
                      <Bot className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="surface-rail rounded-[1.6rem] px-4 py-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                        {msg.role === 'user' ? username : 'Bits AI'}
                      </p>
                      <div className="prose prose-invert prose-p:leading-7 prose-pre:p-0 mt-3 max-w-none text-sm">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                      {msg.sources && msg.sources.length > 0 ? (
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                            Search Sources
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            {msg.sources.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[var(--status-cool)] underline-offset-4 hover:underline"
                              >
                                {source.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {isLoading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex max-w-3xl gap-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/16">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="surface-rail flex rounded-[1.6rem] px-4 py-4">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="mt-4">
            <div className="surface-panel rounded-[1.6rem] p-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Radio check. Ask for standings, strategy, or history..."
                  className="min-w-0 flex-1 rounded-[1.2rem] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[color:var(--border-strong)]"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/18 text-white disabled:opacity-50"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

