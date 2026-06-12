#!/usr/bin/env bash
# scripts/build-pipeline-images.sh
# Rebuild and push the data pipeline service images to Artifact Registry.
# Run whenever bq-sink/ or dbt-project/ source code changes.
#
# Usage:
#   ./scripts/build-pipeline-images.sh              # build both
#   ./scripts/build-pipeline-images.sh --bq-sink    # bq-sink only
#   ./scripts/build-pipeline-images.sh --dbt        # dbt only

set -euo pipefail

PROJECT="datadog-ese-sandbox"
REGION="asia-southeast1"
REPO="${REGION}-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy"
MACHINE="e2-highcpu-8"

BQ_SINK_IMAGE="${REPO}/bq-sink:latest"
DBT_IMAGE="${REPO}/novapay-dbt:latest"

BUILD_BQ_SINK=true
BUILD_DBT=true

if [[ "${1:-}" == "--bq-sink" ]]; then BUILD_DBT=false; fi
if [[ "${1:-}" == "--dbt" ]];     then BUILD_BQ_SINK=false; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo_step() { echo -e "\033[1;36m[build-pipeline]\033[0m $*"; }
echo_ok()   { echo -e "\033[1;32m[build-pipeline]\033[0m $*"; }

if $BUILD_BQ_SINK; then
  echo_step "Building bq-sink image..."
  gcloud builds submit \
    --tag "$BQ_SINK_IMAGE" \
    --project "$PROJECT" \
    --region "$REGION" \
    --machine-type "$MACHINE" \
    "$ROOT/bq-sink"
  echo_ok "bq-sink pushed: $BQ_SINK_IMAGE"

  echo_step "Rolling out bq-sink deployment in GKE..."
  kubectl rollout restart deployment/bq-sink -n data-pipeline \
    --context="gke_${PROJECT}_${REGION}-b_nuttee-cluster-1" 2>/dev/null || \
    echo "  Note: kubectl context not set — restart manually if needed"
fi

if $BUILD_DBT; then
  echo_step "Building novapay-dbt image..."
  gcloud builds submit \
    --tag "$DBT_IMAGE" \
    --project "$PROJECT" \
    --region "$REGION" \
    --machine-type "$MACHINE" \
    "$ROOT/dbt-project"
  echo_ok "novapay-dbt pushed: $DBT_IMAGE"

  echo_step "Triggering immediate dbt run to verify..."
  JOB="dbt-manual-$(date +%s)"
  kubectl create job "$JOB" \
    --from=cronjob/dbt-pricing \
    -n data-pipeline \
    --context="gke_${PROJECT}_${REGION}-b_nuttee-cluster-1" 2>/dev/null && \
    echo_ok "Triggered: kubectl logs -l job-name=$JOB -n data-pipeline -f" || \
    echo "  Note: trigger manually with: kubectl create job dbt-manual-\$(date +%s) --from=cronjob/dbt-pricing -n data-pipeline"
fi

echo ""
echo_ok "Done. Images are in ${REPO}/"
echo "  bq-sink : ${BQ_SINK_IMAGE}"
echo "  dbt     : ${DBT_IMAGE}"
