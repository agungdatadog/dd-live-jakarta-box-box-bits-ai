#!/usr/bin/env bash
# scripts/demo-pipeline.sh
#
# Demo pipeline control for Royal Rumble 2026 — Acts 2 and 3.
#
# Usage:
#   ./scripts/demo-pipeline.sh <command>
#
# Commands:
#   --fail-dbt          Act 2: suspend dbt CronJob + enable broken model
#                       → BigQuery goes stale → freshness monitor fires
#   --fix-dbt           Act 2 recovery: restore dbt + trigger immediate run
#   --error-inject-on   Act 3: inject NullPointerException on THB checkout
#                       → APM error spike → Bits AI investigation
#   --error-inject-off  Act 3 recovery: clear error (simulates Argo rollback)
#   --status            Show current state of all demo controls
#   --reset-all         Reset all demo controls to normal operation

set -euo pipefail

PROJECT="datadog-ese-sandbox"
CLUSTER="nuttee-cluster-1"
ZONE="asia-southeast1-b"
CR_SERVICE="box-box-bits-ai"
REGION="asia-southeast1"
NAMESPACE="data-pipeline"
KUBE_CONTEXT="gke_${PROJECT}_${ZONE}_${CLUSTER}"
# Redpanda Internal LB IP — accessible from Cloud Run via VPC connector (novapay-vpc-connector)
REDPANDA_INTERNAL_IP="10.148.0.65"

echo_step() { echo -e "\033[1;36m[demo-pipeline]\033[0m $*"; }
echo_ok()   { echo -e "\033[1;32m[demo-pipeline]\033[0m $*"; }
echo_warn() { echo -e "\033[1;33m[demo-pipeline]\033[0m $*"; }

