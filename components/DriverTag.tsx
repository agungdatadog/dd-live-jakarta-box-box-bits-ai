'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Edit3, Flag, Check, Copy } from 'lucide-react';
import { datadogRum } from '@datadog/browser-rum';
import {
  useBooleanFlagValue,
  useNumberFlagValue,
  useStringFlagValue,
} from '@openfeature/react-sdk';
import { useUserStore } from '@/store/userStore';
import { FeatureFlags, FeatureFlagDefaults } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';

type FlagRow = { key: string; value: string | number | boolean };

/**
 * Evaluates every feature flag and returns a serialisable list for the
 * debug panel. Each call routes through the OpenFeature `after` hook in
 * FeatureFlagProvider, so opening the panel also tags the RUM session.
 */
function useAllFlagValues(): FlagRow[] {
  const pitwallModel = useStringFlagValue(
    FeatureFlags.PITWALL_LLM_MODEL,
    FeatureFlagDefaults[FeatureFlags.PITWALL_LLM_MODEL],
  );
  const pitwallEnabled = useBooleanFlagValue(
    FeatureFlags.PITWALL_CHAT_ENABLED,
    FeatureFlagDefaults[FeatureFlags.PITWALL_CHAT_ENABLED],
  );
  const synergyAlgo = useStringFlagValue(
    FeatureFlags.DREAM_TEAM_SYNERGY_ALGO,
    FeatureFlagDefaults[FeatureFlags.DREAM_TEAM_SYNERGY_ALGO],
  );
  const quizCount = useNumberFlagValue(
    FeatureFlags.QUIZ_QUESTION_COUNT,
    FeatureFlagDefaults[FeatureFlags.QUIZ_QUESTION_COUNT],
  );
  const uiTheme = useStringFlagValue(
    FeatureFlags.UI_THEME,
    FeatureFlagDefaults[FeatureFlags.UI_THEME],
  );
  const home3d = useBooleanFlagValue(
    FeatureFlags.HOME_3D_CAR_ENABLED,
    FeatureFlagDefaults[FeatureFlags.HOME_3D_CAR_ENABLED],
  );
  const newPitwallUi = useBooleanFlagValue(
    FeatureFlags.NEW_PITWALL_UI,
    FeatureFlagDefaults[FeatureFlags.NEW_PITWALL_UI],
  );
  const aiGuardStrict = useBooleanFlagValue(
    FeatureFlags.AI_GUARD_STRICT_MODE,
    FeatureFlagDefaults[FeatureFlags.AI_GUARD_STRICT_MODE],
  );
  const demoLatency = useBooleanFlagValue(
    FeatureFlags.DEMO_HIGH_LATENCY,
    FeatureFlagDefaults[FeatureFlags.DEMO_HIGH_LATENCY],
  );

  return [
    { key: FeatureFlags.PITWALL_LLM_MODEL, value: pitwallModel },
    { key: FeatureFlags.PITWALL_CHAT_ENABLED, value: pitwallEnabled },
    { key: FeatureFlags.DREAM_TEAM_SYNERGY_ALGO, value: synergyAlgo },
    { key: FeatureFlags.QUIZ_QUESTION_COUNT, value: quizCount },
    { key: FeatureFlags.UI_THEME, value: uiTheme },
    { key: FeatureFlags.HOME_3D_CAR_ENABLED, value: home3d },
    { key: FeatureFlags.NEW_PITWALL_UI, value: newPitwallUi },
    { key: FeatureFlags.AI_GUARD_STRICT_MODE, value: aiGuardStrict },
    { key: FeatureFlags.DEMO_HIGH_LATENCY, value: demoLatency },
  ];
}

function formatValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
  return String(v);
}

function variantClass(v: string | number | boolean): string {
  if (typeof v === 'boolean') {
    return v
      ? 'bg-[color:var(--brand-primary)]/15 text-[var(--brand-primary)] border-[color:var(--brand-primary)]/40'
      : 'bg-white/5 text-white/60 border-white/10';
  }
  return 'bg-white/5 text-white/90 border-white/10';
}

