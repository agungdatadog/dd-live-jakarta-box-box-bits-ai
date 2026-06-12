#!/usr/bin/env bash
# infra/bigquery/setup.sh
# One-time BigQuery setup for the NovaPay demo pipeline.
# Run from the project root: ./infra/bigquery/setup.sh
#
# Prerequisites:
#   gcloud auth login && gcloud config set project datadog-ese-sandbox
#   bq CLI available (ships with gcloud SDK)

set -euo pipefail

PROJECT="datadog-ese-sandbox"
REGION="asia-southeast1"
SA_NAME="novapay-data-pipeline"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SCHEMA_DIR="$(dirname "$0")/schemas"

echo "=== NovaPay BigQuery Setup ==="
echo "Project : $PROJECT"
echo "Region  : $REGION"
echo ""

# ── Datasets ─────────────────────────────────────────────────────────────────
echo "[1/6] Creating BigQuery datasets..."

bq --project_id="$PROJECT" mk \
  --dataset \
  --location="$REGION" \
  --description="NovaPay raw Kafka events (bq-sink output)" \
  "${PROJECT}:novapay_raw" 2>/dev/null || echo "  novapay_raw already exists, skipping"

bq --project_id="$PROJECT" mk \
  --dataset \
  --location="$REGION" \
  --description="NovaPay analytics (dbt output) — dynamic pricing" \
  "${PROJECT}:novapay_analytics" 2>/dev/null || echo "  novapay_analytics already exists, skipping"

# ── Tables ───────────────────────────────────────────────────────────────────
echo "[2/6] Creating BigQuery tables..."

bq --project_id="$PROJECT" mk \
  --table \
  --description="Raw merch purchase events from Kafka via bq-sink" \
  --time_partitioning_type=DAY \
  --time_partitioning_field=event_ts \
  "${PROJECT}:novapay_raw.limited_merch_events" \
  "${SCHEMA_DIR}/limited_merch_events.json" 2>/dev/null || echo "  limited_merch_events already exists, skipping"

bq --project_id="$PROJECT" mk \
  --table \
  --description="Dynamic pricing output from dbt — queried by the merch API" \
  "${PROJECT}:novapay_analytics.dynamic_pricing" \
  "${SCHEMA_DIR}/dynamic_pricing.json" 2>/dev/null || echo "  dynamic_pricing already exists, skipping"

# ── Service Account ───────────────────────────────────────────────────────────
echo "[3/6] Creating service account ${SA_NAME}..."

gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT" \
  --display-name="NovaPay data pipeline (bq-sink + dbt + Cloud Run)" \
  2>/dev/null || echo "  Service account already exists, skipping"

# ── IAM Bindings ──────────────────────────────────────────────────────────────
echo "[4/6] Granting BigQuery IAM roles..."

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataEditor" \
  --condition=None

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser" \
  --condition=None

# Grant metadataViewer so Datadog GCP integration can read table metadata for freshness
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.metadataViewer" \
  --condition=None

# ── SA Key for Cloud Run (stored in Secret Manager) ──────────────────────────
echo "[5/6] Creating SA key and storing in Secret Manager..."

KEY_FILE="$(dirname "$0")/sa-key.json"

gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"

gcloud secrets create NOVAPAY_BQ_SA_KEY \
  --project="$PROJECT" \
  --replication-policy=automatic \
  --data-file="$KEY_FILE" \
  2>/dev/null || \
  gcloud secrets versions add NOVAPAY_BQ_SA_KEY \
    --project="$PROJECT" \
    --data-file="$KEY_FILE"

echo "  Secret NOVAPAY_BQ_SA_KEY created/updated"
echo "  WARNING: sa-key.json is gitignored — never commit it"

# ── Workload Identity for GKE ─────────────────────────────────────────────────
echo "[6/6] Configuring Workload Identity for GKE service accounts..."

for KSA in bq-sink-ksa dbt-ksa; do
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --project="$PROJECT" \
    --role="roles/iam.workloadIdentityUser" \
    --member="serviceAccount:${PROJECT}.svc.id.goog[data-pipeline/${KSA}]" \
    2>/dev/null || true
done

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Note the Redpanda LoadBalancer IP once deployed, then set REDPANDA_BROKERS in Cloud Run"
echo "  2. Set NOVAPAY_BQ_SA_KEY secret in the Cloud Run service (k8s/cloudrun.yaml)"
echo "  3. Apply GKE manifests: kubectl apply -f infra/gke/"
echo "  4. Seed the dynamic_pricing table with initial data (optional):"
echo "     bq load --source_format=NEWLINE_DELIMITED_JSON \\"
echo "       ${PROJECT}:novapay_analytics.dynamic_pricing \\"
echo "       infra/bigquery/seed/dynamic_pricing_seed.ndjson"
echo ""
