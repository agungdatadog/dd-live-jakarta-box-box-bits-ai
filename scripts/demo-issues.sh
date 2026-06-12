#!/usr/bin/env bash
# scripts/demo-issues.sh
#
# Controls the three demo scenarios for Royal Rumble 2026:
#
#   SCENARIO 1 — Bits AI Agentic Investigation (Infrastructure)
#     --k8s-oom-inject   Reduce bq-sink memory to 64Mi → triggers OOMKilled
#     --k8s-oom-fix      Restore bq-sink to 256Mi (simulates Bits AI PR merged)
#     --k8s-status       Show current bq-sink pod status
#
#   SCENARIO 2 — Deployment Gates + Feature Flags
#     --deploy-bad       Deploy Cloud Run with DEMO_ERROR_INJECT=true (bad version)
#     --deploy-good      Deploy Cloud Run with DEMO_ERROR_INJECT=false (rollback)
#     --ff-canary-on     Set 'new-pitwall-ui' feature flag to canary (10% rollout)
#     --ff-canary-full   Roll out 'new-pitwall-ui' to 100%
#     --ff-canary-off    Roll back 'new-pitwall-ui' feature flag to false
#
#   SCENARIO 3 — Shift Left Security (informational — PR Gates configured in Datadog UI)
#     --show-sa-findings Show Static Analysis findings on current code
#     --create-sec-pr    Create a demo/security-issues branch with SAST/SCA/Secret issues
#     --cleanup-sec-pr   Delete the demo/security-issues branch

set -euo pipefail

PROJECT="datadog-ese-sandbox"
CLUSTER="nuttee-cluster-1"
ZONE="asia-southeast1-b"
CR_SERVICE="box-box-bits-ai"
REGION="asia-southeast1"
NAMESPACE="data-pipeline"
KUBE_CTX="gke_${PROJECT}_${ZONE}_${CLUSTER}"

echo_step() { echo -e "\033[1;36m[demo-issues]\033[0m $*"; }
echo_ok()   { echo -e "\033[1;32m[demo-issues]\033[0m $*"; }
echo_warn() { echo -e "\033[1;33m[demo-issues]\033[0m $*"; }

