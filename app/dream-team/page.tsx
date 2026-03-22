'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/userStore';
import { useDreamTeamStore, Character } from '@/store/dreamTeamStore';
import charactersData from '@/data/characters.json';
import { ArrowRight, Timer, Zap } from 'lucide-react';
import RaceStartSequence from '@/components/RaceStartSequence';
import { PageIntro } from '@/components/PageIntro';
import { DriverNameGate } from '@/components/DriverNameGate';
import { useSearchParams } from 'next/navigation';
import { datadogRum } from '@datadog/browser-rum';

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

  // Countdown
  const [countdownMs, setCountdownMs] = useState(POLE_TIME_MS);
  const [countdownActive, setCountdownActive] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const principals   = charactersData.filter(c => c.role === 'Team Principal');
  const drivers      = charactersData.filter(c => c.role === 'Driver');
  const engineers    = charactersData.filter(c => c.role === 'Race Engineer');
  const strategists  = charactersData.filter(c => c.role === 'Head of Strategy');
  const techDirectors = charactersData.filter(c => c.role === 'Technical Director');

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

  const startRace = async () => {
    if (!selectedPrincipal || !selectedDriver || !selectedDriver2 ||
        !selectedEngineer || !selectedEngineer2 || !selectedStrategy || !selectedTechDirector) return;

    setPhase('racing');
    setIsEvaluating(true);

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

    try {
      const res = await fetch('/api/evaluate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username,
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
      });

      if (!res.ok) throw new Error(`Evaluation failed: ${res.status}`);

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
      setSynergyMultiplier(1.0);
      setEvaluationFeedback('Radio comms lost. Default synergy applied.');
      setSynergyClass('AVERAGE');
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── Selection card ──────────────────────────────────────────────────────────
  const SelectionCard = ({
    title, options, selected, onSelect,
  }: { title: string; options: Character[]; selected: Character | null; onSelect: (c: Character) => void }) => (
    <section className="border-t border-white/8 py-6 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="section-title text-[1.5rem] text-white">{title}</h3>
        {selected && (
          <div className="rounded-full border border-[color:var(--border-strong)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white">
            Locked: {selected.name.split(' ')[0]}
          </div>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(selected ? [selected, ...options.filter(o => o.id !== selected.id)] : options).map(c => (
          <motion.button
            layout key={c.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            onClick={() => onSelect(c)}
            className={`group relative overflow-hidden rounded-[1.6rem] border text-left transition-all duration-300 ${
              selected?.id === c.id
                ? 'border-[color:var(--border-strong)] bg-[color:var(--brand-secondary)]/10'
                : 'border-white/10 bg-white/4 hover:bg-white/7'
            }`}
          >
            <div className="flex h-full flex-col p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="brand-wordmark text-[1.4rem] uppercase leading-none text-white mb-1">
                    {c.name.split(' ')[0]}
                  </div>
                  <div className="text-sm uppercase leading-none text-white/56">
                    {c.name.split(' ').slice(1).join(' ')}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-white/76">
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
                      <div className="font-mono text-sm font-bold text-[var(--brand-secondary)]">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="surface-rail rounded-full p-1">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(Object.values(c.visible_stats).reduce((a, b) => a + b, 0) / 300) * 100}%` }}
                    className="h-2 rounded-full bg-[var(--brand-secondary)]"
                  />
                </div>
              </div>
            </div>
            <div className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-black/28 transition-all ${
              selected?.id === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}>
              <Zap className="h-4 w-4 fill-current text-[var(--brand-secondary)]" />
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );

  // ── Synergy class badge ─────────────────────────────────────────────────────
  const synergyConf = SYNERGY_CONFIG[synergyClass] ?? SYNERGY_CONFIG['AVERAGE'];

  return (
    <>
      <DriverNameGate />

      <div className="page-shell pb-32 md:pb-14 selection:bg-[var(--brand-secondary)] selection:text-black">
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
                <p className="section-kicker">Garage Status</p>
                <h2 className="section-title mt-3 text-[1.8rem]">Build the full paddock wall.</h2>
                <p className="muted-copy mt-3 text-sm leading-7">
                  Pick one principal, two drivers, two engineers, one strategist, and one
                  technical director before the race-start sequence unlocks.
                </p>
                <div className="mt-6 grid gap-3">
                  {[
                    ['Roles locked', [selectedPrincipal, selectedDriver, selectedDriver2,
                      selectedEngineer, selectedEngineer2, selectedStrategy, selectedTechDirector]
                      .filter(Boolean).length],
                    ['Ready to launch', baseScore > 0 ? 'Yes' : 'No'],
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
                <SelectionCard title="The Captain // Team Principal" options={principals} selected={selectedPrincipal} onSelect={setPrincipal} />
                <SelectionCard title="The Ace // First Driver" options={drivers.filter(d => d.id !== selectedDriver2?.id)} selected={selectedDriver} onSelect={setDriver} />
                <SelectionCard title="The Wingman // Second Driver" options={drivers.filter(d => d.id !== selectedDriver?.id)} selected={selectedDriver2} onSelect={setDriver2} />
                <SelectionCard title="The Brains // Race Engineer 1" options={engineers.filter(e => e.id !== selectedEngineer2?.id)} selected={selectedEngineer} onSelect={setEngineer} />
                <SelectionCard title="The Voice // Race Engineer 2" options={engineers.filter(e => e.id !== selectedEngineer?.id)} selected={selectedEngineer2} onSelect={setEngineer2} />
                <SelectionCard title="The Mastermind // Head of Strategy" options={strategists} selected={selectedStrategy} onSelect={setStrategy} />
                <SelectionCard title="The Innovator // Technical Director" options={techDirectors} selected={selectedTechDirector} onSelect={setTechDirector} />

                <div className="pt-6">
                  <button
                    onClick={startRace}
                    disabled={!selectedPrincipal || !selectedDriver || !selectedDriver2 ||
                      !selectedEngineer || !selectedEngineer2 || !selectedStrategy || !selectedTechDirector}
                    className="group flex w-full items-center justify-center gap-3 rounded-full border border-[color:var(--border-strong)] bg-[var(--brand-secondary)]/14 px-6 py-5 text-sm font-semibold uppercase tracking-[0.22em] text-white disabled:opacity-45"
                  >
                    <span>Confirm Lineup</span>
                    <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
                  </button>
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
    </>
  );
}