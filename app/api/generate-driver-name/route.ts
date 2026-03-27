import { NextResponse } from 'next/server';
import { getServerGeminiClient } from '@/lib/gemini-server';
import { withLlmObsSpan } from '@/lib/llmobs';

// gemini-3.1-flash-lite-preview: $0.25/1M input, $1.50/1M output — ideal for light tasks
const MODEL = 'gemini-3.1-flash-lite-preview';

const SYSTEM_INSTRUCTION =
  'You are a creative motorsport callsign generator for the Datadog Live Bangkok 2026 F1 fan event. ' +
  'Generate fun, punchy F1 driver identities. Always respond with valid JSON only.';

export async function POST(req: Request) {
  try {
    const { realName, sessionId } = await req.json();

    const userPrompt = `The person's real name (or hint) is: "${realName || 'unknown driver'}"

Generate a fun F1 driver identity:

1. driver_name: 1-3 words maximum. Make it memorable. You can:
   - Do a clever wordplay or pun on their real name
   - Reference F1 culture, racing, speed, or dogs (this is a dog-themed F1 app called "Box Box Bits AI")
   - Reference Datadog, observability, or tech culture in a cool way
   Keep it under 20 characters. Make it feel like a real F1 driver name.

2. nickname: A 2-4 word dramatic racing nickname shown on the timing tower.
   Examples: "The Apex Hunter", "Zero Latency King", "The Data Dog", "Maximum Uptime", "Packet Drop Predator"
   Match the energy of their name.

Return ONLY valid JSON: {"driver_name": "...", "nickname": "..."}`;

    const ai = getServerGeminiClient();

    const response = await withLlmObsSpan(
      'generate_driver_name',
      {
        inputMessages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user',   content: userPrompt },
        ],
        modelName:     MODEL,
        modelProvider: 'google',
        sessionId:     sessionId ?? '',
        tags:     { feature: 'driver-name-generator' },
        metadata: { real_name_hint: realName ?? '' },
        prompt: {
          id: 'driver-name-generator',
          template: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user',   content: 'The person\'s real name (or hint) is: "{{real_name}}".\nGenerate a fun F1 driver identity as JSON: {"driver_name": "...", "nickname": "..."}' },
          ],
          variables: { real_name: realName ?? '' },
          tags: { game: 'datadog-live-bangkok-2026' },
          queryVariables: ['real_name'],
        },
      },
      () =>
        ai.models.generateContent({
          model: MODEL,
          contents: [{ role: 'user', parts: [{ text: `${SYSTEM_INSTRUCTION}\n\n${userPrompt}` }] }],
          config: { responseMimeType: 'application/json' },
        }),
      (res) => ({
        outputContent: res.text ?? '',
        inputTokens:  res.usageMetadata?.promptTokenCount,
        outputTokens: res.usageMetadata?.candidatesTokenCount,
      }),
    );

    const parsed = JSON.parse(response.text ?? '{}');
    return NextResponse.json({
      driverName: String(parsed.driver_name ?? 'Apex Doggo').slice(0, 24),
      nickname:   String(parsed.nickname   ?? 'The Unstoppable').slice(0, 32),
    });
  } catch {
    return NextResponse.json({ error: 'Name generation failed' }, { status: 500 });
  }
}
