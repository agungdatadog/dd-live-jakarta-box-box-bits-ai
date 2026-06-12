#!/usr/bin/env python3
"""
scripts/demo-traffic.py
=======================
Generates Kafka transaction traffic and simulates dynamic pricing fluctuations
for the Royal Rumble 2026 demo.

Sends checkout events to the /api/merch/checkout endpoint (full pipeline:
Cloud Run → Kafka → bq-sink → BigQuery). After sending, optionally triggers
an immediate dbt run so price changes are visible within ~60 seconds.

Usage
-----
  # Pre-warm demo with realistic baseline (run 5 min before demo)
  python3 scripts/demo-traffic.py --scenario warm

  # Spike Red Bull / McLaren items to max price (×1.5) for the demo
  python3 scripts/demo-traffic.py --scenario spike

  # Simulate race-day excitement: high demand on all items with varied multipliers
  python3 scripts/demo-traffic.py --scenario race-day

  # Show current live prices from BigQuery
  python3 scripts/demo-traffic.py --show-prices

  # Watch prices update in real time (polls every 30s)
  python3 scripts/demo-traffic.py --watch

  # Send N checkouts for a specific product
  python3 scripts/demo-traffic.py --product rb-cap-001 --quantity 8

  # Trigger an immediate dbt run after sending events (shows price impact faster)
  python3 scripts/demo-traffic.py --scenario spike --trigger-dbt

  # Dry run — show what would be sent without calling the API
  python3 scripts/demo-traffic.py --scenario race-day --dry-run

Environment
-----------
  BASE_URL  — Cloud Run service URL (default: production URL)
  BQ_PROJECT — BigQuery project (default: datadog-ese-sandbox)

Multiplier formula (from dbt/models/dynamic_pricing.sql):
  multiplier = min(1.0 + (units_sold_1h × 0.05), 1.5)
  ┌─────────────────────────────────────────────────────┐
  │ units sold │  multiplier  │  price impact           │
  │──────────── ─────────────  ─────────────────────────│
  │     0       │    ×1.0     │  base price             │
  │     2       │    ×1.1     │  +10%  (low demand)     │
  │     4       │    ×1.2     │  +20%  (moderate)       │
  │     6       │    ×1.3     │  +30%  (popular)        │
  │     8       │    ×1.4     │  +40%  (hot)            │
  │    10+      │    ×1.5     │  +50%  (max / sold out) │
  └─────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import json
import uuid
from datetime import datetime, timezone
from typing import NamedTuple

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_URL = os.getenv(
    "BASE_URL",
    "https://box-box-bits-ai-449012790678.asia-southeast1.run.app",
)
BQ_PROJECT  = os.getenv("BQ_PROJECT", "datadog-ese-sandbox")
KUBE_CTX    = "gke_datadog-ese-sandbox_asia-southeast1-b_nuttee-cluster-1"
NAMESPACE   = "data-pipeline"

# ─── Product catalog ──────────────────────────────────────────────────────────

class Product(NamedTuple):
    id: str
    name: str
    team: str
    base_price: int
    category: str

PRODUCTS = [
    Product("rb-cap-001",    "Horndog Racing Cap",        "Red Bark Racing",   1290, "caps"),
    Product("rb-hoodie-001", "Horndog Team Hoodie",       "Red Bark Racing",   3490, "tops"),
    Product("mw-cap-001",    "Mercedes Woof Cap",         "Mercedes Woof AMG", 1390, "caps"),
    Product("mw-jacket-001", "Mercedes Woof Jacket",      "Mercedes Woof AMG", 5990, "jackets"),
    Product("fl-cap-001",    "Ferrari LeBark Cap",        "Ferrari LeBark",    1490, "caps"),
    Product("fl-tshirt-001", "Ferrari LeBark T-Shirt",    "Ferrari LeBark",    1990, "tops"),
    Product("mc-cap-001",    "McLaren Nor-ruff Cap",      "McLaren Nor-ruff",  1390, "caps"),
    Product("mc-hoodie-001", "McLaren Nor-ruff Hoodie",   "McLaren Nor-ruff",  3290, "tops"),
]
PRODUCT_BY_ID = {p.id: p for p in PRODUCTS}

# ─── Demand scenarios ─────────────────────────────────────────────────────────
# Each scenario is a list of (product_id, units_to_send) tuples.
# dbt multiplier = min(1.0 + units_sold_1h × 0.05, 1.5)

SCENARIOS: dict[str, list[tuple[str, int]]] = {
    # Pre-demo warm-up: realistic baseline with some variance
    "warm": [
        ("rb-cap-001",    4),   # ×1.20 — popular
        ("rb-hoodie-001", 2),   # ×1.10
        ("mw-cap-001",    1),   # ×1.05
        ("mw-jacket-001", 3),   # ×1.15
        ("fl-cap-001",    1),   # ×1.05
        ("fl-tshirt-001", 2),   # ×1.10
        ("mc-cap-001",    5),   # ×1.25 — hot
        ("mc-hoodie-001", 2),   # ×1.10
    ],

    # Spike: push Red Bull + McLaren caps to maximum ×1.5
    "spike": [
        ("rb-cap-001",    10),  # ×1.50 MAX — sold out energy
        ("mc-cap-001",    10),  # ×1.50 MAX
        ("rb-hoodie-001",  6),  # ×1.30
        ("mw-jacket-001",  4),  # ×1.20
        ("fl-cap-001",     1),  # ×1.05 — slow mover
        ("mc-hoodie-001",  8),  # ×1.40
    ],

    # Race day: high excitement, all items moving
    "race-day": [
        ("rb-cap-001",    8),   # ×1.40
        ("rb-hoodie-001", 5),   # ×1.25
        ("mw-cap-001",    6),   # ×1.30
        ("mw-jacket-001", 4),   # ×1.20
        ("fl-cap-001",    3),   # ×1.15
        ("fl-tshirt-001", 4),   # ×1.20
        ("mc-cap-001",    9),   # ×1.45
        ("mc-hoodie-001", 6),   # ×1.30
    ],

    # Cool-down: low traffic so prices drift back toward base over the hour
    "cooldown": [
        ("rb-cap-001",    1),
        ("mc-cap-001",    1),
    ],
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _color(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m"

def green(t: str)  -> str: return _color(t, "1;32")
def yellow(t: str) -> str: return _color(t, "1;33")
def red(t: str)    -> str: return _color(t, "1;31")
def cyan(t: str)   -> str: return _color(t, "1;36")
def bold(t: str)   -> str: return _color(t, "1")

def multiplier_for(units: int) -> float:
    return min(1.0 + units * 0.05, 1.5)

def price_for(base: int, units: int) -> int:
    m = multiplier_for(units)
    return int(round(base * m / 10.0) * 10)

def mult_label(m: float) -> str:
    if m >= 1.45:   return red(f"×{m:.2f} 🔥 MAX")
    if m >= 1.30:   return red(f"×{m:.2f} HOT")
    if m >= 1.15:   return yellow(f"×{m:.2f}")
    return green(f"×{m:.2f}")

# ─── Checkout API call ────────────────────────────────────────────────────────

def checkout(product: Product, quantity: int, dry_run: bool) -> bool:
    payload = {
        "productId":  product.id,
        "quantity":   quantity,
        "priceThb":   product.base_price,
        "team":       product.team,
        "category":   product.category,
        "userId":     f"demo-traffic-{uuid.uuid4().hex[:8]}",
    }
    if dry_run:
        print(f"  [dry-run] POST /api/merch/checkout  {product.id} ×{quantity}")
        return True
    try:
        data    = json.dumps(payload).encode()
        req     = urllib.request.Request(
            f"{BASE_URL}/api/merch/checkout",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            return body.get("success", False)
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"  {red('ERROR')} {product.id}: {exc}")
        return False

# ─── Send a scenario ──────────────────────────────────────────────────────────

def send_scenario(
    items: list[tuple[str, int]],
    dry_run: bool,
    delay_ms: int = 200,
) -> None:
    total_events = sum(q for _, q in items)
    print(f"\n{bold('Sending')} {total_events} checkout events across {len(items)} products...")
    print(f"{'─' * 60}")

    ok = err = 0
    for product_id, quantity in items:
        p = PRODUCT_BY_ID[product_id]
        expected_mult  = multiplier_for(quantity)
        expected_price = price_for(p.base_price, quantity)

        print(f"  {p.name:<30} {quantity:>3} units  "
              f"{mult_label(expected_mult)}  "
              f"฿{p.base_price:,} → ฿{expected_price:,}")

        # Send one-by-one for realistic Kafka message spread
        for _ in range(quantity):
            success = checkout(p, 1, dry_run)
            if success:
                ok += 1
            else:
                err += 1
            if delay_ms > 0 and not dry_run:
                time.sleep(delay_ms / 1000)

    print(f"{'─' * 60}")
    if dry_run:
        print(f"  {cyan('[dry-run]')} {total_events} events would have been sent")
    else:
        status = green(f"{ok} ok") + (f", {red(str(err) + ' failed')}" if err else "")
        print(f"  {status} — events now in Kafka → bq-sink → BigQuery")

# ─── BigQuery price table ─────────────────────────────────────────────────────

def show_prices(label: str = "Current prices") -> None:
    try:
        result = subprocess.run(
            [
                "bq", "query", "--nouse_legacy_sql",
                "--format=json",
                f"--project_id={BQ_PROJECT}",
                """
                SELECT
                  product_id,
                  base_price_thb,
                  demand_multiplier,
                  current_price_thb,
                  units_sold_1h,
                  FORMAT_TIMESTAMP('%H:%M:%S', dbt_updated_at) AS last_updated
                FROM `datadog-ese-sandbox.novapay_analytics.dynamic_pricing`
                ORDER BY demand_multiplier DESC
                """,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0 or not result.stdout.strip():
            print(f"  {yellow('BigQuery query failed or no data yet.')}")
            return

        rows = json.loads(result.stdout)
        now  = datetime.now(timezone.utc).strftime("%H:%M:%S")

        print(f"\n{bold(label)}  (as of {now} UTC, last dbt run: {rows[0]['last_updated'] if rows else '?'})")
        print(f"{'─' * 82}")
        print(f"  {'Product':<32} {'Base ฿':>8}  {'Mult':>6}  {'Live ฿':>8}  {'Units/1h':>9}  Last dbt")
        print(f"{'─' * 82}")

        for row in rows:
            p        = PRODUCT_BY_ID.get(row["product_id"])
            name     = p.name if p else row["product_id"]
            base     = int(float(row["base_price_thb"]))
            mult     = float(row["demand_multiplier"])
            live     = int(float(row["current_price_thb"]))
            units    = int(row["units_sold_1h"] or 0)
            updated  = row["last_updated"]

            change = ""
            if live > base:
                pct    = round((live - base) / base * 100)
                change = red(f"+{pct}%")

            print(
                f"  {name:<32} {base:>7,}฿  "
                f"{mult_label(mult):>6}  "
                f"{live:>7,}฿  "
                f"{str(units) + ' sold':>9}  "
                f"{updated}  {change}"
            )
        print(f"{'─' * 82}")
        print(f"  Prices update after next dbt run (every 5 min)")

    except FileNotFoundError:
        print(f"  {yellow('bq CLI not found — install Google Cloud SDK to view prices')}")
    except subprocess.TimeoutExpired:
        print(f"  {yellow('BigQuery query timed out')}")

# ─── Trigger immediate dbt run ────────────────────────────────────────────────

def trigger_dbt() -> None:
    job_name = f"dbt-demo-{int(time.time())}"
    print(f"\n{cyan('Triggering immediate dbt run')} ({job_name})...")
    try:
        subprocess.run(
            [
                "kubectl", "create", "job", job_name,
                "--from=cronjob/dbt-pricing",
                f"--namespace={NAMESPACE}",
                f"--context={KUBE_CTX}",
            ],
            check=True,
            capture_output=True,
            timeout=15,
        )
        print(f"  dbt job started — prices will update in ~60 seconds")
        print(f"  Monitor: kubectl logs -l job-name={job_name} -n {NAMESPACE} -f")
    except subprocess.CalledProcessError as e:
        print(f"  {yellow('Could not trigger dbt:')} {e.stderr.decode().strip()}")
    except FileNotFoundError:
        print(f"  {yellow('kubectl not found — dbt will run on its normal 5-min schedule')}")

# ─── Watch mode ───────────────────────────────────────────────────────────────

def watch_prices(interval_sec: int = 30) -> None:
    print(f"{cyan('Watch mode')} — polling prices every {interval_sec}s (Ctrl+C to stop)")
    try:
        while True:
            show_prices("Live prices")
            for remaining in range(interval_sec, 0, -1):
                sys.stdout.write(f"\r  Next refresh in {remaining:2d}s...  ")
                sys.stdout.flush()
                time.sleep(1)
            print()
    except KeyboardInterrupt:
        print(f"\n{green('Watch stopped.')}")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Kafka demo traffic and show dynamic pricing fluctuations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--scenario",
        choices=list(SCENARIOS.keys()),
        help="Send a predefined demand scenario: warm | spike | race-day | cooldown",
    )
    group.add_argument(
        "--product",
        metavar="PRODUCT_ID",
        help="Send events for a single product (use with --units)",
    )
    group.add_argument(
        "--show-prices",
        action="store_true",
        help="Display current prices from BigQuery and exit",
    )
    group.add_argument(
        "--watch",
        action="store_true",
        help="Watch prices update in real time (polls BigQuery every 30s)",
    )

    parser.add_argument(
        "--units",
        type=int,
        default=10,
        metavar="N",
        help="Units to send when using --product (default: 10 = max multiplier)",
    )
    parser.add_argument(
        "--trigger-dbt",
        action="store_true",
        help="Trigger an immediate dbt run after sending events (shows price impact faster)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be sent without calling the API",
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=150,
        metavar="MS",
        help="Delay between each checkout call in milliseconds (default: 150)",
    )

    args = parser.parse_args()

    print(f"\n{bold('Box Box Bits AI — Demo Traffic Generator')}")
    print(f"  Target: {BASE_URL}")
    print(f"  BQ:     {BQ_PROJECT}.novapay_analytics.dynamic_pricing")

    if args.show_prices:
        show_prices()
        return

    if args.watch:
        watch_prices()
        return

    if args.product:
        p = PRODUCT_BY_ID.get(args.product)
        if not p:
            print(f"\n{red('Unknown product:')} {args.product}")
            print(f"  Available: {', '.join(PRODUCT_BY_ID)}")
            sys.exit(1)
        items = [(args.product, args.units)]
    elif args.scenario:
        items = SCENARIOS[args.scenario]
    else:
        parser.print_help()
        print(f"\n{bold('Demo cheat sheet:')}")
        print(f"  Pre-demo warm-up   : python3 scripts/demo-traffic.py --scenario warm --trigger-dbt")
        print(f"  Spike for Act 2    : python3 scripts/demo-traffic.py --scenario spike --trigger-dbt")
        print(f"  Live watch         : python3 scripts/demo-traffic.py --watch")
        print(f"  Simulate race day  : python3 scripts/demo-traffic.py --scenario race-day --trigger-dbt")
        print()
        return

    # Show current prices before
    show_prices("Prices BEFORE")

    # Send events
    send_scenario(items, args.dry_run, args.delay_ms)

    # Optionally trigger dbt
    if args.trigger_dbt and not args.dry_run:
        trigger_dbt()
        print(f"\n  Waiting 75s for dbt to complete...")
        for i in range(75, 0, -5):
            sys.stdout.write(f"\r  {i:2d}s remaining...  ")
            sys.stdout.flush()
            time.sleep(5)
        print()
        show_prices("Prices AFTER dbt run")
    else:
        if not args.dry_run:
            print(f"\n  {cyan('Tip:')} add --trigger-dbt to see prices update immediately")
            print(f"       or run: python3 scripts/demo-traffic.py --watch")

    print()


if __name__ == "__main__":
    main()
