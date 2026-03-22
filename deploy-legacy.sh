#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
SERVICE_TEMPLATE="$ROOT_DIR/service.yaml"
RENDERED_SERVICE_FILE="$ROOT_DIR/.service.rendered.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
  echo "Missing service template: $SERVICE_TEMPLATE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DD_SERVICE="${DD_SERVICE:-$CR_SERVICE_NAME}"
DD_LLMOBS_ML_APP="${DD_LLMOBS_ML_APP:-$CR_SERVICE_NAME}"

required_vars=(
  GCP_PROJECT_ID
  GCP_REGION
  CR_SERVICE_NAME
  ARTIFACT_REPO
  APP_URL
  APPLET_ID
  GEMINI_API_KEY
  NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
  NEXT_PUBLIC_DATADOG_APPLICATION_ID
  NEXT_PUBLIC_DATADOG_SITE
  NEXT_PUBLIC_DATADOG_SERVICE
  NEXT_PUBLIC_DATADOG_ENV
  DD_ENV
  DD_SERVICE
  DD_API_KEY
  DD_APP_KEY
  DD_SITE
  DD_LLMOBS_ML_APP
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Required env var is missing: $var_name" >&2
    exit 1
  fi
done

SERVICE_URL_OVERRIDE="${SERVICE_URL_OVERRIDE:-$APP_URL}"
GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
SHORT_SHA="${SHORT_SHA:-$(git rev-parse --short HEAD)}"
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${CR_SERVICE_NAME}:${SHORT_SHA}"

cleanup() {
  rm -f "$RENDERED_SERVICE_FILE"
}

trap cleanup EXIT

echo "Deploying $CR_SERVICE_NAME to Cloud Run in $GCP_REGION (project: $GCP_PROJECT_ID)"

gcloud config set project "$GCP_PROJECT_ID" >/dev/null

gcloud builds submit "$ROOT_DIR" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --config="$ROOT_DIR/cloudbuild.yaml" \
  --substitutions="_IMAGE_URI=$IMAGE_URI,_NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,_NEXT_PUBLIC_DATADOG_APPLICATION_ID=$NEXT_PUBLIC_DATADOG_APPLICATION_ID,_NEXT_PUBLIC_DATADOG_SITE=$NEXT_PUBLIC_DATADOG_SITE,_NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE,_NEXT_PUBLIC_DATADOG_ENV=$NEXT_PUBLIC_DATADOG_ENV,_NEXT_PUBLIC_DD_VERSION=$SHORT_SHA" \
  --quiet

python3 - <<'PY' "$SERVICE_TEMPLATE" "$RENDERED_SERVICE_FILE" "$CR_SERVICE_NAME" "$IMAGE_URI" "$SERVICE_URL_OVERRIDE" "$APPLET_ID" "$GEMINI_API_KEY" "$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN" "$NEXT_PUBLIC_DATADOG_APPLICATION_ID" "$NEXT_PUBLIC_DATADOG_SITE" "$NEXT_PUBLIC_DATADOG_SERVICE" "$NEXT_PUBLIC_DATADOG_ENV" "$SHORT_SHA" "$DD_ENV" "$DD_SERVICE" "$GIT_SHA" "$DD_API_KEY" "$DD_APP_KEY" "$DD_SITE" "$DD_LLMOBS_ML_APP"
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
keys = [
    "__CR_SERVICE_NAME__",
    "__IMAGE_URI__",
    "__APP_URL__",
    "__APPLET_ID__",
    "__GEMINI_API_KEY__",
    "__NEXT_PUBLIC_DATADOG_CLIENT_TOKEN__",
    "__NEXT_PUBLIC_DATADOG_APPLICATION_ID__",
    "__NEXT_PUBLIC_DATADOG_SITE__",
    "__NEXT_PUBLIC_DATADOG_SERVICE__",
    "__NEXT_PUBLIC_DATADOG_ENV__",
    "__NEXT_PUBLIC_DD_VERSION__",
    "__DD_ENV__",
    "__DD_SERVICE__",
    "__DD_VERSION__",
    "__DD_API_KEY__",
    "__DD_APP_KEY__",
    "__DD_SITE__",
    "__DD_LLMOBS_ML_APP__",
]
values = sys.argv[3:3 + len(keys)]
content = template_path.read_text()
for key, value in zip(keys, values):
    content = content.replace(key, value)
output_path.write_text(content)
PY

gcloud run services replace "$RENDERED_SERVICE_FILE" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --quiet

gcloud run services add-iam-policy-binding "$CR_SERVICE_NAME" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --region="$GCP_REGION" \
  --project="$GCP_PROJECT_ID" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$CR_SERVICE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --region="$GCP_REGION" \
  --format='value(status.url)')"

echo
echo "Deployment complete."
echo "Service URL: $SERVICE_URL"
echo
echo "If you want APP_URL to match the deployed URL exactly, update .env to:"
echo "APP_URL=\"$SERVICE_URL\""
