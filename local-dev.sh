#!/usr/bin/env bash
# local-dev.sh — build and run the production container locally via Skaffold.
#
# Usage:
#   ./local-dev.sh           # build once, run container, Ctrl+C to stop
#   ./local-dev.sh --watch   # rebuild automatically on file changes (skaffold dev)
#
# The app will be available at http://localhost:8080
# Logs stream directly to the terminal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer .env.local for local overrides, fall back to .env
ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    ENV_FILE="$ROOT_DIR/.env.local"
    echo "Using $ENV_FILE"
  else
    ENV_FILE="$ROOT_DIR/.env"
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Local overrides — always use dev settings when running locally
export APP_URL="http://localhost:8080"
export DD_ENV="dev"
export NEXT_PUBLIC_DATADOG_ENV="dev"
export NEXT_PUBLIC_DD_VERSION="local"
export DD_PROFILING_ENABLED="false"
export DD_SERVICE="${DD_SERVICE:-box-box-bits-ai}"
export DD_LLMOBS_ML_APP="${DD_LLMOBS_ML_APP:-box-box-bits-ai}"

echo "Starting box-box-bits-ai locally (profile: local)"
echo "  ENV file : $ENV_FILE"
echo "  APP_URL  : $APP_URL"
echo "  DD_ENV   : $DD_ENV"
echo ""

if [[ "${1:-}" == "--watch" ]]; then
  # skaffold dev: watch for file changes and auto-rebuild
  exec skaffold dev --profile=local --port-forward
else
  # skaffold run: build once, run, stream logs until Ctrl+C
  exec skaffold run --profile=local --port-forward --tail
fi
