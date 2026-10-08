#!/usr/bin/env python3
"""Build the approved local Historical CSV pool from one immutable snapshot.

No network, publication or implicit rights decision. Source era flags do not
choose contracts. All missing cells remain None, including excluded fields.
The runtime owns the combined modern-REG/pre-1999 career >=17 eligibility gate.
"""

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path


REVISION = "bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356"
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
STAT_KEYS = [
    "passingYards", "passingTD", "interceptions", "rushingYards", "rushingTD",
    "receptions", "receivingYards", "receivingTD", "fumblesLost", "twoPoint",
    "returnTD", "sacks", "defensiveInterceptions", "fumbleRecoveries",
    "defensiveTD", "safeties", "blockedKicks", "pointsAllowed", "fumbleRecoveryTD",
    "fieldGoalsShort", "fieldGoals40", "fieldGoals50", "fieldGoalsMissed",
    "fieldGoalsBlocked", "extraPointsMade", "extraPointsMissed", "extraPointsBlocked",
    "fieldGoalsMade", "fieldGoalsUnsuccessful", "extraPointsUnsuccessful",
]
RECORD_COLUMNS = [
    "athleteId", "season", "sourceWeek", "gameId", "date", "teamAtTime",
    "opponent", "seasonType", "sourceFileIndex", "physicalLine", *STAT_KEYS,
]
OFFENSE_COLUMNS = {
    "passingYards": "pass_yds", "passingTD": "pass_td", "interceptions": "pass_int",
    "rushingYards": "rush_yds", "rushingTD": "rush_td", "receptions": "rec",
    "receivingYards": "rec_yds", "receivingTD": "rec_td", "returnTD": "ret_td",
}
STAT_COLUMNS = {
    **OFFENSE_COLUMNS, "twoPoint": "two_pt", "sacks": "sacks",
    "defensiveInterceptions": "def_int", "fumbleRecoveries": "fum_rec",
    "defensiveTD": "def_td", "safeties": "safeties", "pointsAllowed": "pts_allowed",
    "fumbleRecoveryTD": "fum_rec_td", "fieldGoalsShort": "fgm_0_39",
    "fieldGoals40": "fgm_40_49", "fieldGoals50": "fgm_50p",
    "extraPointsMade": "xpm", "fieldGoalsMade": "fgm", "fieldGoalsUnsuccessful": "fg_missed",
}
COLORS = {"QB": "#b6f34d", "RB": "#82a9ff", "WR": "#b39bff", "TE": "#ffb05b", "K": "#e2c565", "DEF": "#91cfad"}
SKILL_COUNTS = {"QB": 20128, "RB": 32736, "WR": 38435, "TE": 14936, "K": 14240, "DEF": 17450}
DIRECT_TEAMS = {
    "ARI": "ARI", "ATL": "ATL", "BUF": "BUF", "CAR": "CAR", "CHI": "CHI",
    "CIN": "CIN", "CLE": "CLE", "DAL": "DAL", "DEN": "DEN", "DET": "DET",
    "GNB": "GB", "IND": "IND", "JAX": "JAX", "KAN": "KC", "MIA": "MIA",
    "MIN": "MIN", "NOR": "NO", "NWE": "NE", "NYG": "NYG", "NYJ": "NYJ",
    "PHI": "PHI", "PIT": "PIT", "SEA": "SEA", "SFO": "SF", "TAM": "TB",
    "TEN": "TEN", "WAS": "WAS",
}
TEAM_TIMELINES = [
    ("BAL", 1950, 1950, None, "Baltimore Colts 1947–1950, distinct extinct NFL franchise"),
    ("BAL", 1953, 1983, "IND", "Baltimore/Indianapolis Colts franchise"),
    ("BAL", 1996, 1999, "BAL", "Baltimore Ravens franchise"),
    ("DTX", 1952, 1952, None, "Dallas Texans 1952 NFL, distinct extinct franchise"),
    ("DTX", 1960, 1962, "KC", "Dallas Texans AFL / Kansas City Chiefs franchise"),
    ("STL", 1960, 1987, "ARI", "St. Louis Cardinals franchise"),
    ("STL", 1995, 1999, "LA", "St. Louis / Los Angeles Rams franchise"),
    ("CRD", 1950, 1959, "ARI", "Chicago / St. Louis / Arizona Cardinals franchise"),
    ("PHO", 1988, 1993, "ARI", "Phoenix / Arizona Cardinals franchise"),
    ("RAM", 1950, 1994, "LA", "Los Angeles / St. Louis Rams franchise"),
    ("BOS", 1960, 1970, "NE", "Boston / New England Patriots franchise"),
    ("NYT", 1960, 1962, "NYJ", "New York Titans / Jets franchise"),
    ("HOU", 1960, 1996, "TEN", "Houston Oilers / Tennessee Titans franchise, not Houston Texans"),
    ("LAC", 1960, 1960, "LAC", "Los Angeles / San Diego Chargers franchise"),
    ("SDG", 1961, 1999, "LAC", "San Diego / Los Angeles Chargers franchise"),
    ("OAK", 1960, 1981, "LV", "Oakland / Los Angeles / Las Vegas Raiders franchise"),
    ("RAI", 1982, 1994, "LV", "Los Angeles / Oakland / Las Vegas Raiders franchise"),
    ("OAK", 1995, 1999, "LV", "Oakland / Las Vegas Raiders franchise"),
    ("NYY", 1950, 1951, None, "New York Yanks, distinct extinct NFL franchise"),
]


