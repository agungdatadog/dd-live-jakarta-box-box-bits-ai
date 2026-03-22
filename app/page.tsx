'use client';

import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import { motion, useScroll } from 'motion/react';
import { ArrowRight, Radio, TimerReset, Users2, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import F1Car3D from '@/components/F1Car3D';

export default function Home() {
  const { username, setUsername } = useUserStore();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(username);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const routes = [
    {
      href: '/pitwall',
      title: 'Pitwall Radio',
      label: 'Ask Bits AI',
      description: 'Live race engineer answers with search-grounded F1 context and Datadog telemetry logging.',
      icon: Radio,
      accentClass: 'text-[var(--brand-primary)]',
    },
    {
      href: '/quiz',
      title: 'Racing Line Quiz',
      label: 'Beat the clock',
      description: 'Fast-twitch trivia framed like a timing system, built to feed the live event dashboard.',
      icon: TimerReset,
      accentClass: 'text-[var(--status-cool)]',
    },
    {
      href: '/dream-team',
      title: 'Dream Team Lineup',
      label: 'Draft the paddock',
      description: 'Assemble the full garage, then let AI judge the chemistry, drama, and hidden doggo synergy.',
      icon: Users2,
      accentClass: 'text-[var(--brand-secondary)]',
    },
  ];

  useEffect(() => {
    setTempName(username);
  }, [username]);

  const handleSaveName = () => {
    if (tempName.trim()) {
      setUsername(tempName.trim());
      setIsEditingName(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <F1Car3D scrollProgress={scrollYProgress} />
      <div
        ref={containerRef}
        className="relative z-10 h-screen overflow-y-auto no-scrollbar"
      >
        <section className="page-shell flex min-h-[100svh] items-end pb-16 pt-24 md:items-center md:pb-20 md:pt-32">
          <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,0.95fr)_20rem] lg:items-end">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="max-w-3xl"
            >
              <p className="section-kicker mb-4">Datadog Live Bangkok 2026</p>
              <div className="brand-wordmark text-[clamp(3.8rem,11vw,8rem)] leading-[0.82]">
                Box Box <span className="brand-signal">Bits AI</span>
              </div>
              <h1 className="section-title mt-6 max-w-3xl text-[clamp(1.6rem,4.3vw,3.25rem)] text-white/92">
                Observability for the paddock, built like a live race-control poster.
              </h1>
              <p className="muted-copy mt-5 max-w-xl text-sm leading-7 md:text-base">
                Explore the Datadog event experience through one branded F1 world:
                race engineer chat, speed-run quiz, and a dream-team simulator
                with AI-powered garage drama.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/pitwall"
                  className="group inline-flex items-center justify-center gap-3 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/16 px-6 py-3 text-sm font-semibold text-white"
                >
                  Open Race Control
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/dream-team"
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-white/10 bg-white/4 px-6 py-3 text-sm font-semibold text-white/88 hover:bg-white/8"
                >
                  Build Your Lineup
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.55, ease: 'easeOut' }}
              className="surface-panel hidden rounded-[2rem] p-5 lg:block"
            >
              <p className="section-kicker">Telemetry Brief</p>
              <div className="mt-5 space-y-4 text-sm">
                <div className="surface-rail rounded-2xl px-4 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                    Brand Signal
                  </p>
                  <p className="mt-2 text-white">Datadog-led atmosphere with Bits AI as the hero-level product cue.</p>
                </div>
                <div className="surface-rail rounded-2xl px-4 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                    Visual Anchor
                  </p>
                  <p className="mt-2 text-white">A dissected F1 machine hovering behind the copy as the one dominant image.</p>
                </div>
                <div className="surface-rail rounded-2xl px-4 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                    Motion Thesis
                  </p>
                  <p className="mt-2 text-white">Idle hover, scroll-linked dissection, and route transitions that feel like telemetry sweeps.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 10 }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
          className="pointer-events-none absolute inset-x-0 top-[72svh] z-10 hidden justify-center md:flex"
        >
          <div className="flex flex-col items-center gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.42em] text-[var(--text-faint)]">
              Scroll to Dissect
            </p>
            <div className="flex h-11 w-7 justify-center rounded-full border border-white/20 p-1">
              <motion.div
                animate={{ y: [0, 13, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="h-1.5 w-1.5 rounded-full bg-white"
              />
            </div>
          </div>
        </motion.div>

        <section className="page-shell pb-12">
          <div className="surface-panel-strong rounded-[2rem] p-6 md:p-8">
            <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="space-y-4"
              >
                <div>
                  <p className="section-kicker">Driver Identity</p>
                  <h2 className="section-title mt-3 text-[clamp(2rem,3vw,3rem)]">
                    Keep the broadcast personal.
                  </h2>
                  <p className="muted-copy mt-3 text-sm leading-7">
                    Set the active driver name once, then use the same profile
                    across the quiz, pitwall, and Dream Team submission flows.
                  </p>
                </div>
                <div className="telemetry-divider" />
                <div className="surface-panel rounded-[1.6rem] p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                    Active Driver
                  </p>
                  <div className="mt-5 flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/12">
                      <span className="brand-wordmark text-2xl text-white">
                        {username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditingName ? (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            className="min-w-0 flex-1 rounded-full border border-white/12 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-[color:var(--border-strong)]"
                            placeholder="Enter driver name"
                            maxLength={20}
                          />
                          <button
                            onClick={handleSaveName}
                            className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/18 px-5 py-3 text-sm font-semibold text-white"
                          >
                            Save Driver
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="brand-wordmark text-[1.8rem] leading-none text-white">
                            {username}
                          </p>
                          <button
                            onClick={() => setIsEditingName(true)}
                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-muted)] hover:text-white"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Edit Driver
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: 0.06 }}
                className="divide-y divide-white/8"
              >
                {routes.map(({ href, title, label, description, icon: Icon, accentClass }) => (
                  <Link key={href} href={href} className="route-row group py-5 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                        <Icon className={`h-5 w-5 ${accentClass}`} />
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                          {label}
                        </p>
                      </div>
                    </div>
                    <div>
                      <h3 className="section-title text-[1.5rem] text-white">{title}</h3>
                      <p className="muted-copy mt-2 max-w-2xl text-sm leading-7">{description}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-white/72 group-hover:text-white">
                      Enter
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        <section className="page-shell pb-32 md:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]"
          >
            <div className="surface-panel rounded-[2rem] p-6 md:p-8">
              <p className="section-kicker">Why It Works</p>
              <h2 className="section-title mt-4 text-[clamp(2rem,3vw,3rem)]">
                One event surface, three distinct race modes.
              </h2>
              <p className="muted-copy mt-4 max-w-2xl text-sm leading-7">
                Every interaction maps to the same visual world: the pitwall,
                the timing screen, and the garage lineup. Datadog stays first,
                and the motorsport atmosphere sharpens the hierarchy instead of
                competing with it.
              </p>
            </div>
            <div className="surface-panel rounded-[2rem] p-6 md:p-8">
              <p className="section-kicker">Launch Cue</p>
              <div className="mt-4 flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 text-[var(--brand-secondary)]" />
                <p className="muted-copy text-sm leading-7">
                  Use the floating car as the poster, then drop into focused
                  product surfaces below. The first screen sells the brand;
                  the next screens sell the interaction.
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
