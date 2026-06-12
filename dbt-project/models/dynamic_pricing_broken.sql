{{
  config(
    materialized='table'
  )
}}

/*
 * dynamic_pricing_broken.sql — INTENTIONALLY BROKEN for demo Act 2
 *
 * This model references a column `unit_price` that does not exist in the source
 * table (the correct column is `price_thb`). This causes a schema mismatch
 * error when dbt runs with DBT_FAIL_MODE=true.
 *
 * In Datadog Data Jobs Monitoring you will see:
 *   - Job status: FAILED
 *   - Error: "Unrecognized name: unit_price at [line N]" (BigQuery error)
 *   - Model: dynamic_pricing_broken
 *
 * This triggers the Act 2 demo scenario:
 *   1. dbt job fails at 03:14
 *   2. BigQuery dynamic_pricing table stops updating → goes stale
 *   3. Data freshness monitor fires in Datadog
 *   4. Merch API falls back to static prices
 *   5. Users see wrong prices → RUM checkout abandonment
 */

with

raw_events as (
  select
    product_id,
    -- BUG: `unit_price` column does not exist. Correct name is `price_thb`.
    -- This is the schema mismatch introduced in deployment revision v2.4.1.
    sum(unit_price) as revenue_1h
  from {{ source('novapay_raw', 'limited_merch_events') }}
  where event_ts >= timestamp_sub(current_timestamp(), interval 1 hour)
  group by product_id
)

select
  product_id,
  revenue_1h,
  current_timestamp() as dbt_updated_at
from raw_events
