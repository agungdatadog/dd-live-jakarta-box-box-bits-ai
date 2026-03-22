import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.pitwall.chat') || {
    setTag: () => {},
    finish: () => {},
  };

  try {
    const { message, reply, userId, username } = await req.json();
    
    span.setTag('usr.id', userId);
    span.setTag('app.username', username);
    span.setTag('app.message_length', message?.length || 0);

    // Mock LLMObs logging
    console.log(JSON.stringify({
      event_type: "pitwall_chat",
      timestamp: new Date().toISOString(),
      user: { usr_id: userId },
      datadog_llm_obs: {
        model_name: "gemini-3-flash-preview",
        prompt: message,
        response: reply,
      }
    }));

    span.finish();
    return NextResponse.json({ success: true });
  } catch (error) {
    try {
      span?.setTag('error', true);
      span?.setTag('error.message', error instanceof Error ? error.message : String(error));
      span?.finish();
    } catch (e) {}
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
