import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';
import charactersData from '@/data/characters.json';
import { getServerGeminiClient } from '@/lib/gemini-server';
import { logger } from '@/lib/logger';
import { withLlmObsSpan } from '@/lib/llmobs';
import { buildSystemInstruction, LLM_MODEL, THINKING_BUDGET, DEMO_HIGH_LATENCY } from '@/lib/demo-config';

// ── Helpers ─────────────────────────────────────────────────────────────────

type Character = (typeof charactersData)[0];

/** Format a single character into a readable block for the LLM context. */
function formatCharacter(c: Character): string {
  const stats = Object.entries(c.visible_stats)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const lore = (c as Character & { lore?: { career_arc?: string; infamous_for?: string } }).lore ?? {};
  return [
    `[${c.id}] ${c.name} (${c.breed})`,
    `Role: ${c.role} | Team: ${c.team} | Stats: ${stats}`,
    `Background: ${c.hidden_persona}`,
    lore.career_arc ? `Career: ${lore.career_arc}` : '',
    lore.infamous_for ? `Notorious for: ${lore.infamous_for}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.dream_team.evaluate') || {
    setTag: () => undefined,
    finish: () => undefined,
  };

  try {
    const data = await req.json();
    const { userId, username, selection, baseTeamStats, sessionId } = data;

    span.setTag('usr.id', userId);
    span.setTag('usr.name', username ?? '');
    span.setTag('team.base_stats', baseTeamStats);

    // ── Resolve selected characters ─────────────────────────────────────────
    const engineer2 = charactersData.find(c => c.id === selection.race_engineer_2);
    const selectedIds = [
      selection.team_principal,
      selection.driver_1,
      selection.driver_2,
      selection.race_engineer_1,
      selection.race_engineer_2,
      selection.head_of_strategy,
      selection.technical_director,
    ];
    const selected = selectedIds.map(id => {
      const c = charactersData.find(c => c.id === id);
      if (!c) throw new Error(`Character not found: ${id}`);
      return c;
    });
    const [principal, driver, driver2, engineer, , strategy, techDirector] = selected;

    // ── Build full roster context ────────────────────────────────────────────
    // Every character is included so the LLM can cross-reference rival histories,
    // team affinities, and synergy bonuses that span the entire paddock.
    const rosterContext = charactersData.map(formatCharacter).join('\n\n');

    // ── Build selected lineup detail ─────────────────────────────────────────
    const lineupContext = [
      `Team Principal: ${formatCharacter(principal)}`,
      `Driver 1: ${formatCharacter(driver)}`,
      `Driver 2: ${formatCharacter(driver2)}`,
      `Race Engineer 1 (assigned to ${driver.name}): ${formatCharacter(engineer)}`,
      `Race Engineer 2 (assigned to ${driver2.name}): ${formatCharacter(engineer2!)}`,
      `Head of Strategy: ${formatCharacter(strategy)}`,
      `Technical Director: ${formatCharacter(techDirector)}`,
      `\nBase Stats Total (sum of all visible stat values): ${baseTeamStats}`,
    ].join('\n\n');

    // ── Prompt ───────────────────────────────────────────────────────────────
    const baseSystemInstruction = `You are the AI judge for the Dream Team Game at Datadog Live Bangkok 2026.
Your job: evaluate a fantasy F1 team of dog-named characters for a live audience competition.

The audience is watching a SCOREBOARD. There are THREE prize categories:
1. BEST SCORE     — Highest final_score (base_stats × synergy_multiplier)
2. WEIRDEST TEAM  — Most unusual / unexpected / chaotic combination
3. MOST CONFLICT  — Team with the most internal dysfunction and paddock warfare

You will receive the FULL PADDOCK ROSTER (all available characters with complete hidden data)
and the SELECTED LINEUP for this submission. Use the full roster to cross-check rivalries,
synergy bonuses, team histories, and career conflicts that the user may not know about.`;

    // DEMO_HIGH_LATENCY=true injects a verbose CoT prefix → higher latency + token usage
    const systemInstruction = buildSystemInstruction(baseSystemInstruction);

    const userPrompt = `## FULL PADDOCK ROSTER (all available characters — use this for cross-referencing)

${rosterContext}

---

## SELECTED TEAM LINEUP FOR THIS SUBMISSION

${lineupContext}

---

## SCORING INSTRUCTIONS

### synergy_multiplier (Float 0.25 – 1.5)
Start at 1.0. Then:
- Apply every explicit CONFLICT penalty from the selected characters' backgrounds.
  e.g. "-40 synergy with X" means subtract 0.40 from the running total.
- Apply every explicit SYNERGY BONUS from their backgrounds.
  e.g. "+25 with Y" means add 0.25 to the running total.
- If characters are from rival teams with documented historical feuds (even without explicit numbers), apply a -0.10 to -0.20 penalty based on severity.
- Cap final multiplier between 0.25 and 1.5.

### weirdness_rating (Integer 0–100)
Score HIGH if:
- Characters are from rival teams (cross-team combinations with known bad blood)
- Historical enemies are literally on the same team (e.g. Gas-leash + O-corgi, Hamilton + Verstappen)
- Someone is paired with the driver/engineer who replaced them or caused their demotion
- The combination is so improbable that no real F1 owner would ever assemble it
- Roles are filled by people who are philosophically opposed to each other's methods
Score LOW if the team is a natural, same-team, coherent combination.

### conflict_index (Integer 0–100)
Score HIGH if:
- Explicit conflict pairs are present (Gas-leash + O-corgi alone = 80+; add more = 90+)
- Multiple alpha personalities across Principal, both Drivers, and Strategy
- The strategist has a documented history of errors that infuriate this specific driver
- The engineer and driver communication styles are explicitly incompatible
Score LOW if the team has clean chain-of-command and complementary personalities.

### sneak_peek (String, 2–3 sentences)
Write like a Sky Sports F1 pundit whispering paddock gossip to the audience.
- TEASE the drama without revealing numeric scores
- Reference specific character names and hint at the chaos (or unlikely brilliance)
- Make the audience NEED to know what happens next
- NO dry analysis — this is live event entertainment

### team_codename (String)
A short, dramatic, F1-flavoured team name that hints at this team's defining characteristic.
Examples: "Operation Controlled Chaos", "The Paddock Fire Starters", "Silent Running FC",
"The Diplomatic Impossibility", "Maximum Verbal Damage Racing"

### synergy_class (Exactly one of: LEGENDARY | STRONG | AVERAGE | VOLATILE | TOXIC)
- LEGENDARY  : multiplier > 1.25  (miracle match, historical greatness)
- STRONG     : 1.0 < multiplier ≤ 1.25  (coherent team, positive chemistry)
- AVERAGE    : 0.70 < multiplier ≤ 1.0  (functional but complicated)
- VOLATILE   : 0.45 < multiplier ≤ 0.70  (high drama, marginal performance)
- TOXIC      : multiplier ≤ 0.45  (catastrophic dysfunction, spectacular failure)

---

Return ONLY valid JSON with exactly these keys:
{
  "synergy_multiplier": <float>,
  "weirdness_rating": <int 0-100>,
  "conflict_index": <int 0-100>,
  "sneak_peek": "<2-3 sentence paddock commentary>",
  "team_codename": "<short dramatic team name>",
  "synergy_class": "<LEGENDARY|STRONG|AVERAGE|VOLATILE|TOXIC>"
}`;

    // ── AI Guard evaluation ───────────────────────────────────────────────────
    // Evaluates the prompt before it reaches the LLM.
    // DD_AI_GUARD_BLOCK=true will reject the promise with AIGuardAbortError on DENY/ABORT.
    // Default is false (MONITOR ONLY) so AI Guard logs without blocking traffic.
    const aiGuardBlock = process.env.DD_AI_GUARD_BLOCK === 'true';
    const aiGuardTracer = tracer as unknown as {
      aiguard?: {
        evaluate: (
          messages: Array<{ role: string; content: string }>,
          opts?: { block?: boolean }
        ) => Promise<{ action: string; reason: string }>;
      };
    };

    if (aiGuardTracer.aiguard) {
      try {
        const guardResult = await aiGuardTracer.aiguard.evaluate(
          [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
          { block: aiGuardBlock }
        );
        span.setTag('ai_guard.action', guardResult.action);
        logger.info({
          event_type: 'ai_guard_evaluation',
          action: guardResult.action,
          reason: guardResult.reason,
          blocked: false,
        });
      } catch (guardErr) {
        const isAbortError =
          guardErr != null &&
          typeof guardErr === 'object' &&
          (guardErr as { name?: string }).name === 'AIGuardAbortError';
        if (isAbortError) {
          span.setTag('ai_guard.action', 'BLOCKED');
          span.setTag('error', true);
          span.finish();
          logger.warn({
            event_type: 'ai_guard_blocked',
            error: guardErr instanceof Error ? guardErr.message : String(guardErr),
          });
          return NextResponse.json({ error: 'Request blocked by AI Guard' }, { status: 403 });
        }
        // AI Guard service unavailable — log and continue (fail open)
        logger.warn({
          event_type: 'ai_guard_error',
          error: guardErr instanceof Error ? guardErr.message : String(guardErr),
        });
      }
    }

    // ── LLM call with full LLMObs annotation ─────────────────────────────────
    const ai = getServerGeminiClient();
    // DEMO_HIGH_LATENCY=true → gemini-3.1-pro-preview + max thinking budget
    // DEMO_HIGH_LATENCY=false → gemini-3-flash-preview (production default)
    const MODEL = LLM_MODEL;
    const startTime = Date.now();

    let llmResult = {
      synergy_multiplier: 1.0,
      weirdness_rating: 50,
      conflict_index: 50,
      sneak_peek: 'Radio comms lost. Default synergy applied.',
      team_codename: 'Unknown Quantity Racing',
      synergy_class: 'AVERAGE' as string,
    };
    let rawResponseText = '';

    // Helper: parse the raw LLM JSON into llmResult (shared between getOutput and the outer scope)
    const parseResponse = (text: string): typeof llmResult => {
      try {
        const parsed = JSON.parse(text);
        return {
          synergy_multiplier: Number(parsed.synergy_multiplier) || 1.0,
          weirdness_rating: Math.min(100, Math.max(0, parseInt(parsed.weirdness_rating) || 50)),
          conflict_index: Math.min(100, Math.max(0, parseInt(parsed.conflict_index) || 50)),
          sneak_peek: String(parsed.sneak_peek || 'No commentary available.'),
          team_codename: String(parsed.team_codename || 'Unknown Quantity Racing'),
          synergy_class: ['LEGENDARY', 'STRONG', 'AVERAGE', 'VOLATILE', 'TOXIC'].includes(
            String(parsed.synergy_class)
          )
            ? String(parsed.synergy_class)
            : 'AVERAGE',
        };
      } catch {
        logger.warn({ message: 'Failed to parse LLM JSON response', raw: text });
        return llmResult; // keep defaults on parse error
      }
    };

    // Selected lineup as a compact string for the prompt variable
    const lineupSummary = [
      principal.name,
      driver.name,
      driver2.name,
      engineer.name,
      engineer2?.name ?? 'TBD',
      strategy.name,
      techDirector.name,
    ].join(' · ');

    const response = await withLlmObsSpan(
      // Span name visible in Datadog LLMObs; used to scope custom evaluations.
      'dream_team_game_evaluation',
      {
        inputMessages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
        modelName:     MODEL,
        modelProvider: 'google',
        sessionId:     sessionId ?? '',
        // tags are indexed/searchable in LLMObs Explorer; metadata is stored but not indexed
        tags: { username: username ?? '' },
        metadata: {
          userId: userId ?? '',
          username: username ?? '',
          base_stats: baseTeamStats,
          selected_principal: selection.team_principal,
          selected_driver_1: selection.driver_1,
          selected_driver_2: selection.driver_2,
          selected_engineer_1: selection.race_engineer_1,
          selected_engineer_2: selection.race_engineer_2 ?? '',
          selected_strategy: selection.head_of_strategy,
          selected_tech_director: selection.technical_director,
        },
        // ── Prompt tracking ────────────────────────────────────────────────────
        // Template uses placeholders for the two dynamic parts of the user prompt.
        // Version is omitted → auto-versioned by hash of template content.
        // contextVariables: the full roster is ground-truth context (for hallucination detection).
        // queryVariables: the selected lineup is what the user is actually asking about.
        prompt: {
          id: 'dream-team-game-evaluation',
          template: [
            { role: 'system', content: systemInstruction },
            {
              role: 'user',
              content:
                '## FULL PADDOCK ROSTER\n{{roster_context}}\n\n---\n\n## SELECTED TEAM LINEUP\n{{lineup_context}}\n\n---\n\n## SCORING INSTRUCTIONS\n{{scoring_instructions}}',
            },
          ],
          variables: {
            roster_context: `Full paddock roster (${charactersData.length} characters with hidden personas and lore)`,
            lineup_context: lineupSummary,
            scoring_instructions: 'synergy_multiplier · weirdness_rating · conflict_index · sneak_peek · team_codename · synergy_class',
          },
          tags: { game: 'datadog-live-bangkok-2026', task: 'dream_team_game_evaluation' },
          contextVariables: ['roster_context'],  // paddock roster = ground-truth context
          queryVariables: ['lineup_context'],    // selected lineup = user query
        },
      },
      async () =>
        ai.models.generateContent({
          model: MODEL,
          contents: [
            { role: 'user', parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] },
          ],
          config: {
            responseMimeType: 'application/json',
            // DEMO_HIGH_LATENCY=true → max thinking budget for visible latency in demo
            thinkingConfig: { thinkingBudget: THINKING_BUDGET },
          },
        }),
      // ── Post-call output annotation ──────────────────────────────────────────
      // Parse the LLM JSON response HERE so the LLMObs span metadata contains
      // the actual scored values — not the pre-initialised defaults.
      // weirdness_rating, conflict_index, synergy_class are intentionally hidden
      // from the UI response; they live only in LLMObs for prize judging.
      (res) => {
        const text = res.text ?? '';
        const latencyMs = Date.now() - startTime;
        const inputTokens  = res.usageMetadata?.promptTokenCount     ?? Math.round((systemInstruction.length + userPrompt.length) / 4);
        const outputTokens = res.usageMetadata?.candidatesTokenCount ?? Math.round(text.length / 4);

        // Parse and cache so the outer scope can reuse without re-parsing
        const parsed = parseResponse(text);
        llmResult = parsed;

        return {
          outputContent: text,
          inputTokens,
          outputTokens,
          metadata: {
            latency_ms: latencyMs,
            // Real scored values — available in Datadog LLMObs for custom evaluation
            weirdness_rating:   parsed.weirdness_rating,
            conflict_index:     parsed.conflict_index,
            synergy_class:      parsed.synergy_class,
            synergy_multiplier: parsed.synergy_multiplier,
            final_score: Math.round(baseTeamStats * parsed.synergy_multiplier),
            team_codename: parsed.team_codename,
          },
        };
      },
    );

    rawResponseText = response.text ?? '';
    const latencyMs = Date.now() - startTime;
    // llmResult was already set inside getOutput above — no second parse needed

    const finalScore = Math.round(baseTeamStats * llmResult.synergy_multiplier);

    // ── APM span tags ────────────────────────────────────────────────────────
    span.setTag('team.final_score', finalScore);
    span.setTag('team.synergy_class', llmResult.synergy_class);
    span.setTag('team.weirdness_rating', llmResult.weirdness_rating);
    span.setTag('team.conflict_index', llmResult.conflict_index);
    span.setTag('team.codename', llmResult.team_codename);

    // ── Structured log (full data for Datadog log-based analysis) ────────────
    logger.info({
      event_type: 'dream_team_game_evaluation',
      timestamp: new Date().toISOString(),
      game: 'datadog-live-bangkok-2026',
      user: { usr_id: userId, username },
      selection: {
        team_principal: selection.team_principal,
        driver_1: selection.driver_1,
        driver_2: selection.driver_2,
        race_engineer_1: selection.race_engineer_1,
        race_engineer_2: selection.race_engineer_2,
        head_of_strategy: selection.head_of_strategy,
        technical_director: selection.technical_director,
      },
      scoring: {
        base_stats: baseTeamStats,
        synergy_multiplier: llmResult.synergy_multiplier,
        final_score: finalScore,
        synergy_class: llmResult.synergy_class,
        // Hidden from UI — visible in Datadog logs / LLMObs for prize judging
        weirdness_rating: llmResult.weirdness_rating,
        conflict_index: llmResult.conflict_index,
      },
      llm: {
        model: MODEL,
        demo_high_latency: DEMO_HIGH_LATENCY,
        thinking_budget: THINKING_BUDGET,
        latency_ms: latencyMs,
        input_chars: systemInstruction.length + userPrompt.length,
        output_chars: rawResponseText.length,
        team_codename: llmResult.team_codename,
      },
      request: { path: '/api/evaluate-team' },
    });

    span.finish();

    // ── Response to UI: glimpse only — no weirdness/conflict numbers ─────────
    return NextResponse.json({
      success: true,
      // Shown to user
      teamCodename: llmResult.team_codename,
      sneakPeek: llmResult.sneak_peek,
      synergyClass: llmResult.synergy_class,
      synergyMultiplier: llmResult.synergy_multiplier,
      finalScore,
      // Legacy field kept for RaceStartSequence compatibility
      feedback: llmResult.sneak_peek,
      latencyMs,
    });
  } catch (error) {
    try {
      span?.setTag('error', true);
      span?.setTag('error.message', error instanceof Error ? error.message : String(error));
      span?.finish();
    } catch (_) { /* span cleanup best-effort */ }
    logger.error({
      event_type: 'dream_team_game_evaluation_error',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
