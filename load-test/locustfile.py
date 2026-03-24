"""
Pitwall / Box-Box-Bits-AI  — Locust load simulator
====================================================
Simulates concurrent users chatting with the Pitwall AI and submitting
Dream-Team evaluations.  Designed to generate rich observability data in
Datadog (APM, LLMObs, RUM proxied via server logs).

Quick start:
    locust -f locustfile.py --host https://box-box-bits-ai-449012790678.asia-southeast1.run.app

Web UI:  http://localhost:8089

CLI (headless):
    locust -f locustfile.py --host <URL> -u 20 -r 2 --run-time 5m --headless

Environment variables:
    GEMINI_API_KEY      — if set, enables on-the-fly question generation via Gemini
    GEMINI_MODEL        — model for question generation (default: gemini-2.5-flash-lite)
    USE_GEMINI_QUESTIONS — "true" to use Gemini questions instead of the static bank
"""

from __future__ import annotations

import json
import os
import random
import time
import uuid
from typing import Optional

from dotenv import load_dotenv
from faker import Faker
from locust import HttpUser, TaskSet, between, events, task
from locust.exception import StopUser

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

fake = Faker()

# ── Load pre-generated questions bank (if available) ─────────────────────────
# Run generate_questions.py first to create questions_bank.json.
# If the file exists it is merged with the static bank for more variety.

_BANK_FILE = os.path.join(os.path.dirname(__file__), "questions_bank.json")
_EXTRA_QUESTIONS: list[str] = []
if os.path.exists(_BANK_FILE):
    try:
        with open(_BANK_FILE, encoding="utf-8") as _f:
            _EXTRA_QUESTIONS = json.load(_f)
        print(f"[info] Loaded {len(_EXTRA_QUESTIONS)} questions from questions_bank.json")
    except Exception as _e:
        print(f"[warn] Could not load questions_bank.json: {_e}")

# ── Character roster (mirrors data/characters.json) ──────────────────────────

DRIVERS = [
    "drv_max_furstappen", "drv_liam_pawson", "drv_george_ruffell",
    "drv_kimi_antonellhound", "drv_charles_lebark", "drv_lewis_howlmilton",
    "drv_lando_norruff", "drv_pawscar_piastri", "drv_furnando_alonso",
    "drv_lance_strollhound", "drv_pierre_gasleash", "drv_jack_doghan",
    "drv_alex_albone", "drv_carlos_spaniel", "drv_yuki_tsudoga",
    "drv_isack_houndjar", "drv_nico_howlkenberg", "drv_gabriel_barktoleto",
    "drv_esteban_ocorgi", "drv_ollie_bearmutt",
]

PRINCIPALS = [
    "prin_christian_horndog", "prin_toto_woof", "prin_fred_basseteur",
    "prin_andrea_setterla", "prin_mike_krackenhound", "prin_oliver_oakeshound",
    "prin_james_vowleshound", "prin_laurent_mekieshound", "prin_mattia_binotdog",
    "prin_ayao_komuttsu",
]

ENGINEERS = [
    "eng_gp_lambarki", "eng_bono_bark", "eng_bryan_barkzzi", "eng_will_josniff",
    "eng_chris_crosniff", "eng_karel_loobark", "eng_james_urwoof",
    "eng_mattia_spidogi", "eng_jorn_barker", "eng_mark_sladog",
]

STRATEGISTS = [
    "strat_hannah_schnauzer",
    "strat_bernie_collie",
    "strat_rosie_barkcombe",
]

TECH_DIRECTORS = [
    "tech_adrian_newfoundland",
    "tech_james_afghan",
    "tech_pierre_weimaraner",
]

# ── Static F1 question bank ───────────────────────────────────────────────────