case "${1:-}" in

  # ── Act 2: fail dbt ─────────────────────────────────────────────────────────
  --fail-dbt)
    echo_step "Act 2: enabling broken dbt model (CronJob keeps running, every run fails)..."

    # Switch to broken model in ConfigMap — the CronJob keeps firing but each
    # run exits non-zero, creating real FAILED entries in Datadog Data Jobs Monitoring.
    # DO NOT suspend the CronJob: repeated failures are more realistic than silence,
    # and they produce a visible failure-run timeline in Data Jobs Monitoring.
    kubectl --context="$KUBE_CONTEXT" patch configmap dbt-config \
      -n "$NAMESPACE" \
      -p '{"data":{"DBT_FAIL_MODE":"true"}}'
    echo_ok "dbt-config patched: DBT_FAIL_MODE=true"

    # Ensure CronJob is running (unsuspend if it was previously suspended)
    kubectl --context="$KUBE_CONTEXT" patch cronjob dbt-pricing \
      -n "$NAMESPACE" \
      -p '{"spec":{"suspend":false}}'
    echo_ok "dbt-pricing CronJob active (will fire on schedule, each run will FAIL)"

    # Trigger an immediate failure run so Datadog has something to show right away
    FAIL_JOB="dbt-fail-$(date +%s)"
    kubectl --context="$KUBE_CONTEXT" create job "$FAIL_JOB" \
      --from=cronjob/dbt-pricing \
      -n "$NAMESPACE"
    echo_ok "Triggered immediate failing dbt run: $FAIL_JOB"

    echo ""
    echo_warn "Every dbt run will now FAIL (schema mismatch on unit_price column)."
    echo_warn "BigQuery dynamic_pricing will go stale — freshness monitor fires in ~5–15 min."
    echo_warn "Data Jobs Monitoring will show repeated FAILED runs on the novapay-dbt pipeline."
    echo_warn "The merch /api/merch/products will fall back to static prices."
    echo ""
    echo_step "Watch runs:  kubectl get jobs -n $NAMESPACE --context=$KUBE_CONTEXT -w"
    echo_step "Recovery:    ./scripts/demo-pipeline.sh --fix-dbt"
    ;;

  # ── Act 2: fix dbt ──────────────────────────────────────────────────────────
  --fix-dbt)
    echo_step "Act 2 recovery: restoring dbt CronJob + healthy model..."

    # Restore healthy model
    kubectl --context="$KUBE_CONTEXT" patch configmap dbt-config \
      -n "$NAMESPACE" \
      -p '{"data":{"DBT_FAIL_MODE":"false"}}'
    echo_ok "dbt-config patched: DBT_FAIL_MODE=false"

    # Unsuspend CronJob
    kubectl --context="$KUBE_CONTEXT" patch cronjob dbt-pricing \
      -n "$NAMESPACE" \
      -p '{"spec":{"suspend":false}}'
    echo_ok "dbt-pricing CronJob unsuspended"

    # Trigger an immediate run to refresh BigQuery now
    JOB_NAME="dbt-manual-$(date +%s)"
    kubectl --context="$KUBE_CONTEXT" create job "$JOB_NAME" \
      --from=cronjob/dbt-pricing \
      -n "$NAMESPACE"
    echo_ok "Triggered immediate dbt run: $JOB_NAME"

    echo ""
    echo_warn "BigQuery will be refreshed in ~2 minutes (dbt run in progress)."
    echo_step "Monitor: kubectl logs -f job/$JOB_NAME -n $NAMESPACE --context=$KUBE_CONTEXT"
    ;;

  # ── Act 3: inject error ──────────────────────────────────────────────────────
  --error-inject-on)
    echo_step "Act 3: injecting NullPointerException on THB checkout handler..."
    gcloud run services update "$CR_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT" \
      --update-env-vars DEMO_ERROR_INJECT=true \
      --quiet
    echo_ok "DEMO_ERROR_INJECT=true — new Cloud Run revision deploying (~30s)"
    echo ""
    echo_warn "Every POST /api/merch/checkout will now return 500."
    echo_warn "Watch APM: error spike on api.merch.checkout + Bits AI investigation."
    echo_step "Recovery: ./scripts/demo-pipeline.sh --error-inject-off"
    ;;

  # ── Act 3: clear error (= simulates Argo rollback recovery) ─────────────────
  --error-inject-off)
    echo_step "Act 3 recovery: clearing checkout error (simulating Argo rollback)..."
    gcloud run services update "$CR_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT" \
      --update-env-vars DEMO_ERROR_INJECT=false \
      --quiet
    echo_ok "DEMO_ERROR_INJECT=false — new Cloud Run revision deploying (~30s)"
    echo ""
    echo_ok "Checkout is healthy again. APM error rate should drop within 1 minute."
    ;;

  # ── Status ───────────────────────────────────────────────────────────────────
  --status)
    echo_step "Current demo control state:"
    echo ""

    echo "── GKE data-pipeline namespace ──"
    kubectl --context="$KUBE_CONTEXT" get cronjobs,deployments,pods \
      -n "$NAMESPACE" 2>/dev/null || echo "  (kubectl context not configured)"
    echo ""

    echo "── dbt-config ConfigMap ──"
    kubectl --context="$KUBE_CONTEXT" get configmap dbt-config \
      -n "$NAMESPACE" -o jsonpath='{.data}' 2>/dev/null | tr ',' '\n' || echo "  (not found)"
    echo ""

    echo "── Cloud Run env (demo toggles) ──"
    gcloud run services describe "$CR_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT" \
      --format="value(spec.template.spec.containers[0].env)" 2>/dev/null \
      | tr ',' '\n' | grep -E 'DEMO_|REDPANDA_|BQ_' || echo "  (gcloud not configured)"
    ;;

  # ── Reset all ────────────────────────────────────────────────────────────────
  # ── Traffic simulation mode controls ─────────────────────────────────────────
  --traffic-normal)
    echo_step "Traffic sim: normal mode (12 events/min, clean data)"
    kubectl set env deployment/traffic-sim TRAFFIC_MODE=normal DATA_QUALITY_MODE=normal -n data-pipeline > /dev/null
    echo_ok "Traffic sim → normal"
    ;;

  --traffic-burst)
    echo_step "Traffic sim: burst mode (3× rate — simulate Black Friday spike)"
    kubectl set env deployment/traffic-sim TRAFFIC_MODE=burst DATA_QUALITY_MODE=normal -n data-pipeline > /dev/null
    echo_ok "Traffic sim → burst (36 events/min)"
    ;;

  --traffic-off)
    echo_step "Traffic sim: off — pipeline freezes (Kafka lag builds, row count stops)"
    kubectl set env deployment/traffic-sim TRAFFIC_MODE=off -n data-pipeline > /dev/null
    echo_warn "Pipeline will stop receiving events. Row count will plateau in ~15 min."
    echo_warn "Recovery: ./scripts/demo-pipeline.sh --traffic-normal"
    ;;

  # ── Data Quality issue triggers ───────────────────────────────────────────
  --dq-zero-prices)
    echo_step "Data Quality: injecting zero-price events (฿0 pricing bug)"
    kubectl set env deployment/traffic-sim DATA_QUALITY_MODE=zero-prices -n data-pipeline > /dev/null
    echo_ok "DATA_QUALITY_MODE=zero-prices"
    echo_warn "Story: Pricing engine bug sending ฿0 to checkout"
    echo_warn "Datadog: BigQuery 'Percent Zero' monitor on price_thb will fire"
    ;;

  --dq-null-users)
    echo_step "Data Quality: injecting null user_id events (attribution bug)"
    kubectl set env deployment/traffic-sim DATA_QUALITY_MODE=null-users -n data-pipeline > /dev/null
    echo_ok "DATA_QUALITY_MODE=null-users"
    echo_warn "Story: Identity stripping bug — customer attribution broken"
    echo_warn "Datadog: BigQuery 'Nullness' monitor on user_id will fire"
    ;;

  --dq-negative-qty)
    echo_step "Data Quality: injecting negative quantity events (refund bug)"
    kubectl set env deployment/traffic-sim DATA_QUALITY_MODE=negative-qty -n data-pipeline > /dev/null
    echo_ok "DATA_QUALITY_MODE=negative-qty"
    echo_warn "Story: Refund processing bug corrupting the raw events table"
    echo_warn "Datadog: BigQuery 'Percent Negative' monitor will fire"
    ;;

  --dq-drop-payload)
    echo_step "Data Quality: corrupt payload mode (row count stops growing)"
    kubectl set env deployment/traffic-sim DATA_QUALITY_MODE=drop-payload -n data-pipeline > /dev/null
    echo_ok "DATA_QUALITY_MODE=drop-payload"
    echo_warn "Story: Bad data format bug — events publish to Kafka but bq-sink drops them"
    echo_warn "Datadog: BigQuery 'Row Count Anomaly' monitor will fire (~15 min)"
    echo_warn "Also shows as Kafka consumer lag in Data Streams Monitoring"
    ;;

  --dq-normal)
    echo_step "Data Quality: resetting to normal clean events"
    kubectl set env deployment/traffic-sim DATA_QUALITY_MODE=normal TRAFFIC_MODE=normal -n data-pipeline > /dev/null
    echo_ok "DATA_QUALITY_MODE=normal TRAFFIC_MODE=normal"
    ;;

  --dq-status)
    echo_step "Traffic sim current config:"
    kubectl get configmap traffic-sim-config \
      -n data-pipeline -o jsonpath='{.data}' 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k in ['TRAFFIC_MODE','TRAFFIC_RATE','DATA_QUALITY_MODE','HOT_PRODUCTS']:
    print(f'  {k}: {d.get(k,\"(not set)\")}')
