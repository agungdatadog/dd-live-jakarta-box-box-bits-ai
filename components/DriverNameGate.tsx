'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { datadogRum } from '@datadog/browser-rum';

export function DriverNameGate() {
  const { hasSetName, setUsername, initialize } = useUserStore();
  const [show, setShow] = useState(false);
  const [input, setInput] = useState('');
  const [shaking, setShaking] = useState(false);
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
      datadogRum.addAction('driver_name_set', { driver_name: name });
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
                    Datadog Live Bangkok 2026
                  </p>
                  <h2 className="brand-wordmark mt-1 text-[1.8rem] leading-none text-white">
                    Set Your Race Number
                  </h2>
                </div>
              </div>

              <p className="muted-copy mb-6 text-sm leading-7">
                Every driver in the paddock needs a callsign. Enter yours to unlock the pitwall, quiz, and Dream Team builder.
              </p>

              <div className="telemetry-divider mb-6" />

              {/* Input */}
              <motion.div
                animate={shaking ? { x: [0, -10, 10, -8, 8, -4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-4"
              >
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                  Driver Name
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                  placeholder="e.g. Foxy McRaceFace"
                  maxLength={20}
                  className="w-full rounded-2xl border border-white/12 bg-black/40 px-5 py-4 text-base text-white placeholder-white/28 outline-none transition-colors focus:border-[color:var(--border-strong)] focus:bg-black/60"
                />
              </motion.div>

              <button
                onClick={handleConfirm}
                disabled={input.trim().length < 2}
                className="group w-full rounded-full border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/16 px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white transition-all hover:bg-[color:var(--brand-primary)]/24 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Enter the Paddock →
              </button>

              <p className="mt-4 text-center font-mono text-[10px] text-[var(--text-faint)]">
                Your name appears on the live scoreboard
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
