'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/userStore';
import { CheckCircle2, Timer, Trophy, XCircle } from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { DriverNameGate } from '@/components/DriverNameGate';

const ALL_QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "Which driver is known as the 'Honey Badger'?",
    options: ["Daniel Ricciardo", "Max Verstappen", "Lando Norris", "Fernando Alonso"],
    answer: 0
  },
  {
    id: 2,
    question: "What does 'Box Box' mean in F1?",
    options: ["Pack up the garage", "Come into the pits", "A penalty box", "Change the steering wheel"],
    answer: 1
  },
  {
    id: 3,
    question: "Which team has the Prancing Horse logo?",
    options: ["Red Bull", "McLaren", "Ferrari", "Mercedes"],
    answer: 2
  },
  {
    id: 4,
    question: "What flag is shown to indicate a session is stopped?",
    options: ["Yellow Flag", "Red Flag", "Black Flag", "Chequered Flag"],
    answer: 1
  },
  {
    id: 5,
    question: "What does DRS stand for?",
    options: ["Drag Reduction System", "Direct Racing System", "Downforce Reduction System", "Driver Reaction System"],
    answer: 0
  },
  {
    id: 6,
    question: "Which F1 circuit is known as the 'Temple of Speed'?",
    options: ["Silverstone", "Spa-Francorchamps", "Monza", "Suzuka"],
    answer: 2
  },
  {
    id: 7,
    question: "Who holds the record for the most F1 World Championships?",
    options: ["Ayrton Senna", "Lewis Hamilton & Michael Schumacher", "Sebastian Vettel", "Alain Prost"],
    answer: 1
  },
  {
    id: 8,
    question: "What is the minimum weight of an F1 car (excluding fuel) in 2024?",
    options: ["700 kg", "750 kg", "798 kg", "850 kg"],
    answer: 2
  },
  {
    id: 9,
    question: "Which driver holds the record for the most race wins in F1 history?",
    options: ["Michael Schumacher", "Ayrton Senna", "Lewis Hamilton", "Max Verstappen"],
    answer: 2
  },
  {
    id: 10,
    question: "What color is the flag that indicates a slow-moving vehicle on track?",
    options: ["Blue", "White", "Yellow", "Green"],
    answer: 1
  },
  {
    id: 11,
    question: "Who is the only driver to win the Formula One World Championship posthumously?",
    options: ["Gilles Villeneuve", "Ayrton Senna", "Jochen Rindt", "Ronnie Peterson"],
    answer: 2
  },
  {
    id: 12,
    question: "Which team famously introduced the innovative 'F-duct' system in 2010?",
    options: ["Red Bull Racing", "McLaren", "Ferrari", "Brawn GP"],
    answer: 1
  },
  {
    id: 13,
    question: "The iconic corner sequence 'Maggotts, Becketts, and Chapel' is located at which circuit?",
    options: ["Spa-Francorchamps", "Suzuka", "Circuit of the Americas", "Silverstone"],
    answer: 3
  },
  {
    id: 14,
    question: "In what year did the FIA mandate the use of the Halo cockpit protection device?",
    options: ["2016", "2017", "2018", "2019"],
    answer: 2
  },
  {
    id: 15,
    question: "Which team holds the record for the fastest ever pit stop in F1 history (1.80 seconds at the 2023 Qatar GP)?",
    options: ["Red Bull Racing", "Mercedes", "Ferrari", "McLaren"],
    answer: 3
  },
  {
    id: 16,
    question: "Which F1 driver is famously nicknamed 'The Smooth Operator'?",
    options: ["Charles Leclerc", "Carlos Sainz", "Lando Norris", "George Russell"],
    answer: 1
  },
  {
    id: 17,
    question: "Which constructor has won the most Formula 1 World Constructors' Championships?",
    options: ["McLaren", "Williams", "Mercedes", "Ferrari"],
    answer: 3
  },
  {
    id: 18,
    question: "What does the 'MGU-K' stand for in a modern F1 power unit?",
    options: ["Motor Generator Unit - Kinetic", "Mechanical Generator Unit - Kinetic", "Motor Generation Unit - KERS", "Magnetic Generator Unit - Kinetic"],
    answer: 0
  },
  {
    id: 19,
    question: "Which circuit features the famous 'Eau Rouge' and 'Raidillon' corners?",
    options: ["Monza", "Spa-Francorchamps", "Suzuka", "Interlagos"],
    answer: 1
  },
  {
    id: 20,
    question: "Who was the youngest ever Formula 1 World Champion?",
    options: ["Max Verstappen", "Lewis Hamilton", "Sebastian Vettel", "Fernando Alonso"],
    answer: 2
  }
];

