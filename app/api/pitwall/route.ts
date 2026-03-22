import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';
import { getServerGeminiClient } from '@/lib/gemini-server';
import { logger } from '@/lib/logger';
import { withLlmObsSpan } from '@/lib/llmobs';

const SYSTEM_INSTRUCTION =
  "You are Bits AI, the Datadog mascot acting as an F1 race engineer on the pitwall. " +
  "You have access to Google Search to find real-time F1 data, race stats, driver information, " +
  "and historical data. Always use search to provide accurate, up-to-date F1 statistics when asked. " +
  "Keep answers concise, engaging, and include occasional dog/racing puns (e.g., 'woof', 'bark', 'box box', 'apex').";

const MODEL = 'gemini-3-flash-preview';

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.pitwall.chat') || {
    setTag: () => undefined,
    finish: () => undefined,
  };

  try {
    const { message, userId, username, sessionId } = await req.json();

    span.setTag('usr.id', userId);
    span.setTag('app.username', username);
    span.setTag('app.message_length', message?.length || 0);

    const ai = getServerGeminiClient();

    const response = await withLlmObsSpan(
      'pitwall_chat',
      {
        inputMessages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: message },
        ],
        modelName:     MODEL,
        modelProvider: 'google',
        sessionId:     sessionId ?? '',
        metadata: { userId: userId ?? '', username: username ?? '' },
        // ── Prompt tracking (dd-trace v5.83.0+) ───────────────────────────
        // Template is static; variables hold the runtime user message.
        // Version is omitted → auto-versioned by hash of template content.
        // queryVariables enables hallucination detection on the user query.
        prompt: {
          id: 'pitwall-chat',
          template: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user',   content: '{{message}}' },
          ],
          variables: { message: message ?? '' },
          tags: { game: 'datadog-live-bangkok-2026', app: 'box-box-bits-ai' },
          queryVariables: ['message'],
        },
      },
      async () => {
        const chat = ai.chats.create({
          model: MODEL,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ googleSearch: {} }],
            // Disable thinking tokens for faster pitwall chat responses.
            // thinkingBudget: 0 eliminates the thinking phase entirely.
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        return chat.sendMessage({ message });
      },
      (res) => ({
        outputContent: res.text ?? '',
        // Prefer actual token counts from Gemini usageMetadata for accurate cost annotation.
        inputTokens:  res.usageMetadata?.promptTokenCount     ?? Math.round((SYSTEM_INSTRUCTION.length + (message?.length || 0)) / 4),
        outputTokens: res.usageMetadata?.candidatesTokenCount ?? Math.round((res.text?.length || 0) / 4),
      }),
    );

    const reply = response.text || "Bark! I couldn't process that.";

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: { uri: string; title: string }[] = [];
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title && !sources.find(s => s.uri === chunk.web.uri)) {
          sources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      });
    }

    logger.info({
      event_type: 'pitwall_chat',
      timestamp: new Date().toISOString(),
      user: { usr_id: userId, username },
      llm: { model: MODEL, prompt_length: message?.length, reply_length: reply.length },
      request: { path: '/api/pitwall', sources_count: sources.length },
    });

    span.finish();
    return NextResponse.json({ success: true, reply, sources });
  } catch (error) {
    try {
      span?.setTag('error', true);
      span?.setTag('error.message', error instanceof Error ? error.message : String(error));
      span?.finish();
    } catch (_) { /* span cleanup best-effort */ }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
