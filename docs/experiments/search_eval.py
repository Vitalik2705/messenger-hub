"""
Evaluates the three history searches of Messenger Hub on your own archive.

For every query in queries.local.json it asks full-text, semantic and hybrid search for the
top 10 messages and checks whether a relevant one is among them. Relevance is a regular
expression over the message text, written by hand for each query — so the numbers measure
the search, not an automatic judge.

Metrics, per search mode and per query type (literal / paraphrase):
  Hit@k  share of queries with a relevant message in the first k results
  MRR    mean reciprocal rank of the first relevant result (0 if none in the top 10)
  ms     median response time

Usage (the application must be running):
  set MH_EMAIL=you@example.com
  set MH_PASSWORD=...
  python search_eval.py [--api http://localhost:8079] [--queries queries.local.json]

Writes a Markdown report to results/search-eval-<date>.md. The report contains only the
queries and the metrics, never message text.
"""
import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MODES = {
    "text": ("Повнотекстовий (tsvector)", "/search/messages"),
    "semantic": ("Семантичний (bge-m3)", "/search/semantic"),
    "hybrid": ("Гібридний (RRF)", "/search/hybrid"),
}
DEPTH = 10


def request(url, token=None, body=None):
    headers = {"Content-Type": "application/json", "X-Background": "1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as response:
        payload = json.loads(response.read())
    return payload, (time.perf_counter() - started) * 1000


def login(api):
    token = os.getenv("MH_TOKEN")
    if token:
        return token
    email, password = os.getenv("MH_EMAIL"), os.getenv("MH_PASSWORD")
    if not email or not password:
        sys.exit("Set MH_EMAIL and MH_PASSWORD (or MH_TOKEN) first.")
    payload, _ = request(api + "/auth/login", body={"email": email, "password": password})
    return payload["accessToken"]


def first_relevant(results, pattern):
    for position, hit in enumerate(results, start=1):
        if pattern.search(hit.get("text") or ""):
            return position
    return None


def summarise(rows):
    n = len(rows)
    if n == 0:
        return None
    ranks = [r["rank"] for r in rows]
    hit = lambda k: sum(1 for r in ranks if r and r <= k) / n
    return {
        "n": n,
        "hit1": hit(1), "hit3": hit(3), "hit5": hit(5),
        "mrr": sum(1 / r for r in ranks if r) / n,
        "ms": statistics.median(r["ms"] for r in rows),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--api", default=os.getenv("MH_API", "http://localhost:8079"))
    parser.add_argument("--queries", default=os.path.join(os.path.dirname(__file__), "queries.local.json"))
    args = parser.parse_args()
    api = args.api.rstrip("/") + "/api"

    with open(args.queries, encoding="utf-8") as f:
        queries = json.load(f)["queries"]
    token = login(api)

    # One unrecorded query per mode, so the first measured call is not paying for a cold
    # model or an index being built in memory.
    for _, path in MODES.values():
        request(api + path + "?" + urllib.parse.urlencode({"q": "прогрів", "limit": DEPTH}), token)

    rows = {mode: [] for mode in MODES}
    for item in queries:
        pattern = re.compile(item["relevant"], re.IGNORECASE)
        for mode, (_, path) in MODES.items():
            payload, ms = request(api + path + "?" + urllib.parse.urlencode({"q": item["q"], "limit": DEPTH}), token)
            rank = first_relevant(payload.get("results", [])[:DEPTH], pattern)
            rows[mode].append({"q": item["q"], "type": item.get("type", "?"), "rank": rank, "ms": ms})

    today = dt.date.today().isoformat()
    lines = [f"# Оцінка пошуку — {today}", "",
             f"Запитів: {len(queries)} ({sum(1 for q in queries if q.get('type') == 'literal')} дослівних, "
             f"{sum(1 for q in queries if q.get('type') == 'paraphrase')} перефразованих). "
             f"Глибина: top-{DEPTH}. Релевантність задано вручну регулярним виразом.", ""]

    for scope, label in [(None, "Усі запити"), ("literal", "Дослівні запити"), ("paraphrase", "Перефразовані запити")]:
        lines += [f"## {label}", "", "| Пошук | Hit@1 | Hit@3 | Hit@5 | MRR | Медіана, мс |", "|---|---|---|---|---|---|"]
        for mode, (name, _) in MODES.items():
            s = summarise([r for r in rows[mode] if scope is None or r["type"] == scope])
            if s:
                lines.append(f"| {name} | {s['hit1']:.0%} | {s['hit3']:.0%} | {s['hit5']:.0%} | {s['mrr']:.2f} | {s['ms']:.0f} |")
        lines.append("")

    lines += ["## По запитах (позиція першого релевантного, — = немає в top-10)", "",
              "| Запит | Тип | " + " | ".join(name for name, _ in MODES.values()) + " |",
              "|---|---|" + "---|" * len(MODES)]
    for i, item in enumerate(queries):
        cells = [str(rows[mode][i]["rank"] or "—") for mode in MODES]
        lines.append(f"| {item['q']} | {item.get('type', '?')} | " + " | ".join(cells) + " |")

    report = "\n".join(lines) + "\n"
    out_dir = os.path.join(os.path.dirname(__file__), "results")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"search-eval-{today}.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(report)
    sys.stdout.reconfigure(encoding="utf-8")
    print(report)
    print("Saved:", out)


if __name__ == "__main__":
    main()
