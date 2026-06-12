#!/bin/sh
# dbt-project/entrypoint.sh
# Runs dbt via the OpenLineage wrapper (dbt-ol) so every run, test, and model
# is tracked in Datadog Data Observability (job runs, lineage, test results).
#
# Docs: https://docs.datadoghq.com/data_observability/jobs_monitoring/dbt/?tab=dbtcore
#
# DBT_FAIL_MODE=true → runs the broken model to trigger the Act 2 demo failure.

set -e

DBT_FAIL_MODE="${DBT_FAIL_MODE:-false}"
DD_SITE="${DD_SITE:-datadoghq.com}"
OPENLINEAGE_NAMESPACE="${OPENLINEAGE_NAMESPACE:-prod}"
JOB_NAME="${DBT_JOB_NAME:-novapay-dynamic-pricing}"

# Required by openlineage-dbt transport
export OPENLINEAGE__TRANSPORT__TYPE=datadog
export DD_SITE
export OPENLINEAGE_NAMESPACE

echo "[dbt entrypoint] DBT_FAIL_MODE=${DBT_FAIL_MODE} job=${JOB_NAME} namespace=${OPENLINEAGE_NAMESPACE}"

# Install dbt packages if not already cached in the image
if [ ! -d "dbt_packages" ]; then
  echo "[dbt entrypoint] Installing dbt packages..."
  dbt deps --profiles-dir .
fi

if [ "$DBT_FAIL_MODE" = "true" ]; then
  echo "[dbt entrypoint] Running BROKEN model (schema mismatch — Act 2 demo failure)"
  # dbt-ol reports the failure to Datadog Data Observability with full lineage context
  dbt-ol run \
    --select dynamic_pricing_broken \
    --profiles-dir . \
    --consume-structured-logs \
    --openlineage-dbt-job-name "${JOB_NAME}" \
    2>&1
  EXIT_CODE=$?
else
  echo "[dbt entrypoint] Running healthy dynamic_pricing model"
  dbt-ol run \
    --select dynamic_pricing \
    --profiles-dir . \
    --consume-structured-logs \
    --openlineage-dbt-job-name "${JOB_NAME}" \
    2>&1
  RUN_EXIT=$?

  # Run tests — dbt-ol reports test failures to Datadog Data Observability
  dbt-ol test \
    --select dynamic_pricing \
    --profiles-dir . \
    --consume-structured-logs \
    --openlineage-dbt-job-name "${JOB_NAME}" \
    2>&1 || true

  EXIT_CODE=$RUN_EXIT
fi

echo "[dbt entrypoint] Done. Exit code: ${EXIT_CODE}"
exit $EXIT_CODE
