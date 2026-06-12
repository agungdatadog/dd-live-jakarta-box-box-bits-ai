#!/usr/bin/env bash
# scripts/demo-data-quality.sh
#
# Scenario 4 — Data Observability: Business Critical Data Quality Demo
#
# Demonstrates how bad data in a pricing pipeline directly causes revenue loss
# (the Qantas/Samsung/Uber pattern) and how Datadog Data Observability monitors
# detect the issue, create an Incident, and notify before it hits customers.
#
# Usage:
#   --inject-zero-prices    Insert ฿0 price events → triggers Percent Zero anomaly monitor
#   --inject-null-users     Insert events with null user_id → triggers Nullness spike monitor
#   --inject-negative-qty   Insert events with negative quantity → Percent Negative monitor
#   --inject-freshness      Fail dbt → dynamic_pricing goes stale (also in demo-pipeline.sh)
#   --inject-row-drop       Scale bq-sink to 0 replicas → row count drop on raw table
#   --show-bad-data         Query BigQuery to show injected anomalies
#   --fix-all               Remove bad data, restore bq-sink, fix dbt
#   --create-monitors       Print monitor creation API calls (run after BQ Quality Monitoring setup)

set -euo pipefail

PROJECT="datadog-ese-sandbox"
CLUSTER="nuttee-cluster-1"
ZONE="asia-southeast1-b"
NAMESPACE="data-pipeline"
KUBE_CTX="gke_${PROJECT}_${ZONE}_${CLUSTER}"
RAW_TABLE="${PROJECT}:novapay_raw.limited_merch_events"
PRICING_TABLE="${PROJECT}:novapay_analytics.dynamic_pricing"

echo_step() { echo -e "\033[1;36m[data-quality]\033[0m $*"; }
echo_ok()   { echo -e "\033[1;32m[data-quality]\033[0m $*"; }
echo_warn() { echo -e "\033[1;33m[data-quality]\033[0m $*"; }

# ─── Bad data injection helpers ───────────────────────────────────────────────

# Inject zero-price purchase events — simulates a pricing engine bug where
# dynamic_pricing table returns ฿0 due to a dbt miscalculation.
# Datadog monitor: Column > Percent Zero on price_thb
inject_zero_prices() {
  echo_step "Injecting ฿0 price events (simulates pricing engine bug)..."
  local NOW
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  # Build INSERT VALUES list (15 rows)
  local VALUES=""
  for i in $(seq 1 15); do
    local EID
    EID="zero-price-$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"
    VALUES="${VALUES}('${EID}','rb-cap-001','bad-data-test',1,0.0,'Red Bark Racing','caps','${NOW}',NULL,'${NOW}'),"
  done
  VALUES="${VALUES%,}"  # remove trailing comma
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "INSERT INTO \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     (event_id,product_id,user_id,quantity,price_thb,team,category,event_ts,kafka_offset,ingested_at)
     VALUES ${VALUES}" 2>&1 | tail -2
  echo_ok "Injected 15 ฿0 price events → 'Percent Zero' column monitor will fire"
  echo_warn "Story: A pricing engine bug sent ฿0 to the checkout — customers saw free merch."
  echo_warn "Revenue impact: 15 free orders × avg ฿2,000 = ฿30,000 lost before detection."
}

# Inject null user_id events — simulates a bad upstream data transformation
# that stripped the user identifier. Makes attribution impossible.
inject_null_users() {
  echo_step "Injecting events with null user_id (simulates identity stripping bug)..."
  local NOW
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local VALUES=""
  for i in $(seq 1 20); do
    local EID
    EID="null-user-$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"
    VALUES="${VALUES}('${EID}','mc-cap-001',NULL,1,1390.0,'McLaren Nor-ruff','caps','${NOW}',NULL,'${NOW}'),"
  done
  VALUES="${VALUES%,}"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "INSERT INTO \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     (event_id,product_id,user_id,quantity,price_thb,team,category,event_ts,kafka_offset,ingested_at)
     VALUES ${VALUES}" 2>&1 | tail -2
  echo_ok "Injected 20 null user_id events → 'Nullness' column monitor will fire"
  echo_warn "Story: 20 purchases unattributable → loyalty program broken, GDPR audit risk."
}