def numeric(cell):
    if cell is None or not cell.strip():
        return None
    text = cell.strip()
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", text):
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    if not value.is_finite():
        return None
    return int(value) if value == value.to_integral_value() else float(value)


def integer(cell, minimum=0):
    value = numeric(cell)
    return value if isinstance(value, int) and value >= minimum else None


def team_franchise(team, season):
    matches = [item for item in TEAM_TIMELINES if item[0] == team and item[1] <= season <= item[2]]
    if matches:
        assert len(matches) == 1
        return matches[0][3]
    return DIRECT_TEAMS.get(team)


def normalized_name(name):
    return " ".join(unicodedata.normalize("NFC", name).split()).casefold()


def canonical_game(row):
    try:
        day = date.fromisoformat(row["date"])
    except (ValueError, KeyError):
        return None
    if day.isoformat() != row["date"]:
        return None
    team, opponent = row.get("team"), row.get("opp")
    if team == opponent or not all(re.fullmatch(r"[A-Z0-9]{2,4}", item or "") for item in (team, opponent)):
        return None
    location = row.get("home_away")
    if location == "H":
        return f"{day:%Y%m%d}-{opponent}-{team}"
    if location == "A":
        return f"{day:%Y%m%d}-{team}-{opponent}"
    if location == "N":
        return f"{day:%Y%m%d}-{'-'.join(sorted((team, opponent)))}-N"
    return None


def identity_valid(row, position):
    season, ordinal = integer(row.get("season"), 1950), integer(row.get("week"), 1)
    if season is None or season > 1999 or ordinal is None:
        return False
    expected = canonical_game(row)
    if expected is None or row.get("game_id") != expected:
        return False
    day = date.fromisoformat(row["date"])
    if day.year != season and not (day.year == season + 1 and day.month <= 3):
        return False
    return position == "DEF" or bool(row.get("player_id", "").strip())


def mapped_stats(row):
    stats = {key: None for key in STAT_KEYS}
    stats.update({field: numeric(row.get(column)) for field, column in STAT_COLUMNS.items()})
    blocks = [numeric(row.get(column)) for column in ("blk_punt", "blk_fg", "blk_xp")]
    if all(value is not None for value in blocks):
        stats["blockedKicks"] = sum(blocks)
    xpm, xpa = numeric(row.get("xpm")), numeric(row.get("xpa"))
    if xpm is not None and xpa is not None and xpa >= xpm:
        stats["extraPointsUnsuccessful"] = xpa - xpm
    return stats


