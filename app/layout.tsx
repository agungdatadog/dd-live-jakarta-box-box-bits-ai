import type {Metadata} from 'next';
import { IBM_Plex_Mono, Space_Grotesk, Sora } from 'next/font/google';
import './globals.css'; // Global styles
import DatadogInit from '@/components/DatadogInit';
import FeatureFlagProvider from '@/components/FeatureFlagProvider';
import { Navigation } from '@/components/Navigation';

const sora = Sora({ subsets: ['latin'], variable: '--font-sans' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Box Box Bits AI',
  description: 'Datadog Live Bangkok 2026 - F1 Racing Simulation with Bits AI',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" data-theme="midnight" className={`${sora.variable} ${spaceGrotesk.variable} ${plexMono.variable} dark`} suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-50 font-sans antialiased" suppressHydrationWarning>
        <DatadogInit />
        <FeatureFlagProvider>
          <div className="shell-grid min-h-screen">
            <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-black/55 via-black/18 to-transparent" />
            <main className="relative z-10 min-h-screen pb-28 md:pb-8">
              {children}
            </main>
          </div>
          <Navigation />
        </FeatureFlagProvider>
      </body>
    </html>
  );
}
