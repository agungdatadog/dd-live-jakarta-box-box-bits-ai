'use client';

import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import { motion, useScroll } from 'motion/react';
import { Flag, Zap, Trophy, Settings, MessageSquare, Loader2, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import F1Car3D from '@/components/F1Car3D';

export default function Home() {
  const { username, setUsername } = useUserStore();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(username);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });

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
    <div className="h-screen w-full flex flex-col bg-black text-white selection:bg-datadog-purple selection:text-white relative overflow-hidden">
      <F1Car3D scrollProgress={scrollYProgress} />
      
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="pt-8 pb-4 px-6 shrink-0 border-b border-zinc-800 flex justify-between items-end relative z-10 bg-black/50 backdrop-blur-md"
      >
        <div>
          <h1 className="font-display text-4xl font-black uppercase tracking-tighter leading-none">
            Box Box <span className="text-datadog-purple-light">Bits AI</span>
          </h1>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em] mt-2">
            Datadog Live Bangkok 2026
          </p>
        </div>
        <div className="text-right">
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.9 }}
            className="w-10 h-10 bg-datadog-purple/20 border-2 border-datadog-purple flex items-center justify-center cursor-pointer"
          >
            <Flag className="w-5 h-5 text-datadog-purple-light" />
          </motion.div>
        </div>
      </motion.header>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar relative z-10">
        
        {/* Spacer to see the 3D car clearly at the top */}
        <div className="min-h-[85vh] flex flex-col items-center justify-end pb-12 text-center pointer-events-none mb-12">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 10 }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              repeatType: "reverse",
              ease: "easeInOut"
            }}
            className="flex flex-col items-center gap-3"
          >
            <p className="font-mono text-xs text-datadog-purple-light/80 uppercase tracking-[0.4em] drop-shadow-md font-bold">Scroll to Dissect</p>
            <div className="w-6 h-10 border-2 border-datadog-purple-light/50 rounded-full flex justify-center p-1">
              <motion.div 
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-1.5 h-1.5 bg-datadog-purple-light rounded-full"
              />
            </div>
          </motion.div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl border-t border-zinc-800/50 pt-12 pb-32 -mx-6 px-6">
          {/* Driver Profile */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-datadog-purple" />
              <h3 className="font-display text-lg font-bold uppercase tracking-tight">Driver Profile</h3>
            </div>
            
            <div className="bg-zinc-900/80 backdrop-blur-md border-2 border-zinc-800 p-5 relative group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-datadog-purple/10 border-2 border-datadog-purple flex items-center justify-center">
                    <span className="font-display font-black text-xl text-datadog-purple-light">{username.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Current Driver</p>
                    {isEditingName ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="bg-black border border-zinc-700 px-3 py-1 text-white font-bold uppercase focus:outline-none focus:border-datadog-purple w-40"
                          placeholder="Enter name..."
                          maxLength={20}
                        />
                        <button
                          onClick={handleSaveName}
                          className="bg-datadog-purple text-white px-3 py-1 font-bold uppercase text-xs hover:bg-datadog-purple-light transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <p className="font-display text-xl font-black uppercase leading-none">{username}</p>
                    )}
                  </div>
                </div>
                {!isEditingName && (
                  <button onClick={() => setIsEditingName(true)} className="text-zinc-500 hover:text-white transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Brutalist accent */}
              <div className="absolute bottom-0 right-0 w-4 h-4 border-t-2 border-l-2 border-zinc-800" />
            </div>
          </motion.div>

          {/* Navigation Grid */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.15,
                }
              }
            }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-datadog-purple" />
              <h3 className="font-display text-lg font-bold uppercase tracking-tight">Race Control</h3>
            </div>
            
            <div className="grid gap-4">
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                <Link href="/pitwall" className="block group">
                  <div className="bg-zinc-900/80 backdrop-blur-md border-2 border-zinc-800 p-5 relative overflow-hidden transition-all duration-300 group-hover:bg-datadog-purple/10 group-hover:border-datadog-purple">
                    <div className="flex items-center gap-4">
                      <div className="bg-datadog-purple text-white p-3 shrink-0">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-black uppercase mb-1">The Pitwall</h3>
                        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">Ask Bits AI historical F1 questions. Powered by RAG & LLMObs.</p>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center transition-transform translate-x-full -translate-y-full group-hover:translate-x-0 group-hover:translate-y-0">
                      <div className="bg-datadog-purple text-white p-1">
                        <Zap className="w-4 h-4 fill-current" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                <Link href="/quiz" className="block group">
                  <div className="bg-zinc-900/80 backdrop-blur-md border-2 border-zinc-800 p-5 relative overflow-hidden transition-all duration-300 group-hover:bg-blue-500/10 group-hover:border-blue-500">
                    <div className="flex items-center gap-4">
                      <div className="bg-blue-500 text-white p-3 shrink-0">
                        <Zap className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-black uppercase mb-1">Racing Line Quiz</h3>
                        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">Rapid-fire trivia. Score points for the live dashboard!</p>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center transition-transform translate-x-full -translate-y-full group-hover:translate-x-0 group-hover:translate-y-0">
                      <div className="bg-blue-500 text-white p-1">
                        <Zap className="w-4 h-4 fill-current" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                <Link href="/dream-team" className="block group">
                  <div className="bg-zinc-900/80 backdrop-blur-md border-2 border-zinc-800 p-5 relative overflow-hidden transition-all duration-300 group-hover:bg-orange-500/10 group-hover:border-orange-500">
                    <div className="flex items-center gap-4">
                      <div className="bg-orange-500 text-black p-3 shrink-0">
                        <Trophy className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-black uppercase mb-1">Dream Team</h3>
                        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">Draft your doggo crew. AI evaluates your hidden synergy.</p>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center transition-transform translate-x-full -translate-y-full group-hover:translate-x-0 group-hover:translate-y-0">
                      <div className="bg-orange-500 text-black p-1">
                        <Zap className="w-4 h-4 fill-current" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