" 2>/dev/null || echo "  (ConfigMap not found)"
    echo ""
    echo_step "Live pod env (overrides from kubectl set env):"
    kubectl exec -n data-pipeline \
      $(kubectl get pod -n data-pipeline -l app=traffic-sim -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) \
      -- env 2>/dev/null | grep -E "TRAFFIC|DATA_QUALITY|HOT_PRODUCTS" | sed "s/^/  /" || echo "  (pod not running)"
    ;;

  --reset-all)
    echo_step "Resetting all demo controls to normal operation..."

    kubectl --context="$KUBE_CONTEXT" patch configmap dbt-config \
      -n "$NAMESPACE" -p '{"data":{"DBT_FAIL_MODE":"false"}}' 2>/dev/null || true
    kubectl --context="$KUBE_CONTEXT" patch cronjob dbt-pricing \
      -n "$NAMESPACE" -p '{"spec":{"suspend":false}}' 2>/dev/null || true
    kubectl set env deployment/traffic-sim \
      TRAFFIC_MODE=normal DATA_QUALITY_MODE=normal \
      -n "$NAMESPACE" 2>/dev/null || true
    gcloud run services update "$CR_SERVICE" \
      --region="$REGION" --project="$PROJECT" \
      --update-env-vars DEMO_ERROR_INJECT=false \
      --quiet 2>/dev/null || true

    # Trigger an immediate healthy dbt run to refresh BigQuery quickly
    RESET_JOB="dbt-reset-$(date +%s)"
    kubectl --context="$KUBE_CONTEXT" create job "$RESET_JOB" \
      --from=cronjob/dbt-pricing -n "$NAMESPACE" 2>/dev/null || true
    echo_ok "All demo controls reset. Triggered dbt refresh: $RESET_JOB"
    ;;

  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  --fail-dbt          Act 2: trigger dbt failure → stale BigQuery pricing"
    echo "  --fix-dbt           Act 2: restore dbt → refresh BigQuery pricing"
    echo "  --error-inject-on   Act 3: inject checkout NullPointerException"
    echo "  --error-inject-off  Act 3: clear checkout error"
    echo "  --status            Show current state of all demo controls"
    echo "  --reset-all         Reset everything to normal"
    echo ""
    echo "Traffic simulation (long-running pod in GKE):"
    echo "  --traffic-normal    Normal rate 12 events/min, clean data (default)"
    echo "  --traffic-burst     3× rate — simulate Black Friday spike"
    echo "  --traffic-off       Pause all traffic (pipeline freezes)"
    echo "  --dq-status         Show current traffic-sim config"
    echo ""
    echo "Data Quality issue modes (changes EVENT content, not dbt):"
    echo "  --dq-zero-prices    ฿0 price bug → BigQuery Percent Zero monitor"
    echo "  --dq-null-users     null user_id → BigQuery Nullness monitor"
    echo "  --dq-negative-qty   negative qty/price → Percent Negative monitor"
    echo "  --dq-drop-payload   corrupt payload → row count stops → Row Count anomaly"
    echo "  --dq-normal         Reset data quality back to normal clean events"
    exit 1
    ;;
esac
