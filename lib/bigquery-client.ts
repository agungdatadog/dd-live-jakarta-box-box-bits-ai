/**
 * lib/bigquery-client.ts
 *
 * BigQuery client singleton for reading the dynamic_pricing table.
 *
 * Authentication:
 *   - GKE/Cloud Run: Workload Identity / GOOGLE_APPLICATION_CREDENTIALS (SA key via Secret Manager)
 *   - Local dev: returns null → callers fall back to static merch-products.json
 *
 * The client is lazy-initialised once per process. If BigQuery is unavailable
 * or the env vars are missing, all public functions return null/empty gracefully
 * so the merch API can fall back without crashing.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT  = process.env.BQ_PROJECT  ?? 'datadog-ese-sandbox';
const DATASET  = 'novapay_analytics';
const TABLE    = 'dynamic_pricing';

let _bq: BigQuery | null = null;

function getClient(): BigQuery | null {
  // Only init if we have credentials available
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.BQ_SA_KEY_JSON) {
    return null;
  }
  if (!_bq) {
    if (process.env.BQ_SA_KEY_JSON) {
      // Inline JSON SA key (alternative to file-based GOOGLE_APPLICATION_CREDENTIALS)
      const credentials = JSON.parse(process.env.BQ_SA_KEY_JSON);
      _bq = new BigQuery({ projectId: PROJECT, credentials });
    } else {
      _bq = new BigQuery({ projectId: PROJECT });
    }
  }
  return _bq;
}

export interface DynamicPricingRow {
  product_id: string;
  base_price_thb: number;
  demand_multiplier: number;
  current_price_thb: number;
  units_sold_1h: number;
  dbt_updated_at: string;
  dbt_run_id: string;
}

export interface PricingQueryResult {
  rows: DynamicPricingRow[];
  /** ISO timestamp of the most recent dbt_updated_at across all rows */
  lastUpdatedAt: string | null;
  /** How stale the data is in hours (0 = fresh) */
  freshnessHours: number;
  source: 'bigquery' | 'static_fallback';
}

/**
 * Fetches all rows from novapay_analytics.dynamic_pricing.
 * Returns null when BigQuery is unavailable so callers can use the static fallback.
 */
export async function fetchDynamicPricing(): Promise<PricingQueryResult | null> {
  const bq = getClient();
  if (!bq) return null;

  try {
    const query = `
      SELECT
        product_id,
        base_price_thb,
        demand_multiplier,
        current_price_thb,
        units_sold_1h,
        CAST(dbt_updated_at AS STRING) AS dbt_updated_at,
        dbt_run_id
      FROM \`${PROJECT}.${DATASET}.${TABLE}\`
      ORDER BY product_id
    `;

    const [rows] = await bq.query({ query, location: 'asia-southeast1' });

    const typedRows = rows as DynamicPricingRow[];
    if (typedRows.length === 0) return null;

    // Compute freshness from the most recent dbt_updated_at
    const mostRecent = typedRows.reduce((latest, row) => {
      return row.dbt_updated_at > latest ? row.dbt_updated_at : latest;
    }, typedRows[0].dbt_updated_at);

    const ageMs = Date.now() - new Date(mostRecent).getTime();
    const freshnessHours = Math.round((ageMs / (1000 * 60 * 60)) * 100) / 100;

    return {
      rows: typedRows,
      lastUpdatedAt: mostRecent,
      freshnessHours,
      source: 'bigquery',
    };
  } catch {
    return null;
  }
}
