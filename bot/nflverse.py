"""1999-present data from nflverse (https://github.com/nflverse/nflverse-data, CC-BY 4.0).

Every loader returns one row per player (or team) per game, in the canonical
columns from common.py, with regular season and playoffs flagged by season_type.
"""

import pandas as pd

from common import (
    DEFENSE_STATS,
    KICKING_STATS,
    OFFENSE_STATS,
    SOURCES_DIR,
    cached_download,
    ensure_columns,
    log,
)

FIRST_SEASON = 1999
RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"

# Team stat files use today's franchise codes; schedules use the code of the day.
FRANCHISE_CODE = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA"}


def team_of_the_day(code, season):
    """Player stat files use today's franchise codes; show the team as it was."""
    if code == "LV" and season < 2020:
        return "OAK"
    if code == "LAC" and season < 2017:
        return "SD"
    if code == "LA" and 1995 <= season < 2016:
        return "STL"
    return code


POSITION_MAP = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "K": "K"}
# Tight ends aren't ranked. Anyone else (a punter who throws, a defender at fullback) is
# kept when his season has real offensive use, with the same 10-touch rule as before 1999.
NOT_RANKED = {"TE"}
MIN_TOUCHES = 10
DEFENSIVE_GROUPS = {"DL", "LB", "DB"}

# Games nflverse's weekly files are missing, typed in from box scores.
MISSING_PLAYER_GAMES = SOURCES_DIR / "nflverse_missing_player_games.csv"
MISSING_TEAM_GAMES = SOURCES_DIR / "nflverse_missing_team_games.csv"

OFFENSE_MAP = {
    "completions": ["completions"],
    "attempts": ["attempts"],
    "passing_yards": ["passing_yards"],
    "passing_tds": ["passing_tds"],
    "interceptions": ["passing_interceptions"],
    "carries": ["carries"],
    "rushing_yards": ["rushing_yards"],
    "rushing_tds": ["rushing_tds"],
    "receptions": ["receptions"],
    "receiving_yards": ["receiving_yards"],
    "receiving_tds": ["receiving_tds"],
    "two_point_conversions": [
        "passing_2pt_conversions",
        "rushing_2pt_conversions",
        "receiving_2pt_conversions",
    ],
    "fumbles_lost": ["sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost"],
    # nflverse's own fantasy points skip fumble-recovery TDs; most leagues count them.
    "other_tds": ["special_teams_tds", "fumble_recovery_tds"],
}

KICKING_MAP = {
    "fg_made": ["fg_made"],
    "fg_att": ["fg_att"],
    "fg_made_0_39": ["fg_made_0_19", "fg_made_20_29", "fg_made_30_39"],
    "fg_made_40_49": ["fg_made_40_49"],
    "fg_made_50_plus": ["fg_made_50_59", "fg_made_60_"],
    "xp_made": ["pat_made"],
    "xp_att": ["pat_att"],
}

DEFENSE_MAP = {
    "sacks": ["def_sacks"],
    "interceptions": ["def_interceptions"],
    "fumble_recoveries": ["fumble_recovery_opp"],
    "def_tds": ["def_tds"],
    "st_tds": ["special_teams_tds"],
    "safeties": ["def_safeties"],
    "blocked_kicks": ["def_punt_blocks", "def_fg_blocks", "def_pat_blocks"],
}


def _sum_columns(raw, mapping):
    out = {}
    for ours, theirs in mapping.items():
        present = [c for c in theirs if c in raw.columns]
        out[ours] = raw[present].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1) if present else 0
    return pd.DataFrame(out, index=raw.index)


def _season_file(kind, season, current):
    name = f"{kind}_week_{season}.csv"
    return cached_download(f"{RELEASES}/{kind}/{name}", name, refresh=season >= current)


def _franchise(code):
    return FRANCHISE_CODE.get(code, code)


def _game_sides(game_id):
    """(away, home) franchise codes from an nflverse game id like 2001_01_PIT_JAX."""
    _, _, away, home = game_id.split("_")
    return _franchise(away), _franchise(home)


_PLAYER_FILES = {}


