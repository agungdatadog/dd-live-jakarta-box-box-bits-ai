'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Car, CheckCircle2, Zap } from 'lucide-react';

const SPEED_LINES = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  top: `${((index * 29) % 100)}%`,
  width: `${140 + ((index * 37) % 260)}px`,
  opacity: 0.45 + ((index % 5) * 0.12),
  duration: 0.12 + ((index % 4) * 0.05),
}));

interface RaceStartSequenceProps {
  driver1Name: string;
  driver2Name: string;
  synergyMultiplier: number | null;
  feedback: string;
  isEvaluating: boolean;
  onAnimationComplete: () => void;
}

export default function RaceStartSequence({ driver1Name, driver2Name, synergyMultiplier, feedback, isEvaluating, onAnimationComplete }: RaceStartSequenceProps) {
  const [lights, setLights] = useState(0);
  const [isRacing, setIsRacing] = useState(false);
  const [showFinish, setShowFinish] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const runSequence = async () => {
      for (let i = 1; i <= 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        if (cancelled) return;
        setLights(i);
      }
      
      // Hold all 5 lights for a random time between 0.5s and 1.5s
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      if (cancelled) return;
      
      // Lights out!
      setLights(0);
      setIsRacing(true);
      
      // Race duration
      await new Promise(resolve => setTimeout(resolve, 4000));
      if (cancelled) return;
      
      setShowFinish(true);
      
      // Wait a bit before calling onAnimationComplete
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (cancelled) return;
      onAnimationComplete();
    };

    runSequence();

    return () => {
      cancelled = true;
    };
  }, [onAnimationComplete]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-zinc-950">
      <AnimatePresence>
        {!showFinish && (
          <motion.div
            key="racing-scene"
            exit={{ opacity: 0, scale: 1.1 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            {/* Camera Shake Container */}
            <motion.div
              animate={isRacing ? {
                x: [-5, 5, -5, 5, 0],
                y: [-2, 2, -2, 2, 0],
              } : {}}
              transition={{ repeat: Infinity, duration: 0.1 }}
              className="relative w-full max-w-4xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden border-4 border-zinc-800 flex flex-col items-center justify-end pb-12"
            >
              {/* Speed lines background */}
              {isRacing && (
                <div className="absolute inset-0 opacity-50">
                  {SPEED_LINES.map((line) => (
                    <motion.div
                      key={line.id}
                      className="absolute h-[2px] bg-gradient-to-r from-transparent via-white to-transparent"
                      style={{ 
                        top: line.top,
                        width: line.width,
                        opacity: line.opacity
                      }}
                      animate={{ x: ['100vw', '-100vw'] }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: line.duration,
                        ease: 'linear' 
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Start Lights */}
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black p-4 rounded-xl border-2 border-zinc-800 flex gap-4 z-20">
                {[1, 2, 3, 4, 5].map((light) => (
                  <div key={light} className="w-8 h-8 rounded-full bg-zinc-800 relative overflow-hidden">
                    <motion.div 
                      className="absolute inset-0 bg-red-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: lights >= light ? 1 : 0 }}
                      transition={{ duration: 0.1 }}
                      style={{ boxShadow: lights >= light ? '0 0 20px #ef4444' : 'none' }}
                    />
                  </div>
                ))}
              </div>

              {/* Cars */}
              <div className="relative w-full h-32 flex flex-col justify-center gap-8 px-12 z-10">
                {/* Driver 1 */}
                <motion.div
                  className="flex items-center gap-4"
                  initial={{ x: 0 }}
                  animate={isRacing ? { x: '120vw' } : { x: 0 }}
                  transition={isRacing ? { duration: 1.5, ease: "easeIn", delay: 0.1 } : {}}
                >
                  <div className="bg-orange-500 text-black font-display font-black px-4 py-2 rounded-r-full flex items-center gap-2">
                    <Car className="w-6 h-6" />
                    <span className="uppercase tracking-wider">{driver1Name}</span>
                  </div>
                  {isRacing && (
                    <motion.div 
                      className="h-2 bg-orange-500/50 rounded-full blur-sm"
                      initial={{ width: 0 }}
                      animate={{ width: 200 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </motion.div>

                {/* Driver 2 */}
                <motion.div
                  className="flex items-center gap-4"
                  initial={{ x: 0 }}
                  animate={isRacing ? { x: '120vw' } : { x: 0 }}
                  transition={isRacing ? { duration: 1.4, ease: "easeIn", delay: 0.2 } : {}}
                >
                  <div className="bg-blue-500 text-white font-display font-black px-4 py-2 rounded-r-full flex items-center gap-2">
                    <Car className="w-6 h-6" />
                    <span className="uppercase tracking-wider">{driver2Name}</span>
                  </div>
                  {isRacing && (
                    <motion.div 
                      className="h-2 bg-blue-500/50 rounded-full blur-sm"
                      initial={{ width: 0 }}
                      animate={{ width: 200 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showFinish && (
          <motion.div
            key="finish-scene"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
          >
            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-4xl font-display font-black uppercase italic text-white mb-4">
              Race Completed!
            </h2>
            <p className="font-mono text-lg text-zinc-400 uppercase tracking-widest mb-8">
              Telemetry Synced Successfully
            </p>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full">
              {isEvaluating ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-zinc-400 font-mono text-sm uppercase">Analyzing Telemetry...</p>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                      <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Synergy Multiplier</div>
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className={`text-4xl font-display font-black ${synergyMultiplier && synergyMultiplier >= 1 ? 'text-emerald-500' : 'text-red-500'}`}
                      >
                        {synergyMultiplier?.toFixed(2)}x
                      </motion.div>
                    </div>
                    
                    {/* Telemetry Bar */}
                    <div className="relative h-6 bg-zinc-950 rounded border border-zinc-800 overflow-hidden">
                      {/* Tick marks */}
                      <div className="absolute inset-0 flex justify-between px-1">
                        {[...Array(16)].map((_, i) => (
                          <div key={i} className="w-px h-full bg-zinc-800/50" />
                        ))}
                      </div>
                      
                      {/* 1.0x Target Line (assuming max is 1.5x, so 1.0 is at 66.66%) */}
                      <div className="absolute top-0 bottom-0 left-[66.66%] w-0.5 bg-white/30 z-10" />
                      
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((synergyMultiplier || 0) / 1.5 * 100, 100)}%` }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                        className={`h-full relative z-0 ${synergyMultiplier && synergyMultiplier >= 1 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      >
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                      </motion.div>
                    </div>
                    <div className="flex justify-between mt-1 font-mono text-[10px] text-zinc-500 uppercase">
                      <span>Poor</span>
                      <span className="ml-8 text-zinc-400">Baseline (1.0x)</span>
                      <span>Perfect</span>
                    </div>
                  </div>
                  <div className="bg-black/50 p-4 rounded-lg border border-zinc-800 mb-6 text-left">
                    <div className="font-mono text-[10px] text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Zap className="w-3 h-3" /> AI Race Engineer Feedback
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed italic">
                      &ldquo;{feedback}&rdquo;
                    </p>
                  </div>
                </>
              )}
              <div className="mt-2 inline-block bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-sm px-4 py-2 rounded">
                View full results on Datadog
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