PITWALL_QUESTIONS_GENERAL = [
    # Race strategy
    "What's the optimal tire strategy for Monaco this season?",
    "When should a team use the undercut vs overcut?",
    "How does a VSC period change the strategy call to pit?",
    "Explain the difference between a one-stop and two-stop strategy at Silverstone.",
    "How do teams decide which compound to start the race on?",
    "What data does the strategy wall use to call a pit stop?",
    "Can you explain what DRS harvesting means?",
    "Why do some teams prefer to start on the hard tyre?",
    "How does track position affect strategy in Monaco vs Monza?",
    "What happens to tyre deg in the last 10 laps of a race?",
    # Driver comparisons
    "Compare Max Verstappen and Lewis Hamilton's driving styles.",
    "Is Lando Norris ready to be a world champion?",
    "How does Charles Leclerc's wet weather ability compare to other drivers?",
    "Who has the best first lap in the current grid?",
    "Which driver has improved the most over the last two seasons?",
    "What makes Fernando Alonso still competitive at his age?",
    "How does George Russell manage tyre temperatures differently from others?",
    "Who is the best qualifier on the current grid?",
    "Compare Oscar Piastri and Lando Norris as a driver pairing.",
    "Which rookie driver has the most potential right now?",
    # Technical F1 facts
    "How does the DRS system work mechanically?",
    "What is the floor effect in F1 and why is it so important?",
    "Explain porpoising and why it was such a big problem in 2022.",
    "How does KERS / ERS differ between hybrid teams?",
    "What is a flexi-wing and why do the FIA keep testing for it?",
    "How do F1 tyres generate heat and what is the temperature window?",
    "Explain the Drag Reduction System activation rules.",
    "What is the difference between rake angle setups?",
    "How do F1 engineers balance downforce vs drag for different circuits?",
    "What does 'washing out' mean in oversteer vs understeer?",
    # Teams & championships
    "What went wrong with Red Bull after Adrian Newey left?",
    "Why has Mercedes struggled in the ground-effect era?",
    "How close is McLaren to winning the Constructors Championship?",
    "What makes Ferrari's strategy often go wrong under pressure?",
    "How has Aston Martin changed since becoming a works team?",
    "What is the budget cap and how does it affect smaller teams?",
    "Why did the sport introduce the cost cap regulation?",
    "Which team has the best pit crew performance this season?",
    "How does the Concorde Agreement affect team finances?",
    "Which team gained the most performance over the winter?",
    # History
    "What made the 2021 Abu Dhabi finale so controversial?",
    "Describe the 2023 season where Verstappen won 19 races.",
    "What is the 'Senna vs Prost' rivalry all about?",
    "How many world championships has Lewis Hamilton won?",
    "What is the fastest lap record at Monza?",
    "What happened at the 1994 San Marino Grand Prix?",
    "Who holds the record for most pole positions in F1 history?",
    "Explain the refuelling ban in F1 and when it happened.",
    "What made the Brawn GP 2009 season so remarkable?",
    "How did Red Bull dominate the 2011-2013 era?",
    # Live race questions
    "What does 'box box box' mean on F1 team radio?",
    "How does the Safety Car procedure work?",
    "What triggers a Virtual Safety Car vs a full Safety Car?",
    "Can you explain what a penalty for track limits looks like?",
    "What is a 'snap of oversteer' in driver radio terminology?",
    "What does 'harvesting' mean in a hybrid context?",
    "How does the anti-stall system protect the engine?",
    "What is 'lift and coast' and when do drivers use it?",
    "Explain what 'he's on a different compound' means for strategy.",
    "What is a 'purple sector' in qualifying?",
]

# Intentionally provocative fan takes — used at 50% weight to stress-test
# Bits AI's handling of negative / adversarial inputs in LLM Observability.
PITWALL_QUESTIONS_PIASTRI_ATTACK = [
    "Is Oscar Piastri actually overrated or does he deserve all the McLaren hype?",
    "Why does Piastri always seem to disappear in the wet? Is it a weakness?",
    "Piastri had the faster car all season and still couldn't beat Norris. What went wrong?",
    "Does Oscar Piastri have any real racecraft or does he just follow the strategy call?",
    "Be honest — is Piastri just a number two driver who got lucky with the McLaren upgrade timing?",
    "Piastri keeps making silly mistakes under pressure. Is that a mental problem?",
    "Why does Piastri look so ordinary when the safety car restarts? No instinct?",
    "Norris outqualified Piastri more times than the stats show. Why does everyone ignore that?",
    "Is Piastri too passive on the opening lap? He never fights for position.",
    "Do you think McLaren secretly wishes they'd kept a more experienced driver instead of Piastri?",
    "Piastri's radio communications sound robotic and disengaged. Does that affect his racing?",
    "Why does Piastri bottle it every time he's within half a second of the lead?",
    "Has Piastri ever actually won a race on pure pace, or is it always strategy-assisted?",
    "Is it fair to say Piastri is just the 'safe' choice — consistent but never exciting?",
    "Lando Norris would have been champion if McLaren hadn't wasted strategy calls trying to help Piastri, right?",
]

