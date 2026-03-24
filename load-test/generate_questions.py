"""
generate_questions.py
=====================
Pre-generates a bank of realistic F1 user questions using Gemini and
writes them to questions_bank.json.

These questions are then loaded by locustfile.py during a simulation run,
giving you more varied and realistic chat inputs without the latency of
calling Gemini inside each Locust task.

Usage:
    python generate_questions.py                    # generates 100 questions
    python generate_questions.py --count 200        # generates 200 questions
    python generate_questions.py --count 50 --topics "race strategy,drivers"

Environment variables:
    GEMINI_API_KEY   — required
    GEMINI_MODEL     — optional (default: gemini-2.5-flash-lite)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env.local")

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_MODEL = "gemini-2.5-flash-lite"
OUTPUT_FILE = Path(__file__).parent / "questions_bank.json"

F1_TOPICS = [
    "race strategy and pit stop timing",
    "tyre compound selection and degradation",
    "driver head-to-head comparisons (current grid)",
    "technical regulations and car development",
    "team politics and team principals",
    "DRS, ERS, and hybrid power unit",
    "qualifying lap analysis",
    "historical F1 moments and records",
    "championship standings and title fight",
    "wet weather racing and safety cars",
    "undercut and overcut strategy",
    "F1 circuit characteristics",
    "rookie drivers and driver development",
    "F1 cost cap and budget regulations",
    "race engineering and radio communications",
    "overtaking moves and defensive driving",
    "crash analysis and incident investigations",
    "aerodynamics and downforce concepts",
    "team factory technology and wind tunnels",
    "FIA stewards decisions and penalties",
]

# ── Async question generation ─────────────────────────────────────────────────

async def generate_batch(
    client,
    model: str,
    topic: str,
    count: int,
) -> list[str]:
    """Generate `count` questions about `topic` in a single Gemini call."""
    prompt = (
        f"You are an F1 fan chatting with an AI race engineer assistant called 'Bits AI'. "
        f"Generate exactly {count} different, specific, natural questions about: **{topic}**.\n\n"
        "Rules:\n"
        "- Each question must be on its own line (no numbering, no bullets, no quotes)\n"
        "- Sound like a real curious fan — conversational, direct, sometimes excited\n"
        "- Vary the length: some short (5 words), some longer (20 words)\n"
        "- Include questions about current F1 season, historical comparisons, and technical curiosity\n"
        "- Do NOT include any preamble, explanation, or line numbers — ONLY the questions\n\n"
        f"Generate exactly {count} questions now:"
    )
    try:
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.models.generate_content(model=model, contents=prompt),
        )
        raw = response.text or ""
        lines = [
            ln.strip().strip("-•*").strip()
            for ln in raw.splitlines()
            if ln.strip() and not ln.strip()[0].isdigit()
        ]
        # Also accept lines that start with a digit followed by dot/paren
        questions = []
        for ln in raw.splitlines():
            ln = ln.strip()
            if not ln:
                continue
            # Strip leading "1. " or "1) " style numbering
            import re
            ln = re.sub(r"^\d+[\.\)]\s*", "", ln)
            ln = ln.strip("-•* \t\"'")
            if ln and len(ln) > 8 and "?" in ln:
                questions.append(ln)
        return questions[:count]
    except Exception as e:
        print(f"  [warn] Gemini error for topic '{topic}': {e}", file=sys.stderr)
        return []


async def generate_all(
    api_key: str,
    model: str,
    total: int,
    topics: list[str],
    concurrency: int = 5,
) -> list[str]:
    """Generate `total` questions across all topics, with limited concurrency."""
    from google import genai

    client = genai.Client(api_key=api_key)

    per_topic = max(1, total // len(topics))
    remainder = total - (per_topic * len(topics))

    tasks = []
    for i, topic in enumerate(topics):
        n = per_topic + (1 if i < remainder else 0)
        tasks.append((topic, n))

    semaphore = asyncio.Semaphore(concurrency)
    all_questions: list[str] = []
    completed = 0

    async def bounded_generate(topic: str, count: int):
        nonlocal completed
        async with semaphore:
            print(f"  Generating {count} questions about: {topic} …")
            qs = await generate_batch(client, model, topic, count)
            all_questions.extend(qs)
            completed += 1
            print(f"  [{completed}/{len(tasks)}] Got {len(qs)} questions for: {topic}")

    await asyncio.gather(*[bounded_generate(t, n) for t, n in tasks])
    return all_questions


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Pre-generate F1 questions with Gemini for Locust load testing."
    )
    parser.add_argument(
        "--count", type=int, default=100,
        help="Total number of questions to generate (default: 100)"
    )
    parser.add_argument(
        "--topics", type=str, default=None,
        help="Comma-separated list of topics (default: built-in F1 topic list)"
    )
    parser.add_argument(
        "--model", type=str, default=None,
        help=f"Gemini model (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--concurrency", type=int, default=5,
        help="Number of parallel Gemini requests (default: 5)"
    )
    parser.add_argument(
        "--output", type=str, default=str(OUTPUT_FILE),
        help=f"Output JSON file path (default: {OUTPUT_FILE})"
    )
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    model = args.model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    topics = [t.strip() for t in args.topics.split(",")] if args.topics else F1_TOPICS
    output_path = Path(args.output)

    print(f"\nGenerating {args.count} questions")
    print(f"Model     : {model}")
    print(f"Topics    : {len(topics)}")
    print(f"Concurrent: {args.concurrency}")
    print(f"Output    : {output_path}\n")

    start = time.time()
    questions = asyncio.run(
        generate_all(
            api_key=api_key,
            model=model,
            total=args.count,
            topics=topics,
            concurrency=args.concurrency,
        )
    )

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for q in questions:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)

    print(f"\nGenerated {len(unique)} unique questions in {time.time() - start:.1f}s")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(unique, f, indent=2, ensure_ascii=False)

    print(f"Saved to: {output_path}")
    print("\nSample questions:")
    for q in unique[:5]:
        print(f"  • {q}")


if __name__ == "__main__":
    main()
