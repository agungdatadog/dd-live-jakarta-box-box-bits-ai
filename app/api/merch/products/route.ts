import { NextResponse } from 'next/server';
import tracer from '@/lib/datadog-server';
import { logger } from '@/lib/logger';
import { fetchDynamicPricing } from '@/lib/bigquery-client';
import staticProducts from '@/data/merch-products.json';

export const dynamic = 'force-dynamic'; // always fresh, never cached by Next.js

const FRESHNESS_THRESHOLD_HOURS = 0.5; // 30 minutes — stale beyond this

export async function GET() {
  const span = tracer?.startSpan('api.merch.products') ?? {
    setTag: () => {},
    finish: () => {},
  };

  try {
    const bqResult = await fetchDynamicPricing();

    if (bqResult && bqResult.freshnessHours <= FRESHNESS_THRESHOLD_HOURS) {
      // ── Fresh BigQuery data ────────────────────────────────────────────────
      span.setTag('pricing.source', 'bigquery');
      span.setTag('data_freshness_minutes', Math.round(bqResult.freshnessHours * 60));
      span.setTag('dbt_run_id', bqResult.rows[0]?.dbt_run_id ?? 'unknown');
      span.setTag('product_count', bqResult.rows.length);

      // Merge dynamic pricing with static catalog metadata (name, description, badge, etc.)
      const products = bqResult.rows.map(row => {
        const meta = staticProducts.find(p => p.id === row.product_id);
        return {
          id: row.product_id,
          name: meta?.name ?? row.product_id,
          team: meta?.team ?? '',
          description: meta?.description ?? '',
          badge: meta?.badge ?? null,
          category: meta?.category ?? '',
          available: meta?.available ?? true,
          price: Math.round(row.current_price_thb),
          base_price: Math.round(row.base_price_thb),
          demand_multiplier: row.demand_multiplier,
          units_sold_1h: row.units_sold_1h,
          currency: 'THB',
          pricing_source: 'bigquery',
          dbt_updated_at: row.dbt_updated_at,
        };
      });

      logger.info({
        event_type: 'pricing_query',
        pricing_source: 'bigquery',
        data_freshness_hours: bqResult.freshnessHours,
        dbt_updated_at: bqResult.lastUpdatedAt,
        product_count: products.length,
        request: { path: '/api/merch/products' },
      });

      span.finish();
      return NextResponse.json({ products, pricing_source: 'bigquery', freshness_hours: bqResult.freshnessHours });
    }

    // ── Fallback: stale BigQuery or BigQuery unavailable ──────────────────────
    const staleness = bqResult
      ? bqResult.freshnessHours
      : null;

    span.setTag('pricing.source', 'static_fallback');
    span.setTag('data_freshness_hours', staleness ?? -1);
    span.setTag('product_count', staticProducts.length);

    const products = staticProducts.map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      description: p.description,
      badge: p.badge,
      category: p.category,
      available: p.available,
      price: p.base_price,
      base_price: p.base_price,
      demand_multiplier: 1.0,
      units_sold_1h: 0,
      currency: 'THB',
      pricing_source: 'static_fallback',
      dbt_updated_at: bqResult?.lastUpdatedAt ?? null,
    }));

    logger.warn({
      event_type: 'pricing_fallback',
      pricing_source: 'static_fallback',
      data_freshness_hours: staleness,
      dbt_updated_at: bqResult?.lastUpdatedAt ?? null,
      bigquery_available: bqResult !== null,
      reason: staleness !== null
        ? `BigQuery data is ${staleness.toFixed(2)}h stale (threshold: ${FRESHNESS_THRESHOLD_HOURS}h) — dbt job may have failed`
        : 'BigQuery client not configured — using static catalog',
      request: { path: '/api/merch/products' },
    });

    span.finish();
    return NextResponse.json({ products, pricing_source: 'static_fallback', freshness_hours: staleness });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      span.setTag('error', true);
      span.setTag('error.message', message);
      span.finish();
    } catch (_) { /* best-effort */ }

    logger.error({
      event_type: 'pricing_query_error',
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      request: { path: '/api/merch/products' },
    });

    // Always serve something — fall back to static catalog even on errors
    const products = staticProducts.map(p => ({
      id: p.id, name: p.name, team: p.team, description: p.description,
      badge: p.badge, category: p.category, available: p.available,
      price: p.base_price, base_price: p.base_price, demand_multiplier: 1.0,
      units_sold_1h: 0, currency: 'THB', pricing_source: 'error_fallback',
      dbt_updated_at: null,
    }));

    return NextResponse.json({ products, pricing_source: 'error_fallback', freshness_hours: null });
  }
}