# Combined list kept for compatibility (e.g. generate_questions fallback).
PITWALL_QUESTIONS = PITWALL_QUESTIONS_GENERAL + PITWALL_QUESTIONS_PIASTRI_ATTACK


def _pick_question(extra: list[str] | None = None) -> str:
    """Return a question with a 50% chance of being a Piastri attack question.

    The remaining 50% is drawn equally from the general bank and any
    pre-generated questions in ``extra`` (questions_bank.json).
    """
    if random.random() < 0.50:
        return random.choice(PITWALL_QUESTIONS_PIASTRI_ATTACK)
    general = (extra + PITWALL_QUESTIONS_GENERAL) if extra else PITWALL_QUESTIONS_GENERAL
    return random.choice(general)

# ── Gemini-based question generation (optional, live) ─────────────────────────

_gemini_client: Optional[object] = None


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        try:
            from google import genai  # type: ignore
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                return None
            _gemini_client = genai.Client(api_key=api_key)
        except ImportError:
            return None
    return _gemini_client


def generate_gemini_question(context_topic: str | None = None) -> str:
    """Generate a single realistic F1 question using Gemini."""
    client = _get_gemini_client()
    if client is None:
        return random.choice(PITWALL_QUESTIONS)

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
    topic = context_topic or random.choice([
        "race strategy", "driver comparison", "technical regulations",
        "team politics", "tyre compounds", "historical F1 moments",
        "current championship standings", "qualifying tactics",
    ])
    prompt = (
        f"Generate exactly ONE short, specific, natural question that an F1 fan would ask "
        f"an AI race engineer about: {topic}. "
        "The question should sound like a real person chatting — curious, engaged, maybe a little excited. "
        "Return ONLY the question text, nothing else, no quotes, no preamble."
    )
    try:
        response = client.models.generate_content(model=model, contents=prompt)
        q = (response.text or "").strip().strip('"').strip("'")
        return q if q else random.choice(PITWALL_QUESTIONS)
    except Exception:
        return random.choice(PITWALL_QUESTIONS)


# ── Helper to pick a random valid team selection ──────────────────────────────

def _random_team_selection() -> tuple[dict, int]:
    """Return (selection_dict, base_stats) with valid distinct character picks."""
    d1, d2 = random.sample(DRIVERS, 2)
    e1, e2 = random.sample(ENGINEERS, 2)
    selection = {
        "team_principal": random.choice(PRINCIPALS),
        "driver_1": d1,
        "driver_2": d2,
        "race_engineer_1": e1,
        "race_engineer_2": e2,
        "head_of_strategy": random.choice(STRATEGISTS),
        "technical_director": random.choice(TECH_DIRECTORS),
    }
    # Mimic the visible_stats sum the frontend calculates (rough simulation)
    base_stats = random.randint(420, 680)
    return selection, base_stats


# ── Locust User classes ───────────────────────────────────────────────────────

