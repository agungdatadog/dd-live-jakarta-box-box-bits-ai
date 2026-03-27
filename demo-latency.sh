#!/usr/bin/env bash
# demo-latency.sh — toggle DEMO_HIGH_LATENCY on the live Cloud Run service
#
# Usage:
#   ./demo-latency.sh on    # gemini-3.1-pro-preview + max thinking + CoT prompt
#   ./demo-latency.sh off   # gemini-3-flash-preview + no thinking (production)
#   ./demo-latency.sh       # show current state
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
fi

SERVICE="${CR_SERVICE_NAME:-box-box-bits-ai}"
REGION="${GCP_REGION:-asia-southeast1}"
PROJECT="${GCP_PROJECT_ID:-datadog-ese-sandbox}"

# ── Helpers ──────────────────────────────────────────────────────────────────

current_value() {
  gcloud run services describe "$SERVICE" \
    --region "$REGION" --project "$PROJECT" \
    --format='value(spec.template.spec.containers[0].env[DEMO_HIGH_LATENCY])' \
    2>/dev/null || echo "unknown"
}

set_value() {
  local val="$1"
  echo "→ Setting DEMO_HIGH_LATENCY=$val on $SERVICE ($REGION) …"
  gcloud run services update "$SERVICE" \
    --update-env-vars "DEMO_HIGH_LATENCY=$val" \
    --region "$REGION" \
    --project "$PROJECT" \
    --quiet
  echo ""
  if [[ "$val" == "true" ]]; then
    echo "✅  HIGH-LATENCY DEMO MODE ON"
    echo "   Model          : gemini-3.1-pro-preview"
    echo "   Thinking budget: 24576 (max)"
    echo "   System prompt  : +5-step CoT prefix"
    echo "   Expected latency: ~20–60 s"
  else
    echo "✅  PRODUCTION MODE (default)"
    echo "   Model          : gemini-3-flash-preview"
    echo "   Thinking budget: 0 (disabled)"
    echo "   Expected latency: ~3–6 s"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

CMD="${1:-status}"

case "$CMD" in
  on)
    set_value "true"
    ;;
  off)
    set_value "false"
    ;;
  status|*)
    VAL=$(current_value)
    echo "DEMO_HIGH_LATENCY = $VAL  (service: $SERVICE, region: $REGION)"
    if [[ "$VAL" == "true" ]]; then
      echo "Mode : HIGH-LATENCY DEMO  (gemini-3.1-pro-preview + max thinking)"
    else
      echo "Mode : PRODUCTION  (gemini-3-flash-preview, fast)"
    fi
    echo ""
    echo "Usage:  ./demo-latency.sh on | off | status"
    ;;
esac