def _player_file(season, current):
    """A season's player-week file, with mislabelled teams repaired (cached per run).

    Some games are missing one team from nflverse's team file and file that team's players
    under their opponent (all 16 Jaguars home games in 2001-02). For those games, players
    whose team for the rest of the season is the missing one are moved back to it.
    """
    if season in _PLAYER_FILES:
        return _PLAYER_FILES[season]
    path = _season_file("stats_player", season, current)
    if path is None:
        return None
    raw = pd.read_csv(path, low_memory=False)
    team_path = _season_file("stats_team", season, current)
    if team_path is not None:
        teams = pd.read_csv(team_path, usecols=["game_id", "team"])
        have = set(zip(teams["game_id"], teams["team"]))
        usual = raw.groupby("player_id")["team"].agg(lambda t: t.mode().iat[0] if t.notna().any() else None)
        moved = 0
        for gid in raw["game_id"].unique():
            sides = _game_sides(gid)
            for side, other in (sides, sides[::-1]):
                if (gid, side) in have:
                    continue
                rows = raw.index[(raw["game_id"] == gid) & (raw["team"] != side)
                                 & (raw["player_id"].map(usual) == side)]
                raw.loc[rows, "team"] = side
                raw.loc[rows, "opponent_team"] = other
                moved += len(rows)
        if moved:
            log(f"  {season}: moved {moved} player rows back to their own team in games nflverse mislabels")
    _PLAYER_FILES[season] = raw
    return raw


def load_player_games(seasons, current, force=False):
    frames = []
    for season in seasons:
        raw = _player_file(season, current if not force else 0)
        if raw is None:
            log(f"  nflverse has no player file for {season} yet")
            continue
        raw = raw[~raw["position"].isin(NOT_RANKED)].copy()
        base = pd.DataFrame(
            {
                "player_id": raw["player_id"],
                "pfr_id": None,
                "name": raw["player_display_name"],
                "position": raw["position"].map(POSITION_MAP).fillna(raw["position"]),
                "headshot_url": raw["headshot_url"],
                "season": raw["season"].astype(int),
                "week": raw["week"].astype(int),
                "season_type": raw["season_type"],
                "game_id": raw["game_id"],
                "team": raw["team"],
                "opponent": raw["opponent_team"],
            }
        )
        for col in ("team", "opponent"):
            base[col] = [team_of_the_day(t, season) for t in base[col]]
        frames.append(pd.concat([base, _sum_columns(raw, OFFENSE_MAP), _sum_columns(raw, KICKING_MAP)], axis=1))
    games = pd.concat(frames, ignore_index=True)
    games = ensure_columns(games, OFFENSE_STATS + KICKING_STATS)
    games["source"] = "nflverse"
    games = _add_missing_player_games(games)
    games = _resolve_other_positions(games)
    games["fg_made_unknown"] = 0
    return _attach_pfr_ids(games)


def _week_of(game_id):
    return int(game_id.split("_")[1])


def _add_missing_player_games(games):
    """Add box-score lines for games nflverse's weekly file doesn't have. Each player's id
    and position come from his other games that season."""
    if not MISSING_PLAYER_GAMES.exists():
        return games
    patch = pd.read_csv(MISSING_PLAYER_GAMES)
    patch["season"] = patch["game_id"].str[:4].astype(int)
    patch = patch[patch["season"].isin(games["season"].unique()) & ~patch["game_id"].isin(games["game_id"])]
    if patch.empty:
        return games
    known = games.drop_duplicates(["season", "name", "team"]).set_index(["season", "name", "team"])
    rows, unmatched = [], []
    for r in patch.itertuples(index=False):
        key = (r.season, r.name, r.team)
        if key not in known.index:
            unmatched.append(f"{r.name} {r.team} {r.game_id}")
            continue
        who = known.loc[key]
        row = {c: getattr(r, c) for c in OFFENSE_STATS + KICKING_STATS if hasattr(r, c)}
        row.update(
            player_id=who["player_id"], pfr_id=None, name=r.name, position=who["position"],
            headshot_url=who["headshot_url"], season=r.season, week=_week_of(r.game_id),
            season_type="REG", game_id=r.game_id, team=r.team, opponent=r.opponent, source="box score",
        )
        rows.append(row)
    if unmatched:
        log(f"  box-score patch: couldn't identify {len(unmatched)} players from their other games: " + ", ".join(unmatched))
    log(f"  box-score patch: added {len(rows)} player lines for {patch['game_id'].nunique()} games nflverse is missing")
    return ensure_columns(pd.concat([games, pd.DataFrame(rows)], ignore_index=True), OFFENSE_STATS + KICKING_STATS)


