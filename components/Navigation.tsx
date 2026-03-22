'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, MessageSquare, Trophy, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
  const pathname = usePathname();
  const navItems = [
    { href: '/', label: 'Paddock', short: 'Home', icon: Home },
    { href: '/pitwall', label: 'Pitwall', short: 'Radio', icon: MessageSquare },
    { href: '/quiz', label: 'Quiz', short: 'Timing', icon: Trophy },
    { href: '/dream-team', label: 'Team', short: 'Lineup', icon: Car },
  ];

  return (
    <>
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-safe px-3 md:hidden">
        <div className="pointer-events-auto mx-auto flex h-18 max-w-2xl items-center justify-between gap-2 rounded-[1.6rem] border border-white/10 bg-[rgba(10,11,15,0.78)] px-2 shadow-[0_-20px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-white',
                pathname === href && 'border border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/10 text-white'
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              <span className="font-mono text-[10px] uppercase tracking-[0.24em]">{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <nav className="pointer-events-none fixed inset-x-0 top-0 z-40 hidden md:block">
        <div className="page-shell pointer-events-auto pt-6">
          <div className="surface-panel flex items-center justify-between rounded-full px-5 py-3">
            <Link href="/" className="min-w-0">
              <div className="brand-wordmark text-[1.35rem] leading-none">
                Box Box <span className="brand-signal">Bits AI</span>
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.32em] text-[var(--text-faint)]">
                Datadog Live Bangkok 2026
              </p>
            </Link>
            <div className="flex items-center gap-2">
              {navItems.map(({ href, short, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-sm text-[var(--text-muted)] hover:border-white/10 hover:bg-white/5 hover:text-white',
                    pathname === href && 'border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em]">{short}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
