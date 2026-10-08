"""Fantasy points for offense, kickers and team defense."""

import json

from common import BOT_DIR

SCORING = json.loads((BOT_DIR / "scoring.json").read_text())
FORMATS = list(SCORING["reception_formats"])
OFFENSE_FP = [f"fp_{fmt}" for fmt in FORMATS]


def score_offense(df):
    pts = SCORING["offense"]
    base = sum(df[stat] * per for stat, per in pts.items() if not stat.startswith("_"))
    for fmt, per_rec in SCORING["reception_formats"].items():
        df[f"fp_{fmt}"] = (base + df["receptions"] * per_rec).round(2)
    df["fp"] = df[f"fp_{SCORING['rank_by']}"]
    return df


def score_kicking(df):
    k = SCORING["kicking"]
    df["fp"] = (
        df["fg_made_0_39"] * k["fg_0_39"]
        + df["fg_made_40_49"] * k["fg_40_49"]
        + df["fg_made_50_plus"] * k["fg_50_plus"]
        + df["fg_made_unknown"] * k["fg_unknown_distance"]
        # Unknown attempts (before 1938) mean no known misses.
        + (df["fg_att"].fillna(df["fg_made"]) - df["fg_made"]) * k["fg_missed"]
        + df["xp_made"] * k["xp_made"]
        + (df["xp_att"].fillna(df["xp_made"]) - df["xp_made"]) * k["xp_missed"]
    ).round(2)
    return df


def points_allowed_fp(points):
    if points != points:  # unknown score (NaN): no points-allowed bonus or penalty
        return 0
    for limit, fp in SCORING["defense"]["points_allowed"]:
        if points <= limit:
            return fp
    return SCORING["defense"]["points_allowed"][-1][1]


def _defense_counting_fp(df):
    d = SCORING["defense"]
    return (
        df["sacks"] * d["sacks"]
        + df["interceptions"] * d["interceptions"]
        + df["fumble_recoveries"] * d["fumble_recoveries"]
        + (df["def_tds"] + df["st_tds"]) * d["touchdowns"]
        + df["safeties"] * d["safeties"]
        + df["blocked_kicks"] * d["blocked_kicks"]
    )


def score_defense_games(df):
    """Score one row per team per game (points-allowed tiers are per game)."""
    df["fp_points_allowed"] = df["points_allowed"].map(points_allowed_fp)
    df["fp"] = (_defense_counting_fp(df) + df["fp_points_allowed"]).round(2)
    return df


def score_defense_totals(df):
    """Score team-season totals whose fp_points_allowed was summed from games."""
    df["fp"] = (_defense_counting_fp(df) + df["fp_points_allowed"]).round(2)
    return df
