FROM python:3.12-slim

WORKDIR /app

# Install system deps (curl only — no Node/npm needed anymore)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dbt-core + BigQuery adapter + OpenLineage dbt integration
# openlineage-dbt provides `dbt-ol` wrapper that sends lineage + job run data
# directly to Datadog Data Observability via OPENLINEAGE__TRANSPORT__TYPE=datadog
# Docs: https://docs.datadoghq.com/data_observability/jobs_monitoring/dbt/?tab=dbtcore
RUN pip install --no-cache-dir \
    dbt-core==1.8.7 \
    dbt-bigquery==1.8.2 \
    "openlineage-dbt>=1.39.0"

# Copy dbt project
COPY dbt_project.yml profiles.yml packages.yml ./
COPY models ./models

# Entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Use Google Application Default Credentials (Workload Identity in GKE)
ENV GOOGLE_CLOUD_PROJECT=datadog-ese-sandbox

ENTRYPOINT ["./entrypoint.sh"]
