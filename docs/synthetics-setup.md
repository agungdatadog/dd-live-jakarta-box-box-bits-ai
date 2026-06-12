# Datadog Synthetics — Setup Guide

## Overview

Three API Synthetic tests monitor the NovaPay demo pipeline's key endpoints.
They run every 5 minutes in production AND during every CI/CD deployment
(via the GitHub Actions workflow — step "Run Datadog Synthetics Tests").

```
Deploy → Wait 30s → Synthetics (seconds) → If fail → Rollback immediately
                  → If pass → Deployment Gate (15 min) → If fail → Rollback
                                                        → If pass → Confirmed ✓
```

---

## Create the tests in Datadog UI

Navigate to **[Synthetics > Tests](https://app.datadoghq.com/synthetics/list)** → **New Test** → **API Test**

### Test 1 — Service Health Check

| Field | Value |
|---|---|
| Name | `[NovaPay] 1 · Service Health Check` |
| URL | `GET https://box-box-bits-ai-449012790678.asia-southeast1.run.app/api/health` |
| Tags | `env:prod` `service:box-box-bits-ai` `team:nuttee` `demo:royal-rumble-2026` |
| Locations | `Asia Pacific (Singapore)` |
| Test frequency | Every 5 minutes |
| **Assertions** | Status code = `200` |
| | Response time < `10000` ms |
| | Body contains `"status":"ok"` |
| Retry | 1 retry, 1s interval |
| Message | `Health check failed — box-box-bits-ai may be unhealthy. Check Cloud Run.` |

### Test 2 — Merch Products API (pricing pipeline)

| Field | Value |
|---|---|
| Name | `[NovaPay] 2 · Merch Products API` |
| URL | `GET https://box-box-bits-ai-449012790678.asia-southeast1.run.app/api/merch/products` |
| Tags | `env:prod` `service:box-box-bits-ai` `team:nuttee` `demo:royal-rumble-2026` |
| Locations | `Asia Pacific (Singapore)` |
| Test frequency | Every 5 minutes |
| **Assertions** | Status code = `200` |
| | Response time < `15000` ms |
| | Body contains `"products"` |
| | Body contains `"pricing_source"` |
| Retry | 1 retry, 2s interval |
| Message | `Merch products API failed — check BigQuery connectivity or dbt pipeline status.` |

### Test 3 — Checkout API (Kafka entry point)

| Field | Value |
|---|---|
| Name | `[NovaPay] 3 · Checkout API` |
| URL | `POST https://box-box-bits-ai-449012790678.asia-southeast1.run.app/api/merch/checkout` |
| Tags | `env:prod` `service:box-box-bits-ai` `team:nuttee` `demo:royal-rumble-2026` |
| Locations | `Asia Pacific (Singapore)` |
| Test frequency | Every 5 minutes |
| **Request body** (JSON) | `{"productId":"rb-cap-001","quantity":1,"priceThb":1290,"team":"Red Bark Racing","category":"caps","userId":"synthetics-ci-test"}` |
| **Assertions** | Status code = `200` |
| | Response time < `15000` ms |
| | Body contains `"success":true` |
| | Body contains `"orderId"` |
| Retry | 1 retry, 2s interval |
| Message | `Checkout API failed — may indicate DEMO_ERROR_INJECT=true or Kafka issue.` |

---

## After creating the tests

### Update `.synthetics.json` with real public IDs

Once created, each test has a **public ID** (format: `xxx-xxx-xxx`).
Find it on the test detail page or via:

```bash
DD_API_KEY=xxx DD_APP_KEY=xxx \
  curl -s "https://api.datadoghq.com/api/v1/synthetics/tests?tags=service%3Abox-box-bits-ai" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  | python3 -c "import sys,json; [print(t['public_id'], t['name']) for t in json.load(sys.stdin)['tests']]"
```

Then replace the placeholder IDs in `.synthetics.json`:
```json
"tests": [
  {"id": "abc-def-123", "executionRule": "blocking"},
  {"id": "abc-def-456", "executionRule": "blocking"},
  {"id": "abc-def-789", "executionRule": "blocking"}
]
```

### GitHub Secrets required

Add to GitHub repository → Settings → Secrets:
| Secret | Value |
|---|---|
| `DD_API_KEY` | Datadog API key (already used for other steps) |
| `DD_APP_KEY` | Datadog Application key with `synthetics_read` scope |

The App Key needs at minimum: `synthetics_read` (to trigger and poll test results).

---

## CI/CD pipeline flow

The updated `deploy-cloud-run.yml` has this sequence:

```
1. Build image
2. Deploy to Cloud Run
3. Mark deployment in Datadog CD Visibility
4. Wait 30s for warm-up + smoke test health endpoint
5. Run Synthetics (DataDog/synthetics-ci-github-action@v2)
   ├── PASS → continue to Deployment Gate
   └── FAIL → immediate rollback (before waiting 15 min for APM gate)
6. Deployment Gate (Watchdog APM Faulty Deployment Detection, 15 min)
   ├── PASS → deployment confirmed ✓
   └── FAIL → rollback to previous revision
```

Synthetics catches **functional regressions** (broken endpoints, wrong response).
The Deployment Gate catches **performance/error regressions** (new error types, latency spikes).
Together they provide fast + deep protection.

---

## Running Synthetics locally

```bash
# Install datadog-ci
npm install -g @datadog/datadog-ci

# Run all tests for this service
DD_API_KEY=xxx DD_APP_KEY=xxx \
  datadog-ci synthetics run-tests \
    --search "tag:service:box-box-bits-ai AND tag:env:prod" \
    --config .synthetics.json

# Run a specific test by public ID
DD_API_KEY=xxx DD_APP_KEY=xxx \
  datadog-ci synthetics run-tests --public-id abc-def-123
```

---

## Demo usage (Act 4 — Deploy with Confidence)

**Showing the Synthetics gate in action:**
```bash
# 1. Deploy a bad version (DEMO_ERROR_INJECT=true)
./scripts/demo-issues.sh --deploy-bad

# 2. In the GitHub Actions UI: show the Synthetics step failing
#    "Synthetics tests FAILED — rolling back immediately"
#    The checkout test returns 500 (DEMO_ERROR_INJECT=true → NullPointerException)

# 3. Show Synthetics result in Datadog:
#    Synthetics → CI Results → Failed batch → Test 3 (Checkout) → 500 response

# 4. Recovery
./scripts/demo-issues.sh --deploy-good
```

**Key talking point**: 
> "Synthetics caught the checkout regression in under 30 seconds — before waiting 
> 15 minutes for the APM Deployment Gate. That's the difference between a 30-second 
> rollback and a 15-minute customer impact window."
