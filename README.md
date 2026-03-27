<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Box Box Bits AI

Interactive F1 demo app for **Datadog Live Bangkok 2026** — built to showcase Datadog APM, RUM, and LLM Observability on a Next.js app deployed to Google Cloud Run.

**Live:** https://box-box-bits-ai-449012790678.asia-southeast1.run.app

---

## What's Inside

Three audience-facing game modes, all wired to Datadog telemetry:

| Mode | Route | Description |
|---|---|---|
| **Pitwall Radio** | `/pitwall` | Chat with Bits AI — a Gemini-powered F1 race engineer with Google Search grounding |
| **Racing Line Quiz** | `/quiz` | Speed-run F1 trivia, Datadog-logged per answer |
| **Dream Team Lineup** | `/dream-team` | Draft a dog-themed paddock roster; AI judges chemistry, conflict, and synergy |

Every interaction is traced end-to-end: APM spans → LLMObs → RUM → structured logs — all surfaced in Datadog.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, standalone output)
- **AI:** Google Gemini via `@google/genai` SDK — `gemini-3-flash-preview` for chat & evaluation
- **Observability:** Datadog APM (`dd-trace`), RUM (`@datadog/browser-rum`), LLM Observability, Winston structured logs
- **Deployment:** Google Cloud Run via Skaffold + Cloud Build
- **State:** Zustand (client-side user store)
- **UI:** Tailwind CSS v4, Motion (Framer), React Three Fiber (3D F1 car)

---

## Local Development

### Prerequisites

