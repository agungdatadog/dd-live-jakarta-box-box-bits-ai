{{
  config(
    materialized='table'
  )
}}

/*
 * dynamic_pricing.sql — working model
 *
 * Computes a demand-based price multiplier for each merch product based on
 * purchase events in the last 1 hour. A product with > 10 units sold in 1h
 * gets a multiplier up to 1.5× (capped). Products with no recent sales keep
 * the base price (multiplier = 1.0).
 *
 * This is the HEALTHY model. dynamic_pricing_broken.sql is the broken version
 * used for the demo failure scenario (DBT_FAIL_MODE=true).
 */

with

raw_events as (
  select
    product_id,
    sum(quantity) as units_sold_1h
  from {{ source('novapay_raw', 'limited_merch_events') }}
  where event_ts >= timestamp_sub(current_timestamp(), interval 1 hour)
  group by product_id
),

base_prices as (
  -- Static base prices from seed data. In production this would be a dimension table.
  select *
  from unnest([
    struct('rb-cap-001'    as product_id, 1290.0 as base_price_thb),
    struct('rb-hoodie-001' as product_id, 3490.0 as base_price_thb),
    struct('mw-cap-001'    as product_id, 1390.0 as base_price_thb),
    struct('mw-jacket-001' as product_id, 5990.0 as base_price_thb),
    struct('fl-cap-001'    as product_id, 1490.0 as base_price_thb),
    struct('fl-tshirt-001' as product_id, 1990.0 as base_price_thb),
    struct('mc-cap-001'    as product_id, 1390.0 as base_price_thb),
    struct('mc-hoodie-001' as product_id, 3290.0 as base_price_thb)
  ])
),

demand_calc as (
  select
    b.product_id,
    b.base_price_thb,
    coalesce(r.units_sold_1h, 0)                                             as units_sold_1h,
    -- Multiplier: 1.0 base + 0.05 per unit sold in last hour, capped at 1.5
    least(1.0 + (coalesce(r.units_sold_1h, 0) * 0.05), 1.5)                 as demand_multiplier
  from base_prices b
  left join raw_events r using (product_id)
)

select
  product_id,
  base_price_thb,
  demand_multiplier,
  -- Round to nearest 10 THB for display
  round(base_price_thb * demand_multiplier / 10.0) * 10.0                   as current_price_thb,
  units_sold_1h,
  current_timestamp()                                                         as dbt_updated_at,
  '{{ invocation_id }}'                                                       as dbt_run_id
from demand_calc