class PitwallChatUser(HttpUser):
    """
    Simulates a fan chatting with the Pitwall AI.
    Each virtual user:
      - gets a unique userId + sessionId
      - sends between 3 and 8 messages per session
      - waits a human-like pause between messages

    Wait time is intentionally generous (8–20 s) to stay within Gemini's
    free-tier rate limit (~10 RPM).  If you hit RESOURCE_EXHAUSTED (429)
    increase wait_time or reduce the user count in the Locust UI.
    """
    wait_time = between(8, 20)  # generous gap to respect Gemini RPM quota
    weight = 3                   # 3× more chat users than dream-team users

    def on_start(self):
        self.user_id = str(uuid.uuid4())
        self.username = fake.first_name() + "_" + fake.last_name().split()[0]
        self.session_id = str(uuid.uuid4())
        self._use_gemini = os.environ.get("USE_GEMINI_QUESTIONS", "false").lower() == "true"
        self._msg_count = 0
        self._topics = random.sample([
            "race strategy", "driver comparison", "tyre compounds",
            "technical regulations", "team politics", "historical moments",
        ], k=3)

    @task(5)
    def chat_static_question(self):
        """Send a question — 50% chance of Piastri attack, 50% general/pre-generated."""
        message = _pick_question(extra=_EXTRA_QUESTIONS or None)
        self._send_pitwall_message(message)

    @task(2)
    def chat_gemini_question(self):
        """Send a Gemini-generated question (only active when USE_GEMINI_QUESTIONS=true)."""
        if not self._use_gemini:
            message = _pick_question()
        else:
            topic = self._topics[self._msg_count % len(self._topics)]
            message = generate_gemini_question(topic)
        self._send_pitwall_message(message)

    @task(1)
    def chat_followup(self):
        """Send a follow-up phrased question to simulate a real conversation thread."""
        followups = [
            "Can you expand on that?",
            "Why does that happen specifically in Monaco though?",
            "What about when it's raining?",
            "Has a team ever done that and it backfired badly?",
            "Who is best at that in the current grid?",
            "How does that affect the championship picture?",
            "What would Verstappen do in that situation?",
            "Is that different from how it worked in the V8 era?",
            "Which team pioneered that approach?",
            "Box box! What tyres are they going on?",
        ]
        self._send_pitwall_message(random.choice(followups))

    def _send_pitwall_message(self, message: str):
        payload = {
            "message": message,
            "userId": self.user_id,
            "username": self.username,
            "sessionId": self.session_id,
        }
        with self.client.post(
            "/api/pitwall",
            json=payload,
            catch_response=True,
            name="/api/pitwall",
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if not data.get("success"):
                    resp.failure(f"success=false: {data.get('error', 'unknown')}")
                else:
                    resp.success()
            elif resp.status_code == 429:
                # Gemini quota exhausted — back off before the next task fires
                resp.failure("Gemini rate limited (429) — reduce users or increase wait_time")
                time.sleep(random.uniform(10, 20))
            else:
                resp.failure(f"HTTP {resp.status_code}")
        self._msg_count += 1


class DreamTeamUser(HttpUser):
    """
    Simulates an audience member building and submitting a dream team.
    Each virtual user:
      - picks a random valid lineup
      - submits it to /api/evaluate-team
      - waits a longer pause (simulates a user thinking about their picks)
    """
    wait_time = between(15, 45)  # longer pause — user is "thinking" about their team
    weight = 1

    def on_start(self):
        self.user_id = str(uuid.uuid4())
        self.username = fake.first_name() + "_" + fake.last_name().split()[0]
        self.session_id = str(uuid.uuid4())

    @task
    def evaluate_team(self):
        selection, base_stats = _random_team_selection()
        payload = {
            "userId": self.user_id,
            "username": self.username,
            "sessionId": self.session_id,
            "selection": selection,
            "baseTeamStats": base_stats,
        }
        with self.client.post(
            "/api/evaluate-team",
            json=payload,
            catch_response=True,
            name="/api/evaluate-team",
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    score = data.get("finalScore", "?")
                    synergy = data.get("synergyClass", "?")
                    resp.success()
                    # Locust custom log shown in --headless mode
                    print(
                        f"[DreamTeam] {self.username} → {synergy} | score={score} "
                        f"| codename='{data.get('teamCodename', '?')}'"
                    )
                else:
                    resp.failure(f"success=false: {data.get('error', 'unknown')}")
            elif resp.status_code == 429:
                resp.failure("Rate limited (429)")
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")


# ── Event hooks (printed to console, visible in Locust output) ─────────────────

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    host = environment.host or "(unknown)"
    print(f"\n{'='*60}")
    print(f"  Pitwall Load Simulation — target: {host}")
    print(f"  Gemini questions: {os.environ.get('USE_GEMINI_QUESTIONS', 'false')}")
    print(f"  Gemini model:     {os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash-lite')}")
    print(f"{'='*60}\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.stats
    print(f"\n{'='*60}")
    print("  Simulation finished")
    print(f"  Total requests : {stats.total.num_requests}")
    print(f"  Failures       : {stats.total.num_failures}")
    print(f"  Median (ms)    : {stats.total.median_response_time}")
    print(f"  p95 (ms)       : {stats.total.get_response_time_percentile(0.95)}")
    print(f"{'='*60}\n")