# Inject negative quantity events — simulates a refund processing bug where
# negative quantities entered the raw events table as real purchases.
inject_negative_qty() {
  echo_step "Injecting negative quantity events (simulates refund processing bug)..."
  # Build 10 rows with negative prices using Python — NOW defined inside Python
  local VALUES
  VALUES=$(python3 -c "
import uuid, random
from datetime import datetime, timezone
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
rows = []
for i in range(10):
    eid = 'neg-qty-' + str(uuid.uuid4())
    qty = random.randint(1,5)
    price = -(random.randint(500,3000))
    rows.append(f\"('{eid}','mw-jacket-001','refund-bug',{-qty},{price}.0,'Mercedes Woof AMG','jackets','{NOW}',NULL,'{NOW}')\")
print(','.join(rows))
")
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "INSERT INTO \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     (event_id,product_id,user_id,quantity,price_thb,team,category,event_ts,kafka_offset,ingested_at)
     VALUES ${VALUES}" 2>&1 | tail -2
  echo_ok "Injected 10 negative quantity/price events → 'Percent Negative' monitor will fire"
  echo_warn "Story: Refund bug injecting negative values — dbt aggregate is now corrupted."
}

# ─── Pipeline failure ─────────────────────────────────────────────────────────

inject_freshness() {
  echo_step "Triggering dbt failure → dynamic_pricing table goes stale..."
  bash "$(dirname "$0")/demo-pipeline.sh" --fail-dbt
  echo_warn "Freshness monitor will fire in ~5–30 minutes."
  echo_warn "Story: Like Qantas — wrong prices on the storefront from stale pricing data."
}

inject_row_drop() {
  echo_step "Scaling bq-sink to 0 replicas → Kafka consumer stops → row count drops..."
  kubectl --context="$KUBE_CTX" scale deployment/bq-sink \
    --replicas=0 -n "$NAMESPACE" 2>&1
  echo_ok "bq-sink scaled to 0 — no new events will land in limited_merch_events."
  echo_warn "Row Count monitor will detect the drop in ~15–30 minutes."
  echo_warn "Story: Silent pipeline failure — checkout events disappearing, no one knows."
  echo_warn "Recovery: ./scripts/demo-data-quality.sh --fix-all"
}

# ─── Show bad data ─────────────────────────────────────────────────────────────

show_bad_data() {
  echo_step "Querying BigQuery for data quality issues..."
  echo ""

  echo "── Zero-price events (price_thb = 0) ──"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "SELECT COUNT(*) as zero_price_events, SUM(1290) as potential_revenue_lost_thb
     FROM \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     WHERE price_thb = 0
     AND ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)" 2>&1

  echo ""
  echo "── Null user_id events ──"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "SELECT COUNT(*) as null_user_events
     FROM \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     WHERE user_id IS NULL
     AND ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)" 2>&1

  echo ""
  echo "── Negative price events ──"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "SELECT COUNT(*) as negative_events, SUM(price_thb) as total_negative_value
     FROM \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     WHERE price_thb < 0
     AND ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)" 2>&1

  echo ""
  echo "── Dynamic pricing freshness ──"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "SELECT
       FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', MAX(dbt_updated_at)) AS last_updated,
       TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(dbt_updated_at), MINUTE) AS minutes_stale
     FROM \`${PROJECT/:/}.novapay_analytics.dynamic_pricing\`" 2>&1
}

# ─── Fix all ──────────────────────────────────────────────────────────────────

fix_all() {
  echo_step "Removing bad data and restoring pipeline..."

  echo "── Deleting bad data injected in the last 2 hours ──"
  bq query --nouse_legacy_sql --project_id="$PROJECT" \
    "DELETE FROM \`${PROJECT/:/}.novapay_raw.limited_merch_events\`
     WHERE (user_id IN ('bad-data-test', 'refund-bug') OR user_id IS NULL OR price_thb <= 0)
     AND ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR)" 2>&1 || true

  echo "── Restoring bq-sink ──"
  kubectl --context="$KUBE_CTX" scale deployment/bq-sink \
    --replicas=1 -n "$NAMESPACE" 2>&1 || true

  echo "── Fixing dbt ──"
  bash "$(dirname "$0")/demo-pipeline.sh" --fix-dbt || true

  echo_ok "All data quality issues resolved."
  echo_ok "Monitors should recover within the next evaluation window."
}

# ─── Monitor creation reference ───────────────────────────────────────────────

create_monitors() {
  cat << 'MONITORS'
=== Data Quality Monitor Creation Reference ===

Prerequisites: BigQuery Quality Monitoring must be configured in Datadog first.
See: infra/datadog/data-observability-setup.md → Step 1

Navigate to: Data Observability > Monitors > New Monitor

─────────────────────────────────────────────────────────────
MONITOR 1: Dynamic Pricing Freshness (Act 2 / Scenario 4)
─────────────────────────────────────────────────────────────
Entity: Table → novapay_analytics.dynamic_pricing
Metric: Freshness
Detection: Threshold
  Alert:   > 30 minutes (data older than 30 min)
  Warning: > 15 minutes
Name: [NovaPay Demo] dynamic_pricing freshness > 30 min
Notification:
  {{#is_alert}}
  PRICING DATA STALE — last updated {{value}} minutes ago.
  dbt job novapay-dynamic-pricing may have failed.
  Wrong prices may be showing on storefront RIGHT NOW.
  Check: https://app.datadoghq.com/data-observability/pipelines
  @incident create: "NovaPay Dynamic Pricing Stale" priority:P2
  {{/is_alert}}
Auto-create Incident: yes (add @incident in notification)

─────────────────────────────────────────────────────────────
MONITOR 2: Zero-Price Events (Revenue Loss Detection)
─────────────────────────────────────────────────────────────
Entity: Column → novapay_raw.limited_merch_events.price_thb
Metric: Percent Zero
Detection: Threshold
  Alert:   > 5% (more than 5% of events have ฿0 price)
Name: [NovaPay Demo] Zero-price checkout events detected
Notification:
  {{#is_alert}}
  DATA QUALITY ALERT: {{value}}% of checkout events have price_thb = 0
  Customers may be checking out for FREE. Immediate revenue impact.
  Table: novapay_raw.limited_merch_events
  @incident create: "Zero-Price Checkout Events" priority:P1
  {{/is_alert}}

─────────────────────────────────────────────────────────────
MONITOR 3: Null User IDs (Attribution Loss)
─────────────────────────────────────────────────────────────
Entity: Column → novapay_raw.limited_merch_events.user_id
Metric: Nullness
Detection: Threshold
  Alert:   > 10% null values
Name: [NovaPay Demo] Null user_id in checkout events
Notification:
  {{#is_alert}}
  DATA QUALITY: {{value}}% of checkout events have null user_id.
  Customer attribution broken — loyalty, personalization, and compliance impacted.
  @pagerduty
  {{/is_alert}}

─────────────────────────────────────────────────────────────
MONITOR 4: Raw Events Row Count Drop (Pipeline Failure)
─────────────────────────────────────────────────────────────
Entity: Table → novapay_raw.limited_merch_events
Metric: Row Count
Detection: Anomaly (learns from historical pattern)
Name: [NovaPay Demo] limited_merch_events row count anomaly
Notification:
  {{#is_alert}}
  DATA PIPELINE ALERT: Row count for limited_merch_events is anomalous.
  Observed: {{observed}}, Expected: {{lower_bound}}–{{upper_bound}}
  bq-sink Kafka consumer may have stopped. Check GKE data-pipeline namespace.
  @pagerduty
  {{/is_alert}}

─────────────────────────────────────────────────────────────
INCIDENT AUTOMATION (Workflow Automation)
─────────────────────────────────────────────────────────────
In Datadog: Service Mgmt > Workflow Automation > New Workflow
Trigger: Monitor alert (any of the above)
Action 1: Create Incident
  - Title: "{{monitor.name}}: {{monitor.message}}"
  - Severity: P1 (zero-price) / P2 (freshness)
  - Service: novapay-merch
Action 2: Post to Slack #incidents
  - Message: "Data quality incident created for NovaPay pricing pipeline"
Action 3: Assign to on-call team via PagerDuty

MONITORS
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
  --inject-zero-prices)   inject_zero_prices ;;
  --inject-null-users)    inject_null_users ;;
  --inject-negative-qty)  inject_negative_qty ;;
  --inject-freshness)     inject_freshness ;;
  --inject-row-drop)      inject_row_drop ;;
  --show-bad-data)        show_bad_data ;;
  --fix-all)              fix_all ;;
  --create-monitors)      create_monitors ;;
  --inject-all)
    echo_step "Injecting all data quality issues for full Scenario 4 demo..."
    inject_zero_prices
    inject_null_users
    inject_negative_qty
    inject_freshness
    echo ""
    echo_ok "All data quality issues injected."
    echo "  Run: ./scripts/demo-data-quality.sh --show-bad-data to verify"
    echo "  Run: ./scripts/demo-data-quality.sh --fix-all to restore"
    ;;
  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "Data injection (triggers monitors):"
    echo "  --inject-zero-prices   Insert ฿0 price events (→ Percent Zero monitor)"
    echo "  --inject-null-users    Insert null user_id events (→ Nullness monitor)"
    echo "  --inject-negative-qty  Insert negative qty/price (→ Percent Negative monitor)"
    echo "  --inject-freshness     Fail dbt → stale dynamic_pricing (→ Freshness monitor)"
    echo "  --inject-row-drop      Scale bq-sink to 0 → row count drop (→ Row Count monitor)"
    echo "  --inject-all           Inject all issues at once"
    echo ""
    echo "Inspection & recovery:"
    echo "  --show-bad-data        Query BQ to show current data quality issues"
    echo "  --fix-all              Remove bad data + restore pipeline"
    echo ""
    echo "Monitor setup:"
    echo "  --create-monitors      Print monitor creation instructions for Datadog UI"
    exit 1
    ;;
esac