def defense_disputed(row):
    values = [numeric(row.get(column)) for column in ("def_int", "def_int_defenders", "opp_pass_int")]
    return row.get("int_check") != "match" or any(value is None for value in values) or len(set(values)) != 1


def active_fields(position):
    if position == "DEF":
        return ["pointsAllowed", "returnTD"]
    fields = list(OFFENSE_COLUMNS)
    if position == "K":
        fields += ["fieldGoalsMade", "extraPointsMade", "fieldGoalsUnsuccessful"]
    return fields


def active_errors(stats, position):
    missing = [key for key in active_fields(position) if stats[key] is None]
    yard_fields = {"passingYards", "rushingYards", "receivingYards"}
    invalid = [key for key in active_fields(position) if stats[key] is not None and key not in yard_fields and (not isinstance(stats[key], int) or stats[key] < 0)]
    return missing, invalid


def load_inputs(source):
    manifest = json.loads((source / "source-manifest.json").read_text())
    if manifest.get("sourceRevision") != REVISION:
        raise ValueError("The approved pinned source revision is required.")
    head = json.loads((source / "pinned-branch-head.json").read_text())
    tree = json.loads((source / "pinned-source-tree.json").read_text())
    if head.get("sha") != REVISION or tree.get("sha") != REVISION or tree.get("truncated"):
        raise ValueError("The complete approved pinned source tree is required.")
    tree_files = {item["path"]: item for item in tree["tree"] if item["type"] == "blob"}
    files = {}
    for item in manifest["files"]:
        path = (source / item["path"]).resolve()
        if not path.is_relative_to(source.resolve()):
            raise ValueError("Source path leaves its snapshot.")
        data = path.read_bytes()
        blob = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
        if len(data) != item["sizeBytes"] or blob != item["gitBlobSHA1"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError(f"Pinned source bytes changed: {item['path']}")
        pinned = tree_files.get(item["path"])
        if pinned is None or pinned["sha"] != blob or pinned["size"] != len(data):
            raise ValueError(f"Source manifest disagrees with pinned tree: {item['path']}")
        files[item["path"]] = item
    inputs, selected = [], []
    for position in POSITIONS:
        for decade in range(1950, 2000, 10):
            name = f"fantasy-legends/data/sheets/{position.lower()}_gamelogs_{decade}s.csv"
            item = files[name]
            file_index = len(selected)
            count = 0
            with (source / name).open(newline="", encoding="utf-8-sig") as stream:
                reader = csv.DictReader(stream)
                if len(set(reader.fieldnames)) != len(reader.fieldnames):
                    raise ValueError(f"Duplicate CSV header: {name}")
                for row in reader:
                    count += 1
                    inputs.append({"position": position, "raw": row, "sourceFileIndex": file_index, "physicalLine": reader.line_num})
            selected.append({**item, "position": position, "decade": decade, "rows": count})
    assert len(selected) == 30
    return manifest, selected, inputs


def modern_identity_inputs(repo):
    paths = [repo / "data/nflverse/athletes.json", repo / "data/nflverse/kicker-athletes.json", repo / "data/nflverse/records.json", repo / "data/nflverse/kicker-records.json", repo / "data/archive-quality.json"]
    hashes = {str(path.relative_to(repo)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    athletes = json.loads(paths[0].read_text()) + json.loads(paths[1].read_text())
    by_id = {athlete["id"]: athlete for athlete in athletes}
    assert len(by_id) == len(athletes)
    by_name = defaultdict(list)
    for athlete in athletes:
        if athlete["position"] != "DEF":
            by_name[(normalized_name(athlete["name"]), athlete["position"])].append(athlete["id"])
    quality_aliases = json.loads(paths[4].read_text())["franchiseAliasMap"]
    proof = defaultdict(list)
    for path in paths[2:4]:
        for row in json.loads(path.read_text()):
            if row[1] == 1999 and row[7] == "REG":
                team = quality_aliases.get(row[5], row[5])
                opponent = quality_aliases.get(row[6], row[6])
                proof[(row[0], row[4], team, opponent)].append(row[3])
    return by_id, by_name, proof, hashes, quality_aliases


def identity_map(inputs, modern, names, proof):
    source_players = defaultdict(list)
    for item in inputs:
        if item["position"] != "DEF":
            source_players[item["raw"]["player_id"]].append(item)
    mapping, quarantined, evidence = {}, {}, []
    for source_id, rows in sorted(source_players.items()):
        positions = {item["position"] for item in rows}
        full_names = {normalized_name(item["raw"]["name"]) for item in rows}
        if len(positions) != 1 or len(full_names) != 1:
            quarantined[source_id] = "conflicting-source-person-position-or-name"
            continue
        position = next(iter(positions))
        label = next(iter(full_names))
        candidates = names.get((label, position), [])
        if not candidates:
            mapping[source_id] = f"historical:player:{source_id}"
            continue
        if len(candidates) != 1:
            quarantined[source_id] = "ambiguous-modern-full-name-position"
            continue
        modern_id = candidates[0]
        matches = []
        for item in rows:
            row = item["raw"]
            if row.get("playoff") != "False" or row.get("season") != "1999" or not identity_valid(row, position):
                continue
            team, opponent = team_franchise(row["team"], 1999), team_franchise(row["opp"], 1999)
            games = proof.get((modern_id, row["date"], team, opponent), [])
            if len(games) == 1:
                matches.append({"date": row["date"], "sourceGameId": row["game_id"], "modernGameId": games[0], "sourceTeam": row["team"], "sourceOpponent": row["opp"], "canonicalTeam": team, "canonicalOpponent": opponent, "sourceFileIndex": item["sourceFileIndex"], "physicalLine": item["physicalLine"]})
        if not matches:
            quarantined[source_id] = "modern-name-collision-without-1999-participation-proof"
            continue
        mapping[source_id] = modern_id
        evidence.append({"sourcePlayerId": source_id, "canonicalAthleteId": modern_id, "name": modern[modern_id]["name"], "position": position, "uniqueFullNamePosition": True, "matching1999RegularAppearances": len(matches), "firstProof": sorted(matches, key=lambda match: (match["date"], match["sourceGameId"]))[0]})
    reverse = defaultdict(list)
    for source_id, athlete_id in mapping.items():
        reverse[athlete_id].append(source_id)
    conflicts = {source_id for identities in reverse.values() if len(identities) > 1 for source_id in identities}
    for source_id in conflicts:
        mapping.pop(source_id, None)
        quarantined[source_id] = "multiple-source-person-ids-share-canonical-identity"
    evidence = [item for item in evidence if item["sourcePlayerId"] not in conflicts]
    return mapping, quarantined, evidence


def source_final_games(inputs):
    groups = defaultdict(list)
    for item in inputs:
        if item["position"] == "DEF" and identity_valid(item["raw"], "DEF"):
            groups[item["raw"]["game_id"]].append(item["raw"])
    final_games = {}
    for game_id, rows in groups.items():
        if len(rows) != 2:
            continue
        a, b = rows
        score_a, score_b = integer(a.get("team_score")), integer(b.get("team_score"))
        if a["team"] == b["opp"] and a["opp"] == b["team"] and score_a is not None and score_b is not None and integer(a.get("pts_allowed")) == score_b and integer(b.get("pts_allowed")) == score_a:
            final_games[game_id] = {a["team"]: (score_a, score_b), b["team"]: (score_b, score_a)}
    return final_games


def source_final_matches(row, position, final_games):
    scores = final_games.get(row["game_id"], {}).get(row["team"])
    opponent_score = integer(row.get("pts_allowed" if position == "DEF" else "opp_score"))
    if scores is None or scores != (integer(row.get("team_score")), opponent_score):
        return False
    return row.get("result") == ("W" if scores[0] > scores[1] else "L" if scores[0] < scores[1] else "T")


def scoring_metadata_errors(row, position):
    """Source status is quality metadata; fixed active fields choose the contract."""
    complete = row.get("scoring_complete")
    if complete not in ("True", "False") or "scoring_missing" not in row:
        return ["source-scoring-status-unavailable"]
    missing = set(filter(None, row["scoring_missing"].split(";")))
    if (complete == "True") != (not missing):
        return ["source-scoring-status-inconsistent"]
    if position == "DEF":
        known = {"pts_allowed", "sacks", "def_int", "fum_rec", "safeties", "blk_punt", "blk_fg", "blk_xp", "def_int_td", "def_fum_td", "ret_td"}
        active = {"pts_allowed", "ret_td"}
    elif position == "K":
        known = {"xpm", "fgm_0_39", "fgm_40_49", "fgm_50p", "fg_missed"}
        active = set(OFFENSE_COLUMNS.values()) | {"fgm", "xpm", "fg_missed"}
    else:
        known = set(OFFENSE_COLUMNS.values()) | {"two_pt", "fum_rec_td"}
        active = set(OFFENSE_COLUMNS.values())
    if missing - known:
        return ["source-scoring-status-unknown-marker"]
    return ["source-marks-active-scoring-field-unknown"] if missing & active else []


def build_pool(repo, source):
    manifest, source_files, inputs = load_inputs(source)
    modern, names, proof, modern_hashes, quality_aliases = modern_identity_inputs(repo)
    player_map, identity_quarantine, identity_evidence = identity_map(inputs, modern, names, proof)
    final_games = source_final_games(inputs)
    report = {position: {"allRows": 0, "regularRows": 0, "postseasonRows": 0, "blockedReasons": Counter(), "missingActiveFields": Counter(), "invalidActiveFields": Counter(), "emittedRows": 0, "pre1999Rows": 0, "auditOnly1999Rows": 0} for position in POSITIONS}
    records, records_by_athlete, source_by_athlete = [], defaultdict(list), defaultdict(set)
    seen_source_keys = set()
    for item in inputs:
        position, row = item["position"], item["raw"]
        summary = report[position]
        summary["allRows"] += 1
        if row.get("playoff") != "False":
            summary["postseasonRows"] += row.get("playoff") == "True"
            summary["blockedReasons"]["postseason-or-unknown-flag"] += 1
            continue
        summary["regularRows"] += 1
        if not identity_valid(row, position):
            summary["blockedReasons"]["invalid-game-date-season-source-identity"] += 1
            continue
        source_key = ("team" if position == "DEF" else "player", row["team"] if position == "DEF" else row["player_id"], row["game_id"])
        if source_key in seen_source_keys:
            raise ValueError(f"Duplicate source identity/game: {source_key}")
        seen_source_keys.add(source_key)
        reasons = scoring_metadata_errors(row, position)
        if not source_final_matches(row, position, final_games):
            reasons.append("source-final-score-controls-unavailable-or-inconsistent")
        stats = mapped_stats(row)
        missing, invalid = active_errors(stats, position)
        summary["missingActiveFields"].update(missing)
        summary["invalidActiveFields"].update(invalid)
        if missing:
            reasons.append("active-scoring-fields-unknown")
        if invalid:
            reasons.append("invalid-active-scoring-value")
        if position == "DEF":
            if defense_disputed(row):
                reasons.append("defense-interceptions-quarantined")
            franchise = team_franchise(row["team"], int(row["season"]))
            athlete_id = f"franchise-{franchise.lower()}" if franchise else None
            if athlete_id not in modern:
                reasons.append("unmapped-or-extinct-franchise-identity")
        else:
            athlete_id = player_map.get(row["player_id"])
            if not athlete_id:
                reasons.append(identity_quarantine.get(row["player_id"], "source-identity-unresolved"))
            if position == "K" and not missing:
                fgm, fga, failed = numeric(row.get("fgm")), numeric(row.get("fga")), numeric(row.get("fg_missed"))
                if fga is None or fga < fgm or failed != fga - fgm:
                    reasons.append("kicking-aggregate-control-inconsistent")
        if reasons:
            summary["blockedReasons"].update(set(reasons))
            continue
        record = [athlete_id, int(row["season"]), int(row["week"]), row["game_id"], row["date"], row["team"], row["opp"], "REG", item["sourceFileIndex"], item["physicalLine"], *(stats[key] for key in STAT_KEYS)]
        records.append(record)
        records_by_athlete[athlete_id].append(record)
        source_by_athlete[athlete_id].add(row["team"] if position == "DEF" else row["player_id"])
        summary["emittedRows"] += 1
        summary["pre1999Rows" if int(row["season"]) < 1999 else "auditOnly1999Rows"] += 1
    records.sort(key=lambda record: (record[0], record[1], record[4], record[3]))
    assert len({(row[0], row[3]) for row in records}) == len(records)
    assert all(len(row) == len(RECORD_COLUMNS) for row in records)
    assert len(STAT_KEYS) == 30
    source_labels = {}
    for item in inputs:
        if item["position"] != "DEF":
            source_labels.setdefault(item["raw"]["player_id"], {**item["raw"], "position": item["position"]})
    athletes = []
    for athlete_id, rows in sorted(records_by_athlete.items()):
        years = Counter(row[1] for row in rows)
        if athlete_id in modern:
            original = modern[athlete_id]
            athlete = {key: value for key, value in original.items() if key not in ("seasons", "gameCount", "gamesBySeason", "style")}
        else:
            ids = sorted(source_by_athlete[athlete_id])
            assert len(ids) == 1
            original = source_labels[ids[0]]
            position = original["position"]
            name = original["name"]
            latest_season = max(years)
            clubs = Counter(row[5] for row in rows if row[1] == latest_season)
            club = sorted(clubs, key=lambda value: (-clubs[value], value))[0]
            athlete = {"id": athlete_id, "name": name, "position": position, "club": team_franchise(club, latest_season) or club, "number": "".join(word[0] for word in name.split() if word)[:2].upper(), "legend": False, "color": COLORS[position]}
        athlete.update({"style": f"Historical CSV · {min(years)}–{max(years)} · {len(rows)} regular games", "seasons": sorted(years), "gameCount": len(rows), "gamesBySeason": {str(year): years[year] for year in sorted(years)}, "historicalSourceIds": sorted(source_by_athlete[athlete_id]), "historicalSourceOnly": True})
        athletes.append(athlete)
    for position, summary in report.items():
        assert summary["regularRows"] == SKILL_COUNTS[position]
        ids = {athlete["id"] for athlete in athletes if athlete["position"] == position}
        pre_counts = Counter(row[0] for row in records if row[0] in ids and row[1] < 1999)
        all_counts = Counter(row[0] for row in records if row[0] in ids)
        summary.update({"sourceEntitiesWithRecords": len(ids), "sourceOnlyEntitiesAtLeast17": sum(value >= 17 for value in all_counts.values()), "pre1999SourceOnlyEntitiesAtLeast17": sum(value >= 17 for value in pre_counts.values())})
        for key in ("blockedReasons", "missingActiveFields", "invalidActiveFields"):
            summary[key] = dict(sorted(summary[key].items()))
    input_head = json.loads((source / "pinned-branch-head.json").read_text())
    coverage = {
        "schemaVersion": 1, "sourceRevision": REVISION, "sourceUrl": f"https://github.com/Jonathan94110/prime-rushmore/tree/{REVISION}/fantasy-legends", "importedAt": input_head["commit"]["committer"]["date"],
        "localOnly": False, "publicationApproved": True, "publicationScope": "existing-owner-private-site", "sourceUseDecision": "owner-authorized-private-demo; upstream-license-not-established", "sourceQualityNote": "Provider claims and previously normalized base numbers; not independently verified complete career coverage or primary participation evidence.",
        "requiredMode": "historical", "runtimeCsvSeasons": {"min": 1950, "max": 1998}, "auditOnlyCsvSeasons": [1999], "seasonTypes": ["REG"], "weekSemantics": "source game ordinal; not verified NFL week; runtime Performance.week must be null",
        "recordColumns": RECORD_COLUMNS, "statKeys": STAT_KEYS, "sourceFiles": source_files,
        "wholeSnapshotFilesHashVerified": len(manifest["files"]), "modernIdentityInputSHA256": modern_hashes, "modernQualityAliases": quality_aliases,
        "playerIdentityPolicy": "One source person ID, never one ID per position. Unique full name and position plus actual modern 1999 regular date/team/opponent record is required to merge with a modern athlete. Ambiguity is quarantined.",
        "modernPlayerIdentityEvidence": identity_evidence, "quarantinedPlayerIdentities": dict(sorted(identity_quarantine.items())),
        "franchiseTimelines": [{"sourceCode": code, "firstSeason": first, "lastSeason": last, "modernClub": club, "canonicalAthleteId": f"franchise-{club.lower()}" if club else None, "reason": reason} for code, first, last, club, reason in TEAM_TIMELINES], "directFranchiseAliases": DIRECT_TEAMS,
        "historicalContract": {"skill": "Current pass/rush/receiving/return-TD/PPR coefficients; exclude individual lost fumbles, two points and offensive recovery TDs", "kicker": "Same active offense plus 3*FGM + XPM - unsuccessfulFG; unsuccessfulXP excluded; missing active offense blocks source K", "defense": "Opponent full final-score PA tiers plus 6*specialTeamsReturnTD only; disputed INT controls still quarantine", "sameContractForEveryTeam": True, "providerEraFlagsUsedForEligibility": False, "unknownValuesFilled": False},
        "careerEligibility": "Runtime combines existing modern REG records with CSV records before 1999, then requires >=17 known active-category games; selectable years have at least one qualifying record. Generated source-only metadata does not grant career eligibility.",
        "performanceCount": len(records), "pre1999PerformanceCount": sum(row[1] < 1999 for row in records), "auditOnly1999PerformanceCount": sum(row[1] == 1999 for row in records), "athleteCount": len(athletes), "seasons": sorted({row[1] for row in records}), "positions": report,
        "kickerBlocker": "All nine active offense columns are absent from K CSVs. No K identity/game/team overlaps another skill CSV. Base JSON derives values through num(None/blank)=0 and cannot prove its zeros. No guessed zeros or cross-position grafting.",
        "excludedRawStatsPolicy": "Every available raw scoring value is preserved; absent values are null. K missed/blocked splits remain null, with known unsuccessful aggregate counts retained. DEF records require matching selected/defender/opposing-passer INT controls, so all three counts equal the retained selected count; raw split/flags remain available in pinned CSV at source file/line.",
        "sourceFinalGameControls": len(final_games), "normalArchiveFilesModified": False,
    }
    assert coverage["positions"]["K"]["emittedRows"] == 0
    return athletes, records, coverage


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def main():
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=repo.parent / "research/prime-rushmore-bbfc22cc")
    parser.add_argument("--output-dir", type=Path, default=repo / "data/historical-mode")
    parser.add_argument("--check", action="store_true", help="Compare deterministic output bytes without changing files.")
    args = parser.parse_args()
    athletes, records, coverage = build_pool(repo, args.source_root.resolve())
    outputs = {"athletes.json": athletes, "records.json": records, "coverage.json": coverage}
    if not args.check:
        args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items():
        content = encoded(value)
        destination = args.output_dir / name
        if args.check:
            if destination.read_bytes() != content:
                raise ValueError(f"Generated Historical pool differs: {name}")
        else:
            destination.write_bytes(content)
    print(json.dumps({"sourceRevision": REVISION, "check": args.check, "athletes": len(athletes), "performances": len(records), "pre1999Performances": coverage["pre1999PerformanceCount"], "positions": coverage["positions"], "output": str(args.output_dir)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
