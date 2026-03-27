'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/userStore';
import { useDreamTeamStore, Character } from '@/store/dreamTeamStore';
import charactersData from '@/data/characters.json';
import { ArrowRight, LoaderCircle, Timer, Zap } from 'lucide-react';
import RaceStartSequence from '@/components/RaceStartSequence';
import { PageIntro } from '@/components/PageIntro';
import { DriverNameGate } from '@/components/DriverNameGate';
import { useSearchParams } from 'next/navigation';
import { datadogRum } from '@datadog/browser-rum';
import { fetchWithRetry, LLM_FETCH_OPTIONS } from '@/lib/fetch-with-retry';

// ── Countdown: Kimi Antonelli's 2025 Bahrain pole time 1:32.064 ──────────────
const POLE_TIME_MS = 92064; // 1 min 32.064 sec

function formatCountdown(ms: number) {
  if (ms <= 0) return '0:00.000';
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// ── Synergy class visual config ───────────────────────────────────────────────
const SYNERGY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LEGENDARY: { label: 'LEGENDARY', color: 'text-[#f5c518]', bg: 'bg-[#f5c518]/10 border-[#f5c518]/30' },
  STRONG:    { label: 'STRONG',    color: 'text-[var(--brand-secondary)]', bg: 'bg-[var(--brand-secondary)]/10 border-[var(--brand-secondary)]/30' },
  AVERAGE:   { label: 'AVERAGE',   color: 'text-white/70',                  bg: 'bg-white/5 border-white/15' },
  VOLATILE:  { label: 'VOLATILE',  color: 'text-orange-400',                bg: 'bg-orange-500/10 border-orange-500/30' },
  TOXIC:     { label: 'TOXIC',     color: 'text-red-400',                   bg: 'bg-red-500/10 border-red-500/30' },
};

const SUBMISSION_STAGES = [
  {
    id: 'locked',
    title: 'Garage Locked',
    copy: 'The lineup is frozen and race control has accepted your submission.',
  },
  {
    id: 'sent',
    title: 'Context Sent',
    copy: 'Hidden rivalries, lore, and chemistry data are heading to the judges now.',
  },
  {
    id: 'judging',
    title: 'AI Judges Reviewing',
    copy: 'Datadog LLM Observability is tracing the verdict while the pitwall model scores the team.',
  },
] as const;

type RoleId =
  | 'principal'
  | 'driver1'
  | 'driver2'
  | 'engineer1'
  | 'engineer2'
  | 'strategy'
  | 'techDirector';

const ROLE_ORDER: RoleId[] = [
  'principal',
  'driver1',
  'driver2',
  'engineer1',
  'engineer2',
  'strategy',
  'techDirector',
];

const ROLE_STYLES: Record<
  RoleId,
  {
    label: string;
    title: string;
    subtitle: string;
    hint: string;
    dotClass: string;
    borderClass: string;
    bgClass: string;
    textClass: string;
  }
