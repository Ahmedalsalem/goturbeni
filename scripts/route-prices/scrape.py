"""Collect intercity bus fares for every province pair from obilet route pages.

Each obilet route page embeds a JSON model ("seo-bus-route") whose
bottomTable lists every operator on the route with its fare, daily trip
count and trip duration. Only one direction per pair is fetched: spot checks
(2026-10-15) showed the reverse fare is equal or within ~10%.

Resumable: re-running skips pairs already in the output file. Failed fetches
are written with an "error" field; delete those lines and re-run to retry.

    python -X utf8 scripts/route-prices/scrape.py scripts/route-prices/routes.jsonl
"""
import gzip
import itertools
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PROVINCES_TS = os.path.join(HERE, "..", "..", "src", "utils", "turkish-provinces.ts")
TR = str.maketrans("çğıöşüÇĞİÖŞÜâî", "cgiosucgiosuai")
# obilet slugs that don't follow the plain ASCII-lowercase rule and don't redirect.
SPECIAL_SLUGS = {"Karaman": "karaman_karaman"}
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def slug(province):
    return SPECIAL_SLUGS.get(province) or province.translate(TR).lower().replace(" ", "")


def load_provinces():
    src = open(PROVINCES_TS, encoding="utf-8").read()
    body = src[src.index("TURKISH_PROVINCES = [") : src.index("] as const")]
    return re.findall(r'"([^"]+)"', body)


def fetch(a, b, decoder):
    url = f"https://www.obilet.com/otobus-bileti/{slug(a)}-{slug(b)}"
    rec = {"from": a, "to": b, "url": url}
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                html = raw.decode("utf-8", "replace")
                rec["final"] = resp.geturl()
                rec["status"] = resp.status
            i = html.find('page: {"name":"seo-bus-route"')
            if i < 0:
                # obilet redirects a pair it has no direct service for to a city page.
                rec["error"] = "no-model"
            else:
                model = decoder.raw_decode(html[i + 6 :])[0]["model"]
                table = model.get("bottomTable") or {}
                rec["companies"] = [
                    {"n": d.get("Name"), "p": d.get("Price"), "c": d.get("Count"), "d": d.get("Duration")}
                    for d in table.get("data") or []
                ]
                rec.pop("error", None)
            return rec
        except urllib.error.HTTPError as e:
            rec["status"] = e.code
            rec["error"] = f"http {e.code}"
            if e.code in (404, 410):
                return rec
        except Exception as e:
            rec["error"] = repr(e)[:200]
        time.sleep(5)
    return rec


def main(out_path):
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path, encoding="utf-8"):
            r = json.loads(line)
            done.add((r["from"], r["to"]))
    todo = [p for p in itertools.combinations(load_provinces(), 2) if p not in done]
    decoder = json.JSONDecoder()
    lock = threading.Lock()
    with open(out_path, "a", encoding="utf-8") as out:

        def work(pair):
            rec = fetch(*pair, decoder)
            with lock:
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out.flush()
            # Three workers at ~1.5 s each keeps the load to about one request a second.
            time.sleep(1.5)

        with ThreadPoolExecutor(3) as pool:
            list(pool.map(work, todo))
    print(f"fetched {len(todo)} pairs into {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
