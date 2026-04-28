import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.quiz.submit') || {
    setTag: () => {},
    finish: () => {},
  };

  try {
    const data = await req.json();
    
    // Log custom APM span tags for Dashboard math
    span.setTag('usr.id', data.userId);
    span.setTag('app.username', data.username);
    span.setTag('quiz.id', data.quizId);
    span.setTag('quiz.score', data.baseScore);
    span.setTag('quiz.correct_answers', data.correctAnswers);
    span.setTag('quiz.time_taken_sec', data.timeTakenSec);

    // Mock logging the payload structure
    logger.info({
      event_type: "quiz_submission",
      timestamp: new Date().toISOString(),
      user: {
        usr_id: data.userId,
        username: data.username
      },
      quiz_data: {
        quiz_id: data.quizId,
        time_taken_sec: data.timeTakenSec,
        correct_answers: data.correctAnswers,
        total_questions: data.totalQuestions,
        base_score: data.baseScore
      },
      request: {
        path: '/api/quiz',
      }
    });

    span.finish();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      span?.setTag('error', true);
      span?.setTag('error.message', message);
      span?.finish();
    } catch (_) { /* span cleanup best-effort */ }

    logger.error({
      event_type: 'quiz_submission_error',
      status: 500,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      request: { path: '/api/quiz' },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
