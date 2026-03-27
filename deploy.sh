#!/usr/bin/env bash
# deploy.sh — build and deploy to Cloud Run via Skaffold
# Usage: ./deploy.sh [--no-iam]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
K8S_MANIFEST="$ROOT_DIR/k8s/cloudrun.yaml"

# ── 1. Load env ──────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DD_SERVICE="${DD_SERVICE:-$CR_SERVICE_NAME}"
DD_LLMOBS_ML_APP="${DD_LLMOBS_ML_APP:-$CR_SERVICE_NAME}"

required_vars=(
  GCP_PROJECT_ID GCP_REGION CR_SERVICE_NAME ARTIFACT_REPO
  APP_URL APPLET_ID GEMINI_API_KEY
  NEXT_PUBLIC_DATADOG_CLIENT_TOKEN NEXT_PUBLIC_DATADOG_APPLICATION_ID
  NEXT_PUBLIC_DATADOG_SITE NEXT_PUBLIC_DATADOG_SERVICE NEXT_PUBLIC_DATADOG_ENV
  DD_ENV DD_SERVICE DD_API_KEY DD_APP_KEY DD_SITE DD_LLMOBS_ML_APP
)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Required env var missing: $var" >&2
    exit 1
  fi
done

GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
SHORT_SHA="${SHORT_SHA:-$(git rev-parse --short HEAD)}"
export NEXT_PUBLIC_DD_VERSION="$SHORT_SHA"

# ── 2. Regenerate k8s/cloudrun.yaml with current env values ──────────────────
mkdir -p "$ROOT_DIR/k8s"

cat > "$K8S_MANIFEST" <<MANIFEST
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${CR_SERVICE_NAME}
  labels:
    service: ${CR_SERVICE_NAME}
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      labels:
        service: ${CR_SERVICE_NAME}
      annotations:
        autoscaling.knative.dev/maxScale: "30"
        autoscaling.knative.dev/minScale: "10"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      containers:
        - name: app
          image: asia-southeast1-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${CR_SERVICE_NAME}
          ports:
            - name: http1
              containerPort: 8080
          resources:
            limits:
              cpu: "1"
              memory: 1Gi
          startupProbe:
            failureThreshold: 3
            periodSeconds: 240
            tcpSocket:
              port: 8080
            timeoutSeconds: 240
          env:
            - name: APP_URL
              value: "${APP_URL}"
            - name: APPLET_ID
              value: "${APPLET_ID}"
            - name: NEXT_PUBLIC_APPLET_ID
              value: "${APPLET_ID}"
            - name: GEMINI_API_KEY
              value: "${GEMINI_API_KEY}"
            - name: NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
              value: "${NEXT_PUBLIC_DATADOG_CLIENT_TOKEN}"
            - name: NEXT_PUBLIC_DATADOG_APPLICATION_ID
              value: "${NEXT_PUBLIC_DATADOG_APPLICATION_ID}"
            - name: NEXT_PUBLIC_DATADOG_SITE
              value: "${NEXT_PUBLIC_DATADOG_SITE}"
            - name: NEXT_PUBLIC_DATADOG_SERVICE
              value: "${NEXT_PUBLIC_DATADOG_SERVICE}"
            - name: NEXT_PUBLIC_DATADOG_ENV
              value: "${NEXT_PUBLIC_DATADOG_ENV}"
            - name: NEXT_PUBLIC_DD_VERSION
              value: "${SHORT_SHA}"
            - name: DD_API_KEY
              value: "${DD_API_KEY}"
            - name: DD_SITE
              value: "${DD_SITE}"
            - name: DD_SERVICE
              value: "${DD_SERVICE}"
            - name: DD_ENV
              value: "${DD_ENV}"
            - name: DD_VERSION
              value: "${GIT_SHA}"
            - name: DD_LOGS_ENABLED
              value: "true"
            - name: DD_LOGS_INJECTION
              value: "true"
            - name: DD_SOURCE
              value: "nodejs"
            - name: DD_LLMOBS_ENABLED
              value: "1"
            - name: DD_LLMOBS_ML_APP
              value: "${DD_LLMOBS_ML_APP}"
            # AI Guard
            - name: DD_TRACE_ENABLED
              value: "true"
            - name: DD_APP_KEY
              value: "${DD_APP_KEY}"
            - name: DD_AI_GUARD_ENABLED
              value: "true"
            - name: DD_AI_GUARD_BLOCK
              value: "${DD_AI_GUARD_BLOCK:-false}"
  traffic:
    - latestRevision: true
      percent: 100
MANIFEST

echo "Generated $K8S_MANIFEST"

# ── 3. Authenticate Docker with Artifact Registry ────────────────────────────
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

# ── 4. Run Skaffold (build via Cloud Build, deploy via Cloud Run API) ─────────
echo "Deploying ${CR_SERVICE_NAME} via Skaffold to Cloud Run (${GCP_REGION}, project: ${GCP_PROJECT_ID})"

skaffold run \
  --profile=prod \
  --default-repo="asia-southeast1-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}" \
  --build-concurrency=1 \
  2>&1

# ── 5. Make service publicly accessible ──────────────────────────────────────
if [[ "${1:-}" != "--no-iam" ]]; then
  gcloud run services add-iam-policy-binding "$CR_SERVICE_NAME" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" \
    --quiet
fi

# ── 6. Report result ──────────────────────────────────────────────────────────
SERVICE_URL="$(gcloud run services describe "$CR_SERVICE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --format='value(status.url)')"

REVISION="$(gcloud run services describe "$CR_SERVICE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --format='value(status.latestReadyRevisionName)')"

echo
echo "Deployment complete."
echo "  Service URL : $SERVICE_URL"
echo "  Revision    : $REVISION"
echo "  Image tag   : ${SHORT_SHA}"