def _resolve_other_positions(games):
    """Players listed outside QB/RB/WR/K: keep a season only when he had real offensive use
    (10+ touches), at the position his points came from."""
    other = ~games["position"].isin(POSITION_MAP.values())
    if not other.any():
        return games
    g = games[other]
    totals = g.groupby(["player_id", "season"])[
        ["attempts", "carries", "receptions", "passing_yards", "passing_tds", "interceptions",
         "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds"]
    ].sum()
    touches = totals["attempts"] + totals["carries"] + totals["receptions"]
    points = pd.DataFrame({
        "QB": totals["passing_yards"] * 0.04 + totals["passing_tds"] * 4 - totals["interceptions"] * 2,
        "RB": totals["rushing_yards"] * 0.1 + totals["rushing_tds"] * 6,
        "WR": totals["receiving_yards"] * 0.1 + totals["receiving_tds"] * 6 + totals["receptions"],
    })
    position = points.idxmax(axis=1).where(touches >= MIN_TOUCHES)
    resolved = pd.Series([position.get((p, s)) for p, s in zip(g["player_id"], g["season"])], index=g.index)
    games.loc[other, "position"] = resolved
    kept = resolved.notna()
    log(f"  kept {g[kept].groupby(['player_id', 'season']).ngroups} seasons by players listed at other positions "
        f"with {MIN_TOUCHES}+ touches")
    return games[~other | games.index.isin(resolved[kept].index)].reset_index(drop=True)


def _attach_pfr_ids(games):
    """Add Pro Football Reference ids so pre-1999 seasons can merge with these."""
    path = cached_download(f"{RELEASES}/players/players.csv", "players.csv")
    if path is None:
        return games
    ids = pd.read_csv(path, usecols=["gsis_id", "pfr_id"], low_memory=False).dropna()
    games = games.drop(columns="pfr_id").merge(
        ids.drop_duplicates("gsis_id"), how="left", left_on="player_id", right_on="gsis_id"
    )
    return games.drop(columns="gsis_id")


def _defensive_fumble_tds(seasons, current, force):
    """Fumble-return TDs by the defense. nflverse's team def_tds counts interception returns
    only, and its team fumble_recovery_tds also counts the offense's own recoveries, so sum
    the player-level fumble-recovery TDs of defensive players."""
    frames = []
    for season in sorted(seasons):
        raw = _player_file(season, current if not force else 0)
        if raw is None:
            continue
        raw = raw[raw["position_group"].isin(DEFENSIVE_GROUPS) & (raw["fumble_recovery_tds"].fillna(0) > 0)]
        frames.append(raw.groupby(["game_id", "team"], as_index=False)["fumble_recovery_tds"].sum())
    if not frames:
        return pd.DataFrame(columns=["game_id", "franchise", "fumble_return_tds"])
    out = pd.concat(frames, ignore_index=True)
    return out.rename(columns={"team": "franchise", "fumble_recovery_tds": "fumble_return_tds"})


def _add_missing_team_games(games):
    """Fill defensive stats for games nflverse's team file doesn't have, from box scores."""
    if not MISSING_TEAM_GAMES.exists():
        return games
    patch = pd.read_csv(MISSING_TEAM_GAMES).set_index(["game_id", "team"])
    cols = [c for c in DEFENSE_STATS if c != "points_allowed"]
    for i in games.index[games["sacks"].isna()]:
        key = (games.at[i, "game_id"], games.at[i, "team"])
        if key in patch.index:
            for c in cols:
                games.at[i, c] = patch.at[key, c]
    return games


