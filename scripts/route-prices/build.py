"""Turn scraped bus fares (scrape.py output) into the suggested-price table.

Pricing rule (product decision, 2026-10-16): the suggestion is the
passenger's share of the fuel cost, capped at 80% of the cheapest bus
ticket. On most routes the bus costs about twice the fuel share, so the
passenger pays roughly half the bus fare and a driver carrying three
passengers covers about 75% of the fuel. On competitive trunk routes
(Ankara–İstanbul, Ankara–İzmir) the bus is cheaper than the fuel share, so
the 80% cap applies. Tolls are not included.

Writes:
  scripts/route-prices/bus-fares.csv  every route with bus service, with
                                      the inputs (also read by the video
                                      project's route-price script)
  src/utils/route-prices.json         {"<from>|<to>": price} for the site

    python -X utf8 scripts/route-prices/build.py scripts/route-prices/routes.jsonl
"""
import csv
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEO_TS = os.path.join(HERE, "..", "..", "src", "utils", "turkish-provinces-geo.ts")
CSV_OUT = os.path.join(HERE, "bus-fares.csv")
JSON_OUT = os.path.join(HERE, "..", "..", "src", "utils", "route-prices.json")

# getProvinceDistanceKm is straight-line between provincial capitals; real
# roads run about a quarter longer (Ankara–İstanbul: ~350 km straight, ~450 km by road).
ROAD_DISTANCE_FACTOR = 1.25
FUEL_LITRES_PER_KM = 6.5 / 100
FUEL_TL_PER_LITRE = 86  # benzin, October 2026
PEOPLE_SHARING_FUEL = 4  # driver + 3 passengers
BUS_CAP = 0.8
ROUND_TO_TL = 25


def load_coordinates():
    src = open(GEO_TS, encoding="utf-8").read()
    return {name: (float(lat), float(lng)) for name, lat, lng in re.findall(r'"?([^\s":]+)"?: \[([\d.]+), ([\d.]+)\]', src)}


def straight_km(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)))


def main(jsonl_path):
    coords = load_coordinates()
    rows = []
    for line in open(jsonl_path, encoding="utf-8"):
        rec = json.loads(line)
        fares = [c for c in rec.get("companies") or [] if c.get("p")]
        if not fares:
            continue
        road_km = straight_km(coords[rec["from"]], coords[rec["to"]]) * ROAD_DISTANCE_FACTOR
        bus_min = min(c["p"] for c in fares)
        fuel_share = road_km * FUEL_LITRES_PER_KM * FUEL_TL_PER_LITRE / PEOPLE_SHARING_FUEL
        price = round(min(fuel_share, BUS_CAP * bus_min) / ROUND_TO_TL) * ROUND_TO_TL
        rows.append(
            {
                "from": rec["from"],
                "to": rec["to"],
                "road_km": round(road_km),
                "operators": len(fares),
                "daily_trips": sum(c.get("c") or 0 for c in fares),
                "bus_min": round(bus_min),
                "fuel_share": round(fuel_share),
                "price": max(price, ROUND_TO_TL),
            }
        )
    rows.sort(key=lambda r: (r["from"], r["to"]))
    with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump({f'{r["from"]}|{r["to"]}': r["price"] for r in rows}, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(rows)} routes -> {CSV_OUT}, {JSON_OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
