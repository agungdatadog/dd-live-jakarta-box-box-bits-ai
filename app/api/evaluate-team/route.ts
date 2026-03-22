import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';
import charactersData from '@/data/characters.json';

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.dream_team.evaluate') || {
    setTag: () => {},
    finish: () => {},
  };

  try {
    const data = await req.json();
    const { userId, selection, baseTeamStats, evaluation } = data;
    
    span.setTag('usr.id', userId);
    span.setTag('team.base_stats', baseTeamStats);

    const principal = charactersData.find(c => c.id === selection.team_principal);
    const driver = charactersData.find(c => c.id === selection.driver_1);
    const driver2 = charactersData.find(c => c.id === selection.driver_2);
    const engineer = charactersData.find(c => c.id === selection.race_engineer_1);
    const strategy = charactersData.find(c => c.id === selection.head_of_strategy);
    const techDirector = charactersData.find(c => c.id === selection.technical_director);

    if (!principal || !driver || !driver2 || !engineer || !strategy || !techDirector) {
      throw new Error('Invalid team selection');
    }

    const synergyMultiplier = evaluation?.synergyMultiplier || 1.0;
    const feedback = evaluation?.feedback || "Default synergy applied.";
    const latency = evaluation?.latency || 0;
    const promptTokens = evaluation?.promptTokens || 0;
    const completionTokens = evaluation?.completionTokens || 0;

    const finalScore = Math.round(baseTeamStats * synergyMultiplier);

    // EXACT JSON structure for Datadog LLMObs as requested
    const llmObsPayload = {
      event_type: "dream_team_evaluation",
      timestamp: new Date().toISOString(),
      user: {
        usr_id: userId
      },
      selection: {
        team_principal: selection.team_principal,
        driver_1: selection.driver_1,
        driver_2: selection.driver_2,
        race_engineer_1: selection.race_engineer_1,
        head_of_strategy: selection.head_of_strategy,
        technical_director: selection.technical_director
      },
      scoring_metrics: {
        base_team_stats: baseTeamStats,
        synergy_multiplier: synergyMultiplier,
        final_calculated_score: finalScore
      },
      datadog_llm_obs: {
        model_name: "gemini-3.1-flash-lite-preview",
        prompt_tokens: Math.round(promptTokens),
        completion_tokens: Math.round(completionTokens),
        total_tokens: Math.round(promptTokens + completionTokens),
        latency_ms: latency,
        custom_evaluation_feedback: feedback
      }
    };

    console.log(JSON.stringify(llmObsPayload));

    span.setTag('team.final_score', finalScore);
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
