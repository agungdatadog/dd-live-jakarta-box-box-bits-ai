'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface PageIntroProps {
  eyebrow: string;
  title: string;
  accent?: string;
  summary: string;
  aside?: React.ReactNode;
  className?: string;
}

export function PageIntro({
  eyebrow,
  title,
  accent,
  summary,
  aside,
  className,
}: PageIntroProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={cn(
        'grid gap-6 border-b border-white/8 pb-8 pt-24 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:pt-32',
        className
      )}
    >
      <div className="max-w-3xl">
        <p className="section-kicker mb-3">{eyebrow}</p>
        <h1 className="section-title text-[clamp(2.6rem,7vw,5.6rem)]">
          {title}{' '}
          {accent ? <span className="brand-signal">{accent}</span> : null}
        </h1>
        <p className="muted-copy mt-4 max-w-2xl text-sm leading-7 md:text-base">
          {summary}
        </p>
      </div>
      {aside ? <div className="md:justify-self-end">{aside}</div> : null}
    </motion.section>
  );
}