def team_name(abbr, season, names):
    # nflverse only has Washington's current name.
    if abbr == "WAS" and season < 2020:
        return "Washington Redskins"
    if abbr == "WAS" and season < 2022:
        return "Washington Football Team"
    return names.get(abbr, abbr)


def load_team_names():
    path = cached_download(f"{RELEASES}/teams/teams_colors_logos.csv", "teams_colors_logos.csv")
    teams = pd.read_csv(path)
    return dict(zip(teams["team_abbr"], teams["team_name"]))


def load_defense_games(seasons, current, force=False):
    """One row per team per game: points allowed from schedules, the rest from team stats."""
    sched_path = cached_download(f"{RELEASES}/schedules/games.csv", "games.csv", refresh=True)
    sched = pd.read_csv(sched_path)
    sched = sched[sched["season"].isin(list(seasons))].dropna(subset=["home_score", "away_score"])

    sides = []
    for us, them in (("home", "away"), ("away", "home")):
        sides.append(
            pd.DataFrame(
                {
                    "game_id": sched["game_id"],
                    "season": sched["season"].astype(int),
                    "week": sched["week"].astype(int),
                    "season_type": sched["game_type"].where(sched["game_type"] == "REG", "POST"),
                    "team": sched[f"{us}_team"],
                    "opponent": sched[f"{them}_team"],
                    "points_allowed": sched[f"{them}_score"].astype(int),
                }
            )
        )
    games = pd.concat(sides, ignore_index=True)
    games["franchise"] = games["team"].replace(FRANCHISE_CODE)

    stat_frames = []
    for season in sorted(games["season"].unique()):
        path = _season_file("stats_team", season, current if not force else 0)
        if path is None:
            continue
        raw = pd.read_csv(path, low_memory=False)
        stats = _sum_columns(raw, DEFENSE_MAP)
        stats["game_id"] = raw["game_id"]
        stats["franchise"] = raw["team"]
        stats = stats.dropna(subset=["franchise"])
        # Games missing a team row also have that team's players filed under the opponent,
        # so the opponent's row is wrong too: rebuild both sides from the repaired player rows.
        have = set(zip(stats["game_id"], stats["franchise"]))
        broken = {g for g in stats["game_id"].unique() if not all((g, t) in have for t in _game_sides(g))}
        players = _player_file(season, current if not force else 0)
        if broken and players is not None:
            pl = players[players["game_id"].isin(broken)].copy()
            # In these games nflverse also files the mislabelled team's offensive TDs as
            # def_tds, so take defensive TDs from defensive players only.
            pl.loc[~pl["position_group"].isin(DEFENSIVE_GROUPS), "def_tds"] = 0
            rebuilt = _sum_columns(pl, DEFENSE_MAP)
            rebuilt["game_id"], rebuilt["franchise"] = pl["game_id"], pl["team"]
            rebuilt = rebuilt.groupby(["game_id", "franchise"], as_index=False).sum()
            stats = pd.concat([stats[~stats["game_id"].isin(broken)], rebuilt], ignore_index=True)
            log(f"  {season}: rebuilt team defense from player rows for {len(broken)} games nflverse mislabels")
        stat_frames.append(stats)
    stats = pd.concat(stat_frames, ignore_index=True)
    stats = stats.merge(_defensive_fumble_tds(games["season"].unique(), current, force),
                        how="left", on=["game_id", "franchise"])
    stats["def_tds"] = stats["def_tds"] + stats["fumble_return_tds"].fillna(0)
    stats = stats.drop(columns="fumble_return_tds")

    games = games.merge(stats, how="left", on=["game_id", "franchise"])
    games = _add_missing_team_games(games)
    missing = games["sacks"].isna().sum()
    if missing:
        log(f"  {missing} team-games have no defensive stats; counting points allowed only: "
            + ", ".join(f"{r.game_id} {r.team}" for r in games[games["sacks"].isna()].itertuples()))
    games = ensure_columns(games, DEFENSE_STATS)
    names = load_team_names()
    games["team_name"] = [team_name(t, s, names) for t, s in zip(games["team"], games["season"])]
    games["source"] = "nflverse"
    return games.drop(columns="franchise")
