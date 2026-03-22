import Link from 'next/link';
import { Car, MessageSquare, Trophy, Home } from 'lucide-react';

export function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 pb-safe">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-4">
        <Link href="/" className="flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-purple-400 transition-colors">
          <Home className="w-5 h-5 mb-1" />
          <span className="text-[10px] uppercase font-bold tracking-wider">Paddock</span>
        </Link>
        <Link href="/pitwall" className="flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-purple-400 transition-colors">
          <MessageSquare className="w-5 h-5 mb-1" />
          <span className="text-[10px] uppercase font-bold tracking-wider">Pitwall</span>
        </Link>
        <Link href="/quiz" className="flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-purple-400 transition-colors">
          <Trophy className="w-5 h-5 mb-1" />
          <span className="text-[10px] uppercase font-bold tracking-wider">Quiz</span>
        </Link>
        <Link href="/dream-team" className="flex flex-col items-center justify-center w-full h-full text-zinc-400 hover:text-purple-400 transition-colors">
          <Car className="w-5 h-5 mb-1" />
          <span className="text-[10px] uppercase font-bold tracking-wider">Team</span>
        </Link>
      </div>
    </nav>
  );
}
