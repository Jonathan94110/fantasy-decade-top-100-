"""Pre-1999 data (1920-1998), read from the CSVs in sources/.

Those CSVs are built once by the scripts in bot/legacy_build/ from published
datasets (NFL.com and Pro Football Reference scrapes on Kaggle / Hugging Face /
GitHub, and FiveThirtyEight's game scores), so the weekly run never downloads
them. Each loader returns canonical columns from common.py, or an empty frame
when the CSV isn't there.

Older seasons only have season totals, so players get season lines (no game
logs) and team defenses get points allowed per game plus season totals for
sacks, takeaways, touchdowns and safeties.
"""

import pandas as pd

from common import DEFENSE_STATS, KICKING_STATS, OFFENSE_STATS, SOURCES_DIR

LAST_SEASON = 1998

OFFENSE_CSV = SOURCES_DIR / "legacy_offense_seasons.csv"
KICKER_CSV = SOURCES_DIR / "legacy_kicker_seasons.csv"
DEFENSE_GAMES_CSV = SOURCES_DIR / "legacy_defense_games.csv"
DEFENSE_SEASONS_CSV = SOURCES_DIR / "legacy_defense_seasons.csv"

# Columns that may stay unknown (NaN) through scoring and into the published JSON.
UNKNOWN_OK = {"fg_att", "xp_att"}

# Season totals that legacy_defense_seasons.csv adds on top of the game rows.
DEFENSE_SEASON_STATS = [c for c in DEFENSE_STATS if c != "points_allowed"]

SOURCES = {
    "pre-1999": (
        "Published scrapes of NFL.com and Pro Football Reference (Kaggle: trevyoungquist, "
        "josephvm, kendallgillies; GitHub: fantasydatapros, allenjake440; Hugging Face: "
        "michaelmallari), FiveThirtyEight game scores (CC BY 4.0), and hand-checked lines from "
        "profootballarchives.com, statscrew.com, jt-sw.com and Wikipedia. See bot/legacy_build/."
    ),
}

# The build scripts use Pro Football Reference team codes; show the ones that differ only in
# spelling the way nflverse does, so a 1998-99 career reads "SF", not "SFO/SF".
TEAM_CODES = {"GNB": "GB", "KAN": "KC", "NOR": "NO", "NWE": "NE", "SDG": "SD", "SFO": "SF", "TAM": "TB"}


def _team_codes(series):
    return series.map(lambda t: "/".join(TEAM_CODES.get(c, c) for c in t.split("/")) if isinstance(t, str) else t)


def _read(path):
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path, dtype={"player_id": "string", "pfr_id": "string", "gsis_id": "string"})
    df = df[df["season"] <= LAST_SEASON].copy()
    for col in ("team", "opponent"):
        if col in df:
            df[col] = _team_codes(df[col])
    return df


def load_player_seasons():
    frames = []
    for path, stats in ((OFFENSE_CSV, OFFENSE_STATS), (KICKER_CSV, KICKING_STATS)):
        df = _read(path)
        if df.empty:
            continue
        for col in stats:
            if col in UNKNOWN_OK:
                # Kicking attempts weren't recorded before 1938: keep them unknown (scored as no
                # misses, published as null) rather than 0, which would score makes as misses.
                df[col] = pd.to_numeric(df[col], errors="coerce") if col in df else float("nan")
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0) if col in df else 0
        df["games"] = pd.to_numeric(df["games"], errors="coerce").fillna(0).astype(int)
        df["source"] = "legacy"
        df["headshot_url"] = None
        frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def load_player_games():
    return pd.DataFrame()


def load_defense_games():
    df = _read(DEFENSE_GAMES_CSV)
    if df.empty:
        return df
    df["season_type"] = "REG"
    df["points_allowed"] = pd.to_numeric(df["points_allowed"], errors="coerce")
    for col in DEFENSE_SEASON_STATS:
        df[col] = 0
    df["source"] = "legacy"
    return df


def load_defense_seasons():
    df = _read(DEFENSE_SEASONS_CSV)
    if df.empty:
        return df
    for col in DEFENSE_SEASON_STATS:
        df[col] = pd.to_numeric(df[col], errors="coerce") if col in df else float("nan")
    return df


def _first_known(df, col):
    known = df.loc[df[col].notna(), "season"]
    return None if known.empty else int(known.min())


def coverage_notes():
    """Plain-language notes on what older seasons are missing, worked out from the data."""
    notes = []
    seasons = load_defense_seasons()
    if not seasons.empty:
        labels = {
            "sacks": "sacks",
            "interceptions": "interceptions",
            "fumble_recoveries": "fumble recoveries",
            "def_tds": "defensive TDs",
            "st_tds": "return TDs",
            "safeties": "safeties",
            "blocked_kicks": "blocked kicks",
        }
        first = int(seasons["season"].min())
        for col, label in labels.items():
            since = _first_known(seasons, col)
            if since is None:
                notes.append(f"Team defense: {label} aren't available before 1999 and count as 0.")
            elif since > first:
                notes.append(f"Team defense: {label} aren't available before {since} and count as 0 for earlier seasons.")
    offense = _read(OFFENSE_CSV)
    if not offense.empty and "fumbles_lost" in offense:
        since = _first_known(offense, "fumbles_lost")
        if since and since > int(offense["season"].min()):
            notes.append(f"Fumbles lost aren't available before {since} and count as 0 for earlier seasons.")
    kickers = _read(KICKER_CSV)
    if not kickers.empty:
        bucketed = kickers.loc[(kickers["fg_made"] > 0) & (kickers["fg_made_unknown"] == 0), "season"]
        if not bucketed.empty:
            notes.append(
                f"Kickers: field goal distances are known from {int(bucketed.min())}; earlier field goals "
                "score the 'distance unknown' value."
            )
    if not offense.empty or not kickers.empty:
        notes += [
            "Before 1999, players have season lines only (no game logs).",
            "AFL seasons (1960-69) are included; AAFC seasons (1946-49) are not, matching official NFL records.",
            "The NFL kept few official stats before 1932, so the 1920s lists are short.",
        ]
    return notes
