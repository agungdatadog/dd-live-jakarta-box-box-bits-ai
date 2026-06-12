#!/usr/bin/env python3
"""
traffic-sim/sim.py
==================
Long-running traffic simulation service for the NovaPay Royal Rumble demo.

Reads all settings from environment variables — no restart needed when using
`kubectl set env deployment/traffic-sim ENV=VALUE -n data-pipeline`.
A SIGHUP reloads env vars without restarting the process.

ENV VARS
--------
APP_URL             Cloud Run service URL (required)
TRAFFIC_RATE        Events per minute. Default: 12. Set 0 to pause traffic.
TRAFFIC_MODE        normal | burst | low | off
                      normal  → TRAFFIC_RATE events/min, weighted by product
                      burst   → 3× TRAFFIC_RATE (simulates Black Friday spike)
                      low     → 0.3× TRAFFIC_RATE (simulates off-peak)
                      off     → no events sent (freeze pipeline for demo)
DATA_QUALITY_MODE   normal | zero-prices | null-users | negative-qty | drop-payload | low-volume
                      normal        → clean valid events
                      zero-prices   → price_thb=0 → BigQuery Percent Zero monitor fires
                      null-users    → user_id=null → BigQuery Nullness monitor fires
                      negative-qty  → quantity<0, price_thb<0 → Percent Negative monitor fires
                      drop-payload  → send malformed JSON to checkout → 400 errors → Kafka
                                      messages not published → row count stops growing →
                                      Row Count anomaly monitor fires (takes ~15 min)
                      low-volume    → 1 event per 2 min → row count anomaly (takes ~30 min)
HOT_PRODUCTS        Comma-separated product IDs that get 3× traffic weight.
                    Default: rb-cap-001,mc-cap-001
LOG_LEVEL           INFO | DEBUG. Default: INFO
"""

import os, sys, time, random, uuid, json, signal, logging
import urllib.request, urllib.error

# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [traffic-sim] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("traffic-sim")

# ─── Product catalog ──────────────────────────────────────────────────────────
PRODUCTS = [
    {"id": "rb-cap-001",    "base_price": 1290, "team": "Red Bark Racing",   "category": "caps"},
    {"id": "rb-hoodie-001", "base_price": 3490, "team": "Red Bark Racing",   "category": "tops"},
    {"id": "mw-cap-001",    "base_price": 1390, "team": "Mercedes Woof AMG", "category": "caps"},
    {"id": "mw-jacket-001", "base_price": 5990, "team": "Mercedes Woof AMG", "category": "jackets"},
    {"id": "fl-cap-001",    "base_price": 1490, "team": "Ferrari LeBark",    "category": "caps"},
    {"id": "fl-tshirt-001", "base_price": 1990, "team": "Ferrari LeBark",    "category": "tops"},
    {"id": "mc-cap-001",    "base_price": 1390, "team": "McLaren Nor-ruff",  "category": "caps"},
    {"id": "mc-hoodie-001", "base_price": 3290, "team": "McLaren Nor-ruff",  "category": "tops"},
]
PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}

# ─── Config reader (reads ENV on every cycle for hot-reload) ──────────────────
def read_config() -> dict:
    hot_ids = [x.strip() for x in os.environ.get("HOT_PRODUCTS", "rb-cap-001,mc-cap-001").split(",")]
    weights = [3 if p["id"] in hot_ids else 1 for p in PRODUCTS]

    rate_env = float(os.environ.get("TRAFFIC_RATE", "12"))
    mode = os.environ.get("TRAFFIC_MODE", "normal").lower()
    dq   = os.environ.get("DATA_QUALITY_MODE", "normal").lower()
    app  = os.environ.get("APP_URL", "").rstrip("/")

    if not app:
        log.error("APP_URL not set — exiting")
        sys.exit(1)

    # Effective rate modifier by mode
    rate_mult = {"normal": 1.0, "burst": 3.0, "low": 0.3, "off": 0.0}.get(mode, 1.0)
    effective_rate = rate_env * rate_mult

    # low-volume mode overrides to 0.5 events/min (1 per 2 min)
    if dq == "low-volume":
        effective_rate = min(effective_rate, 0.5)

    sleep_s = (60.0 / effective_rate) if effective_rate > 0 else float("inf")

    return {
        "app": app,
        "mode": mode,
        "dq": dq,
        "rate": effective_rate,
        "sleep_s": sleep_s,
        "weights": weights,
    }

