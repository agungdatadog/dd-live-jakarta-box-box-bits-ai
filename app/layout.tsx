import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css'; // Global styles
import DatadogInit from '@/components/DatadogInit';
import { Navigation } from '@/components/Navigation';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Box Box Bits AI',
  description: 'Datadog Live Bangkok 2026 - F1 Racing Simulation with Bits AI',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} dark`} suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-50 font-sans antialiased pb-20" suppressHydrationWarning>
        <DatadogInit />
        <main className="max-w-md mx-auto min-h-screen relative overflow-hidden">
          {children}
        </main>
        <Navigation />
      </body>
    </html>
  );
}
