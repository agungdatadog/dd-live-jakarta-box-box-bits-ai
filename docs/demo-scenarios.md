# Royal Rumble 2026 — Demo Scenarios: Pain Points, Values & Scripts

---

## Demo Control — Commands to Run Before Recording

### T-30 min: Reset everything to clean baseline

```bash
# 1. Reset all demo controls (dbt healthy, no error injection, clean traffic)
./scripts/demo-pipeline.sh --reset-all

# 2. Confirm traffic simulation is running normally
./scripts/demo-pipeline.sh --dq-status
# Expected: TRAFFIC_MODE=normal, DATA_QUALITY_MODE=normal

# 3. Verify GKE components are healthy
kubectl get pods -n data-pipeline
# Expected: redpanda-0 Running, bq-sink Running, dbt-pricing CronJob active, traffic-sim Running

# 4. Verify Kafka broker metrics flowing (new — Redpanda /public_metrics scrape)
kubectl exec -n datadog \
  $(kubectl get pod -l app=datadog-agent -n datadog -o jsonpath='{.items[0].metadata.name}') \
  -c agent -- agent status 2>/dev/null | grep "redpanda.*OK\]"
# Expected: Instance ID: openmetrics:redpanda:... [OK]   Metric Samples: ~95/run
```

---

### T-10 min: Stage Act 2 (Data Observability incident — MUST pre-stage)

> Act 2 relies on a **real** freshness alert already fired. You cannot wait for it live on stage.

```bash
# 5. Trigger dbt failure → BigQuery goes stale → freshness monitor fires
./scripts/demo-pipeline.sh --fail-dbt

# 6. Inject zero-price events so RUM has real wrong-price sessions
./scripts/demo-pipeline.sh --dq-zero-prices

# 7. Generate a burst of traffic for RUM Session Replay to capture
./scripts/demo-pipeline.sh --traffic-burst
```

Wait **5–8 minutes** then verify:

```bash
# 8. Check freshness monitor has fired
open "https://app.datadoghq.com/data-observability/monitors"
# Expected: [NovaPay Demo] dynamic_pricing freshness > 30 min → ALERT

# 9. Check Data Jobs Monitoring shows failed dbt run
open "https://app.datadoghq.com/data-observability/pipelines"
# Expected: novapay-dbt → FAILED (schema mismatch)

# 10. Confirm bad data in BigQuery
./scripts/demo-data-quality.sh --show-bad-data
```

---

### T-5 min: Stage per-scenario issues

```bash
# Scenario 1 — Bits AI: bq-sink OOMKilled
./scripts/demo-issues.sh --k8s-oom-inject
# Expected: bq-sink pod enters OOMKilled / CrashLoopBackOff within ~2 min

# Scenario 3 — Shift Left Security: PR branch with SAST/Secrets/SCA issues
./scripts/demo-issues.sh --create-sec-pr
git push origin demo/security-issues --force 2>/dev/null || true
# Expected: GitHub Actions 'static-analysis.yml' runs → PR Gates blocks merge

# Scenario 2 — Deployment Gates: ensure Cloud Run is on the GOOD (last stable) revision
./scripts/demo-pipeline.sh --status
# Expected: DEMO_ERROR_INJECT=false (no active error injection)
```

---

### T-1 min: Final pre-flight checklist

```bash
# Full status sweep
./scripts/demo-pipeline.sh --status

# Verify traffic is flowing (Kafka → BQ)
kubectl logs deployment/traffic-sim -n data-pipeline --tail=5
# Expected: recent "published checkout event" lines

# Confirm bq-sink is OOMKilled (Scenario 1 staged)
kubectl get pod -n data-pipeline -l app=bq-sink
# Expected: STATUS = OOMKilled or CrashLoopBackOff

# Check Kafka broker metrics in Datadog (live smoke check)
open "https://app.datadoghq.com/metric/explorer#live=true&metrics=redpanda.kafka.records_produced_total"
# Expected: rising counter per-topic tag
```

---

### Recovery commands (post-recording)

