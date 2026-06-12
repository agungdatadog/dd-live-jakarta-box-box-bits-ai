# Datadog Data Observability — BigQuery Quality Monitoring + Full Lineage

## What this achieves

Once configured, Datadog Data Observability automatically builds a lineage graph connecting:

```
Kafka topic (limited_merch_transactions)
  └─ via Data Streams Monitoring
  └─→ novapay_raw.limited_merch_events       ← BigQuery Quality Monitoring
        └─ via dbt Core OpenLineage
        └─→ dbt job (novapay-dynamic-pricing)  ← Jobs Monitoring
              └─→ novapay_analytics.dynamic_pricing ← BigQuery Quality Monitoring
                    └─→ /api/merch/products    ← APM (Cloud Run)
```

Navigate to **Data Observability > Lineage**, anchor on
`novapay_analytics.dynamic_pricing` to see the full graph.

---

## Status: what's already done

| Component | Status | Config |
|---|---|---|
| GCP APIs | ✅ All 5 enabled | `bigquery`, `monitoring`, `cloudasset`, `cloudresourcemanager`, `compute` |
| dbt Core OpenLineage | ✅ Sending 17 events/run | `OPENLINEAGE__TRANSPORT__TYPE=datadog`, `dbt-ol run/test` |
| BigQuery IAM roles | ✅ Granted | `datadog-llm-observability@` SA has `dataViewer + resourceViewer + jobUser` |
| Data Streams Monitoring | ✅ Live | `DD_DATA_STREAMS_ENABLED=true` on Cloud Run + bq-sink |

---

## Step 1 — Connect BigQuery in Datadog Data Observability UI

> **One-time manual step in the Datadog UI. All subsequent steps are automatic.**

1. Go to [Data Observability > Settings](https://app.datadoghq.com/data-observability/settings)
2. Under **Data Warehouses**, find **BigQuery** and click **Configure**
3. Click **Add BigQuery Account**
4. Select **Use connected Service Account**
5. Choose the service account that is linked to your Datadog GCP integration
   - Most likely: `datadog-llm-observability@datadog-ese-sandbox.iam.gserviceaccount.com`
   - This SA now has `bigquery.dataViewer + resourceViewer + jobUser` granted
6. Under **Project**, select `datadog-ese-sandbox`
7. Turn on the **Enable Data Observability** toggle
8. Click **Add Account**

Datadog begins syncing `INFORMATION_SCHEMA` and query history in the background.
**Initial sync can take several hours** — tables appear in the Catalog after sync.

---

## Step 2 — Verify tables appear in the Data Catalog

After the initial sync:

1. Go to [Data Observability > Data Catalog](https://app.datadoghq.com/data-observability/catalog)
2. Search for `dynamic_pricing` — you should see:
   - `datadog-ese-sandbox.novapay_analytics.dynamic_pricing`
   - `datadog-ese-sandbox.novapay_raw.limited_merch_events`
3. Click either table to see column-level metadata, row count, and freshness

---

## Step 3 — Create Data Observability Monitors

Create these monitors to alert on data quality issues:

### Monitor 1: `dynamic_pricing` freshness (Act 2 demo trigger)

1. Go to [Data Observability > Monitors > New Monitor](https://app.datadoghq.com/data-observability/monitors/new)
2. Select table: `datadog-ese-sandbox.novapay_analytics.dynamic_pricing`
3. Metric: **Freshness** (time since last update)
4. Condition: Alert when freshness > **30 minutes**
5. Name: `[NovaPay Demo] dynamic_pricing freshness > 30 min`
6. Message:
   ```
   The `novapay_analytics.dynamic_pricing` table hasn't been updated in {{value}} minutes.
   The dbt job `novapay-dynamic-pricing` may have failed.
   Check Jobs Monitoring: https://app.datadoghq.com/data-observability/pipelines
   Run: ./scripts/demo-pipeline.sh --fix-dbt to recover
   ```

### Monitor 2: `limited_merch_events` row count anomaly

1. New Monitor → table: `datadog-ese-sandbox.novapay_raw.limited_merch_events`
2. Metric: **Row count** — Anomaly
3. Name: `[NovaPay Demo] limited_merch_events row count anomaly`
4. (Anomaly model trains for 3–7 days — shows baseline after first week)

---

## Step 4 — View the full lineage

Once both BigQuery tables appear in the Catalog and the dbt job has run:

1. Go to [Data Observability > Lineage](https://app.datadoghq.com/data-observability/lineage)
2. In the search bar, search for `dynamic_pricing`
3. Select: `datadog-ese-sandbox.novapay_analytics.dynamic_pricing`
4. Set upstream depth to `∞`
5. You should see:
   ```
   novapay_raw.limited_merch_events
     └─ [dbt job: novapay-dynamic-pricing]
           └─ novapay_analytics.dynamic_pricing  ← ANCHOR
   ```

---

## GCP commands already run

The following commands were run to prepare the IAM permissions:

```bash
# All 5 APIs confirmed enabled:
# bigquery.googleapis.com ✅
# monitoring.googleapis.com ✅
# cloudasset.googleapis.com ✅
# cloudresourcemanager.googleapis.com ✅
# compute.googleapis.com ✅

# BigQuery Data Observability roles granted to Datadog integration SA:
gcloud projects add-iam-policy-binding datadog-ese-sandbox \
  --member="serviceAccount:datadog-llm-observability@datadog-ese-sandbox.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding datadog-ese-sandbox \
  --member="serviceAccount:datadog-llm-observability@datadog-ese-sandbox.iam.gserviceaccount.com" \
  --role="roles/bigquery.resourceViewer"

gcloud projects add-iam-policy-binding datadog-ese-sandbox \
  --member="serviceAccount:datadog-llm-observability@datadog-ese-sandbox.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
```

---

## Troubleshooting

### Tables not appearing in Catalog after 24h

The SA used in Step 1 might not have the correct IAM roles. Check which SA is actually
linked to your Datadog GCP integration:

1. In Datadog: Integrations > Google Cloud Platform > find `datadog-ese-sandbox`
2. Note the service account email
3. Run: `gcloud projects get-iam-policy datadog-ese-sandbox --format=json | grep <SA_EMAIL>`
4. If it's missing the BigQuery roles, run the 3 `add-iam-policy-binding` commands above
   replacing the SA email

### dbt lineage not appearing

Confirm `dbt-ol` is running and sending events:
```bash
kubectl logs -l job-name=$(kubectl get jobs -n data-pipeline --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}') -n data-pipeline 2>&1 | grep -E "Emitted|ERROR|401"
```
Expected: `Emitted 17 OpenLineage events` with no ERROR/401 lines.

If you see `401`: update the `datadog-secret` in `data-pipeline` namespace:
```bash
CORRECT_KEY=$(gcloud secrets versions access latest --secret=NUTTEE_DD_API_KEY --project=datadog-ese-sandbox)
kubectl delete secret datadog-secret -n data-pipeline
kubectl create secret generic datadog-secret --namespace=data-pipeline --from-literal=api-key="$CORRECT_KEY"
```

### Lineage shows dbt but not BigQuery tables

BigQuery tables appear in lineage only after:
1. The Quality Monitoring BigQuery integration sync completes (up to 24h first time)
2. At least one dbt run has completed with `dbt-ol` after the BigQuery sync

The `dbt-ol` OpenLineage events reference the fully-qualified table names
(`datadog-ese-sandbox.novapay_analytics.dynamic_pricing`) which Datadog matches
against the BigQuery catalog entries to stitch the lineage together.