/**
 * Trigger pill + floating panel that shows the user's callsign, their
 * active RUM session id (last 6 chars), and every evaluated feature flag
 * with its current value. Clicking the pill toggles the panel. The panel
 * also lets the user edit their callsign without reloading the app.
 */
export function DriverTag({ className }: { className?: string }) {
  const { username, hasSetName, setUsername, userId } = useUserStore();
  const [sessionTail, setSessionTail] = useState('------');
  const [fullSessionId, setFullSessionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(username);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const flags = useAllFlagValues();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const read = () => {
      const id = datadogRum.getInternalContext?.()?.session_id;
      if (id && !cancelled) {
        setSessionTail(id.slice(-6).toUpperCase());
        setFullSessionId(id);
        return true;
      }
      return false;
    };
    if (read()) return;
    const interval = setInterval(() => {
      attempts += 1;
      if (read() || attempts >= 20) clearInterval(interval);
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setDraftName(username);
  }, [username]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (editing) setTimeout(() => editInputRef.current?.focus(), 50);
  }, [editing]);

  const displayName = hasSetName ? username : 'GuestDoggo';

  const saveName = () => {
    const name = draftName.trim();
    if (!name || name.length < 2) return;
    setUsername(name);
    if (datadogRum.getInitConfiguration()) {
      datadogRum.setUser({ id: userId, name });
      datadogRum.setGlobalContextProperty('usr.name', name);
      datadogRum.addAction('driver_name_updated', { driver_name: name });
    }
    setEditing(false);
  };

  const copySession = async () => {
    if (!fullSessionId) return;
    try {
      await navigator.clipboard.writeText(fullSessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API may be unavailable; silently ignore */
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white',
          open && 'border-[color:var(--border-strong)] bg-white/10 text-white',
        )}
        title={`Call sign: ${displayName} · RUM session: ${sessionTail}`}
      >
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)] shadow-[0_0_8px_rgba(130,76,230,0.6)]" />
        <span className="max-w-[8rem] truncate text-white/90">{displayName}</span>
        <span className="text-white/30">·</span>
        <span className="text-white/60">{sessionTail}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="driver-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[rgba(10,11,15,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            role="dialog"
            aria-label="Driver panel"
          >
            {/* Header */}
            <div className="border-b border-white/8 bg-white/4 px-4 py-3">
              <div className="flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                  Driver Panel
                </span>
              </div>
            </div>

            {/* Callsign */}
            <div className="px-4 pt-4">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                Callsign
              </p>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') {
                        setDraftName(username);
                        setEditing(false);
                      }
                    }}
                    maxLength={24}
                    className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[color:var(--border-strong)]"
                  />
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={draftName.trim().length < 2}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/15 text-[var(--brand-primary)] disabled:opacity-40"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="truncate text-sm text-white">{displayName}</span>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
                    title="Edit callsign"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Session id */}
            <div className="px-4 pt-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                RUM session id
              </p>
              <button
                type="button"
                onClick={copySession}
                disabled={!fullSessionId}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left font-mono text-[11px] text-white/80 hover:bg-white/8 disabled:opacity-50"
                title={fullSessionId || 'Session not ready'}
              >
                <span className="truncate">{fullSessionId || 'session not ready'}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-white/40" />
                )}
              </button>
            </div>

            {/* Flags */}
            <div className="px-4 pb-4 pt-4">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                Feature flags
              </p>
              <ul className="space-y-1.5">
                {flags.map(({ key, value }) => (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
                  >
                    <span className="truncate font-mono text-[11px] text-white/70">
                      {key}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                        variantClass(value),
                      )}
                    >
                      {formatValue(value)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Values stream from Datadog → updates take effect on next evaluation.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
