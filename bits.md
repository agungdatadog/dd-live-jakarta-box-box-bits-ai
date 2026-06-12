# Box Box Bits AI — Service Knowledge Base for Bits AI

This file is a knowledge source for Bits AI Investigation.
When investigating alerts or incidents in this system, use the context below to
accelerate root cause analysis.

---

## System Overview

**Box Box Bits AI** is a Next.js application deployed to Google Cloud Run
(`asia-southeast1`, project `datadog-ese-sandbox`) that powers the NovaPay
demo data pipeline. It exposes an F1-themed merch storefront where checkout
events flow through a real-time data pipeline.

### Service Map

```
Cloud Run: box-box-bits-ai
  └─ POST /api/merch/checkout → publishes Avro events to Kafka
  └─ GET  /api/merch/products → reads from BigQuery dynamic_pricing
  └─ POST /api/pitwall        → Gemini LLM via AI Guard (LLMObs)
  └─ POST /api/evaluate-team  → Gemini LLM evaluation

Redpanda (GKE, namespace: data-pipeline)
  └─ topic: limited_merch_transactions (Avro, 1 partition)

bq-sink (GKE Deployment, namespace: data-pipeline)
  └─ KafkaJS consumer → BigQuery batch writes
  └─ Expected memory: 256Mi–512Mi
  └─ Expected CPU: 100m–500m
  └─ Health: GET http://localhost:3001/health

dbt CronJob (GKE, namespace: data-pipeline, schedule: */5 * * * *)
  └─ dbt-ol run dynamic_pricing → novapay_analytics.dynamic_pricing
  └─ Expected runtime: 60–90 seconds
  └─ Fails when DBT_FAIL_MODE=true (deliberate demo failure)

BigQuery (datadog-ese-sandbox)
  └─ novapay_raw.limited_merch_events       ← written by bq-sink
  └─ novapay_analytics.dynamic_pricing      ← written by dbt
```

---

## GKE Cluster

- **Cluster**: `nuttee-cluster-1`, zone `asia-southeast1-b`
- **Namespace**: `data-pipeline` (Redpanda, bq-sink, dbt)
- **Namespace**: `datadog` (Datadog Agent DaemonSet, Cluster Agent)

---

## Known Demo Failure Modes

### `bq-sink` OOMKilled
- **Trigger**: Memory limit reduced below 128Mi (`demo-issues.sh --k8s-oom-inject`)
- **Symptom**: bq-sink pod OOMKilled → CrashLoopBackOff → Kafka consumer lag increases
- **Root cause**: Container memory limit too low for Avro deserialization + BigQuery batch buffering
- **Fix**: Increase memory limit to 256Mi minimum (`demo-issues.sh --k8s-oom-fix`)
- **File to change**: `infra/gke/bq-sink/deployment.yaml` → `resources.limits.memory`

### `dbt` schema mismatch failure (Act 2)
- **Trigger**: `scripts/demo-pipeline.sh --fail-dbt` (sets DBT_FAIL_MODE=true)
- **Symptom**: dbt CronJob fails → dynamic_pricing table goes stale → wrong prices on storefront
- **Root cause**: `dynamic_pricing_broken.sql` references `unit_price` which doesn't exist in source
- **Fix**: `scripts/demo-pipeline.sh --fix-dbt`

### Checkout NullPointerException (Act 3)
- **Trigger**: `scripts/demo-pipeline.sh --error-inject-on` (DEMO_ERROR_INJECT=true)
- **Symptom**: POST /api/merch/checkout returns 500, tagged `deployment.version: v2.4.1`
- **Root cause**: THB currency handler null pointer — env var DEMO_ERROR_INJECT=true
- **Fix**: `scripts/demo-pipeline.sh --error-inject-off` (Cloud Run env var update)

---

## Key Environment Variables

| Service | Var | Demo use |
|---|---|---|
| Cloud Run | `DEMO_ERROR_INJECT=true` | Triggers checkout 500 errors (Act 3) |
| Cloud Run | `DEMO_HIGH_LATENCY=true` | Slow LLM responses (Act 5) |
| Cloud Run | `REDPANDA_BROKERS=10.148.0.65:9092` | Internal Redpanda LB (VPC connector) |
| dbt CronJob ConfigMap | `DBT_FAIL_MODE=true` | Breaks dbt model (Act 2) |
| bq-sink Deployment | `memory: 64Mi` | Triggers OOMKilled (Bits AI demo) |

---

## Runbooks

### bq-sink pod restarting
1. Check events: `kubectl describe pod -l app=bq-sink -n data-pipeline`
2. If OOMKilled: increase memory limit in `infra/gke/bq-sink/deployment.yaml`
3. Apply: `kubectl apply -f infra/gke/bq-sink/deployment.yaml && kubectl rollout restart deployment/bq-sink -n data-pipeline`
4. Normal memory: `requests: 128Mi, limits: 256Mi`

### Kafka consumer lag spike
1. Check bq-sink pod is healthy
2. Check Redpanda broker: `kubectl exec redpanda-0 -n data-pipeline -- /usr/bin/rpk topic describe limited_merch_transactions`
3. bq-sink reconnects automatically — if lag is >100k messages, check for schema errors

### Dynamic pricing stale
1. Check dbt CronJob: `kubectl get jobs -n data-pipeline`
2. If no recent Completed jobs: check ConfigMap `DBT_FAIL_MODE`
3. Trigger manual run: `kubectl create job dbt-manual-$(date +%s) --from=cronjob/dbt-pricing -n data-pipeline`

---

## Contacts & Repositories

- **GitHub repo**: `DataDog/dd-live-bkk-box-box-bits-ai` (or the user's fork)
- **Cloud Run URL**: https://box-box-bits-ai-449012790678.asia-southeast1.run.app
- **GCP Project**: `datadog-ese-sandbox`