```bash
# Restore everything to clean operation
./scripts/demo-pipeline.sh --fix-dbt          # un-suspend dbt, triggers immediate run
./scripts/demo-pipeline.sh --traffic-normal   # back to 12 events/min clean data
./scripts/demo-pipeline.sh --dq-normal        # clear zero-price injection
./scripts/demo-issues.sh --k8s-oom-fix        # restore bq-sink memory limit
./scripts/demo-issues.sh --cleanup-sec-pr     # delete demo/security-issues branch
./scripts/demo-pipeline.sh --reset-all        # belt-and-suspenders reset
```

---

### All script commands at a glance

| Script | Command | Effect |
|---|---|---|
| `demo-pipeline.sh` | `--reset-all` | Full clean state |
| `demo-pipeline.sh` | `--status` | Show all toggles |
| `demo-pipeline.sh` | `--fail-dbt` | Suspend dbt → freshness alarm |
| `demo-pipeline.sh` | `--fix-dbt` | Restore dbt + immediate run |
| `demo-pipeline.sh` | `--error-inject-on` | Cloud Run 500 errors (APM spike) |
| `demo-pipeline.sh` | `--error-inject-off` | Clear Cloud Run errors |
| `demo-pipeline.sh` | `--traffic-normal` | 12 events/min, clean data |
| `demo-pipeline.sh` | `--traffic-burst` | 3× rate (Black Friday spike) |
| `demo-pipeline.sh` | `--traffic-off` | Freeze pipeline (Kafka lag builds) |
| `demo-pipeline.sh` | `--dq-zero-prices` | ฿0 events → Percent Zero monitor |
| `demo-pipeline.sh` | `--dq-null-users` | null user_id → Nullness monitor |
| `demo-pipeline.sh` | `--dq-negative-qty` | negative qty → Percent Negative |
| `demo-pipeline.sh` | `--dq-drop-payload` | corrupt payload → row count stops |
| `demo-pipeline.sh` | `--dq-normal` | Restore clean events |
| `demo-pipeline.sh` | `--dq-status` | Show traffic-sim config |
| `demo-issues.sh` | `--k8s-oom-inject` | bq-sink OOMKilled (Scenario 1) |
| `demo-issues.sh` | `--k8s-oom-fix` | Restore bq-sink (Bits AI fix) |
| `demo-issues.sh` | `--deploy-bad` | Bad Cloud Run deploy |
| `demo-issues.sh` | `--deploy-good` | Rollback to good revision |
| `demo-issues.sh` | `--ff-canary-on` | Feature Flag 10% canary |
| `demo-issues.sh` | `--ff-canary-full` | Roll out to 100% |
| `demo-issues.sh` | `--ff-canary-off` | Roll back feature flag |
| `demo-issues.sh` | `--create-sec-pr` | Vulnerable PR branch (Scenario 3) |
| `demo-issues.sh` | `--cleanup-sec-pr` | Delete security-issues branch |
| `demo-data-quality.sh` | `--show-bad-data` | Query BigQuery for anomalies |
| `demo-data-quality.sh` | `--create-monitors` | Print monitor setup guide |

---

## Pain Point → Demo Scenario Mapping

| Customer says | What it means | Demo scene | Datadog value |
|---|---|---|---|
| "$4.2M Black Friday outage, on-call at 3am" | Slow MTTR, reactive ops | **Scenario 1** Bits AI finds OOMKilled in <5 min | MTTR 4hr → 18min |
| "40 deploys/day, can't control quality" | No deployment guardrails | **Scenario 2** Deployment Gate auto-rollback | Every deploy has a safety net |
| "IPO in 6 months, regulators want audit trail" | Security + compliance pressure | **Scenario 3** PR Gates blocks SQL injection | Security before merge, not after |
| "Our dashboards are always stale or broken" | Data freshness issues | **Scenario 4** Freshness monitor + Incident | Know before customers know |
| "Marketing doesn't trust the data" | Broken attribution | **Scenario 4** Null user_id monitor | Trust-building with proactive alerting |
| "Bad data = lost revenue" (Qantas pattern) | Pricing engine failures | **Scenario 4** Zero-price monitor | Stop revenue loss at the data layer |
| "Tool sprawl slowing delivery" | Team tripled, 14 tools | **All scenarios** One platform, all signals | One pane of glass, end-to-end |
| "Developers keep merging vulnerable code" | Security debt accumulates | **Scenario 3** SAST/SCA diff-aware | Only NEW issues block — velocity preserved |

---