case "${1:-}" in

  # ── SCENARIO 1: Bits AI — K8s OOMKilled ────────────────────────────────────
  --k8s-oom-inject)
    echo_step "Scenario 1: Injecting OOMKilled on bq-sink (memory limit → 64Mi)..."
    kubectl --context="$KUBE_CTX" apply \
      -f infra/gke/bq-sink/deployment-oom-demo.yaml

    echo_ok "OOM deployment applied. Pod will OOMKill when processing Kafka messages."
    echo ""
    echo_warn "DEMO FLOW:"
    echo "  1. Watch pod restart: kubectl get pods -n $NAMESPACE -w"
    echo "  2. In Datadog: Monitors → K8s pod restart alert fires"
    echo "  3. Bits AI auto-investigates → finds OOMKilled in events + metrics"
    echo "  4. Bits AI RCA: 'Container memory limit (64Mi) too low for Avro + BigQuery'"
    echo "  5. Bits Code: creates PR to update deployment.yaml memory to 256Mi"
    echo ""
    echo_step "Generating Kafka load to trigger OOM quickly..."
    python3 scripts/demo-traffic.py --scenario race-day --delay-ms 50 > /dev/null 2>&1 &
    echo_ok "Load generator running in background."
    ;;

  --k8s-oom-fix)
    echo_step "Scenario 1 recovery: Restoring bq-sink memory to 256Mi (Bits AI PR merged)..."
    kubectl --context="$KUBE_CTX" apply \
      -f infra/gke/bq-sink/deployment.yaml
    kubectl --context="$KUBE_CTX" rollout restart deployment/bq-sink -n "$NAMESPACE"
    kubectl --context="$KUBE_CTX" rollout status deployment/bq-sink -n "$NAMESPACE" --timeout=60s
    echo_ok "bq-sink restored. Memory: requests=128Mi, limits=256Mi"
    ;;

  --k8s-status)
    kubectl --context="$KUBE_CTX" get pods -n "$NAMESPACE" -o wide
    echo ""
    kubectl --context="$KUBE_CTX" describe pod \
      $(kubectl --context="$KUBE_CTX" get pods -n "$NAMESPACE" -l app=bq-sink \
        -o jsonpath='{.items[0].metadata.name}') -n "$NAMESPACE" 2>/dev/null | \
      grep -A 10 "OOM\|Memory\|Limits\|Restart\|Last State" | head -25
    ;;

  # ── SCENARIO 2a: Deployment Gate — Bad Deploy ──────────────────────────────
  --deploy-bad)
    # ── Generate a versioned "bad deploy" tag ─────────────────────────────
    BAD_VERSION="bad-deploy-$(date +%Y%m%d-%H%M%S)"
    DEPLOY_START=$(date +%s)

    echo_step "Scenario 2: Deploying bad version with Deployment Gate watch..."
    echo ""
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║  DEMO_ERROR_INJECT = true  (every checkout → HTTP 500)  ║"
    printf "  ║  DD_VERSION        = %-36s║\n" "$BAD_VERSION"
    printf "  ║  Service           = %-36s║\n" "$CR_SERVICE"
    echo "  ║  Environment       = prod                                ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo ""

    # ── Load API keys from Secret Manager ─────────────────────────────────
    DD_API_KEY=$(gcloud secrets versions access latest \
      --secret=NUTTEE_DD_API_KEY --project="$PROJECT" 2>/dev/null)
    DD_APP_KEY=$(gcloud secrets versions access latest \
      --secret=NUTTEE_DD_APP_KEY --project="$PROJECT" 2>/dev/null)

    # ── Deploy bad version to Cloud Run ───────────────────────────────────
    echo_step "[1/4] Deploying bad revision to Cloud Run..."
    gcloud run services update "$CR_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT" \
      --update-env-vars "DEMO_ERROR_INJECT=true,DD_VERSION=$BAD_VERSION" \
      --quiet 2>&1 | grep -E "Done|Routing|revision|Service URL"

    NEW_REVISION=$(gcloud run services describe "$CR_SERVICE" \
      --region="$REGION" --project="$PROJECT" \
      --format='value(status.latestReadyRevisionName)' 2>/dev/null)
    echo_ok "  Revision: $NEW_REVISION"
    echo_ok "  Version:  $BAD_VERSION"
    echo ""

    # ── Mark deployment in Datadog DORA Metrics ────────────────────────────
    echo_step "[2/4] Marking deployment in Datadog (DORA + CD Visibility)..."
    if [ -n "$DD_API_KEY" ]; then
      DD_API_KEY="$DD_API_KEY" DD_APP_KEY="$DD_APP_KEY" DD_SITE="datadoghq.com" \
        datadog-ci dora deployment \
          --service "$CR_SERVICE" \
          --env prod \
          --version "$BAD_VERSION" \
          --started-at "$DEPLOY_START" \
          --finished-at "$(date +%s)" \
          --git-commit-sha "$(git -C . rev-parse HEAD 2>/dev/null || echo 'unknown')" \
          2>&1 | grep -v "^$" | grep -v "^⚠️\|^Assuming" | head -5
      echo_ok "  Deployment event sent. Datadog now tracking version: $BAD_VERSION"
    else
      echo_warn "  DD_API_KEY not found — skipping DORA mark"
    fi
    echo ""

    # ── Watch rollout: probe checkout until 500s are live ─────────────────
    echo_step "[3/4] Watching rollout — probing checkout endpoint..."
    CONFIRMED=false
    for attempt in $(seq 1 8); do
      # Use -s (no -f) so curl doesn't fail on 4xx/5xx — we want the status code
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "https://box-box-bits-ai-449012790678.asia-southeast1.run.app/api/merch/checkout" \
        -H "Content-Type: application/json" \
        -d "{\"product_id\":\"rb-cap-001\",\"quantity\":1,\"user_id\":\"gate-probe\",\"price_thb\":1290}" \
        --max-time 10 2>/dev/null)
      if [ "$STATUS" = "500" ]; then
        echo_ok "  ✓ Probe $attempt → HTTP 500 confirmed — bad deploy is LIVE"
        echo_ok "    Errors are flowing to Datadog APM (version:$BAD_VERSION)"
        CONFIRMED=true
        break
      else
        printf "  ⏳ Probe %d → HTTP %s (waiting for new revision...)\n" "$attempt" "$STATUS"
        sleep 5
      fi
    done
    if [ "$CONFIRMED" = "false" ]; then
      echo_warn "  Could not confirm 500s after 40s — revision may still be routing. Check manually."
    fi
    echo ""

    # ── Run Synthetics Gate — shows tests failing in CLI ──────────────────
    echo_step "[4/4] Running Synthetics Gate (tests tagged service:$CR_SERVICE env:prod)..."
    echo "  Tests: fum-v3s-b8r (Checkout Gate), zgp-czb-usw (Bad Deploy Detector)"
    echo ""
    SYNTH_EXIT=0
    if [ -n "$DD_API_KEY" ]; then
      DD_API_KEY="$DD_API_KEY" DD_APP_KEY="$DD_APP_KEY" DD_SITE="datadoghq.com" \
        datadog-ci synthetics run-tests \
          --search "tag:service:$CR_SERVICE AND tag:env:prod AND tag:scenario:deployment-gates" \
          --batchTimeout 120000 \
          --failOnCriticalErrors \
          2>&1
      SYNTH_EXIT=$?
    else
      echo_warn "  DD_API_KEY not found — skipping Synthetics run"
    fi

    # ── Deployment Gate API check (polls Datadog gate policy if configured) ─
    GATE_EXIT=0
    if [ -n "$DD_API_KEY" ]; then
      echo ""
      echo_step "  Checking Deployment Gate policy (service:$CR_SERVICE env:prod version:$BAD_VERSION)..."
      GATE_RESP=$(curl -sf -X POST \
        "https://api.datadoghq.com/api/v2/deployments/gates/evaluation" \
        -H "DD-API-KEY: $DD_API_KEY" \
        -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"data\":{\"type\":\"deployment_gates_evaluation_request\",\"attributes\":{\"service\":\"$CR_SERVICE\",\"env\":\"prod\",\"version\":\"$BAD_VERSION\"}}}" \
        2>/dev/null)
      EVAL_ID=$(echo "$GATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['attributes']['evaluation_id'])" 2>/dev/null)

      if [ -n "$EVAL_ID" ]; then
        echo_ok "  Gate evaluation started: $EVAL_ID"
        echo "  Polling for result (up to 5 min)..."
        for i in $(seq 1 20); do
          sleep 15
          POLL=$(curl -sf \
            "https://api.datadoghq.com/api/v2/deployments/gates/evaluation/$EVAL_ID" \
            -H "DD-API-KEY: $DD_API_KEY" \
            -H "DD-APPLICATION-KEY: $DD_APP_KEY" 2>/dev/null)
          STATUS=$(echo "$POLL" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['attributes']['gate_status'])" 2>/dev/null)
          printf "  [%ds] Gate status: %s\n" $((i * 15)) "$STATUS"
          if [ "$STATUS" = "pass" ]; then
            echo_ok "  ✓ Gate PASSED"
            break
          elif [ "$STATUS" = "fail" ]; then
            echo_warn "  ✗ Gate FAILED"
            GATE_EXIT=1
            break
          fi
        done
      else
        echo_warn "  No Deployment Gate configured for service:$CR_SERVICE env:prod"
        echo_warn "  → Create one at: https://app.datadoghq.com/ci/deployment-gates"
        echo_warn "    Rule: Monitor search query = tag:scenario:deployment-gates tag:env:prod"
      fi
    fi

    # ── Result summary ─────────────────────────────────────────────────────
    echo ""
    if [ "$SYNTH_EXIT" -ne 0 ] || [ "$GATE_EXIT" -ne 0 ]; then
      echo "  ╔══════════════════════════════════════════════════════════════╗"
      echo "  ║  🚨 DEPLOY BLOCKED — Synthetics or Deployment Gate FAILED   ║"
      printf "  ║  Revision: %-48s║\n" "$NEW_REVISION"
      printf "  ║  Version:  %-48s║\n" "$BAD_VERSION"
      echo "  ║                                                              ║"
      echo "  ║  ROLLBACK COMMAND:                                           ║"
      echo "  ║    ./scripts/demo-issues.sh --deploy-good                    ║"
      echo "  ╚══════════════════════════════════════════════════════════════╝"
    else
      echo_warn "Synthetics / Gate did not block (Synthetics may need 1 min to fire)."
      echo ""
      echo_warn "DEMO: show in Datadog now:"
      echo "  APM  → https://app.datadoghq.com/apm/services/box-box-bits-ai"
      echo "         error spike on POST /api/merch/checkout  version:$BAD_VERSION"
      echo "  Synth→ https://app.datadoghq.com/synthetics/details/fum-v3s-b8r"
      echo "         fum-v3s-b8r (Checkout Gate) → FAIL"
      echo "  Gate → https://app.datadoghq.com/ci/deployment-gates"
      echo "         $CR_SERVICE / prod → BLOCKED"
      echo ""
      echo_step "ROLLBACK: ./scripts/demo-issues.sh --deploy-good"
    fi
    ;;

  --deploy-good)
    echo_step "Scenario 2 recovery: Rolling back to good version (DEMO_ERROR_INJECT=false)..."
    gcloud run services update "$CR_SERVICE" \
      --region="$REGION" \
      --project="$PROJECT" \
      --update-env-vars DEMO_ERROR_INJECT=false \
      --quiet 2>&1 | tail -3
    echo_ok "Rollback complete. Checkout API healthy again."
    echo_ok "APM error rate should drop within 1–2 minutes."
    ;;

  # ── SCENARIO 2b: Feature Flags Canary ─────────────────────────────────────
  --ff-canary-on)
    echo_step "Scenario 2b: Enabling 'new-pitwall-ui' canary via Datadog Feature Flags..."
    echo ""
    echo_warn "Manual step required — open Datadog Feature Flags UI:"
    echo ""
    echo "  1. Go to: https://app.datadoghq.com/feature-flags"
    echo "  2. Find flag: 'new-pitwall-ui'"
    echo "  3. Click Edit → add a 'Percentage' targeting rule:"
    echo "     - Rollout: 10% of users (by user ID)"
    echo "     - Variant: true"
    echo "  4. Save → Datadog Remote Config pushes to agents within 30s"
    echo ""
    echo_warn "In the app: 10% of users see the new Pitwall UI."
    echo_warn "RUM tracks the flag exposure automatically (enableFlagEvaluationTracking=true)."
    echo ""
    echo_step "Monitoring the canary in Datadog:"
    echo "  - RUM → Sessions → filter by feature_flag.new-pitwall-ui=true"
    echo "  - APM → compare error rates between flag-on and flag-off users"
    echo "  - Feature Flags → Insights tab shows conversion + error rate per variant"
    ;;

  --ff-canary-full)
    echo_step "Scenario 2b: Rolling 'new-pitwall-ui' to 100%..."
    echo ""
    echo_warn "Manual step — Datadog Feature Flags UI:"
    echo "  1. Find flag: 'new-pitwall-ui' → Edit"
    echo "  2. Change rollout percentage to 100%"
    echo "  3. Save → all users now see the new UI"
    ;;

  --ff-canary-off)
    echo_step "Scenario 2b: Rolling back 'new-pitwall-ui' feature flag..."
    echo ""
    echo_warn "Manual step — Datadog Feature Flags UI:"
    echo "  1. Find flag: 'new-pitwall-ui' → Edit"
    echo "  2. Remove the percentage targeting rule (or set to 0%)"
    echo "  3. Save → flag reverts to default=false for all users"
    echo_ok "Feature flag rolled back. Zero downtime — no deploy needed."
    ;;

  # ── SCENARIO 3: Shift Left Security ─────────────────────────────────────────
  --show-sa-findings)
    echo_step "Scenario 3: Running Datadog Static Analysis locally (preview findings)..."
    if command -v datadog-ci >/dev/null 2>&1; then
      datadog-ci sarif upload \
        --service box-box-bits-ai \
        --env ci \
        --dry-run 2>&1 | head -20 || true
    else
      echo_warn "datadog-ci not installed. Findings shown in GitHub Actions on next push."
      echo_warn "Install: npm install -g @datadog/datadog-ci"
    fi
    ;;

  --create-sec-pr)
    echo_step "Scenario 3: Setting up demo/security-issues branch for PR Gates demo..."
    echo ""
    echo_warn "This branch contains intentional vulnerabilities:"
    echo "  - SAST: SQL injection (Critical) — app/api/demo/search/route.ts"
    echo "  - Secret Scanning: hardcoded API key (Critical)"
    echo ""

    # Ensure we're on the right branch
    CURRENT=$(git -C . branch --show-current)
    if [ "$CURRENT" != "demo/security-issues" ]; then
      git -C . checkout -b demo/security-issues 2>/dev/null || git -C . checkout demo/security-issues
    fi

    # Stage and commit the vulnerable file if not already committed
    if [ -f "app/api/demo/search/route.ts" ]; then
      if git -C . diff --name-only main...HEAD 2>/dev/null | grep -q "app/api/demo/search/route.ts" || \
         git -C . log main..HEAD --oneline -- app/api/demo/search/route.ts 2>/dev/null | grep -q .; then
        echo_ok "Vulnerable file already committed on this branch."
      else
        git -C . add app/api/demo/search/route.ts
        git -C . commit -m "demo(security): add intentional SAST/Secret vulnerabilities for PR Gates demo