> = {
  principal: {
    label: 'P1',
    title: 'The Captain',
    subtitle: 'Team Principal',
    hint: 'Pick the leader who shapes the whole garage tone.',
    dotClass: 'bg-violet-400',
    borderClass: 'border-violet-400/35',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-300',
  },
  driver1: {
    label: 'D1',
    title: 'The Ace',
    subtitle: 'First Driver',
    hint: 'Choose the headline act who carries the pace ceiling.',
    dotClass: 'bg-orange-400',
    borderClass: 'border-orange-400/35',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-300',
  },
  driver2: {
    label: 'D2',
    title: 'The Wingman',
    subtitle: 'Second Driver',
    hint: 'Balance the lineup with support, tension, or chaos.',
    dotClass: 'bg-sky-400',
    borderClass: 'border-sky-400/35',
    bgClass: 'bg-sky-500/10',
    textClass: 'text-sky-300',
  },
  engineer1: {
    label: 'E1',
    title: 'The Brains',
    subtitle: 'Race Engineer 1',
    hint: 'Match the first driver with the right radio voice.',
    dotClass: 'bg-cyan-400',
    borderClass: 'border-cyan-400/35',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-300',
  },
  engineer2: {
    label: 'E2',
    title: 'The Voice',
    subtitle: 'Race Engineer 2',
    hint: 'Give the second driver a different engineering mood.',
    dotClass: 'bg-emerald-400',
    borderClass: 'border-emerald-400/35',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-300',
  },
  strategy: {
    label: 'STR',
    title: 'The Mastermind',
    subtitle: 'Head of Strategy',
    hint: 'Choose the pitwall brain that makes or breaks Sunday.',
    dotClass: 'bg-amber-400',
    borderClass: 'border-amber-400/35',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-300',
  },
  techDirector: {
    label: 'TD',
    title: 'The Innovator',
    subtitle: 'Technical Director',
    hint: 'Lock in the architect behind the whole machine.',
    dotClass: 'bg-fuchsia-400',
    borderClass: 'border-fuchsia-400/35',
    bgClass: 'bg-fuchsia-500/10',
    textClass: 'text-fuchsia-300',
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function DreamTeamPage() {
  return (
    <Suspense>
      <DreamTeamContent />
    </Suspense>
  );
}

function DreamTeamContent() {
  const { userId, username } = useUserStore();
  const {
    selectedPrincipal, selectedDriver, selectedDriver2,
    selectedEngineer, selectedEngineer2, selectedStrategy, selectedTechDirector,
    setPrincipal, setDriver, setDriver2, setEngineer, setEngineer2, setStrategy, setTechDirector,
  } = useDreamTeamStore();

  const searchParams = useSearchParams();
  const gameMode = searchParams.get('game') === '1';

  const [phase, setPhase] = useState<'selection' | 'racing'>('selection');
  const [baseScore, setBaseScore] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Evaluation result fields
  const [synergyMultiplier, setSynergyMultiplier] = useState<number | null>(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState('');
  const [teamCodename, setTeamCodename] = useState('');
  const [sneakPeek, setSneakPeek] = useState('');
  const [synergyClass, setSynergyClass] = useState('');
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [submissionStage, setSubmissionStage] =
    useState<(typeof SUBMISSION_STAGES)[number]['id']>('locked');
  const [expandedRoleId, setExpandedRoleId] = useState<RoleId>('principal');
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  // Countdown
  const [countdownMs, setCountdownMs] = useState(POLE_TIME_MS);
  const [countdownActive, setCountdownActive] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const principals   = charactersData.filter(c => c.role === 'Team Principal');
  const drivers      = charactersData.filter(c => c.role === 'Driver');
  const engineers    = charactersData.filter(c => c.role === 'Race Engineer');
  const strategists  = charactersData.filter(c => c.role === 'Head of Strategy');
  const techDirectors = charactersData.filter(c => c.role === 'Technical Director');
  const sectionRefs = useRef<Record<RoleId, HTMLElement | null>>({
    principal: null,
    driver1: null,
    driver2: null,
    engineer1: null,
    engineer2: null,
    strategy: null,
    techDirector: null,
  });

  const selectedByRole: Record<RoleId, Character | null> = {
    principal: selectedPrincipal,
    driver1: selectedDriver,
    driver2: selectedDriver2,
    engineer1: selectedEngineer,
    engineer2: selectedEngineer2,
    strategy: selectedStrategy,
    techDirector: selectedTechDirector,
  };

  const allRolesLocked = ROLE_ORDER.every((role) => selectedByRole[role]);

  // Base score calculation
  useEffect(() => {
    const chars = [selectedPrincipal, selectedDriver, selectedDriver2, selectedEngineer,
                   selectedEngineer2, selectedStrategy, selectedTechDirector];
    if (chars.every(Boolean)) {
      setBaseScore(chars.reduce((sum, c) =>
        sum + Object.values(c!.visible_stats).reduce((a, b) => a + b, 0), 0));
    } else {
      setBaseScore(0);
    }
  }, [selectedPrincipal, selectedDriver, selectedDriver2, selectedEngineer,
      selectedEngineer2, selectedStrategy, selectedTechDirector]);

  // Countdown timer (activated by ?game=1 param or button)
  useEffect(() => {
    if (gameMode && !countdownActive) {
      setCountdownActive(true);
    }
  }, [gameMode]);

  useEffect(() => {
    if (countdownActive && countdownMs > 0) {
      const start = Date.now();
      const startMs = countdownMs;
      countdownRef.current = setInterval(() => {
        const remaining = startMs - (Date.now() - start);
        if (remaining <= 0) {
          setCountdownMs(0);
          setCountdownActive(false);
          clearInterval(countdownRef.current!);
        } else {
          setCountdownMs(remaining);
        }
      }, 50);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [countdownActive]);

  useEffect(() => {
    if (phase !== 'selection') return;
    const firstIncomplete = ROLE_ORDER.find((role) => !selectedByRole[role]);
    if (!firstIncomplete) return;
    setExpandedRoleId((current) => (selectedByRole[current] ? firstIncomplete : current));
  }, [
    phase,
    selectedPrincipal,
    selectedDriver,
    selectedDriver2,
    selectedEngineer,
    selectedEngineer2,
    selectedStrategy,
    selectedTechDirector,
  ]);

  const focusRole = (roleId: RoleId) => {
    setExpandedRoleId(roleId);
    requestAnimationFrame(() => {
      sectionRefs.current[roleId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const commitSelection = (roleId: RoleId, character: Character, setter: (value: Character) => void) => {
    setter(character);
    const nextState = {
      ...selectedByRole,
      [roleId]: character,
    };
    const nextRole = ROLE_ORDER.find((candidate) => !nextState[candidate]) ?? roleId;
    setExpandedRoleId(nextRole);
    requestAnimationFrame(() => {
      sectionRefs.current[nextRole]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startRace = async () => {
    if (!selectedPrincipal || !selectedDriver || !selectedDriver2 ||
        !selectedEngineer || !selectedEngineer2 || !selectedStrategy || !selectedTechDirector) return;

    setPhase('racing');
    setIsEvaluating(true);
    setSubmissionStage('locked');

    // RUM custom action — records the submission for Session Replay correlation
    if (datadogRum.getInitConfiguration()) {
      datadogRum.addAction('dream_team_submitted', {
        userId,
        username,
        base_score: baseScore,
        selection: {
          principal: selectedPrincipal.name,
          driver_1: selectedDriver.name,
          driver_2: selectedDriver2.name,
          engineer_1: selectedEngineer.name,
          engineer_2: selectedEngineer2.name,
          strategy: selectedStrategy.name,
          tech_director: selectedTechDirector.name,
        },
      });
    }

    setRetryStatus(null);
    try {
      setSubmissionStage('sent');
      const res = await fetchWithRetry(
        '/api/evaluate-team',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            username,
            sessionId: datadogRum.getInternalContext()?.session_id ?? '',
            selection: {
              team_principal: selectedPrincipal.id,
              driver_1: selectedDriver.id,
              driver_2: selectedDriver2.id,
              race_engineer_1: selectedEngineer.id,
              race_engineer_2: selectedEngineer2.id,
              head_of_strategy: selectedStrategy.id,
              technical_director: selectedTechDirector.id,
            },
            baseTeamStats: baseScore,
          }),
        },
        {
          ...LLM_FETCH_OPTIONS,
          context: 'dream_team_evaluation',
          onRetry: (attempt, max, msg) => {
            setRetryStatus(`Attempt ${attempt}/${max} — ${msg}`);
            datadogRum.addAction?.('dream_team_retry', { attempt, max, reason: msg });
          },
        },
      );

      setRetryStatus(null);
      if (!res.ok) throw new Error(`Evaluation failed: ${res.status}`);
      setSubmissionStage('judging');

      const result = await res.json();
      setSynergyMultiplier(result.synergyMultiplier ?? 1.0);
      setTeamCodename(result.teamCodename ?? '');
      setSneakPeek(result.sneakPeek ?? '');
      setSynergyClass(result.synergyClass ?? 'AVERAGE');
      setFinalScore(result.finalScore ?? null);
      setEvaluationFeedback(result.sneakPeek ?? 'Evaluation complete.');

      // RUM: record the result (score visible in Session Replay + RUM analytics)
      if (datadogRum.getInitConfiguration()) {
        datadogRum.addAction('dream_team_result', {
          userId,
          username,
          final_score: result.finalScore,
          synergy_class: result.synergyClass,
          team_codename: result.teamCodename,
        });
      }
    } catch (err) {
      setRetryStatus(null);
      const errMsg = err instanceof Error ? err.message : String(err);
      datadogRum.addAction?.('dream_team_failed', { error: errMsg });
      setSynergyMultiplier(1.0);
      setEvaluationFeedback(
        errMsg.includes('429') || errMsg.includes('rate limit')
          ? 'Judges overloaded — give it a moment and re-submit your lineup.'
          : 'Radio comms lost after multiple attempts. Re-submit your lineup.',
      );
      setSynergyClass('AVERAGE');
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── Selection card ──────────────────────────────────────────────────────────
  const SelectionSection = ({
    roleId,
    options,
    selected,
    onSelect,
  }: {
    roleId: RoleId;
    options: Character[];
    selected: Character | null;
    onSelect: (c: Character) => void;
  }) => {
    const role = ROLE_STYLES[roleId];
    const isExpanded = expandedRoleId === roleId;

    return (
      <motion.section
        layout
        ref={(node) => {
          sectionRefs.current[roleId] = node;
        }}
        className={`border-t border-white/8 py-5 first:border-t-0 first:pt-0 ${selected && !isExpanded ? 'opacity-92' : ''}`}
      >
        <button
          type="button"
          onClick={() => focusRole(roleId)}
          className={`flex w-full items-start justify-between gap-4 rounded-[1.6rem] border px-4 py-4 text-left transition-all ${
            isExpanded
              ? `${role.borderClass} ${role.bgClass}`
              : selected
                ? 'border-white/10 bg-white/4 hover:bg-white/6'
                : 'border-white/8 bg-black/20 hover:bg-white/5'
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${role.dotClass}`} />
              <p className={`font-mono text-[10px] uppercase tracking-[0.28em] ${role.textClass}`}>
                {role.label}
              </p>
            </div>
            <h3 className="section-title mt-3 text-[1.45rem] text-white">
              {role.title}
            </h3>
            <p className="mt-1 text-sm uppercase leading-none text-white/56">
              {role.subtitle}
            </p>
            <p className="muted-copy mt-3 max-w-xl text-sm leading-6">
              {selected && !isExpanded
                ? `Locked in: ${selected.name}`
                : role.hint}
            </p>
          </div>

          <div className="shrink-0">
            <div className={`rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.24em] ${
              selected ? `${role.borderClass} ${role.textClass}` : 'border-white/12 text-white/52'
            }`}>
              {selected ? 'Change' : 'Choose'}
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key={`${roleId}-options`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mt-4 grid gap-3 lg:grid-cols-2"
            >
              {(selected ? [selected, ...options.filter((option) => option.id !== selected.id)] : options).map((c) => (
                <motion.button
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={`group relative overflow-hidden rounded-[1.45rem] border text-left transition-all duration-300 ${
                    selected?.id === c.id
                      ? `${role.borderClass} ${role.bgClass}`
                      : 'border-white/10 bg-white/4 hover:bg-white/7'
                  }`}
                >
                  <div className="flex h-full flex-col p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <div className="brand-wordmark mb-1 text-[1.35rem] uppercase leading-none text-white">
                          {c.name.split(' ')[0]}
                        </div>
                        <div className="text-sm uppercase leading-none text-white/56">
                          {c.name.split(' ').slice(1).join(' ')}
                        </div>
                      </div>
                      <div className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.24em] ${
                        selected?.id === c.id ? `${role.borderClass} ${role.textClass}` : 'border-white/10 text-white/76'
                      }`}>
                        {c.breed.split(' ')[0]}
                      </div>
                    </div>

                    <div className="mt-auto space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {Object.entries(c.visible_stats).map(([key, val]) => (
                          <div key={key} className="surface-rail rounded-2xl px-2 py-3 text-center">
                            <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                              {key.split('_')[0]}
                            </div>
                            <div className={`font-mono text-sm font-bold ${role.textClass}`}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="surface-rail rounded-full p-1">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(Object.values(c.visible_stats).reduce((a, b) => a + b, 0) / 300) * 100}%` }}
                          className={`h-2 rounded-full ${role.dotClass}`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-black/28 transition-all ${
                    selected?.id === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <Zap className={`h-4 w-4 fill-current ${role.textClass}`} />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.section>
    );
  };

  const roleSections = [
    {
      roleId: 'principal' as const,
      options: principals,
      selected: selectedPrincipal,
      onSelect: (c: Character) => commitSelection('principal', c, setPrincipal),
    },
    {
      roleId: 'driver1' as const,
      options: drivers.filter((d) => d.id !== selectedDriver2?.id),
      selected: selectedDriver,
      onSelect: (c: Character) => commitSelection('driver1', c, setDriver),
    },
    {
      roleId: 'driver2' as const,
      options: drivers.filter((d) => d.id !== selectedDriver?.id),
      selected: selectedDriver2,
      onSelect: (c: Character) => commitSelection('driver2', c, setDriver2),
    },
    {
      roleId: 'engineer1' as const,
      options: engineers.filter((e) => e.id !== selectedEngineer2?.id),
      selected: selectedEngineer,
      onSelect: (c: Character) => commitSelection('engineer1', c, setEngineer),
    },
    {
      roleId: 'engineer2' as const,
      options: engineers.filter((e) => e.id !== selectedEngineer?.id),
      selected: selectedEngineer2,
      onSelect: (c: Character) => commitSelection('engineer2', c, setEngineer2),
    },
    {
      roleId: 'strategy' as const,
      options: strategists,
      selected: selectedStrategy,
      onSelect: (c: Character) => commitSelection('strategy', c, setStrategy),
    },
    {
      roleId: 'techDirector' as const,
      options: techDirectors,
      selected: selectedTechDirector,
      onSelect: (c: Character) => commitSelection('techDirector', c, setTechDirector),
    },
  ];

  // ── Synergy class badge ─────────────────────────────────────────────────────
  const synergyConf = SYNERGY_CONFIG[synergyClass] ?? SYNERGY_CONFIG['AVERAGE'];

  return (
    <>
      <DriverNameGate />

      <div className={`page-shell selection:bg-[var(--brand-secondary)] selection:text-black ${
        phase === 'selection' ? 'pb-48 md:pb-40' : 'pb-32 md:pb-14'
      }`}>
        <PageIntro
          eyebrow="Lineup Builder"
          title="Dream"
          accent="Team"
          summary="Draft a full garage, compare visible stats, then send the squad through an AI race-start simulation — your team's synergy is judged live against the Bangkok paddock."
          aside={
            <div className="flex flex-col gap-3">
              {/* Base score */}
              <div className="surface-panel rounded-[1.4rem] px-5 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">Total Rating</p>
                <p className="mt-2 brand-wordmark text-[2rem] leading-none text-[var(--brand-secondary)]">{baseScore}</p>
              </div>

              {/* Countdown timer */}
              {(gameMode || countdownActive || countdownMs < POLE_TIME_MS) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`surface-panel rounded-[1.4rem] px-5 py-4 ${countdownMs === 0 ? 'border border-red-500/40' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <Timer className={`h-3.5 w-3.5 ${countdownMs === 0 ? 'text-red-400' : 'text-[var(--brand-primary)]'}`} />
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                      {countdownMs === 0 ? "Time's Up" : "Pole Time"}
                    </p>
                  </div>
                  <p className={`mt-2 brand-wordmark text-[1.6rem] leading-none tabular-nums ${
                    countdownMs === 0 ? 'text-red-400' :
                    countdownMs < 10000 ? 'text-orange-400' : 'text-white'
                  }`}>
                    {formatCountdown(countdownMs)}
                  </p>
                  {!countdownActive && countdownMs === POLE_TIME_MS && (
                    <button
                      onClick={() => setCountdownActive(true)}
                      className="mt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--brand-primary)] hover:text-white"
                    >
                      Start Timer →
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          }
        />

        <AnimatePresence mode="wait">
          {/* ── Selection phase ─────────────────────────────────────────────── */}
          {phase === 'selection' && (
            <motion.div
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -50 }}
              className="grid gap-6 pt-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
            >
              <aside className="surface-panel rounded-[1.8rem] p-5">
                <p className="section-kicker">Draft Flow</p>
                <h2 className="section-title mt-3 text-[1.8rem]">Choose one role at a time.</h2>
                <p className="muted-copy mt-3 text-sm leading-7">
                  Finished roles collapse into roster strips, and the next open slot becomes the active choice.
                </p>
                <div className="mt-6 grid gap-3">
                  {[
                    ['Roles locked', [selectedPrincipal, selectedDriver, selectedDriver2,
                      selectedEngineer, selectedEngineer2, selectedStrategy, selectedTechDirector]
                      .filter(Boolean).length],
                    ['Live slot', ROLE_STYLES[expandedRoleId].label],
                    ['Ready to launch', allRolesLocked ? 'Yes' : 'No'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="surface-rail rounded-2xl px-4 py-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">{label}</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Game mode hint */}
                {!gameMode && (
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Tip: add ?game=1 to URL to start the Kimi pole countdown
                  </p>
                )}
              </aside>

              <section className="surface-panel-strong rounded-[2rem] p-5 md:p-6">
                {roleSections.map((section) => (
                  <SelectionSection
                    key={section.roleId}
                    roleId={section.roleId}
                    options={section.options}
                    selected={section.selected}
                    onSelect={section.onSelect}
                  />
                ))}

                <div className="pt-6">
                  <button
                    onClick={startRace}
                    disabled={!allRolesLocked}
                    className="group flex w-full items-center justify-center gap-3 rounded-full border border-[color:var(--border-strong)] bg-[var(--brand-secondary)]/14 px-6 py-5 text-sm font-semibold uppercase tracking-[0.22em] text-white disabled:opacity-45"
                  >
                    <span>Confirm Lineup</span>
                    <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
                  </button>
                  <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                    Submit once and the garage locks while the AI judges start immediately.
                  </p>
                </div>
              </section>
            </motion.div>
          )}

          {/* ── Racing / result phase ────────────────────────────────────────── */}
          {phase === 'racing' && (
            <motion.div
              key="racing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 pt-6"
            >
              {isEvaluating ? (
                <motion.section
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="surface-panel rounded-[2rem] p-5 md:p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-3">
                        <LoaderCircle className="h-5 w-5 animate-spin text-[var(--brand-secondary)]" />
                        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand-secondary)]">
                          Evaluation Running
                        </p>
                      </div>
                      <h2 className="section-title mt-3 text-[1.8rem] text-white">
                        Your lineup is on the pitwall now.
                      </h2>
                      <p className="muted-copy mt-3 max-w-xl text-sm leading-7">
                        We&apos;re locking the garage, sending the full paddock context to the judges,
                        and waiting for the Datadog-traced verdict to come back.
                      </p>
                      {retryStatus ? (
                        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-orange-400">
                          ↻ {retryStatus}
                        </p>
                      ) : null}
                    </div>

                    <div className="surface-rail rounded-[1.4rem] px-4 py-4 lg:min-w-[14rem]">
                      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                        Current Step
                      </p>
                      <p className="mt-2 brand-wordmark text-[1.3rem] leading-none text-[var(--brand-secondary)]">
                        {SUBMISSION_STAGES.find((stage) => stage.id === submissionStage)?.title}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {SUBMISSION_STAGES.map((stage, index) => {
                      const activeIndex = SUBMISSION_STAGES.findIndex(
                        (item) => item.id === submissionStage
                      );
                      const isActive = stage.id === submissionStage;
                      const isDone = index < activeIndex;

                      return (
                        <div
                          key={stage.id}
                          className={`rounded-[1.4rem] border px-4 py-4 transition-colors ${
                            isActive
                              ? 'border-[color:var(--border-strong)] bg-[var(--brand-secondary)]/10'
                              : isDone
                                ? 'border-white/12 bg-white/6'
                                : 'border-white/8 bg-white/3'
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[var(--text-faint)]">
                            Step {index + 1}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white">{stage.title}</p>
                          <p className="mt-2 text-sm leading-6 text-white/68">{stage.copy}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>
              ) : null}

              {/* Race start animation */}
              <div className="surface-panel-strong overflow-hidden rounded-[2rem]">
                <RaceStartSequence
                  driver1Name={selectedDriver?.name || 'Driver 1'}
                  driver2Name={selectedDriver2?.name || 'Driver 2'}
                  synergyMultiplier={synergyMultiplier}
                  feedback={evaluationFeedback}
                  isEvaluating={isEvaluating}
                  onAnimationComplete={() => undefined}
                />
              </div>

              {/* Glimpse result — shown once evaluation completes */}
              <AnimatePresence>
                {!isEvaluating && teamCodename && (
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="surface-panel-strong rounded-[2rem] p-6 md:p-8"
                  >
                    {/* Top row: codename + synergy class badge */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="section-kicker mb-2">Team Codename</p>
                        <h2 className="brand-wordmark text-[clamp(1.8rem,4vw,3rem)] leading-tight text-white">
                          {teamCodename}
                        </h2>
                      </div>
                      <div className={`rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-[0.28em] ${synergyConf.bg} ${synergyConf.color}`}>
                        {synergyConf.label}
                      </div>
                    </div>

                    <div className="telemetry-divider my-6" />

                    {/* Sneak peek commentary */}
                    <div className="mb-6">
                      <p className="section-kicker mb-3">Pitwall Verdict</p>
                      <p className="text-base leading-7 text-white/88">{sneakPeek}</p>
                    </div>

                    {/* Score row */}
                    {finalScore !== null && (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <div className="surface-rail rounded-2xl px-4 py-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">Final Score</p>
                          <p className="mt-2 brand-wordmark text-[2rem] leading-none text-[var(--brand-secondary)]">
                            {finalScore.toLocaleString()}
                          </p>
                        </div>
                        <div className="surface-rail rounded-2xl px-4 py-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">Base Rating</p>
                          <p className="mt-2 brand-wordmark text-[2rem] leading-none text-white/70">{baseScore}</p>
                        </div>
                        <div className="surface-rail rounded-2xl px-4 py-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">Synergy ×</p>
                          <p className={`mt-2 brand-wordmark text-[2rem] leading-none ${synergyConf.color}`}>
                            {synergyMultiplier?.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                      Weirdness rating &amp; conflict index logged to Datadog LLM Observability — check the scoreboard with the MC.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {phase === 'selection' ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 px-3 md:bottom-6">
          <div className="pointer-events-auto mx-auto max-w-[min(var(--page-max),100%)]">
            <div className="surface-panel rounded-[1.6rem] px-3 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                  Lineup Preview
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/56">
                  Tap any slot to edit
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {ROLE_ORDER.map((roleId) => {
                  const role = ROLE_STYLES[roleId];
                  const selected = selectedByRole[roleId];
                  const isActive = expandedRoleId === roleId;

                  return (
                    <button
                      key={roleId}
                      type="button"
                      onClick={() => focusRole(roleId)}
                      className={`min-w-[10.5rem] rounded-[1.2rem] border px-3 py-3 text-left transition-all ${
                        isActive
                          ? `${role.borderClass} ${role.bgClass}`
                          : selected
                            ? 'border-white/12 bg-white/6'
                            : 'border-white/8 bg-black/25'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${role.dotClass}`} />
                        <span className={`font-mono text-[9px] uppercase tracking-[0.24em] ${role.textClass}`}>
                          {role.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/52">
                        {role.subtitle}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {selected ? selected.name : 'Pending'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}