## Scenario 3 — AI-Native Observability + Shift Left Security (UPDATED)

### Part A: Error Tracking + Bits AI Dev Agent → IDE Fix

**Demo story**: A new error appears in production after the latest deploy. Instead of debugging
manually, the engineer triggers Bits AI Dev Agent from the Error Tracking panel.

**Demo flow**:
1. **Error Tracking** — grouped error fingerprint, APM trace correlation, first/last seen
2. **Bits AI Dev Agent** — click "Investigate with Bits" on the error group
   - Bits reads: error stacktrace, APM spans, log context, recent deploy markers
   - Bits forms a hypothesis: "null pointer in checkout handler, introduced in v2.4.1"
   - Bits opens a GitHub PR with the fix (or proposes an edit in the IDE)
3. **IDE integration** — with Datadog Observability context in Claude Code / Cursor via the
   main Datadog MCP server, the engineer can:
   - Ask: *"What errors occurred on `api.merch.checkout` in the last 15 minutes?"*
   - Ask: *"Show me the last deployment that introduced this error"*
   - Bits AI Dev Agent creates a PR directly from the IDE investigation

**Key message**: Observability data (APM traces, logs, deployment context, Unified Service Tagging)
is the context that makes AI agents like Claude Code and Gemini effective.
Without the right context → AI guesses. With Datadog context → AI diagnoses.

### Part B: Shift Left Security — PR Gates + Code Security MCP

**Why PR Gates are different from traditional SAST**:

> "Traditional security tools scan everything. PR Gates are **diff-aware** — they only block
> code changes that YOU introduced. Existing issues in the repo? Not your problem today.
> The developer still has full context because the PR is still open."

**Demo flow**:
```bash
./scripts/demo-issues.sh --create-sec-pr
git push origin demo/security-issues
# Open PR → GitHub runs static-analysis.yml
# Datadog PR Gates creates two blocking checks:
#   ❌ SQL injection (Critical) — app/api/demo/search/route.ts:24
#   ❌ Hardcoded API key — app/api/demo/search/route.ts:8
# Developer sees the exact line, severity, and a "Fix with Bits Code" button
```

**Code Security MCP — pre-commit in the IDE**:

The `datadog-code-security-mcp` runs locally in Claude Code / Cursor and scans BEFORE commit:

```bash
# Install (one-time):
npm install -g @datadog/datadog-code-security-mcp

# Add to Claude Code:
claude mcp add datadog-code-security \
  -e DD_API_KEY=$DD_API_KEY \
  -e DD_APP_KEY=$DD_APP_KEY \
  -e DD_SITE=datadoghq.com \
  -- datadog-code-security-mcp start

# Add to Cursor (in ~/.cursor/mcp.json):
# "datadog-code-security": {
#   "command": "datadog-code-security-mcp",
#   "args": ["start"],
#   "env": { "DD_API_KEY": "...", "DD_APP_KEY": "...", "DD_SITE": "datadoghq.com" }
# }
```

**Available tools in the IDE**:
- `datadog_code_security_scan` — SAST + Secrets + SCA + IaC in parallel
- `datadog_secrets_scan` — hardcoded credentials detection
- `datadog_sca_scan` — CVE scanning on npm/pip dependencies
- `datadog_iac_scan` — Kubernetes manifest and Dockerfile misconfigurations

