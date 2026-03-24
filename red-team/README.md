# Red Team — OWASP LLM Top 10 Scan

Automated adversarial security scan of the **Pitwall Chat** endpoint (`POST /api/pitwall`) using [promptfoo](https://www.promptfoo.dev/docs/red-team/).

Covers all 10 OWASP LLM vulnerabilities (2025) plus deep-dive plugins for the risks most relevant to this endpoint:

| OWASP ID | Risk | Extra coverage |
|---|---|---|
| LLM01 | Prompt Injection | `prompt-injection` + `jailbreak` strategies |
| LLM02 | Sensitive Info Disclosure | via `owasp:llm` |
| LLM03 | Supply Chain | via `owasp:llm` |
| LLM04 | Data & Model Poisoning | via `owasp:llm` |
| LLM05 | Improper Output Handling | via `owasp:llm` |
| LLM06 | Excessive Agency | `excessive-agency` + `hijacking` ← Google Search tool |
| LLM07 | System Prompt Leakage | `prompt-extraction` with actual system prompt |
| LLM08 | Vector & Embedding Weaknesses | via `owasp:llm` |
| LLM09 | Misinformation | `hallucination` + `overreliance` |
| LLM10 | Unbounded Consumption | via `owasp:llm` |

---

## Prerequisites

- **Node.js 20+**
- **`OPENAI_API_KEY`** — used by promptfoo to *generate* adversarial attacks (not sent to your app)
  - Alternatively, uncomment the Gemini attacker block at the bottom of `promptfooconfig.yaml` and set `GEMINI_API_KEY`

---

## Setup

No installation needed — promptfoo runs via `npx`. On first run it will download itself.

```bash
cd red-team
```

---

## Run against production

```bash
export OPENAI_API_KEY=sk-...

npx promptfoo@latest redteam run
```

This will:
1. Generate ~5 adversarial test cases per plugin (~50–80 total)
2. Send each to `POST /api/pitwall` on the production Cloud Run service
3. Grade each response and save results to `redteam.yaml`

---

## Run against local dev server

```bash
export OPENAI_API_KEY=sk-...
APP_URL=http://localhost:3000 npx promptfoo@latest redteam run
```

---

## View the report

```bash
npx promptfoo@latest redteam report
```

Opens a browser report at `http://localhost:15500` with:
- OWASP Top 10 scorecard with pass/fail per category
- Per-vulnerability severity breakdown
- Individual test case logs (input → output → verdict)
- Suggested mitigations for any failures

---

## Increase scan depth

Edit `numTests` in `promptfooconfig.yaml` to generate more test cases per plugin:

```yaml
redteam:
  numTests: 10   # default: 5 — use 10-20 for pre-production scans
```

---

## Use Gemini as the attack model (no OpenAI key needed)

Uncomment the block at the bottom of `promptfooconfig.yaml`:

```yaml
defaultTest:
  options:
    provider:
      id: google:gemini-2.0-flash
      config:
        apiKey: ${GEMINI_API_KEY}
```

Then run:

```bash
export GEMINI_API_KEY=...
npx promptfoo@latest redteam run
```

---

## CI integration

Add to your pipeline to catch regressions before deploy:

```bash
npx promptfoo@latest redteam run --no-cache
npx promptfoo@latest redteam report --output report.html
```

See [promptfoo CI/CD docs](https://www.promptfoo.dev/docs/integrations/ci-cd/) for GitHub Actions integration.
