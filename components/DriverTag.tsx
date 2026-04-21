'use client';

import { useEffect, useState } from 'react';
import { datadogRum } from '@datadog/browser-rum';
import { useUserStore } from '@/store/userStore';
import { cn } from '@/lib/utils';

/**
 * Compact "driver tag" shown in the nav bar with the current user's
 * call sign and the last 6 chars of the active RUM session id. The
 * session id is polled briefly after mount because datadogRum may
 * initialise a tick after the component renders.
 */
export function DriverTag({ className }: { className?: string }) {
  const { username, hasSetName } = useUserStore();
  const [sessionTail, setSessionTail] = useState<string>('------');

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const read = () => {
      const ctx = datadogRum.getInternalContext?.();
      const id = ctx?.session_id;
      if (id && !cancelled) {
        setSessionTail(id.slice(-6).toUpperCase());
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

  const displayName = hasSetName ? username : 'GuestDoggo';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]',
        className,
      )}
      title={`Call sign: ${displayName} · RUM session: ${sessionTail}`}
    >
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)] shadow-[0_0_8px_rgba(var(--brand-primary-rgb,130,76,230),0.6)]" />
      <span className="max-w-[8rem] truncate text-white/90">{displayName}</span>
      <span className="text-white/30">·</span>
      <span className="text-white/60">{sessionTail}</span>
    </div>
  );
}