**Hook-based enforcement** (add to `.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash(git commit*)",
      "hooks": [{
        "type": "command",
        "command": "datadog-code-security-mcp scan all . && echo 'Security scan passed'"
      }]
    }]
  }
}
```

**Key message**: "The developer never leaves the IDE. The security scan is in their context,
not in a separate security dashboard two weeks later."

**Shift Left value chain**:
```
IDE (pre-commit)           PR (diff-aware gate)        Production
datadog-code-security-mcp → PR Gates (SAST/SCA/Secrets) → Error Tracking + CSPM
        ↑                          ↑                              ↑
Catch cheapest               Catch before merge            Catch before blast radius
```

---

## Scenario 4 — Data Observability: Business Critical Data Quality

### The Qantas framing (slides 12–13)

**Slide 12 script**:
> "Data issues directly impact revenue and customer experiences. Recently, Qantas mistakenly
> sold business-class seats at an 85% discount on flights from Australia to the US.
> To protect customer goodwill, they allowed passengers to keep the booking — but this decision
> led to significant lost revenue, all originating from a **single data failure in their pricing engine**."

**Slide 13 script**:
> "This is not isolated. Samsung: $105 billion fat-finger calculation error.
> Unity Software: $5 billion market cap lost due to degraded ad accuracy models.
> Equifax: millions of incorrect credit scores. Uber: miscalculating driver commissions.
> The core issue is the same: **companies lack visibility into the health of their data pipelines**."

### Connecting to NovaPay

NovaPay's `dynamic_pricing` pipeline is the live demo version of the Qantas pricing engine:

```
limited_merch_events (raw)
  → [dbt: dynamic_pricing.sql]
  → novapay_analytics.dynamic_pricing
  → /api/merch/products (storefront)
  → User sees ฿1,940 instead of ฿1,290 (correct demand pricing)
                OR
  → User sees ฿0 (pricing bug — free merch)
```

### Demo flow — 4 data quality scenarios

```bash
# Before demo: inject all issues
./scripts/demo-data-quality.sh --inject-all

# Show bad data in BigQuery
./scripts/demo-data-quality.sh --show-bad-data
```

| Scenario | What's injected | Datadog monitor | Business impact |
|---|---|---|---|
| Zero prices | `price_thb = 0` events | Percent Zero > 5% | Free merch — direct revenue loss |
| Null users | `user_id = null` | Nullness > 10% | Attribution broken — compliance risk |
| Negative values | `price_thb < 0`, `quantity < 0` | Percent Negative > 0 | Refund bug corrupting aggregates |
| Stale pricing | dbt fails, `dynamic_pricing` not updated | Freshness > 30 min | Wrong prices on storefront |
| Row count drop | bq-sink scaled to 0 | Row Count anomaly | Silent pipeline failure |

### Monitor setup

```bash
./scripts/demo-data-quality.sh --create-monitors
```

This prints the exact configuration for creating 4 Data Observability monitors in the Datadog UI:
1. **Freshness** — `dynamic_pricing.dbt_updated_at` > 30 min
2. **Percent Zero** — `limited_merch_events.price_thb` = 0 > 5%
3. **Nullness** — `limited_merch_events.user_id` null > 10%
4. **Row Count Anomaly** — `limited_merch_events` row count drops

Each monitor is configured to:
- Auto-create a Datadog Incident via `@incident` in the notification
- Post to Slack via Workflow Automation
- Link to the Lineage graph for root cause context

### Incident auto-creation

Configure Workflow Automation (Service Management → Workflow Automation → New Workflow):
- **Trigger**: Monitor alert (Data Observability monitor)
- **Action 1**: Create Incident (P1/P2 based on severity)
- **Action 2**: Slack notification to `#data-incidents`
- **Action 3**: Assign on-call via PagerDuty

### Key message for Scenario 4

> "Qantas didn't know their pricing engine was broken until customers started tweeting.
> NovaPay's dynamic_pricing table went stale at 03:14 — Datadog detected it at 03:15.
> The monitor fired before a single customer saw a wrong price.
> That's not just observability. That's revenue protection at the data layer."

### Discovery cards → Demo mapping

| Customer discovery trigger | Follow-up | Datadog tie-in |
|---|---|---|
| "Our dashboards are always stale or broken" | "Do you have SLAs for those dashboards?" | Freshness monitoring on `dynamic_pricing` |
| "Flying blind when data changes" | "Do schema changes break downstream reports?" | Schema change detection + Lineage (dbt → BQ) |
| "Analytics team always fixing stuff" | "How do you know when something's off?" | Proactive alerting — know before users complain |
| "We just implemented dbt/Snowflake" | "How are you monitoring the pipeline end-to-end?" | Data observability layer for the modern stack |
| "Marketing doesn't trust the data" | "Do business teams question accuracy?" | Trust-building: Nullness monitor catches attribution loss |
| "Data changes often, breaks stuff" | "Do you track schema changes over time?" | Lineage: `limited_merch_events` → dbt → `dynamic_pricing` |
| "We want to get ahead of data issues" | "What tools are you using to monitor today?" | Criteria-based monitors, anomaly detection |
| "We're scaling data ops, want governance" | "Can you track issues across teams/models?" | Ownership, incident routing, Data Catalog |
