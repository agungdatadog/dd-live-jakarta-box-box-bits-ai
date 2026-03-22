'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/userStore';
import { useDreamTeamStore, Character } from '@/store/dreamTeamStore';
import charactersData from '@/data/characters.json';
import { Car, Zap } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import RaceStartSequence from '@/components/RaceStartSequence';

export default function DreamTeamPage() {
  const { userId } = useUserStore();
  const { 
    selectedPrincipal, 
    selectedDriver, 
    selectedDriver2,
    selectedEngineer, 
    selectedEngineer2,
    selectedStrategy,
    selectedTechDirector,
    setPrincipal, 
    setDriver, 
    setDriver2,
    setEngineer, 
    setEngineer2,
    setStrategy,
    setTechDirector
  } = useDreamTeamStore();
  
  const [phase, setPhase] = useState<'selection' | 'racing'>('selection');
  
  const [baseScore, setBaseScore] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [synergyMultiplier, setSynergyMultiplier] = useState<number | null>(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState<string>('');

  const principals = charactersData.filter(c => c.role === 'Team Principal');
  const drivers = charactersData.filter(c => c.role === 'Driver');
  const engineers = charactersData.filter(c => c.role === 'Race Engineer');
  const strategists = charactersData.filter(c => c.role === 'Head of Strategy');
  const techDirectors = charactersData.filter(c => c.role === 'Technical Director');

  useEffect(() => {
    if (selectedPrincipal && selectedDriver && selectedDriver2 && selectedEngineer && selectedEngineer2 && selectedStrategy && selectedTechDirector) {
      const pStats = Object.values(selectedPrincipal.visible_stats).reduce((a, b) => a + b, 0);
      const dStats = Object.values(selectedDriver.visible_stats).reduce((a, b) => a + b, 0);
      const d2Stats = Object.values(selectedDriver2.visible_stats).reduce((a, b) => a + b, 0);
      const eStats = Object.values(selectedEngineer.visible_stats).reduce((a, b) => a + b, 0);
      const e2Stats = Object.values(selectedEngineer2.visible_stats).reduce((a, b) => a + b, 0);
      const sStats = Object.values(selectedStrategy.visible_stats).reduce((a, b) => a + b, 0);
      const tStats = Object.values(selectedTechDirector.visible_stats).reduce((a, b) => a + b, 0);
      setBaseScore(pStats + dStats + d2Stats + eStats + e2Stats + sStats + tStats);
    } else {
      setBaseScore(0);
    }
  }, [selectedPrincipal, selectedDriver, selectedDriver2, selectedEngineer, selectedEngineer2, selectedStrategy, selectedTechDirector]);

  const startRace = async () => {
    if (!selectedPrincipal || !selectedDriver || !selectedDriver2 || !selectedEngineer || !selectedEngineer2 || !selectedStrategy || !selectedTechDirector) return;
    
    setPhase('racing');
    setIsEvaluating(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API Key');
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        You are a dramatic F1 pundit evaluating the synergy of this fantasy F1 team based on their hidden personas and dog breed incompatibilities.
        Team Principal: ${selectedPrincipal.name} - ${selectedPrincipal.hidden_persona}
        First Driver: ${selectedDriver.name} - ${selectedDriver.hidden_persona}
        Second Driver: ${selectedDriver2.name} - ${selectedDriver2.hidden_persona}
        Race Engineer 1 (for ${selectedDriver.name}): ${selectedEngineer.name} - ${selectedEngineer.hidden_persona}
        Race Engineer 2 (for ${selectedDriver2.name}): ${selectedEngineer2.name} - ${selectedEngineer2.hidden_persona}
        Head of Strategy: ${selectedStrategy.name} - ${selectedStrategy.hidden_persona}
        Technical Director: ${selectedTechDirector.name} - ${selectedTechDirector.hidden_persona}
        
        CRITICAL INSTRUCTION: F1 is full of drama! You MUST actively look for conflicts, drawbacks, and breed incompatibilities. Even if they seem like a good team, find the friction points. If there are explicit CONFLICTS mentioned (e.g., "-30 synergy"), apply a severe penalty. If there are no explicit conflicts, invent realistic paddock drama based on their clashing personalities (e.g., a micromanaging principal annoying an independent driver).
        
        Return ONLY a JSON object with two keys:
        - "multiplier": A number between 0.4 and 1.3. Bias heavily towards lower numbers (0.4 to 0.9) to reflect the chaos and conflict. Only give above 1.0 if they are an absolute miracle match.
        - "feedback": A dramatic 2-3 sentence explanation focusing on the team's internal conflicts, radio arguments, or paddock drama. Make it sound like a juicy F1 news headline.
      `;

      let currentSynergyMultiplier = 1.0;
      let currentFeedback = "Default synergy applied.";
      let latency = 0;
      let promptTokens = prompt.length / 4;
      let completionTokens = 0;

      const startTime = Date.now();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });
        
        latency = Date.now() - startTime;
        
        const result = JSON.parse(response.text || '{}');
        currentSynergyMultiplier = result.multiplier || 1.0;
        currentFeedback = result.feedback || "AI evaluation complete.";
        completionTokens = (response.text?.length || 0) / 4;
      } catch (llmError) {
        console.error("LLM Evaluation failed, falling back to default", llmError);
        currentFeedback = "Radio comms failed. Default synergy applied.";
      }

      setSynergyMultiplier(currentSynergyMultiplier);
      setEvaluationFeedback(currentFeedback);

      // Trigger API call to log evaluation
      await fetch('/api/evaluate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          selection: {
            team_principal: selectedPrincipal.id,
            driver_1: selectedDriver.id,
            driver_2: selectedDriver2.id,
            race_engineer_1: selectedEngineer.id,
            race_engineer_2: selectedEngineer2.id,
            head_of_strategy: selectedStrategy.id,
            technical_director: selectedTechDirector.id
          },
          baseTeamStats: baseScore,
          evaluation: {
            synergyMultiplier: currentSynergyMultiplier,
            feedback: currentFeedback,
            latency,
            promptTokens,
            completionTokens
          }
        }),
      });
    } catch (error) {
      console.error('Evaluation failed:', error);
    } finally {
      setIsEvaluating(false);
    }
  };

  const SelectionCard = ({ 
    title, 
    options, 
    selected, 
    onSelect 
  }: { 
    title: string, 
    options: Character[], 
    selected: Character | null, 
    onSelect: (c: Character) => void 
  }) => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-orange-500" />
        <h3 className="font-display text-lg font-bold uppercase tracking-tight">{title}</h3>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x no-scrollbar">
        {(selected ? [selected, ...options.filter(o => o.id !== selected.id)] : options).map(c => (
          <motion.button
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            key={c.id}
            onClick={(e) => {
              onSelect(c);
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.scrollTo({ left: 0, behavior: 'smooth' });
              }
            }}
            className={`snap-center shrink-0 w-64 group relative overflow-hidden transition-all duration-300 text-left ${
              selected?.id === c.id 
                ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black' 
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <div className={`p-5 h-full flex flex-col border-2 transition-colors ${
              selected?.id === c.id ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="font-display text-xl font-black uppercase leading-none mb-1">{c.name.split(' ')[0]}</div>
                  <div className="font-display text-lg font-light uppercase leading-none opacity-60">{c.name.split(' ').slice(1).join(' ')}</div>
                </div>
                <div className="font-mono text-[10px] bg-zinc-800 px-2 py-1 rounded uppercase tracking-widest">
                  {c.breed.split(' ')[0]}
                </div>
              </div>

              <div className="mt-auto space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(c.visible_stats).map(([key, val]) => (
                    <div key={key} className="text-center">
                      <div className="text-[8px] text-zinc-500 uppercase font-mono tracking-tighter mb-1">
                        {key.split('_')[0]}
                      </div>
                      <div className="font-mono text-sm font-bold text-orange-400">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(Object.values(c.visible_stats).reduce((a, b) => a + b, 0) / 300) * 100}%` }}
                    className="h-full bg-orange-500"
                  />
                </div>
              </div>
            </div>
            
            {/* Brutalist accent */}
            <div className={`absolute top-0 right-0 w-8 h-8 flex items-center justify-center transition-transform ${
              selected?.id === c.id ? 'translate-x-0 translate-y-0' : 'translate-x-full -translate-y-full'
            }`}>
              <div className="bg-orange-500 text-black p-1">
                <Zap className="w-4 h-4 fill-current" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-black text-white selection:bg-orange-500 selection:text-black">
      <header className="pt-8 pb-4 px-6 shrink-0 border-b border-zinc-800 flex justify-between items-end">
        <div>
          <h1 className="font-display text-4xl font-black uppercase tracking-tighter leading-none">
            Dream <span className="text-orange-500">Team</span>
          </h1>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em] mt-2">
            Selection Phase // 2026 Grid
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] text-zinc-500 uppercase mb-1">Total Rating</div>
          <div className="text-3xl font-display font-black text-orange-500 leading-none">{baseScore}</div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {phase === 'selection' && (
          <motion.div
            key="selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar"
          >
            <SelectionCard title="The Captain // Team Principal" options={principals} selected={selectedPrincipal} onSelect={setPrincipal} />
            <SelectionCard title="The Ace // First Driver" options={drivers.filter(d => d.id !== selectedDriver2?.id)} selected={selectedDriver} onSelect={setDriver} />
            <SelectionCard title="The Wingman // Second Driver" options={drivers.filter(d => d.id !== selectedDriver?.id)} selected={selectedDriver2} onSelect={setDriver2} />
            <SelectionCard title="The Brains // Race Engineer 1" options={engineers.filter(e => e.id !== selectedEngineer2?.id)} selected={selectedEngineer} onSelect={setEngineer} />
            <SelectionCard title="The Voice // Race Engineer 2" options={engineers.filter(e => e.id !== selectedEngineer?.id)} selected={selectedEngineer2} onSelect={setEngineer2} />
            <SelectionCard title="The Mastermind // Head of Strategy" options={strategists} selected={selectedStrategy} onSelect={setStrategy} />
            <SelectionCard title="The Innovator // Technical Director" options={techDirectors} selected={selectedTechDirector} onSelect={setTechDirector} />

            <div className="mt-8 pb-24">
              <button
                onClick={startRace}
                disabled={!selectedPrincipal || !selectedDriver || !selectedDriver2 || !selectedEngineer || !selectedEngineer2 || !selectedStrategy || !selectedTechDirector}
                className="w-full group relative overflow-hidden bg-orange-500 disabled:bg-zinc-800 text-black font-display text-xl font-black uppercase py-6 transition-all duration-300"
              >
                <div className="relative z-10 flex items-center justify-center gap-3">
                  <span>Confirm Lineup</span>
                  <Car className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </div>
                <motion.div 
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.5 }}
                />
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'racing' && (
          <motion.div
            key="racing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative overflow-hidden bg-zinc-950"
          >
            <RaceStartSequence 
              driver1Name={selectedDriver?.name || 'Driver 1'} 
              driver2Name={selectedDriver2?.name || 'Driver 2'} 
              synergyMultiplier={synergyMultiplier}
              feedback={evaluationFeedback}
              isEvaluating={isEvaluating}
              onAnimationComplete={() => {
                // Animation handles its own finish state now
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
