# Datadog Integration Setup — NovaPay Demo Pipeline

One-time Datadog-side configuration required for the Royal Rumble demo.
These steps are done in the Datadog UI and GCP console — no code changes.

---

## 1. GCP Integration — BigQuery data freshness

**Goal:** Datadog monitors `novapay_analytics.dynamic_pricing` table freshness.

### Steps

1. Go to [Datadog Integrations → Google Cloud Platform](https://app.datadoghq.com/integrations/google-cloud-platform)
2. Find the `datadog-ese-sandbox` project (or add it if not present)
3. Ensure the Datadog service account has these BigQuery roles in GCP:
   ```bash
   gcloud projects add-iam-policy-binding datadog-ese-sandbox \
     --member="serviceAccount:<DATADOG_SA>@<DATADOG_PROJECT>.iam.gserviceaccount.com" \
     --role="roles/bigquery.metadataViewer"
   gcloud projects add-iam-policy-binding datadog-ese-sandbox \
     --member="serviceAccount:<DATADOG_SA>@<DATADOG_PROJECT>.iam.gserviceaccount.com" \
     --role="roles/bigquery.jobUser"
   ```
4. In Datadog GCP integration config, enable **BigQuery** under "Collect GCP Metrics"

### Create the freshness monitor

In Datadog Monitors → New Monitor → Metric:

```
Metric:  gcp.bigquery.storage.row_count
From:    project:datadog-ese-sandbox, dataset_id:novapay_analytics, table_id:dynamic_pricing
Alert:   Last update more than 30 minutes ago

# Or use a custom metric query:
Metric:  max:gcp.bigquery.storage.last_modified_time{table_id:dynamic_pricing}
Alert:   value < (now() - 1800)  [1800 = 30 minutes in seconds]
```

**Monitor name:** `[NovaPay Demo] dynamic_pricing freshness > 30 min`
**Alert message:** `The novapay_analytics.dynamic_pricing table hasn't been updated in {{value}} seconds. dbt job may have failed. Check Datadog Data Jobs Monitoring.`

---

## 2. Datadog Agent + Redpanda integration (GKE)

**Goal:** Agent scrapes Redpanda Prometheus metrics for consumer lag, broker health.

The autodiscovery annotation is already in `infra/gke/redpanda/statefulset.yaml`:
```yaml
ad.datadoghq.com/redpanda.checks: |
  {
    "redpanda": {
      "instances": [{"prometheus_url": "http://%%host%%:9644/metrics"}]
    }
  }
```

### Deploy the Datadog Agent via Helm

```bash
# Create the datadog namespace and secret first
kubectl create namespace datadog
kubectl create secret generic datadog-agent-secret \
  --namespace=datadog \
  --from-literal=api-key=<DD_API_KEY> \
  --from-literal=app-key=<DD_APP_KEY>

# Deploy using the Helm values in infra/gke/datadog/datadog-values.yaml
helm repo add datadog https://helm.datadoghq.com && helm repo update
helm upgrade --install datadog-agent datadog/datadog \
  -f infra/gke/datadog/datadog-values.yaml \
  --namespace datadog \
  --set datadog.apiKey=<DD_API_KEY> \
  --set datadog.appKey=<DD_APP_KEY>
```

### Verify

```bash
# Check the agent can reach Redpanda
kubectl exec -n datadog ds/datadog-agent -- \
  agent check redpanda 2>&1 | head -40
```

---

## 3. Data Streams Monitoring (Kafka pipeline)

**Goal:** End-to-end pipeline latency visible in Datadog → Data Streams.

### Cloud Run (producer)

Already configured in `service.yaml` and the running service:
```yaml
- name: DD_DATA_STREAMS_ENABLED
  value: "true"
```

Cloud Run connects to Redpanda via the **VPC Access Connector** `novapay-vpc-connector` (10.8.0.0/28) and the Internal LoadBalancer IP `10.148.0.65:9092`. No public firewall rules are needed.

### bq-sink (consumer, GKE)

Already in `infra/gke/bq-sink/configmap.yaml`:
```yaml
DD_DATA_STREAMS_ENABLED: "true"
```

### Verify

After both producer (Cloud Run checkout) and consumer (bq-sink) are running:
1. Go to [Datadog → Data Streams Monitoring](https://app.datadoghq.com/data-streams)
2. You should see a pipeline: `box-box-bits-ai → limited_merch_transactions → bq-sink`
3. Lag, throughput, and end-to-end latency are visible per service

---

## 4. Data Jobs Monitoring (dbt)

**Goal:** dbt run status, model health, and lineage in Datadog Data Jobs Monitoring.

### How it works

The dbt CronJob's `entrypoint.sh` runs `datadog-ci dbt run-artifact` after each dbt execution.
This uploads dbt run artifacts (manifest.json, run_results.json) to Datadog.

### Datadog API key in GKE

The `datadog-secret` in the `data-pipeline` namespace provides `DD_API_KEY` to the dbt pod.
Create it once:
```bash
kubectl create secret generic datadog-secret \
  --namespace=data-pipeline \
  --from-literal=api-key=<DD_API_KEY>
```

### Verify

1. After the first successful dbt CronJob run:
   - Go to [Datadog → Data Jobs Monitoring](https://app.datadoghq.com/ci/pipelines)
   - Service: `novapay-dbt`
   - You should see the dbt job status and model results

2. After triggering `--fail-dbt`:
   - The job status shows FAILED
   - Model `dynamic_pricing_broken` shows the BigQuery schema error
   - This is the signal for the Act 2 Data Observability story

---

## 5. Datadog Feature Flags (already configured)

Two new flags to create in [Datadog Feature Flags](https://app.datadoghq.com/feature-flags):

| Flag key | Type | Default | Demo use |
|---|---|---|---|
| `pricing-engine` | STRING | `ai-search` | Act 3: flip to `static` for zero-downtime mitigation |
| `limited-merch-enabled` | BOOLEAN | `true` | Kill-switch for /merch route |

---

## 6. Demo validation checklist

Run through this before recording the demo:

- [ ] `./infra/bigquery/setup.sh` completed successfully
- [ ] BigQuery datasets exist: `bq ls datadog-ese-sandbox:`
- [ ] BigQuery table seeded: `bq query 'SELECT COUNT(*) FROM datadog-ese-sandbox.novapay_analytics.dynamic_pricing'`
- [ ] Redpanda pods running: `kubectl get pods -n data-pipeline`
- [ ] Redpanda LoadBalancer IP assigned: `kubectl get svc redpanda-kafka-lb -n data-pipeline`
- [ ] `REDPANDA_BROKERS` set in Cloud Run env
- [ ] bq-sink pod running and consuming: check logs for `bq_sink_started`
- [ ] dbt CronJob ran successfully: `kubectl get jobs -n data-pipeline`
- [ ] Datadog Data Streams shows `box-box-bits-ai → bq-sink` pipeline
- [ ] Datadog Data Jobs shows `novapay-dbt` service
- [ ] BigQuery freshness monitor created and in `OK` state
- [ ] `/merch` page loads with products and correct prices
- [ ] `./scripts/demo-pipeline.sh --fail-dbt` triggers stale pricing
- [ ] `./scripts/demo-pipeline.sh --error-inject-on` creates APM error spike
- [ ] Both `--fix-dbt` and `--error-inject-off` restore normal operation