- Node.js 20+
- A Gemini API key ([get one here](https://aiskudio.google.com))
- (Optional) Datadog account for observability

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local` in the project root:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key

# Datadog RUM (baked into the client bundle at build time)
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
NEXT_PUBLIC_DATADOG_APPLICATION_ID=
NEXT_PUBLIC_DATADOG_SITE=datadoghq.com
NEXT_PUBLIC_DATADOG_SERVICE=box-box-bits-ai
NEXT_PUBLIC_DATADOG_ENV=development

# Datadog APM + LLMObs (server-side only)
DD_API_KEY=
DD_SITE=datadoghq.com
DD_SERVICE=box-box-bits-ai
DD_ENV=development
DD_LLMOBS_ML_APP=box-box-bits-ai
```

> Datadog variables are optional for local development. The app runs fully without them — traces and logs just won't be forwarded.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Docker (Local Container)

Build and run as a container (mirrors the Cloud Run environment):

```bash
# Build
docker build \
  --build-arg NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN \
  --build-arg NEXT_PUBLIC_DATADOG_APPLICATION_ID=$NEXT_PUBLIC_DATADOG_APPLICATION_ID \
  --build-arg NEXT_PUBLIC_DATADOG_SITE=$NEXT_PUBLIC_DATADOG_SITE \
  --build-arg NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE \
  --build-arg NEXT_PUBLIC_DATADOG_ENV=$NEXT_PUBLIC_DATADOG_ENV \
  -t box-box-bits-ai-local .

# Run (reads remaining env from .env)
docker compose -f docker-compose.local.yaml --env-file .env up
```

App available at [http://localhost:8080](http://localhost:8080).

---

## Deploy to Cloud Run

### Prerequisites

- `gcloud` CLI authenticated
- `skaffold` installed
- Artifact Registry repo created in your GCP project

### 1. Create a `.env` file

Copy the required variables into a `.env` file (not `.env.local`) — `deploy.sh` reads this:

```env
GCP_PROJECT_ID=your-project-id
GCP_REGION=asia-southeast1
CR_SERVICE_NAME=box-box-bits-ai
ARTIFACT_REPO=your-artifact-registry-repo
APP_URL=https://your-cloudrun-url.run.app
APPLET_ID=your-applet-id

GEMINI_API_KEY=...

# Datadog RUM (build-time args)
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=...
NEXT_PUBLIC_DATADOG_APPLICATION_ID=...
NEXT_PUBLIC_DATADOG_SITE=datadoghq.com
NEXT_PUBLIC_DATADOG_SERVICE=box-box-bits-ai
NEXT_PUBLIC_DATADOG_ENV=production

# Datadog APM (runtime env vars injected into Cloud Run)
DD_API_KEY=...
DD_APP_KEY=...
DD_SITE=datadoghq.com
DD_ENV=production
DD_LLMOBS_ML_APP=box-box-bits-ai
```

### 2. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

The script:
1. Validates all required env vars
2. Generates `k8s/cloudrun.yaml` from your env
3. Authenticates Docker with Artifact Registry
4. Builds the image via Cloud Build (`skaffold run --profile=prod`)
5. Deploys to Cloud Run and makes the service public
6. Prints the live service URL

To skip the IAM binding (if already public):
```bash
./deploy.sh --no-iam
```

---

## Observability Architecture

```
Browser (RUM)                    Cloud Run Container
┌──────────────┐                 ┌──────────────────────────────────┐
│ @datadog/    │  page views,    │  serverless-init (ENTRYPOINT)    │
│ browser-rum  │  user actions,  │    ↕ local DD agent process      │
│ browser-logs │  errors         │                                  │
└──────┬───────┘                 │  Next.js (instrumentation.ts)    │
       │                         │    dd-trace.init({ llmobs })     │
       │                         │    ↕ APM spans                   │
       ▼                         │                                  │
  Datadog RUM                    │  /api/pitwall                    │
                                 │    withLlmObsSpan('pitwall_chat')│
                                 │    → Gemini API (grounded search) │
                                 │                                  │
                                 │  /api/evaluate-team              │
                                 │    withLlmObsSpan('dream_team_…')│
                                 │    → Gemini API (JSON mode)      │
                                 │                                  │
                                 │  Winston logger                  │
                                 │    DD_LOGS_INJECTION=true        │
                                 └──────────────────────────────────┘
                                          ↕ DD_API_KEY
                                    Datadog APM / LLMObs / Logs
```

### Key Datadog surfaces

| Product | What you'll see |
|---|---|
| **APM Service Map** | `box-box-bits-ai` → Gemini API dependency |
| **APM Traces** | `api.pitwall.chat`, `api.dream_team.evaluate` spans with `usr.id` tags |
| **LLM Observability** | `pitwall_chat` and `dream_team_game_evaluation` LLM spans — token counts, latency, prompt versions |
| **RUM** | Session replays, page views, Core Web Vitals per user |
| **Logs** | `event_type:pitwall_chat`, `event_type:dream_team_game_evaluation` structured entries |

---

## Demo Mode — High-Latency Switch

A single environment variable toggles the app between **production-fast** and **demo-slow** modes without requiring a redeploy.

| | `DEMO_HIGH_LATENCY=false` (default) | `DEMO_HIGH_LATENCY=true` |
|---|---|---|
| **Model** | `gemini-3-flash-preview` | `gemini-3.1-pro-preview` |
| **Thinking budget** | `0` (disabled) | `24576` (Gemini maximum) |
| **System prompt** | Base prompt only | + verbose 5-step chain-of-thought prefix |
| **Expected latency** | ~3–6 s | ~20–60 s |

This is useful for live demos where you want Datadog LLM Observability to show **visibly high latency, elevated token counts, and large cost differences** between calls.

### Enable demo mode (no redeploy needed)

`--update-env-vars` creates a new Cloud Run revision in ~30 seconds — no Docker rebuild:

```bash
# Switch ON
gcloud run services update box-box-bits-ai \
  --update-env-vars DEMO_HIGH_LATENCY=true \
  --region asia-southeast1 \
  --project YOUR_PROJECT_ID

# Switch OFF
gcloud run services update box-box-bits-ai \
  --update-env-vars DEMO_HIGH_LATENCY=false \
  --region asia-southeast1 \
  --project YOUR_PROJECT_ID
```

### How it works

Three techniques are applied simultaneously when `DEMO_HIGH_LATENCY=true`:

1. **Heavier model** — switches from Flash to `gemini-3.1-pro-preview`, which has higher baseline latency and produces more deliberate responses.

2. **Maximum thinking budget** — sets `thinkingConfig: { thinkingBudget: 24576 }` (Gemini's maximum), forcing the model to generate a large internal reasoning chain before producing output. This is the primary latency driver.

3. **Chain-of-thought system prompt** — prepends a verbose 5-step reasoning instruction to every system prompt (understand context → identify factors → consider interpretations → construct answer → review). The model explicitly works through each step, adding both latency and token count.

### Visibility in Datadog

All logs include `demo_high_latency` and `thinking_budget` fields:

```
event_type: pitwall_chat
llm.demo_high_latency: true
llm.thinking_budget: 24576
llm.model: gemini-3.1-pro-preview
```

In **LLM Observability** you'll see:
- Span duration 5–10× longer
- `inputTokens` significantly higher (CoT prefix adds ~500 tokens per call)
- Cost metrics (`inputCost`, `outputCost`) proportionally larger

---

## Load Testing (Observability Data Generation)

Generate realistic concurrent user sessions to populate Datadog dashboards for demos.

```bash
cd load-test
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### Optional: pre-generate question bank via Gemini

```bash
GEMINI_API_KEY=your_key python generate_questions.py --count 120
```

### Run the simulator

**Web UI** (recommended for live demos):
```bash
locust -f locustfile.py --host https://box-box-bits-ai-449012790678.asia-southeast1.run.app
# → open http://localhost:8089, set users=15, spawn rate=2
```

**Headless** (for background traffic generation):
```bash
locust -f locustfile.py \
  --host https://box-box-bits-ai-449012790678.asia-southeast1.run.app \
  -u 15 -r 2 --run-time 10m --headless
```

See [`load-test/README.md`](load-test/README.md) for full documentation.

---

## Project Structure

```
box-box-bits-ai/
├── app/
│   ├── api/
│   │   ├── pitwall/route.ts          # Gemini chat endpoint
│   │   ├── evaluate-team/route.ts    # Dream Team AI evaluation
│   │   ├── quiz/route.ts             # Quiz answer checker
│   │   └── generate-driver-name/    # AI driver name generator
│   ├── pitwall/page.tsx              # Pitwall Radio UI
│   ├── quiz/page.tsx                 # Racing Line Quiz UI
│   ├── dream-team/page.tsx           # Dream Team Lineup UI
│   └── layout.tsx                   # Root layout + Datadog RUM init
├── components/
│   ├── DatadogInit.tsx               # Client-side RUM + Logs initialisation
│   ├── DriverNameGate.tsx            # Username entry modal
│   ├── F1Car3D.tsx                   # Three.js scroll-linked F1 car
│   └── Navigation.tsx
├── lib/
│   ├── datadog-server.ts             # dd-trace singleton (server)
│   ├── datadog-client.ts             # RUM config (client)
│   ├── llmobs.ts                     # withLlmObsSpan helper
│   ├── logger.ts                     # Winston + DD log injection
│   ├── gemini-server.ts              # Gemini client singleton
│   └── demo-config.ts                # DEMO_HIGH_LATENCY switch (model, thinking, CoT prompt)
├── data/characters.json              # 46 dog-themed F1 paddock characters
├── store/
│   └── userStore.ts                  # Zustand username + userId store
├── instrumentation.ts                # Next.js dd-trace init hook
├── deploy.sh                         # Cloud Run deploy script
├── skaffold.yaml                     # Skaffold build/deploy config
├── service.yaml                      # Cloud Run service template
├── docker-compose.local.yaml         # Local container testing
└── load-test/                        # Locust load simulator
    ├── locustfile.py
    ├── generate_questions.py
    └── README.md
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Run standalone server (after build) |
| `npm run lint` | ESLint |
| `./deploy.sh` | Build + deploy to Cloud Run via Skaffold |
| `gcloud run services update … --update-env-vars DEMO_HIGH_LATENCY=true` | Enable high-latency demo mode (no redeploy) |
| `gcloud run services update … --update-env-vars DEMO_HIGH_LATENCY=false` | Revert to production-speed mode |