export default function QuizPage() {
  return (
    <>
      <DriverNameGate />
      <QuizContent />
    </>
  );
}

function QuizContent() {
  const { userId, username } = useUserStore();
  const [gameState, setGameState] = useState<'start' | 'playing' | 'results'>('start');
  const [activeQuestions, setActiveQuestions] = useState<typeof ALL_QUIZ_QUESTIONS>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  const handleAnswer = (index: number) => {
    setSelectedAnswer(index);
    if (index === activeQuestions[currentQuestion].answer) {
      setScore(prev => prev + 1);
    }
    
    setTimeout(() => {
      if (currentQuestion < activeQuestions.length - 1) {
        setCurrentQuestion(prev => prev + 1);
        setSelectedAnswer(null);
        setTimeLeft(10);
      } else {
        finishGame();
      }
    }, 1500);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'playing' && timeLeft > 0 && selectedAnswer === null) {
      timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (gameState === 'playing' && timeLeft === 0 && selectedAnswer === null) {
      handleAnswer(-1); // Time out
    }
    return () => clearTimeout(timer);
  }, [gameState, timeLeft, selectedAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = () => {
    const shuffled = [...ALL_QUIZ_QUESTIONS].sort(() => 0.5 - Math.random());
    setActiveQuestions(shuffled.slice(0, 10));
    setGameState('playing');
    setCurrentQuestion(0);
    setScore(0);
    setTimeLeft(10);
    setSelectedAnswer(null);
    setStartTime(Date.now());
  };

  const finishGame = async () => {
    setGameState('results');
    setIsSubmitting(true);
    
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    const finalScore = score + (selectedAnswer === activeQuestions[currentQuestion].answer ? 1 : 0);
    const baseScore = finalScore * 100;

    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username,
          quizId: 'f1_history_01',
          timeTakenSec: timeTaken,
          correctAnswers: finalScore,
          totalQuestions: activeQuestions.length,
          baseScore
        }),
      });
      
      const text = await response.text();
      try {
        JSON.parse(text);
      } catch (e) {
        console.error('Non-JSON response:', text.substring(0, 200));
        throw new Error('Received HTML instead of JSON');
      }
    } catch (error) {
      console.error('Failed to submit quiz score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-shell pb-32 md:pb-14">
      <PageIntro
        eyebrow="Timing Screen"
        title="Racing Line"
        accent="Quiz"
        summary="A fast-response F1 challenge designed like a live timing panel. Answer quickly, score cleanly, and send the result to the event dashboard."
        aside={
          <div className="surface-panel rounded-[1.4rem] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
              Driver
            </p>
            <p className="mt-2 brand-wordmark text-[1.7rem] leading-none text-white">{username}</p>
          </div>
        }
      />

      <div className="grid gap-6 pt-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="surface-panel rounded-[1.8rem] p-5">
          <p className="section-kicker">Race Format</p>
          <h2 className="section-title mt-3 text-[1.8rem]">Ten prompts. Ten seconds each.</h2>
          <p className="muted-copy mt-3 text-sm leading-7">
            Score is based on correct answers and posted to Datadog once the run completes.
          </p>
          <div className="mt-6 space-y-3">
            <div className="surface-rail rounded-2xl px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                Questions
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">10</p>
            </div>
            <div className="surface-rail rounded-2xl px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-faint)]">
                Per Lap
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">00:10</p>
            </div>
          </div>
        </aside>

        <section className="surface-panel-strong rounded-[2rem] p-5 md:p-6">
          <div className="surface-rail rounded-[1.5rem] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
                  Session Status
                </p>
                <p className="mt-1 text-sm text-white">
                  {gameState === 'start'
                    ? 'Grid forming'
                    : gameState === 'playing'
                      ? 'Hot lap in progress'
                      : 'Checkered flag'}
                </p>
              </div>
              {gameState === 'playing' ? (
                <div className={`flex items-center gap-2 rounded-full border px-3 py-2 ${
                  timeLeft <= 3 ? 'border-red-400/40 text-red-300' : 'border-[color:var(--status-cool)]/40 text-[var(--status-cool)]'
                }`}>
                  <Timer className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-[0.22em]">
                    00:{timeLeft.toString().padStart(2, '0')}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {gameState === 'start' && (
              <motion.div
                key="start"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex min-h-[28rem] flex-col items-center justify-center text-center"
              >
                <div className="surface-rail flex h-24 w-24 items-center justify-center rounded-full mb-6">
                  <Trophy className="h-12 w-12 text-[var(--status-cool)]" />
                </div>
                <h2 className="section-title text-[2.4rem]">Ready to race?</h2>
                <p className="muted-copy mt-4 mb-8 max-w-md text-sm leading-7">
                  Answer fast. Score points. Climb the live Datadog leaderboard.
                </p>
                <button
                  onClick={startGame}
                  className="rounded-full border border-[color:var(--status-cool)]/40 bg-[var(--status-cool)]/14 px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white"
                >
                  Lights Out!
                </button>
              </motion.div>
            )}

            {gameState === 'playing' && (
              <motion.div
                key="playing"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="pt-6"
              >
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="font-mono text-sm text-[var(--text-muted)]">
                    Q {currentQuestion + 1}/{activeQuestions.length}
                  </div>
                  <div className="text-sm font-medium text-white/72">
                    Score {score}
                  </div>
                </div>

                <div className="surface-rail mb-4 rounded-full p-1">
                  <motion.div
                    className="h-2 rounded-full bg-[var(--status-cool)]"
                    animate={{ width: `${((currentQuestion + 1) / activeQuestions.length) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>

                <div className="surface-panel rounded-[1.8rem] p-6 mb-6">
                  <h3 className="text-2xl font-medium leading-relaxed text-white">
                    {activeQuestions[currentQuestion].question}
                  </h3>
                </div>

                <div className="grid gap-3">
                  {activeQuestions[currentQuestion].options.map((option, idx) => {
                    let btnClass = "border-white/10 bg-white/4 hover:bg-white/7 text-zinc-200";
                    let Icon = null;

                    if (selectedAnswer !== null) {
                      if (idx === activeQuestions[currentQuestion].answer) {
                        btnClass = "border-emerald-500/40 bg-emerald-500/16 text-emerald-300";
                        Icon = CheckCircle2;
                      } else if (idx === selectedAnswer) {
                        btnClass = "border-red-500/40 bg-red-500/16 text-red-300";
                        Icon = XCircle;
                      } else {
                        btnClass = "border-white/10 bg-white/4 opacity-50";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => selectedAnswer === null && handleAnswer(idx)}
                        disabled={selectedAnswer !== null}
                        className={`relative flex items-center justify-between rounded-[1.4rem] border px-4 py-4 text-left transition-all ${btnClass}`}
                      >
                        <span className="font-medium">{option}</span>
                        {Icon ? <Icon className="h-5 w-5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {gameState === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex min-h-[28rem] flex-col items-center justify-center text-center"
              >
                <div className="surface-rail mb-6 flex h-24 w-24 items-center justify-center rounded-full">
                  <Trophy className="h-12 w-12 text-emerald-300" />
                </div>
                <h2 className="section-title text-[2.8rem]">Checkered flag.</h2>
                <p className="muted-copy mt-3 mb-8 text-sm leading-7">
                  You scored {score} out of {activeQuestions.length}
                </p>
              
                <div className="surface-panel rounded-[1.6rem] p-6 w-full max-w-sm mb-8">
                  <div className="font-mono text-sm uppercase tracking-[0.28em] text-[var(--text-faint)] mb-2">Telemetry Synced</div>
                  <div className="text-3xl font-semibold text-[var(--status-cool)]">{score * 100} PTS</div>
                  <p className="muted-copy text-sm mt-3">Look for the run on the live Datadog dashboard.</p>
                </div>

                <button
                  onClick={startGame}
                  disabled={isSubmitting}
                  className="rounded-full border border-white/10 bg-white/6 px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white disabled:opacity-50"
                >
                  Race Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

