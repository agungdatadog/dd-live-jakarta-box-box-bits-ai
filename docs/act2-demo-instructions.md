# Act 2 Demo Instructions — The Incident: End-to-End Observability

## Overview

Act 2 tells the story of a pricing pipeline failure across 6 system layers:

```
User abandons checkout (฿9,990 wrong price)
  → Watchdog anomaly detection fires
  → RUM Session Replay shows the session
  → APM: pricing API serving 6h stale data
  → Data Observability: Kafka lag + dbt job FAILED
  → BigQuery: dynamic_pricing table stale 6h17m
  → Data Jobs Monitoring: dbt job error visible in lineage
```

---

## The 90-Second Problem

> **You cannot wait 30 minutes for a freshness alert to fire live on stage.**

The solution: **pre-stage the failure before recording, then SHOW the already-fired alert.**
This is how professional demos work — the issue already happened, you're now walking through how Datadog detected it.

---

## Pre-Demo Setup (10 minutes before recording)

```bash
# Step 1: Trigger the dbt failure (this creates the real Datadog signals)
./scripts/demo-pipeline.sh --fail-dbt

# Step 2: Wait 3-5 minutes for:
#   - Datadog Data Jobs Monitoring to show the failed dbt job
#   - BigQuery freshness to degrade (the table stops updating)
#   - The Data Observability freshness monitor to fire

# Step 3: Generate wrong-price traffic so RUM has real sessions to show
./scripts/demo-data-quality.sh --inject-zero-prices  # creates ฿0 orders
python3 scripts/demo-traffic.py --scenario race-day --delay-ms 300 &

# Step 4: Verify everything is staged
./scripts/demo-data-quality.sh --show-bad-data
```

---

## What You Show During the Demo (Act 2 Flow)

### Scene 1 — Watchdog fires first (0:00–0:30)

**Where**: Datadog → Watchdog → Anomaly Alerts

> *"It's 3:14 AM. The dbt pricing model runs its scheduled job — and fails."*
> *"Before any human knows, Watchdog has already fired."*

**What to show**:
- The Watchdog alert: "Unusual checkout abandonment rate"
- Point to the timestamp: this fired **before any user complained**

### Scene 2 — RUM Session Replay (0:30–1:00)

**Where**: Datadog → RUM → Session Replay

> *"I can see exactly what that user saw. Not a log line — the actual session."*

**What to show**:
- A RUM session where user sees the wrong price
- The checkout abandonment event in the session timeline
- Point to the `merch.checkout_abandon` RUM action

### Scene 3 — APM: stale cache (1:00–1:30)

**Where**: Datadog → APM → Traces → `api.merch.products`

> *"APM traces the pricing API. It's serving data from 6 hours ago. Why?"*

**What to show**:
- APM span for `api.merch.products` with tag: `pricing.source: static_fallback`
- Tag: `data_freshness_hours: 6.17` on the span
- The structured log: `event_type: pricing_fallback`

### Scene 4 — Data Observability: the pipeline story (1:30–3:00)

**Where**: Datadog → Data Observability → Jobs Monitoring

> *"Data Observability: the dbt job failed at 03:14. The pricing model ran on a broken source schema."*

**What to show** (this is the "wow moment"):

**a) Data Jobs Monitoring — dbt failure**
- Navigate to: Data Observability → Pipelines → `novapay-dbt`
- Show the FAILED job run: schema mismatch error on `unit_price` column
- The job timeline shows: was running every 5 min, then STOPPED

**b) BigQuery Freshness Monitor — already fired**
- Navigate to: Data Observability → Monitors
- Show: `[NovaPay Demo] dynamic_pricing freshness > 30 min` — **ALERT state**
- The freshness graph: flat line (no updates) after the dbt failure timestamp
- This is the visual proof: **the table stopped being updated at 03:14**

**c) Lineage — the causal chain**
- Navigate to: Data Observability → Lineage
- Anchor on: `novapay_analytics.dynamic_pricing`
- Show the lineage: `limited_merch_events → [dbt job] → dynamic_pricing → /api/merch/products`
- Click the dbt job node → shows the FAILED status
- This is the "one platform" moment: from browser session to database table, connected

> *"One platform traced a wrong price from the browser session all the way to a failed dbt job at 3am — across 6 system layers. In 90 seconds."*

---

## Recovery After the Demo

```bash
# Restore the pipeline immediately after Act 2
./scripts/demo-pipeline.sh --fix-dbt

# This:
# 1. Restores DBT_FAIL_MODE=false in the ConfigMap
# 2. Triggers an immediate dbt run
# 3. BigQuery dynamic_pricing table refreshes within ~60 seconds
# 4. Freshness monitor recovers

# Verify recovery
./scripts/demo-data-quality.sh --show-bad-data
```

---

## Why This Approach Works Better Than Live Injection

| Approach | Risk | Realism | Demo control |
|---|---|---|---|
| **Pre-staged failure (recommended)** | Low — already fired | High — real Datadog signals | Full — you decide when to show |
| Live injection during recording | Medium — timing uncertainty | Medium | Partial — depends on alert latency |
| Simulated (fake) data | Zero risk | Low — no real signals | Full |

The pre-staged approach gives you **real Datadog signals** (real dbt failure, real freshness monitor alert, real Data Jobs Monitoring entry) without the timing uncertainty of waiting for alerts to fire live.

---

## Demo Talking Points Reference

| Signal | What Datadog shows | Business translation |
|---|---|---|
| Watchdog anomaly | Checkout abandonment rate spike correlated to pricing API | Detected before any customer complaint |
| RUM Session Replay | User sees ฿9,990 instead of ฿3,490 | Proof of customer impact, not just a metric |
| APM span tag `pricing.source: static_fallback` | The pricing API is serving stale data | The symptom, not the root cause |
| APM tag `data_freshness_hours: 6.17` | Data is 6 hours old | How stale? Exactly 6h17m |
| Data Jobs Monitoring: FAILED | dbt schema mismatch: `unit_price` column not found | This is the root cause |
| Freshness monitor: ALERT | `dynamic_pricing` table not updated for 6h17m | Business impact: wrong prices for 6 hours |
| Lineage graph | `limited_merch_events → dbt → dynamic_pricing → API` | Shows the causal chain end-to-end |

---

## Quick Reference Datadog URLs

```
# Data Jobs Monitoring (dbt failure)
https://app.datadoghq.com/data-observability/pipelines

# Lineage (anchor on dynamic_pricing)
https://app.datadoghq.com/data-observability/lineage

# Data Observability Monitors (freshness alert)
https://app.datadoghq.com/data-observability/monitors

# RUM Session Replay
https://app.datadoghq.com/rum/explorer

# APM Traces (pricing API)
https://app.datadoghq.com/apm/traces?query=service%3Abox-box-bits-ai%20operation_name%3Aapi.merch.products
```
