'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/userStore';
import { Timer, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import Image from 'next/image';

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
    <div className="flex flex-col h-screen relative bg-black text-white">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 opacity-20">
        <Image 
          src="/quiz-bg.png" 
          alt="Quiz Background" 
          fill 
          unoptimized
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
      </div>

      <div className="relative z-10 flex flex-col h-full pt-6 pb-20 px-4">
        <header className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tighter">
            Racing Line <span className="text-blue-400">Quiz</span>
          </h1>
        </header>

        <AnimatePresence mode="wait">
          {gameState === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
                <Trophy className="w-12 h-12 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Ready to Race?</h2>
              <p className="text-zinc-400 mb-8 max-w-xs">
                Answer fast. Score points. Climb the live Datadog leaderboard.
              </p>
              <button
                onClick={startGame}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-wider px-8 py-4 rounded-full w-full max-w-xs transition-colors"
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
              className="flex-1 flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="font-mono text-sm text-zinc-400">
                  Q {currentQuestion + 1}/{activeQuestions.length}
                </div>
                <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft <= 3 ? 'text-red-500' : 'text-blue-400'}`}>
                  <Timer className="w-4 h-4" />
                  00:{timeLeft.toString().padStart(2, '0')}
                </div>
              </div>

              <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 mb-8">
                <h3 className="text-xl font-medium leading-relaxed">
                  {activeQuestions[currentQuestion].question}
                </h3>
              </div>

              <div className="grid gap-3">
                {activeQuestions[currentQuestion].options.map((option, idx) => {
                  let btnClass = "bg-zinc-900/80 backdrop-blur-sm border-zinc-800 hover:bg-zinc-800 text-zinc-300";
                  let Icon = null;

                  if (selectedAnswer !== null) {
                    if (idx === activeQuestions[currentQuestion].answer) {
                      btnClass = "bg-emerald-500/20 border-emerald-500 text-emerald-400";
                      Icon = CheckCircle2;
                    } else if (idx === selectedAnswer) {
                      btnClass = "bg-red-500/20 border-red-500 text-red-400";
                      Icon = XCircle;
                    } else {
                      btnClass = "bg-zinc-900/80 border-zinc-800 opacity-50";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => selectedAnswer === null && handleAnswer(idx)}
                      disabled={selectedAnswer !== null}
                      className={`relative border rounded-xl p-4 text-left transition-all flex items-center justify-between ${btnClass}`}
                    >
                      <span className="font-medium">{option}</span>
                      {Icon && <Icon className="w-5 h-5" />}
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
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                <Trophy className="w-12 h-12 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-display font-bold uppercase mb-2">Checkered Flag!</h2>
              <p className="text-zinc-400 mb-8">
                You scored {score} out of {activeQuestions.length}
              </p>
              
              <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 w-full max-w-xs mb-8">
                <div className="font-mono text-sm text-zinc-500 uppercase mb-2">Telemetry Synced</div>
                <div className="text-2xl font-bold text-blue-400">{score * 100} PTS</div>
                <p className="text-xs text-zinc-500 mt-2">Look at the Live Datadog Dashboard!</p>
              </div>

              <button
                onClick={startGame}
                disabled={isSubmitting}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-wider px-8 py-4 rounded-full w-full max-w-xs transition-colors disabled:opacity-50"
              >
                Race Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
