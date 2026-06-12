import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import tracer from '@/lib/datadog-server';
import { logger } from '@/lib/logger';
import { DEMO_ERROR_INJECT } from '@/lib/demo-config';
import { publishCheckoutEvent } from '@/lib/kafka-client';

export async function POST(req: Request) {
  const span = tracer?.startSpan('api.merch.checkout') ?? {
    setTag: () => {},
    finish: () => {},
  };

  try {
    const { productId, quantity = 1, userId, priceThb, team, category } = await req.json();

    span.setTag('item.id', productId);
    span.setTag('item.quantity', quantity);
    span.setTag('item.price_thb', priceThb);
    span.setTag('currency.code', 'THB');
    span.setTag('usr.id', userId ?? 'anonymous');
    span.setTag('item.team', team ?? 'unknown');

    // ── Act 3 demo: inject NullPointerException on THB currency handler ──────
    // Simulates the bug introduced in deployment revision v2.4.1.
    // Triggered by: ./scripts/demo-pipeline.sh --error-inject-on
    if (DEMO_ERROR_INJECT) {
      span.setTag('deployment.version', 'v2.4.1');
      span.setTag('error.injected', true);

      const err = new Error('Cannot read properties of null (reading "THBConversionRate")');
      err.name = 'NullPointerException';

      span.setTag('error', err);
      span.setTag('error.type', err.name);
      span.setTag('error.message', err.message);
      span.setTag('error.currency', 'THB');
      span.finish();

      logger.error({
        event_type: 'checkout_error',
        error_type: 'NullPointerException',
        error_message: err.message,
        deployment_version: 'v2.4.1',
        product_id: productId,
        currency: 'THB',
        demo_injected: true,
        request: { path: '/api/merch/checkout' },
      });

      return NextResponse.json(
        { error: 'Payment processing failed. Please try again.', code: 'CURRENCY_HANDLER_ERROR' },
        { status: 500 },
      );
    }

    // ── Normal path: publish event to Kafka ───────────────────────────────────
    const orderId = uuidv4();
    const eventId = uuidv4();

    // Fire-and-forget — do not await Kafka ack to keep checkout latency low
    publishCheckoutEvent({
      event_id: eventId,
      product_id: productId,
      user_id: userId ?? 'anonymous',
      quantity,
      price_thb: priceThb ?? 0,
      team,
      category,
      event_ts: new Date().toISOString(),
    }).catch(err => {
      logger.warn({
        event_type: 'kafka_publish_failed',
        error: err instanceof Error ? err.message : String(err),
        product_id: productId,
        event_id: eventId,
      });
    });

    span.setTag('order.id', orderId);
    span.setTag('kafka.published', true);
    span.finish();

    logger.info({
      event_type: 'checkout_success',
      order_id: orderId,
      event_id: eventId,
      product_id: productId,
      quantity,
      price_thb: priceThb,
      currency: 'THB',
      user_id: userId ?? 'anonymous',
      request: { path: '/api/merch/checkout' },
    });

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      span.setTag('error', true);
      span.setTag('error.message', message);
      span.finish();
    } catch (_) { /* best-effort */ }

    logger.error({
      event_type: 'checkout_error',
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      request: { path: '/api/merch/checkout' },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
