import { NextResponse } from 'next/server';
import { getServerGeminiClient } from '@/lib/gemini-server';

const MODEL = 'gemini-2.0-flash-lite';

export async function POST(req: Request) {
  try {
    const { realName } = await req.json();

    const ai = getServerGeminiClient();

    const prompt = `You are a creative motorsport callsign generator for the Datadog Live Bangkok 2026 F1 fan event.

The person's real name (or hint) is: "${realName || 'unknown driver'}"

Generate a fun, punchy F1 driver identity:

1. driver_name: 1-3 words maximum. Make it memorable. You can:
   - Do a clever wordplay or pun on their real name
   - Reference F1 culture, racing, speed, or dogs (this is a dog-themed F1 app called "Box Box Bits AI")
   - Reference Datadog, observability, or tech culture in a cool way
   Keep it under 20 characters. Make it feel like a real F1 driver name.

2. nickname: A 2-4 word dramatic racing nickname shown on the timing tower.
   Examples: "The Apex Hunter", "Zero Latency King", "The Data Dog", "Maximum Uptime", "Packet Drop Predator", "The Tail Chaser"
   Match the energy of their name.

Return ONLY valid JSON with exactly these two keys:
{"driver_name": "...", "nickname": "..."}`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text ?? '{}');
    return NextResponse.json({
      driverName: String(parsed.driver_name ?? 'Apex Doggo').slice(0, 24),
      nickname: String(parsed.nickname ?? 'The Unstoppable').slice(0, 32),
    });
  } catch {
    return NextResponse.json(
      { error: 'Name generation failed' },
      { status: 500 }
    );
  }
}
