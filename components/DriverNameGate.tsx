'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, ArrowRight } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { datadogRum } from '@datadog/browser-rum';
import { fetchWithRetry, LIGHT_FETCH_OPTIONS } from '@/lib/fetch-with-retry';

// ── Rainbow gradient cycle used on the AI button ──────────────────────────────
const RAINBOW_GRADIENT =
  'linear-gradient(135deg,#ff6b6b,#ffa94d,#ffd43b,#69db7c,#4dabf7,#9775fa,#f783ac,#ff6b6b)';

/**
 * GenAI 4-pointed star icon with an embedded rainbow SVG gradient.
 * Uses an inline <linearGradient> so the fill works regardless of CSS context —
 * background-clip:text does NOT work on SVG icon elements.
 */
function GenAiIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="genai-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#ff6b6b" />
          <stop offset="25%"  stopColor="#ffd43b" />
          <stop offset="55%"  stopColor="#4dabf7" />
          <stop offset="80%"  stopColor="#9775fa" />
          <stop offset="100%" stopColor="#f783ac" />
        </linearGradient>
      </defs>
      {/* Primary 4-pointed star — standard GenAI / Gemini symbol */}
      <path
        d="M12 2L13.9 10.1L22 12L13.9 13.9L12 22L10.1 13.9L2 12L10.1 10.1Z"
        fill="url(#genai-grad)"
      />
      {/* Small accent sparkle — top-right corner */}
      <path
        d="M19.5 3L20.2 5.8L23 6.5L20.2 7.2L19.5 10L18.8 7.2L16 6.5L18.8 5.8Z"
        fill="url(#genai-grad)"
        opacity="0.9"
      />
    </svg>
  );
}

export function DriverNameGate() {
  const { hasSetName, setUsername, initialize } = useUserStore();
  const [show, setShow] = useState(false);
  const [input, setInput] = useState('');
  const [shaking, setShaking] = useState(false);

  // AI name generator state
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<{ driverName: string; nickname: string } | null>(null);
  const [genError, setGenError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!hasSetName) {
      setShow(true);
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [hasSetName]);

  // Clear suggestion when user edits the input manually
  const handleInputChange = (val: string) => {
    setInput(val);
    if (suggestion) setSuggestion(null);
    if (genError) setGenError(false);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSuggestion(null);
    setGenError(false);
    try {
      const res = await fetchWithRetry(
        '/api/generate-driver-name',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            realName:  input.trim() || '',
            sessionId: datadogRum.getInternalContext()?.session_id ?? '',
          }),
        },
        { ...LIGHT_FETCH_OPTIONS, context: 'driver_name_generation' },
      );
      if (!res.ok) throw new Error('generate failed');
      const data = await res.json();
      setSuggestion({ driverName: data.driverName, nickname: data.nickname });
    } catch {
      setGenError(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const useSuggestion = () => {
    if (!suggestion) return;
    setInput(suggestion.driverName);
    setSuggestion(null);
    inputRef.current?.focus();
  };

  const handleConfirm = () => {
    const name = input.trim();
    if (!name || name.length < 2) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      inputRef.current?.focus();
      return;
    }
    setUsername(name);
    if (datadogRum.getInitConfiguration()) {
      datadogRum.setUser({ id: useUserStore.getState().userId, name });
      datadogRum.setGlobalContextProperty('usr.name', name);
      datadogRum.addAction('driver_name_set', { driver_name: name, ai_generated: !!suggestion });
    }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="driver-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-4 w-full max-w-md"
          >
            {/* Top accent bar */}
            <div className="h-1 w-full rounded-t-[1.6rem] bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--brand-primary)]" />

            <div className="surface-panel-strong rounded-b-[2rem] rounded-t-none p-8">
              {/* Header */}
              <div className="mb-8 flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/12">
                  <Flag className="h-5 w-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[var(--brand-primary)]">
                    Datadog Observability &amp; Security Platform Event
                  </p>
                  <h2 className="brand-wordmark mt-1 text-[1.8rem] leading-none text-white">
                    Set Your Race Number
                  </h2>
                </div>
              </div>

              <p className="muted-copy mb-6 text-sm leading-7">
                Every driver in the paddock needs a callsign. Type your name — or let AI generate a legendary one.
              </p>

              <div className="telemetry-divider mb-6" />

              {/* Input row */}
              <motion.div
                animate={shaking ? { x: [0, -10, 10, -8, 8, -4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-3"
              >
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                  Driver Name
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    placeholder="Your name or callsign…"
                    maxLength={24}
                    className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-black/40 px-5 py-4 text-base text-white placeholder-white/28 outline-none transition-colors focus:border-[color:var(--border-strong)] focus:bg-black/60"
                  />

                  {/* AI Generate button — rainbow gradient border */}
                  <motion.button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    whileTap={{ scale: 0.93 }}
                    title="Generate AI driver name"
                    className="relative flex-shrink-0 overflow-hidden rounded-2xl p-[2px] disabled:opacity-70"
                    style={{ background: RAINBOW_GRADIENT, backgroundSize: '200% 200%' }}
                    animate={isGenerating ? { backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] } : {}}
                    transition={isGenerating ? { duration: 1.4, repeat: Infinity, ease: 'linear' } : {}}
                  >
                    {/* Inner surface */}
                    <div className="flex h-full items-center justify-center rounded-[calc(1rem-2px)] bg-[#0a0b0f] px-4 py-3">
                      <motion.div
                        animate={isGenerating ? { rotate: 360 } : { rotate: 0 }}
                        transition={isGenerating ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
                      >
                        <GenAiIcon />
                      </motion.div>
                    </div>

                    {/* Glow pulse when idle */}
                    {!isGenerating && (
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-2xl"
                        style={{ background: RAINBOW_GRADIENT, opacity: 0 }}
                        animate={{ opacity: [0, 0.35, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </motion.button>
                </div>

                {/* Hint text below input */}
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                  ✦ Hit the GenAI button — AI will forge your F1 identity
                </p>
              </motion.div>

              {/* AI Suggestion card */}
              <AnimatePresence>
                {suggestion && (
                  <motion.div
                    key="suggestion"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="mb-4 overflow-hidden rounded-2xl p-[1.5px]"
                    style={{ background: RAINBOW_GRADIENT }}
                  >
                    <div className="rounded-[calc(1rem-1.5px)] bg-[#0d0e12] px-5 py-4">
                      <div className="mb-3 flex items-center gap-2">
                        <GenAiIcon />
                        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--brand-secondary)]">
                          AI Suggestion
                        </span>
                      </div>
                      <p className="brand-wordmark text-[1.9rem] leading-none text-white">
                        {suggestion.driverName}
                      </p>
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.24em] text-white/52">
                        {suggestion.nickname}
                      </p>
                      <button
                        onClick={useSuggestion}
                        className="mt-4 flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-white/10"
                      >
                        Use this name
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {genError && (
                  <motion.p
                    key="gen-error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-red-400/70"
                  >
                    Radio static — try again or type a name manually.
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                onClick={handleConfirm}
                disabled={input.trim().length < 2}
                className="group w-full rounded-full border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/16 px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition-all hover:bg-[color:var(--brand-primary)]/24 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Enter the Paddock →
              </button>

              <p className="mt-4 text-center font-mono text-[10px] text-[var(--text-faint)]">
                Your callsign appears on the live scoreboard
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
