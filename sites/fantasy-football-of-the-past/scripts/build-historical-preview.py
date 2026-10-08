"""Project minimal identity metadata from an audited, quarantined snapshot.
Usage: python scripts/build-historical-preview.py INPUT.jsonl.gz CONFLICTS.json
No game rows or scoring values are included in the output.
"""
import collections
import gzip
import json
import pathlib
import sys

source, conflicts = map(pathlib.Path, sys.argv[1:])
excluded = set(json.loads(conflicts.read_text())["affected_player_ids"])
profiles = {}
all_ids = set()
with gzip.open(source, "rt", encoding="utf-8") as stream:
    for line in stream:
        row = json.loads(line)
        assert row["schemaVersion"] == "quarantine-1"
        assert 1960 <= row["season"] <= 1998
        assert row["position"] in {"QB", "RB", "WR", "TE", "K"}
        identity = row["playerId"]
        all_ids.add(identity)
        if identity in excluded:
            continue
        item = profiles.setdefault(identity, {"id": str(identity), "name": row["name"].strip(), "position": row["position"], "sourcePosition": row["sourcePosition"], "seasons": set()})
        assert (item["name"], item["position"], item["sourcePosition"]) == (row["name"].strip(), row["position"], row["sourcePosition"])
        item["seasons"].add(row["season"])
for item in profiles.values():
    item["seasons"] = sorted(item["seasons"])
rows = sorted(profiles.values(), key=lambda p: (p["name"].casefold(), int(p["id"])))
assert len(all_ids) == 3925 and len(excluded) == 12 and len(rows) == 3913
output = {"sourceUrl": "https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats", "sourceLabel": "Zack Thoutt / zynicide · 2017 source snapshot", "coverageStart": 1960, "coverageEnd": 1998, "sourceCandidateCount": len(all_ids), "excludedIdentityCount": len(excluded), "profiles": rows}
path = pathlib.Path(__file__).resolve().parent.parent / "data/historical-preview.json"
path.write_text(json.dumps(output, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({"profiles": len(rows), "excludedIdentities": len(excluded), "positions": collections.Counter(row["position"] for row in rows), "outputBytes": path.stat().st_size}))