Intentional issues for Datadog PR Gates demonstration:
- SQL injection vulnerability (SAST Critical)
- Hardcoded API key pattern (Secret Scanning Critical)

FOR DEMO PURPOSES ONLY — DO NOT merge to main."
        echo_ok "Vulnerable file committed."
      fi
    else
      echo_warn "app/api/demo/search/route.ts not found. Creating..."
      mkdir -p app/api/demo/search
      cat > app/api/demo/search/route.ts << 'VULN'
// DEMO ONLY — intentional SAST/Secret vulnerabilities for PR Gates demo
import { NextResponse } from 'next/server';

// VULNERABILITY: Hardcoded API key (Secret Scanning — Critical)
const PAYMENT_API_KEY = 'sk_live_4xKj8mNpQrStUvWxYzAb2CdEfGhIjKlMnOpQr';

// VULNERABILITY: SQL Injection (SAST — Critical)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('id');
  // INSECURE: direct string interpolation of user input
  const query = `SELECT * FROM products WHERE id = '${productId}'`;
  console.log(`Executing: ${query}`);
  return NextResponse.json({ demo: true, query_preview: query.substring(0, 30) });
}
VULN
      git -C . add app/api/demo/search/route.ts
      git -C . commit -m "demo(security): add intentional SAST/Secret vulnerabilities for PR Gates demo"
    fi

    # Push the branch
    git -C . push origin demo/security-issues 2>&1
    echo ""
    echo_ok "Branch pushed: demo/security-issues"
    echo ""
    echo_warn "DEMO FLOW — open PR now:"
    echo "  PR URL: https://github.com/DataDog/dd-live-bkk-box-box-bits-ai/compare/main...demo/security-issues"
    echo ""
    echo "  After pushing, the GitHub Actions static-analysis.yml runs and:"
    echo "  ❌ Datadog PR Gates check: SQL injection (Critical) — BLOCKS merge"
    echo "  ❌ Datadog PR Gates check: Secret detected — BLOCKS merge"
    echo ""
    echo "  In Datadog:"
    echo "  • Software Delivery → Code Analysis → PR tab: shows violations"
    echo "  • Click 'Fix with Bits Code' on the SQL injection finding"
    echo "  • Bits Code opens a GitHub PR with the fix"
    ;;

  --cleanup-sec-pr)
    echo_step "Cleaning up demo/security-issues branch..."
    git -C . checkout main 2>/dev/null || git -C . checkout -
    git -C . branch -D demo/security-issues 2>/dev/null || true
    git -C . push origin --delete demo/security-issues 2>/dev/null || true
    echo_ok "Branch deleted."
    ;;

  # ── Help ───────────────────────────────────────────────────────────────────
  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "SCENARIO 1 — Bits AI Agentic Investigation (Kubernetes OOMKilled)"
    echo "  --k8s-oom-inject   Inject OOMKilled on bq-sink (64Mi limit)"
    echo "  --k8s-oom-fix      Restore bq-sink memory (256Mi) — simulates PR fix"
    echo "  --k8s-status       Show pod status"
    echo ""
    echo "SCENARIO 2 — Deployment Gates + Feature Flags"
    echo "  --deploy-bad       Deploy broken version (triggers APM error spike)"
    echo "  --deploy-good      Roll back to good version"
    echo "  --ff-canary-on     Instructions: enable 10% canary for new-pitwall-ui"
    echo "  --ff-canary-full   Instructions: promote canary to 100%"
    echo "  --ff-canary-off    Instructions: roll back feature flag"
    echo ""
    echo "SCENARIO 3 — Shift Left Security (PR Gates)"
    echo "  --create-sec-pr    Create demo/security-issues branch with SAST/SCA issues"
    echo "  --show-sa-findings Show static analysis findings preview"
    echo "  --cleanup-sec-pr   Delete the demo branch"
    exit 1
    ;;
esac
