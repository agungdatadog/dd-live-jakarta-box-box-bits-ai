'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Bot, User } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { GoogleGenAI } from '@google/genai';
import Image from 'next/image';
import Markdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
}

export default function PitwallPage() {
  const { userId, username } = useUserStore();
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
  const chatRef = useRef<any>(null);

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
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API Key');
      }

      if (!chatRef.current) {
        const ai = new GoogleGenAI({ apiKey });
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction: "You are Bits AI, the Datadog mascot acting as an F1 race engineer on the pitwall. You have access to Google Search to find real-time F1 data, race stats, driver information, and historical data. Always use search to provide accurate, up-to-date F1 statistics when asked. Keep answers concise, engaging, and include occasional dog/racing puns (e.g., 'woof', 'bark', 'box box', 'apex').",
            tools: [{ googleSearch: {} }],
          }
        });
      }
      
      const response = await chatRef.current.sendMessage({ message: userMsg.content });

      const replyText = response.text || "Bark! I couldn't process that.";

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources: { uri: string; title: string }[] = [];
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web?.title) {
            if (!sources.find(s => s.uri === chunk.web.uri)) {
              sources.push({ uri: chunk.web.uri, title: chunk.web.title });
            }
          }
        });
      }

      // Log to Datadog LLMObs via API route
      fetch('/api/pitwall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg.content, 
          reply: replyText,
          userId, 
          username 
        }),
      }).catch(err => console.error('Failed to log to LLMObs:', err));

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
    <div className="flex flex-col h-screen relative bg-black text-white">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 opacity-20">
        <Image 
          src="/pitwall-bg.png" 
          alt="Pitwall Background" 
          fill 
          unoptimized
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
      </div>

      <div className="relative z-10 flex flex-col h-full pt-6 pb-20 px-4">
        <header className="mb-4 text-center">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tighter">
            The <span className="text-datadog-purple-light">Pitwall</span>
          </h1>
          <p className="text-zinc-400 font-mono text-xs uppercase tracking-widest">Team Radio</p>
        </header>

        <div className="flex-1 overflow-y-auto bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 mb-4 flex flex-col gap-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-zinc-800' : 'bg-datadog-purple'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`px-4 py-3 rounded-2xl max-w-[80%] ${
                msg.role === 'user' 
                  ? 'bg-zinc-800 text-white rounded-tr-sm' 
                  : 'bg-datadog-purple/20 border border-datadog-purple/30 text-zinc-100 rounded-tl-sm'
              }`}>
                <div className="text-sm leading-relaxed prose prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-datadog-purple/30">
                    <p className="text-[10px] text-datadog-purple-light mb-2 font-bold uppercase tracking-wider">Sources:</p>
                    <ul className="flex flex-col gap-1">
                      {msg.sources.map((source, idx) => (
                        <li key={idx}>
                          <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline truncate block">
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-datadog-purple flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-datadog-purple/20 border border-datadog-purple/30 rounded-tl-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-datadog-purple-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-datadog-purple-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-datadog-purple-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {SUGGESTED_QUERIES.map((query, idx) => (
              <button
                key={idx}
                onClick={() => setInput(query)}
                className="bg-zinc-800/80 hover:bg-datadog-purple/40 border border-zinc-700 hover:border-datadog-purple/60 text-xs text-zinc-300 py-2 px-4 rounded-full transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Radio check..."
            className="flex-1 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-datadog-purple transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="bg-datadog-purple hover:bg-datadog-purple-light disabled:opacity-50 disabled:hover:bg-datadog-purple text-white w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