# ─── Build payload per mode ───────────────────────────────────────────────────
def build_payload(product: dict, dq_mode: str) -> dict | None:
    """
    Returns the POST body dict, or None to simulate a corrupt payload.
    """
    base = {
        "productId": product["id"],
        "quantity":  random.randint(1, 3),
        "priceThb":  product["base_price"],
        "team":      product["team"],
        "category":  product["category"],
        "userId":    f"traffic-sim-{uuid.uuid4().hex[:10]}",
    }

    if dq_mode == "normal":
        return base

    if dq_mode == "zero-prices":
        # ฿0 price → BigQuery Percent Zero on price_thb column
        base["priceThb"] = 0
        return base

    if dq_mode == "null-users":
        # null user_id → BigQuery Nullness spike on user_id column
        base["userId"] = None
        return base

    if dq_mode == "negative-qty":
        # Negative quantity + negative price → Percent Negative monitor
        base["quantity"] = -random.randint(1, 3)
        base["priceThb"] = -random.randint(500, 5000)
        return base

    if dq_mode == "drop-payload":
        # Send malformed JSON (wrong content-type header handled in send_event)
        # Returns a special sentinel that sends garbled bytes
        return {"_corrupt": True}

    if dq_mode == "low-volume":
        # Normal payload but sent very rarely (rate already slowed to 0.5/min above)
        return base

    return base  # fallback to normal

# ─── Send one checkout event ──────────────────────────────────────────────────
def send_event(app_url: str, payload: dict, dq_mode: str) -> bool:
    """Returns True on success (HTTP 200 + success:true)."""
    if payload.get("_corrupt"):
        # Send genuinely malformed request to trigger 400/500 → Kafka not published
        body = b"not-valid-json{{{{broken"
        req = urllib.request.Request(
            f"{app_url}/api/merch/checkout",
            data=body,
            headers={"Content-Type": "text/plain"},
            method="POST",
        )
    else:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{app_url}/api/merch/checkout",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            return result.get("success", False)
    except urllib.error.HTTPError as e:
        if e.code in (400, 422):
            log.debug("drop-payload mode: expected HTTP %d", e.code)
        else:
            log.warning("HTTP error %d for product %s", e.code, payload.get("productId", "?"))
        return False
    except Exception as e:
        log.warning("request failed: %s", e)
        return False

# ─── Weighted product picker ──────────────────────────────────────────────────
def pick_product(weights: list[int]) -> dict:
    total = sum(weights)
    r = random.randint(1, total)
    c = 0
    for i, w in enumerate(weights):
        c += w
        if r <= c:
            return PRODUCTS[i]
    return PRODUCTS[0]

# ─── Main loop ────────────────────────────────────────────────────────────────
def main():
    log.info("traffic-sim starting up")
    log.info("  APP_URL: %s", os.environ.get("APP_URL", "(unset)"))
    log.info("  TRAFFIC_MODE: %s", os.environ.get("TRAFFIC_MODE", "normal"))
    log.info("  TRAFFIC_RATE: %s events/min", os.environ.get("TRAFFIC_RATE", "12"))
    log.info("  DATA_QUALITY_MODE: %s", os.environ.get("DATA_QUALITY_MODE", "normal"))

    cycle = 0
    ok = err = 0
    report_every = 10  # log stats every N events

    while True:
        cfg = read_config()

        # ── Paused / off mode ──
        if cfg["mode"] == "off" or cfg["rate"] == 0:
            if cycle % 60 == 0:
                log.info("TRAFFIC_MODE=off — no events. Sleeping 10s.")
            time.sleep(10)
            cycle += 1
            continue

        # ── Pick product and build payload ──
        product = pick_product(cfg["weights"])
        payload = build_payload(product, cfg["dq"])

        # ── Send ──
        success = send_event(cfg["app"], payload, cfg["dq"])
        if success:
            ok += 1
            log.debug("ok | %s | mode=%s | dq=%s", product["id"], cfg["mode"], cfg["dq"])
        else:
            err += 1
            log.debug("err| %s | mode=%s | dq=%s", product["id"], cfg["mode"], cfg["dq"])

        # ── Periodic stats log ──
        cycle += 1
        if cycle % report_every == 0:
            log.info(
                "cycle=%d | ok=%d err=%d | mode=%s dq=%s | rate=%.1f/min",
                cycle, ok, err, cfg["mode"], cfg["dq"], cfg["rate"],
            )

        # ── Sleep between events ──
        sleep = cfg["sleep_s"] * random.uniform(0.7, 1.3)  # ±30% jitter
        time.sleep(max(0.5, sleep))


if __name__ == "__main__":
    main()
