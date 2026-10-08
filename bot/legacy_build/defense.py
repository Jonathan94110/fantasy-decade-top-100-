#!/usr/bin/env python3
"""Build the pre-1999 team defense (D/ST) tables for 1920-1998.

One-time build script. It downloads the raw sources into .cache/legacy/raw/
(gitignored, reused when present) and writes two clean CSVs that the weekly bot
only reads (bot/legacy.py). Run from the repo root:

    python3 bot/legacy_build/defense.py

Outputs
  sources/legacy_defense_games.csv    one row per team per regular-season game:
      game_id, season, week, team, team_name, opponent, points_allowed, source
  sources/legacy_defense_seasons.csv  one row per team-season:
      season, team, team_name, sacks, interceptions, fumble_recoveries, def_tds,
      st_tds, safeties, blocked_kicks, source_notes
  Both tables hold exactly the same set of (season, team) keys and team names,
  so the bot can add the season totals to the per-game points-allowed rows.

Sources (downloaded files are treated as untrusted data and read with pandas, never
executed):
  fivethirtyeight  github.com/fivethirtyeight/nfl-elo-game data/nfl_games.csv:
                   every game 1920-2020 with date, home team (team1), playoff
                   flag and final score. 538 uses franchise codes (ARI is the
                   Cardinals in every city, DET includes Portsmouth ...); they
                   are mapped to the codes and names of each era below.
  octonion         github.com/octonion/football-public nfl_team_standings.csv,
                   NFL.com standings 1920-2014 (W-L-T, points for/against). Only
                   used to check the games and points allowed.
  allenjake440     github.com/allenjake440/NFL_Champion all_team_defense_data.csv,
                   Pro Football Reference team defense 1980-2024: G, PA, FL
                   (opponent fumbles lost), Int, and plays/attempts from which
                   team sacks are derived (below). Its group labels are shifted:
                   "Tot Yds & TO_Cmp/Att" hold passing Cmp/Att and "Passing_Att"
                   holds rushing Att; the script asserts this (Tot Yds = pass +
                   rush yards, TO = FL + Int, NY/A = pass yds / (att + sacks)).
  michaelmallari   huggingface.co/datasets/michaelmallari/nfl, Pro Football
                   Reference season scoring table 1922-2022 (NFL only, no AFL):
                   IntTD, FblTD, PR TD, KR TD, OthTD, Sfty per player-season.
  trevyoungquist   Kaggle trevyoungquist/2020-nfl-stats-active-and-retired-players
                   (an NFL.com scrape). Defense (interceptions, sacks) and
                   Passing (interceptions thrown, for a league-total check) per
                   player and season. The Defense header is shifted by one
                   column: real safeties are under Sack_Yards, passes defended
                   under Safties, interceptions under Passes_Deflected, INT TDs
                   under INTs and INT yards under TDs (checked below on Night
                   Train Lane 1952: 14 INT, 298 yds, 2 TD). NFL.com files most
                   traded players' whole season under one team, and some players
                   are missing altogether (e.g. Roy Zimmerman's 7 INT for the 1945
                   Eagles).
  kendallgillies   Kaggle kendallgillies/nflstatistics, another NFL.com scrape
                   that covers fewer players but keeps one row per team for
                   traded players. Used to split traded players' trevyoungquist
                   defense lines by team and PFR "2TM" rows (below).
  profootballarchives  profootballarchives.com team pages ({YYYY}nfl{team}.html,
                   {YYYY}afl{team}.html), looked up by hand (web lookup during the
                   build, not downloaded by this script) and transcribed into
                   PFA_NFL_1940S and PFA_AFL below: the Team Totals rows of the
                   INTERCEPTIONS, SCORING, RUSHING, RECEIVING, PUNT RETURNS and
                   KICKOFF RETURNS tables. Their player rows add up to the team
                   totals, and the league INT totals equal the league's
                   interceptions thrown (1949 NFL 247; AFL 1960, 1961, 1963-66, 1968).
  nfl.com          NFL.com team stats pages for 1940-1998, looked up during the build
                   (not downloaded by this script) and transcribed into
                   NFLCOM_TEAM_DEFENSE below: INT from
                   https://www.nfl.com/stats/team-stats/defense/interceptions/{YYYY}/reg/all
                   and SFTY from
                   https://www.nfl.com/stats/team-stats/defense/scoring/{YYYY}/reg/all
                   (the AAFC teams those pages also list are left out). These are team
                   totals, not sums of NFL.com's player lines. SFTY equals
                   profootballarchives' SAF, which counts safeties credited to no player,
                   for all 98 NFL team-seasons of 1940-49 and all 86 AFL ones. INT equals
                   profootballarchives for the same 184 and PFR for 537 of the 540 1980-98
                   team-seasons. In the other 3 (1988 RAM, 1991 DEN and WAS) NFL.com is 1
                   higher and profootballarchives agrees with PFR.

How each column is built
  points_allowed   per game, the opponent's final score (538).
  sacks            1982-1998: Pro Football Reference team sacks (allenjake440:
                   plays - pass attempts - rush attempts). These are the official
                   team totals, including sacks credited only to the team. (Sums of
                   NFL.com player sacks miss team-only sacks and players absent
                   from the scrape, and file traded players under one team; they
                   differ from the official totals in about 24% of 1982-98 team-
                   seasons, by 1-5, so they are only printed for comparison.) Shared
                   sacks need no rounding this way. Sacks became official in 1982;
                   PFR's unofficial 1980-81 team totals are used too (SACKS_FROM =
                   1980) so the whole 1980s decade is comparable. Empty before 1980.
  interceptions    1980-1998: PFR team totals (allenjake440 Int).
                   1950-1979 NFL: NFL.com team totals (NFLCOM_TEAM_DEFENSE). The sums of
                   NFL.com's player lines (trevyoungquist, with traded players split by
                   team with kendallgillies where it can) are only printed for
                   comparison. They differ in 69 team-seasons, because a traded player's
                   season is filed under one team (Dan Sandifer's 2 interceptions for
                   the 1950 Lions are filed under the Eagles) or players are missing from
                   the scrape. In all 69, profootballarchives' INTERCEPTIONS Team Totals
                   agree with the team totals (PFA_INT_CHECKS).
                   1940-1949 NFL and 1960-1969 AFL: profootballarchives team
                   totals, which equal NFL.com's (NFL.com's player lines are missing whole
                   players in the 1940s and AFL). Empty before 1940 (not recorded).
  fumble_recoveries  1980-1998: PFR team FL (opponent fumbles lost), PFR's
                   definition; it can differ by 1 from the game books' "opponent
                   fumbles recovered" (3 of 33 team-seasons checked, e.g. 1985 RAM
                   17 vs 16). No team-level source found before 1980 (NFL.com has
                   player fumble recoveries only from about 1991), so empty.
  def_tds          NFL 1922-1998: PFR IntTD + FblTD summed by team (rows checked and
                   corrected as described under "Checks on PFR's scoring rows"). From 1950 on,
                   FblTD scored by players listed only at an offensive position
                   (QB, RB, WR, TE, offensive line, LE/RE ...) are left out: those
                   are mostly an offense recovering its own fumble in the end zone.
                   For 1950-59, when two-way play was still common, the 18 such
                   TDs were checked on profootballarchives' fumble tables and the 9
                   that came from recovering an opponent's fumble are kept
                   (FBL_TD_DEFENSIVE_1950S).
                   AFL 1960-1969: profootballarchives team totals: all TDs that
                   are not rushing, receiving, punt-return or kickoff-return TDs
                   (scoring TD - rush TD - rec TD - PR TD - KR TD), i.e. INT-return,
                   fumble-return and blocked/missed-kick-return TDs. Empty for
                   1920-1921 (no source).
  st_tds           NFL 1922-1998: PFR PR TD + KR TD + OthTD (OthTD are blocked
                   kick and missed field goal returns, which fantasy D/ST scoring
                   and nflverse's special_teams_tds count). AFL 1960-1969:
                   profootballarchives punt + kickoff return TDs (the AFL's other
                   return TDs are in def_tds, same points). Empty for 1920-1921.
  safeties         1940-1949 NFL and 1960-1969 AFL: profootballarchives team
                   totals (SAF), which include safeties credited only to the team.
                   1950-1998 NFL: NFL.com team totals (SFTY, NFLCOM_TEAM_DEFENSE), which
                   include them as well (see Sources, and the points check below). PFR's
                   Sfty (safeties credited to a player, placed on teams like the TDs)
                   is only compared. It misses the safeties credited to no player
                   (holding in the end zone, a snap out of the end zone): 443 against
                   578 team safeties in 1950-98, low in 127 of 1075 team-seasons (1996
                   CAR 0 vs 2, SFO 2 vs 4). Empty before 1940: PFR's player safeties
                   are almost all missing then (0 league-wide in 1934-36, 1938-41 and
                   1943), and no team totals were used.
  blocked_kicks    no source has blocked kicks before 1999: empty everywhere.
  source_notes     short per-row note of which source filled each column and any
                   partial column.

Checks on PFR's scoring rows (they feed def_tds and st_tds)
  * Row check (build fails otherwise): a row's TD types add up to its AllTD, and its
    Pts equal 6 x TDs + XP + 3 x FG + 2 x Sfty + 2 x 2PT, unless the gap can't hide or
    double a D/ST score. Allowed gaps are a missing XP, safety or 2PT (under 6 points),
    or fewer points on a row with no return, fumble, interception, other or safety
    scores. The rows that failed were looked up and are corrected in PFR_ROW_FIXES.
    One is Darrell Hogan 1952: IntTD 1 and OthTD 1 but 6 points. He scored one
    "other" TD and returned none of his 4 interceptions for a score.
  * Points check (a self-check): from 1950 on, take a season's points scored (538,
    equal to the standings), minus PFR's single-team players' non-safety points
    (TDs, XP, FG, 2PT), minus 2 x the team safeties. The result equals PFR's
    multi-team ("2TM") players' non-safety points in every season. That checks the
    NFL.com safeties and catches a TD counted twice even when its row adds up, as
    Floyd Rice 1973 did (PFR 2 TDs, profootballarchives 1). AFL_NFL_SPLIT_SCORERS adds
    the NFL points of five players whose season was split between the AFL and the NFL,
    whom PFR's NFL table lacks. Back to 1922, no team-season scored fewer points than
    PFR's single-team players plus 2 x its known safeties.

Judgement calls
  * Seasons 1920-1998, regular season only: 538 games with playoff=1 are dropped.
    That drops the conference tiebreaker games (1941, 1943, 1947, 1950, 1952,
    1957, 1958, 1963 AFL, 1965, 1968 AFL), which official records treat as
    postseason. The 1932 Bears-Spartans "playoff" game counted in the 1932
    standings and 538 marks it playoff=0, so it stays as a regular-season game.
  * The AFL (1960-69) is included. The AAFC (1946-49: Browns, 49ers, Colts,
    Bills/Bisons, Dons, Yankees, Dodgers, Rockets/Hornets, Seahawks) is excluded;
    no AAFC team ever played an NFL team in a regular-season game, which the
    script asserts.
  * 1920-1921: games against non-league opponents are dropped; only games where
    both teams were APFA members that season are kept. (The 1920 standings
    assembled later by historians include some non-league games, so ten 1920
    points-allowed totals differ from octonion/NFL.com; the check prints them.)
  * 538 lacks one game: Frankford 10, Orange 0 on 1929-12-14 at Frankford
    (Wikipedia "1929 Orange Tornadoes season"; it makes both teams' games and
    points match the 1929 standings). MANUAL_GAMES adds it with source "manual".
  * week is the team's game number within the season, ordered by date (1..N).
    Early-era teams sometimes played twice in a calendar week, so a league week
    would not be unique per team.
  * game_id is "<season>_<YYYYMMDD>_<away>_<home>" with the era codes below
    (home = 538's team1, also for the few neutral-site games). Both teams' rows
    of a game share the game_id.
  * Team codes are Pro Football Reference's season-table codes of the era (the
    same scheme as bot/legacy_build/offense.py and kickers.py): CRD Chicago
    Cardinals, STL St. Louis Cardinals 1960-87 (and All-Stars 1923, Gunners 1934,
    Rams 1995-98), PHO/ARI, PRT Portsmouth, BOS for every Boston team (Bulldogs
    1929, Braves/Redskins 1932-36, Yanks 1944-48, Patriots 1960-70), RAM
    Cleveland/LA Rams, BAL Baltimore Colts 1953-83 and Ravens 1996-98, BCL 1950
    Colts, HOU/TEN Oilers, OAK/RAI Raiders, DTX Dallas Texans (1952 NFL and
    1960-62 AFL), NYT Titans, LAC 1960 Chargers then SDG, NWE, KAN, GNB, NOR,
    SFO, TAM. Pre-1922 teams that PFR's tables lack: DEC Decatur Staleys, CHT
    Chicago Tigers, MUN Muncie Flyers, WSN Washington Senators, TON Tonawanda
    Kardex. The 1943 Phil-Pitt Combine is PHI and the 1944 Card-Pitt Combine is
    CRD, as PFR files them. team_name is the era's full name in Pro Football
    Reference's naming (e.g. 1920 "Chicago Cardinals", 1940 "Pittsburgh
    Steelers", 1925 "Akron Pros"); the run prints where NFL.com's standings name
    differs.
  * Traded players (NFL.com player interceptions, now only compared with the team
    totals): when kendallgillies has a player's season split by team and its totals
    (INT, sacks, INT TDs, safeties) equal trevyoungquist's single-team line, the
    kendallgillies per-team lines replace it. Other traded players' interceptions
    stay on the team NFL.com files them under, one reason the player sums differ
    from the team totals.
  * PFR rows for players on two or more teams in a season ("2TM"/"3TM") with D/ST
    scoring are placed by kendallgillies' per-team split of the same stat when it
    adds up, otherwise by MANUAL_PLACEMENTS (each entry backed by a web lookup,
    mostly the per-team scoring and return tables on profootballarchives.com).
    There is no guessing fallback: the build fails on a row neither can place.
    (NFL.com's single team per season was wrong for 6 of 11 audited placements.)

Columns that are empty, and why (empty = unknown; the bot counts it as 0)
  sacks              before 1982 (not an official stat)
  interceptions      before 1940 (not recorded)
  fumble_recoveries  before 1980 (no team-level source found)
  def_tds, st_tds    1920-1921 (no source)
  safeties           1920-1939 (PFR player safeties missing; no team totals used)
  blocked_kicks      every season (no source)
Partial (not empty, but can be undercounted):
  * def_tds 1960-1998 NFL (and 9 of the 18 checked 1950s cases, 4 of them on an
    unclear fumble-table row): fumble TDs by offensive-position players are
    excluded, which drops the odd special-teams fumble-recovery TD. AFL def_tds can include a rare offensive own-fumble TD
    (e.g. 1961 BOS: Babe Parilli).
  * fumble_recoveries 1980-1998: PFR opponent fumbles lost (see above).
  Within the 1980s, 1980-81 have no sacks (per the spec) and so score lower than
  1982-89 team-seasons in the same decade list.
"""

from __future__ import annotations

import io
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bot"))
from common import DEFENSE_STATS  # noqa: E402  (read-only: canonical column names)
from scoring import SCORING  # noqa: E402  (read-only: D/ST points for the summary)

RAW = ROOT / ".cache" / "legacy" / "raw"
OUT_GAMES = ROOT / "sources" / "legacy_defense_games.csv"
OUT_SEASONS = ROOT / "sources" / "legacy_defense_seasons.csv"

FIRST_SEASON, LAST_SEASON = 1920, 1998
AAFC_SEASONS = range(1946, 1950)
INT_FROM = 1940
SACKS_FROM = 1980          # official from 1982; PFR's unofficial 1980-81 team totals keep the 1980s comparable
FR_FROM = 1980
TDS_FROM = 1922
SAFETIES_FROM = 1940
PFR_SAFETIES_FROM = 1950   # PFR player safeties placed on teams from here (compared with the team totals)
PFA_NFL_SEASONS = range(1940, 1950)
PLATOON_FROM = 1950

SEASON_STATS = [c for c in DEFENSE_STATS if c != "points_allowed"]
assert SEASON_STATS == ["sacks", "interceptions", "fumble_recoveries", "def_tds", "st_tds",
                        "safeties", "blocked_kicks"], SEASON_STATS
GAME_COLUMNS = ["game_id", "season", "week", "team", "team_name", "opponent", "points_allowed", "source"]
SEASON_COLUMNS = ["season", "team", "team_name", *SEASON_STATS, "source_notes"]

URLS = {
    "fivethirtyeight_nfl_games.csv":
        "https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv",
    "octonion_nfl_team_standings.csv":
        "https://raw.githubusercontent.com/octonion/football-public/master/nfl/csv/nfl_team_standings.csv",
    "allenjake440_all_team_defense_data.csv":
        "https://raw.githubusercontent.com/allenjake440/NFL_Champion/main/data/all_team_defense_data.csv",
    "michaelmallari_nfl_players_1922_2022.csv":
        "https://huggingface.co/datasets/michaelmallari/nfl/resolve/main/nfl-players-1922-2022.csv",
    "trev.zip": "https://www.kaggle.com/api/v1/datasets/download/"
                "trevyoungquist/2020-nfl-stats-active-and-retired-players",
    "kendallgillies.zip": "https://www.kaggle.com/api/v1/datasets/download/kendallgillies/nflstatistics",
}

# Games 538 lacks, in 538's layout (team1 = home). See the docstring.
MANUAL_GAMES = [
    {"date": "1929-12-14", "season": 1929, "neutral": 0, "playoff": 0, "team1": "FYJ", "team2": "TOR",
     "score1": 10, "score2": 0},
]

# --- team totals from profootballarchives.com (web lookup, see the docstring) ---------
# NFL 1940-49, from https://www.profootballarchives.com/{YYYY}nfl{team}.html (1943 Phil-Pitt
# = 1943nflp-p, 1944 Card-Pitt = 1944nflc-p): INTERCEPTIONS Team Totals INT and TD, SCORING
# Team Totals SAF. int_td is only used to cross-check PFR (def_tds stay PFR).
PFA_NFL_1940S = """
season team int int_td saf
1940 WAS 18 1 0
1940 BKN 18 1 1
1940 NYG 23 0 1
1940 PIT 8 0 0
1940 PHI 12 0 0
1940 CHI 27 2 0
1940 GNB 40 1 0
1940 DET 29 2 1
1940 RAM 25 2 1
1940 CRD 23 1 1
1941 WAS 23 1 0
1941 BKN 20 1 1
1941 NYG 29 1 0
1941 PIT 19 0 0
1941 PHI 21 0 0
1941 CHI 34 3 0
1941 GNB 25 1 1
1941 DET 18 2 0
1941 RAM 15 0 0
1941 CRD 16 1 0
1942 WAS 19 0 2
1942 BKN 14 1 0
1942 NYG 15 1 0
1942 PIT 21 0 0
1942 PHI 18 0 0
1942 CHI 33 3 0
1942 GNB 33 1 0
1942 DET 18 0 0
1942 RAM 23 0 1
1942 CRD 25 1 0
1943 WAS 26 1 0
1943 NYG 18 1 0
1943 PHI 22 2 0
1943 BKN 15 0 0
1943 CHI 24 0 0
1943 GNB 42 2 0
1943 DET 19 2 0
1943 CRD 16 0 0
1944 NYG 34 4 2
1944 PHI 33 3 0
1944 WAS 19 0 0
1944 BOS 16 0 0
1944 BKN 10 0 0
1944 GNB 29 3 1
1944 CHI 24 0 0
1944 DET 26 0 0
1944 RAM 27 0 0
1944 CRD 16 0 0
1945 WAS 16 0 0
1945 PHI 19 0 0
1945 NYG 13 0 0
1945 BOS 30 0 0
1945 PIT 13 1 0
1945 RAM 28 0 0
1945 DET 23 1 1
1945 GNB 24 5 1
1945 CHI 15 0 0
1945 CRD 12 0 1
1946 WAS 24 1 0
1946 PHI 26 1 2
1946 NYG 19 1 0
1946 BOS 17 1 0
1946 PIT 14 1 0
1946 RAM 23 1 0
1946 DET 13 0 1
1946 GNB 24 0 2
1946 CHI 27 1 0
1946 CRD 25 0 1
1947 WAS 21 0 0
1947 PHI 23 0 0
1947 NYG 27 0 0
1947 BOS 28 0 0
1947 PIT 18 4 3
1947 RAM 24 1 0
1947 DET 25 1 0
1947 GNB 30 1 2
1947 CHI 27 3 0
1947 CRD 27 2 0
1948 WAS 24 2 1
1948 PHI 23 0 1
1948 NYG 39 2 1
1948 BOS 18 3 0
1948 PIT 13 1 0
1948 RAM 19 1 0
1948 DET 14 0 0
1948 GNB 29 0 0
1948 CHI 30 1 0
1948 CRD 23 2 0
1949 PHI 29 2 1
1949 PIT 22 0 1
1949 NYG 22 2 0
1949 WAS 18 0 0
1949 NYY 14 1 0
1949 RAM 30 4 0
1949 CHI 27 2 1
1949 CRD 33 3 1
1949 DET 32 2 0
1949 GNB 20 0 0
"""

# AFL 1960-69, from https://www.profootballarchives.com/{YYYY}afl{team}.html: Team Totals of
# SCORING (td, saf), RUSHING td, RECEIVING td, INTERCEPTIONS (int, int_td), PUNT RETURNS td,
# KICKOFF RETURNS td. 1960 NYT: the RECEIVING Team Totals TD cell is blank; 32 is the sum of
# its player rows (= the team's passing TDs).
PFA_AFL = """
season team td saf rush_td rec_td int int_td pr_td kr_td
1960 HOU 48 0 15 31 25 0 0 2
1960 NYT 51 0 14 32 24 1 0 2
1960 BUF 38 0 15 19 33 4 0 0
1960 BOS 37 1 11 25 25 0 0 0
1960 LAC 48 0 23 21 28 2 0 0
1960 DTX 46 0 24 16 32 4 1 0
1960 OAK 43 1 23 18 25 1 0 1
1960 DEN 37 0 10 24 27 2 1 0
1961 HOU 66 2 15 48 33 0 0 0
1961 NYT 40 0 17 20 25 1 2 0
1961 BUF 38 1 18 15 29 1 0 1
1961 BOS 52 0 14 29 22 2 0 2
1961 SDG 52 0 24 17 49 9 1 0
1961 DTX 45 0 23 18 25 3 0 1
1961 OAK 29 1 10 17 23 2 0 0
1961 DEN 32 1 11 18 26 0 1 1
1962 HOU 50 2 15 32 35 2 1 0
1962 BOS 41 0 11 25 25 3 0 1
1962 BUF 41 0 20 15 36 3 0 2
1962 NYT 34 1 9 20 29 1 3 0
1962 DTX 50 0 21 29 32 0 0 0
1962 DEN 39 1 12 21 27 4 0 0
1962 SDG 38 0 13 23 29 1 0 1
1962 OAK 27 0 14 11 29 1 0 1
1963 BOS 37 2 16 17 29 3 0 0
1963 BUF 39 2 21 16 22 1 0 0
1963 HOU 39 1 11 26 36 2 0 0
1963 NYJ 32 0 8 21 21 0 1 0
1963 SDG 50 0 20 28 29 1 0 0
1963 OAK 48 2 11 31 35 2 2 0
1963 KAN 46 1 12 30 26 1 0 1
1963 DEN 36 0 10 23 15 1 0 1
1964 BOS 41 1 9 31 31 1 0 0
1964 BUF 48 3 25 19 28 2 1 0
1964 HOU 39 0 14 19 30 3 1 1
1964 NYJ 34 1 11 19 34 4 0 0
1964 SDG 44 0 14 28 30 2 0 0
1964 OAK 37 1 9 28 26 0 0 0
1964 KAN 49 0 14 32 28 1 0 0
1964 DEN 28 1 10 14 32 1 1 0
1965 BOS 27 2 8 19 21 0 0 0
1965 BUF 33 0 16 13 32 1 0 2
1965 HOU 37 1 10 25 27 0 0 0
1965 NYJ 32 0 11 21 26 0 0 0
1965 SDG 41 0 13 23 28 3 2 0
1965 OAK 35 1 8 22 24 4 1 0
1965 KAN 40 0 15 22 20 2 1 0
1965 DEN 38 0 14 18 25 3 1 0
1966 BOS 38 0 17 20 22 0 0 0
1966 BUF 43 1 19 15 29 4 2 1
1966 HOU 41 1 11 29 18 0 0 0
1966 NYJ 38 1 15 21 21 1 0 1
1966 SDG 41 1 9 29 27 1 1 0
1966 OAK 40 0 13 26 23 1 0 0
1966 KAN 55 0 19 31 33 2 1 0
1966 DEN 22 0 6 12 13 0 0 3
1966 MIA 26 0 5 16 31 4 0 1
1967 BOS 33 2 10 20 17 2 0 0
1967 BUF 27 0 9 14 27 3 0 0
1967 HOU 31 0 12 11 26 6 0 1
1967 NYJ 46 0 17 27 27 1 0 0
1967 SDG 45 0 14 26 13 2 0 0
1967 OAK 58 1 19 33 30 4 0 0
1967 KAN 49 1 18 26 31 4 0 1
1967 DEN 31 2 10 17 28 3 1 0
1967 MIA 28 0 10 16 28 1 0 0
1968 NYJ 45 1 22 20 28 2 0 0
1968 HOU 38 1 16 17 20 5 0 0
1968 MIA 36 0 12 21 22 1 0 0
1968 BOS 26 1 8 16 23 1 0 0
1968 BUF 22 1 9 7 22 4 1 1
1968 OAK 55 2 16 31 25 4 2 0
1968 KAN 40 1 16 20 37 2 2 0
1968 SDG 45 1 12 29 20 2 1 0
1968 CIN 25 1 14 8 10 2 0 0
1968 DEN 32 1 11 20 20 0 1 0
1969 NYJ 37 0 14 21 29 1 0 0
1969 HOU 31 1 12 15 23 2 0 0
1969 MIA 28 0 12 12 18 2 0 1
1969 BOS 32 2 11 19 20 1 0 0
1969 BUF 26 0 7 17 19 1 0 0
1969 OAK 45 1 4 36 26 4 0 0
1969 KAN 40 0 19 16 32 2 0 1
1969 SDG 35 0 18 13 31 3 0 0
1969 CIN 33 1 10 22 21 1 0 0
1969 DEN 37 0 12 23 14 2 0 0
"""

# --- team totals from NFL.com (web lookup, see the docstring) --------------------------
# "team:INT:SFTY" for every NFL and AFL team-season 1940-1998. INT from
# https://www.nfl.com/stats/team-stats/defense/interceptions/{YYYY}/reg/all, SFTY from
# https://www.nfl.com/stats/team-stats/defense/scoring/{YYYY}/reg/all (NFL.com's nicknames
# mapped to the era codes; the AAFC teams on the 1946-49 pages left out). Used for NFL
# interceptions 1950-79 and NFL safeties 1950-98, and checked against the other sources.
NFLCOM_TEAM_DEFENSE = """
1940 BKN:18:1 CHI:27:0 CRD:23:1 DET:29:1 GNB:40:0 NYG:23:1 PHI:12:0 PIT:8:0 RAM:25:1 WAS:18:0
1941 BKN:20:1 CHI:34:0 CRD:16:0 DET:18:0 GNB:25:1 NYG:29:0 PHI:21:0 PIT:19:0 RAM:15:0 WAS:23:0
1942 BKN:14:0 CHI:33:0 CRD:25:0 DET:18:0 GNB:33:0 NYG:15:0 PHI:18:0 PIT:21:0 RAM:23:1 WAS:19:2
1943 BKN:15:0 CHI:24:0 CRD:16:0 DET:19:0 GNB:42:0 NYG:18:0 PHI:22:0 WAS:26:0
1944 BKN:10:0 BOS:16:0 CHI:24:0 CRD:16:0 DET:26:0 GNB:29:1 NYG:34:2 PHI:33:0 RAM:27:0 WAS:19:0
1945 BOS:30:0 CHI:15:0 CRD:12:1 DET:23:1 GNB:24:1 NYG:13:0 PHI:19:0 PIT:13:0 RAM:28:0 WAS:16:0
1946 BOS:17:0 CHI:27:0 CRD:25:1 DET:13:1 GNB:24:2 NYG:19:0 PHI:26:2 PIT:14:0 RAM:23:0 WAS:24:0
1947 BOS:28:0 CHI:27:0 CRD:27:0 DET:25:0 GNB:30:2 NYG:27:0 PHI:23:0 PIT:18:3 RAM:24:0 WAS:21:0
1948 BOS:18:0 CHI:30:0 CRD:23:0 DET:14:0 GNB:29:0 NYG:39:1 PHI:23:1 PIT:13:0 RAM:19:0 WAS:24:1
1949 CHI:27:1 CRD:33:1 DET:32:0 GNB:20:0 NYG:22:0 NYY:14:0 PHI:29:1 PIT:22:1 RAM:30:0 WAS:18:0
1950 BCL:34:0 CHI:16:1 CLE:31:1 CRD:22:0 DET:31:0 GNB:27:0 NYG:27:2 NYY:30:3 PHI:31:0 PIT:22:1
     RAM:31:1 SFO:22:0 WAS:19:0
1951 CHI:21:0 CLE:22:0 CRD:27:0 DET:15:1 GNB:22:0 NYG:41:1 NYY:22:0 PHI:18:1 PIT:30:1 RAM:19:0
     SFO:33:1 WAS:18:0
1952 CHI:20:2 CLE:22:1 CRD:25:0 DET:32:1 DTX:28:0 GNB:22:0 NYG:28:1 PHI:20:1 PIT:27:0 RAM:38:1
     SFO:17:2 WAS:18:2
1953 BAL:29:1 CHI:14:1 CLE:25:0 CRD:24:1 DET:38:0 GNB:28:0 NYG:23:2 PHI:24:0 PIT:21:2 RAM:30:0
     SFO:23:0 WAS:27:0
1954 BAL:20:1 CHI:27:0 CLE:23:1 CRD:24:0 DET:30:0 GNB:19:0 NYG:33:1 PHI:28:1 PIT:30:1 RAM:23:0
     SFO:19:0 WAS:18:2
1955 BAL:19:0 CHI:19:1 CLE:25:1 CRD:29:0 DET:15:1 GNB:31:0 NYG:23:0 PHI:16:0 PIT:10:0 RAM:31:1
     SFO:21:0 WAS:19:0
1956 BAL:13:0 CHI:23:0 CLE:18:1 CRD:33:0 DET:28:0 GNB:21:0 NYG:17:1 PHI:16:0 PIT:18:1 RAM:18:0
     SFO:17:0 WAS:18:1
1957 BAL:28:0 CHI:15:0 CLE:19:0 CRD:12:1 DET:25:1 GNB:30:0 NYG:18:0 PHI:17:0 PIT:19:1 RAM:14:1
     SFO:18:1 WAS:16:0
1958 BAL:35:0 CHI:22:0 CLE:16:0 CRD:15:0 DET:22:0 GNB:13:0 NYG:21:1 PHI:15:0 PIT:24:1 RAM:28:1
     SFO:16:0 WAS:16:0
1959 BAL:40:0 CHI:22:1 CLE:18:0 CRD:15:0 DET:14:0 GNB:14:2 NYG:22:0 PHI:20:0 PIT:22:0 RAM:7:1
     SFO:14:1 WAS:13:1
1960 BAL:30:2 BOS:25:1 BUF:33:0 CHI:10:0 CLE:31:0 DAL:15:0 DEN:27:0 DET:19:3 DTX:32:0 GNB:22:0
     HOU:25:0 LAC:28:0 NYG:22:1 NYT:24:0 OAK:25:1 PHI:30:0 PIT:16:0 RAM:23:0 SFO:20:2 STL:21:3
     WAS:15:0
1961 BAL:16:1 BOS:22:0 BUF:29:1 CHI:24:0 CLE:20:0 DAL:25:0 DEN:26:1 DET:29:1 DTX:25:0 GNB:29:0
     HOU:33:2 MIN:22:0 NYG:33:2 NYT:25:0 OAK:23:1 PHI:17:0 PIT:25:0 RAM:23:0 SDG:49:0 SFO:19:1
     STL:24:1 WAS:26:0
1962 BAL:23:2 BOS:25:0 BUF:36:0 CHI:23:0 CLE:24:0 DAL:20:0 DEN:27:1 DET:24:4 DTX:32:0 GNB:31:0
     HOU:35:2 MIN:25:2 NYG:26:0 NYT:29:1 OAK:29:0 PHI:26:0 PIT:28:2 RAM:19:1 SDG:29:0 SFO:12:0
     STL:16:0 WAS:28:0
1963 BAL:15:1 BOS:29:2 BUF:22:2 CHI:36:1 CLE:22:0 DAL:26:0 DEN:15:0 DET:24:1 GNB:22:1 HOU:36:1
     KAN:26:1 MIN:11:0 NYG:34:0 NYJ:21:0 OAK:35:2 PHI:15:0 PIT:25:1 RAM:19:1 SDG:29:0 SFO:14:0
     STL:18:0 WAS:21:0
1964 BAL:23:0 BOS:31:1 BUF:28:3 CHI:10:0 CLE:19:0 DAL:18:0 DEN:32:1 DET:22:1 GNB:16:0 HOU:30:0
     KAN:28:0 MIN:19:0 NYG:15:0 NYJ:34:1 OAK:26:1 PHI:17:0 PIT:12:0 RAM:17:0 SDG:30:0 SFO:15:1
     STL:25:1 WAS:34:1
1965 BAL:22:1 BOS:21:2 BUF:32:0 CHI:20:0 CLE:24:0 DAL:18:0 DEN:25:0 DET:26:1 GNB:27:0 HOU:27:1
     KAN:20:0 MIN:19:3 NYG:16:1 NYJ:26:0 OAK:24:1 PHI:25:0 PIT:12:0 RAM:11:1 SDG:28:0 SFO:13:0
     STL:17:1 WAS:27:0
1966 ATL:19:0 BAL:22:0 BOS:22:0 BUF:29:1 CHI:15:0 CLE:30:0 DAL:17:1 DEN:13:0 DET:24:0 GNB:28:0
     HOU:18:1 KAN:33:0 MIA:31:0 MIN:14:0 NYG:17:0 NYJ:21:1 OAK:23:0 PHI:20:0 PIT:24:1 RAM:26:1
     SDG:27:1 SFO:18:0 STL:21:0 WAS:23:0
1967 ATL:17:0 BAL:32:0 BOS:17:2 BUF:27:0 CHI:28:0 CLE:22:0 DAL:29:2 DEN:28:2 DET:23:1 GNB:26:1
     HOU:26:0 KAN:31:1 MIA:28:0 MIN:16:0 NOR:22:1 NYG:17:0 NYJ:27:0 OAK:30:1 PHI:21:0 PIT:26:0
     RAM:32:1 SDG:13:0 SFO:16:0 STL:19:0 WAS:20:1
1968 ATL:14:0 BAL:29:0 BOS:23:1 BUF:22:1 CHI:18:0 CIN:10:1 CLE:32:0 DAL:26:1 DEN:20:1 DET:24:0
     GNB:17:0 HOU:20:1 KAN:37:1 MIA:22:0 MIN:16:1 NOR:16:0 NYG:26:0 NYJ:28:1 OAK:25:2 PHI:13:1
     PIT:17:0 RAM:25:1 SDG:20:1 SFO:20:0 STL:13:0 WAS:21:0
1969 ATL:19:0 BAL:15:0 BOS:20:2 BUF:19:0 CHI:16:2 CIN:21:1 CLE:19:0 DAL:24:1 DEN:14:0 DET:21:1
     GNB:19:0 HOU:23:1 KAN:32:0 MIA:18:0 MIN:30:0 NOR:12:1 NYG:19:0 NYJ:29:0 OAK:26:1 PHI:15:1
     PIT:25:0 RAM:26:1 SDG:31:0 SFO:20:1 STL:15:0 WAS:16:1
1970 ATL:19:0 BAL:25:0 BOS:8:0 BUF:11:0 CHI:17:0 CIN:23:0 CLE:19:3 DAL:24:0 DEN:16:2 DET:28:0
     GNB:20:0 HOU:18:1 KAN:31:0 MIA:23:0 MIN:28:0 NOR:22:0 NYG:17:1 NYJ:23:1 OAK:19:0 PHI:10:0
     PIT:23:0 RAM:19:0 SDG:9:1 SFO:22:2 STL:21:0 WAS:15:0
1971 ATL:20:1 BAL:28:1 BUF:11:1 CHI:22:0 CIN:27:0 CLE:24:1 DAL:26:1 DEN:20:1 DET:22:1 GNB:16:1
     HOU:23:0 KAN:27:0 MIA:17:0 MIN:27:2 NOR:20:0 NWE:15:0 NYG:15:0 NYJ:13:0 OAK:23:0 PHI:22:0
     PIT:17:0 RAM:27:0 SDG:22:1 SFO:14:0 STL:17:0 WAS:29:0
1972 ATL:18:2 BAL:23:0 BUF:23:0 CHI:21:0 CIN:20:1 CLE:13:0 DAL:16:2 DEN:10:0 DET:12:0 GNB:17:1
     HOU:6:0 KAN:24:0 MIA:26:0 MIN:26:0 NOR:14:1 NWE:10:0 NYG:23:0 NYJ:19:0 OAK:25:0 PHI:19:1
     PIT:28:1 RAM:16:1 SDG:24:1 SFO:19:0 STL:11:0 WAS:17:1
1973 ATL:22:1 BAL:15:0 BUF:14:0 CHI:14:0 CIN:18:0 CLE:12:0 DAL:18:2 DEN:14:1 DET:22:0 GNB:15:0
     HOU:17:0 KAN:21:0 MIA:21:1 MIN:21:1 NOR:16:0 NWE:13:1 NYG:20:0 NYJ:19:0 OAK:17:0 PHI:15:0
     PIT:37:1 RAM:20:3 SDG:16:0 SFO:17:1 STL:10:0 WAS:26:0
1974 ATL:17:0 BAL:10:0 BUF:20:1 CHI:18:0 CIN:9:1 CLE:24:0 DAL:13:1 DEN:22:0 DET:17:1 GNB:23:1
     HOU:21:0 KAN:28:1 MIA:16:1 MIN:22:1 NOR:16:0 NWE:24:0 NYG:15:0 NYJ:17:0 OAK:27:1 PHI:18:0
     PIT:25:1 RAM:22:0 SDG:15:0 SFO:20:0 STL:16:0 WAS:25:0
1975 ATL:25:0 BAL:29:1 BUF:25:0 CHI:13:1 CIN:22:0 CLE:10:1 DAL:25:0 DEN:16:0 DET:20:2 GNB:14:3
     HOU:24:2 KAN:20:0 MIA:21:1 MIN:28:2 NOR:16:0 NWE:13:0 NYG:16:0 NYJ:15:0 OAK:35:2 PHI:26:0
     PIT:27:1 RAM:22:1 SDG:20:0 SFO:11:0 STL:22:0 WAS:18:0
1976 ATL:18:1 BAL:15:1 BUF:19:0 CHI:24:2 CIN:26:1 CLE:21:1 DAL:16:2 DEN:24:0 DET:24:0 GNB:11:1
     HOU:11:0 KAN:23:1 MIA:11:0 MIN:19:0 NOR:12:0 NWE:23:0 NYG:12:0 NYJ:11:0 OAK:16:1 PHI:9:0
     PIT:22:1 RAM:32:0 SDG:20:0 SEA:15:1 SFO:9:2 STL:19:0 TAM:9:0 WAS:26:1
1977 ATL:26:0 BAL:30:1 BUF:21:1 CHI:18:0 CIN:16:0 CLE:23:1 DAL:21:0 DEN:25:0 DET:19:1 GNB:13:0
     HOU:26:3 KAN:21:0 MIA:15:0 MIN:16:1 NOR:10:1 NWE:19:1 NYG:12:0 NYJ:11:1 OAK:26:0 PHI:21:0
     PIT:31:0 RAM:25:0 SDG:21:0 SEA:25:0 SFO:8:0 STL:19:0 TAM:23:0 WAS:21:0
1978 ATL:12:2 BAL:17:1 BUF:14:1 CHI:17:1 CIN:20:2 CLE:27:0 DAL:23:1 DEN:31:1 DET:22:0 GNB:27:0
     HOU:17:0 KAN:21:1 MIA:32:2 MIN:22:0 NOR:21:1 NWE:22:2 NYG:21:0 NYJ:23:0 OAK:28:1 PHI:28:0
     PIT:27:0 RAM:28:0 SDG:22:0 SEA:22:1 SFO:18:0 STL:26:1 TAM:29:0 WAS:22:0
1979 ATL:15:1 BAL:23:0 BUF:24:0 CHI:29:1 CIN:20:0 CLE:16:0 DAL:13:2 DEN:19:1 DET:14:1 GNB:18:0
     HOU:34:0 KAN:23:0 MIA:23:1 MIN:22:0 NOR:26:1 NWE:20:1 NYG:21:1 NYJ:21:1 OAK:24:0 PHI:22:0
     PIT:27:0 RAM:25:1 SDG:28:2 SEA:17:1 SFO:15:0 STL:18:0 TAM:14:0 WAS:26:0
1980 ATL:26:1 BAL:17:0 BUF:24:2 CHI:17:1 CIN:20:2 CLE:22:0 DAL:27:1 DEN:16:1 DET:23:1 GNB:13:0
     HOU:26:0 KAN:28:0 MIA:28:0 MIN:24:1 NOR:12:0 NWE:24:0 NYG:18:0 NYJ:23:1 OAK:35:1 PHI:25:0
     PIT:26:2 RAM:25:0 SDG:20:0 SEA:23:0 SFO:17:1 STL:20:0 TAM:15:0 WAS:33:0
1981 ATL:25:0 BAL:16:1 BUF:19:2 CHI:18:1 CIN:19:0 CLE:15:1 DAL:37:3 DEN:23:0 DET:24:0 GNB:30:0
     HOU:18:0 KAN:26:0 MIA:18:1 MIN:16:3 NOR:17:0 NWE:16:0 NYG:17:0 NYJ:21:1 OAK:13:3 PHI:26:1
     PIT:30:0 RAM:17:0 SDG:23:0 SEA:21:0 SFO:27:0 STL:21:0 TAM:32:0 WAS:24:0
1982 ATL:10:0 BAL:5:0 BUF:13:0 CHI:13:1 CIN:14:1 CLE:17:0 DAL:15:0 DEN:12:2 DET:18:0 GNB:12:0
     HOU:3:0 KAN:12:0 MIA:19:0 MIN:12:1 NOR:9:0 NWE:12:1 NYG:12:1 NYJ:17:0 PHI:15:0 PIT:17:1
     RAI:18:0 RAM:11:0 SDG:13:2 SEA:13:0 SFO:9:0 STL:6:0 TAM:11:0 WAS:11:0
1983 ATL:15:0 BAL:20:1 BUF:13:0 CHI:21:0 CIN:23:0 CLE:22:0 DAL:27:1 DEN:27:1 DET:22:3 GNB:19:1
     HOU:14:0 KAN:30:0 MIA:26:1 MIN:25:2 NOR:23:0 NWE:17:0 NYG:23:1 NYJ:22:0 PHI:8:1 PIT:28:1
     RAI:20:2 RAM:24:2 SDG:16:0 SEA:26:0 SFO:24:0 STL:28:1 TAM:23:0 WAS:34:1
1984 ATL:12:2 BUF:16:0 CHI:21:1 CIN:25:1 CLE:20:0 DAL:28:1 DEN:31:0 DET:14:0 GNB:27:0 HOU:13:0
     IND:18:1 KAN:30:0 MIA:24:0 MIN:11:0 NOR:13:0 NWE:17:1 NYG:19:0 NYJ:15:1 PHI:20:0 PIT:31:0
     RAI:20:2 RAM:17:3 SDG:19:0 SEA:38:1 SFO:25:1 STL:21:0 TAM:18:0 WAS:21:0
1985 ATL:22:0 BUF:20:0 CHI:34:3 CIN:19:1 CLE:18:0 DAL:33:0 DEN:24:0 DET:18:0 GNB:15:1 HOU:15:0
     IND:16:1 KAN:27:0 MIA:23:0 MIN:22:1 NOR:21:0 NWE:23:2 NYG:24:0 NYJ:22:1 PHI:18:1 PIT:20:0
     RAI:17:1 RAM:29:1 SDG:26:0 SEA:24:1 SFO:18:1 STL:13:1 TAM:18:0 WAS:23:1
1986 ATL:22:1 BUF:10:0 CHI:31:2 CIN:17:1 CLE:18:0 DAL:17:0 DEN:18:2 DET:22:0 GNB:20:0 HOU:16:0
     IND:16:1 KAN:31:0 MIA:13:0 MIN:24:0 NOR:26:0 NWE:21:1 NYG:24:0 NYJ:20:1 PHI:23:1 PIT:20:1
     RAI:26:1 RAM:28:1 SDG:15:1 SEA:22:0 SFO:39:0 STL:10:0 TAM:13:0 WAS:19:0
1987 ATL:15:1 BUF:17:2 CHI:13:0 CIN:14:1 CLE:23:0 DAL:23:0 DEN:28:1 DET:19:1 GNB:18:0 HOU:23:1
     IND:20:1 KAN:11:0 MIA:16:0 MIN:26:1 NOR:30:2 NWE:21:0 NYG:20:0 NYJ:18:1 PHI:21:1 PIT:27:1
     RAI:13:0 RAM:16:1 SDG:13:2 SEA:17:0 SFO:25:1 STL:14:0 TAM:16:0 WAS:23:0
1988 ATL:24:0 BUF:15:1 CHI:26:1 CIN:22:1 CLE:20:1 DAL:10:1 DEN:16:0 DET:15:0 GNB:20:2 HOU:22:2
     IND:15:0 KAN:18:3 MIA:16:0 MIN:36:2 NOR:17:2 NWE:20:0 NYG:15:1 NYJ:24:1 PHI:32:2 PHO:16:1
     PIT:20:1 RAI:17:0 RAM:23:1 SDG:16:0 SEA:22:0 SFO:22:1 TAM:21:1 WAS:14:1
1989 ATL:20:0 BUF:23:0 CHI:26:0 CIN:21:0 CLE:27:0 DAL:7:0 DEN:21:1 DET:16:0 GNB:25:1 HOU:21:2
     IND:21:0 KAN:15:1 MIA:15:1 MIN:18:2 NOR:21:3 NWE:16:0 NYG:22:2 NYJ:15:1 PHI:30:1 PHO:16:1
     PIT:21:0 RAI:18:1 RAM:21:0 SDG:25:0 SEA:9:0 SFO:21:0 TAM:21:2 WAS:27:3
1990 ATL:17:1 BUF:18:0 CHI:31:0 CIN:15:2 CLE:13:0 DAL:11:1 DEN:10:3 DET:17:0 GNB:16:0 HOU:21:1
     IND:9:0 KAN:20:1 MIA:19:1 MIN:22:2 NOR:8:1 NWE:14:0 NYG:23:0 NYJ:18:1 PHI:19:0 PHO:16:0
     PIT:24:1 RAI:13:0 RAM:12:0 SDG:19:1 SEA:12:0 SFO:17:1 TAM:25:0 WAS:21:2
1991 ATL:19:3 BUF:23:0 CHI:17:0 CIN:17:1 CLE:15:1 DAL:12:1 DEN:24:0 DET:19:1 GNB:15:1 HOU:20:0
     IND:15:0 KAN:15:1 MIA:12:0 MIN:17:0 NOR:29:0 NWE:12:0 NYG:12:0 NYJ:18:0 PHI:26:0 PHO:17:0
     PIT:19:0 RAI:18:1 RAM:11:1 SDG:19:0 SEA:18:0 SFO:12:1 TAM:11:0 WAS:28:0
1992 ATL:11:0 BUF:23:1 CHI:14:0 CIN:16:0 CLE:13:0 DAL:17:1 DEN:15:0 DET:21:0 GNB:15:0 HOU:20:1
     IND:20:0 KAN:24:0 MIA:18:0 MIN:28:1 NOR:18:0 NWE:14:0 NYG:14:0 NYJ:21:1 PHI:24:1 PHO:16:1
     PIT:22:0 RAI:12:1 RAM:18:1 SDG:25:3 SEA:20:0 SFO:17:0 TAM:20:0 WAS:23:0
1993 ATL:13:0 BUF:23:1 CHI:18:0 CIN:12:3 CLE:13:2 DAL:14:0 DEN:18:1 DET:19:0 GNB:18:1 HOU:26:1
     IND:10:0 KAN:21:0 MIA:13:0 MIN:24:2 NOR:10:1 NWE:13:0 NYG:18:1 NYJ:19:1 PHI:20:2 PHO:9:2
     PIT:24:0 RAI:14:0 RAM:11:0 SDG:22:0 SEA:22:4 SFO:19:0 TAM:9:0 WAS:17:1
1994 ARI:23:1 ATL:22:0 BUF:16:1 CHI:12:0 CIN:10:1 CLE:18:0 DAL:22:0 DEN:12:0 DET:12:1 GNB:21:0
     HOU:14:1 IND:18:0 KAN:12:2 MIA:23:0 MIN:18:0 NOR:17:0 NWE:22:0 NYG:16:2 NYJ:17:0 PHI:21:1
     PIT:17:0 RAI:12:0 RAM:14:1 SDG:17:0 SEA:19:1 SFO:23:0 TAM:9:0 WAS:17:1
1995 ARI:19:0 ATL:18:0 BUF:17:0 CAR:21:0 CHI:16:1 CIN:12:2 CLE:17:0 DAL:19:0 DEN:8:0 DET:22:1
     GNB:13:0 HOU:21:1 IND:13:1 JAX:13:0 KAN:16:0 MIA:14:0 MIN:25:0 NOR:17:0 NWE:15:0 NYG:16:1
     NYJ:17:1 OAK:11:0 PHI:19:0 PIT:22:0 SDG:17:1 SEA:16:1 SFO:26:0 STL:22:1 TAM:14:0 WAS:16:1
1996 ARI:11:0 ATL:6:0 BAL:15:0 BUF:14:0 CAR:22:2 CHI:17:1 CIN:34:0 DAL:19:0 DEN:23:0 DET:11:0
     GNB:26:1 HOU:12:2 IND:13:1 JAX:13:0 KAN:17:1 MIA:20:1 MIN:22:0 NOR:12:0 NWE:23:1 NYG:22:2
     NYJ:11:0 OAK:17:2 PHI:19:1 PIT:23:0 SDG:22:0 SEA:14:0 SFO:20:4 STL:26:1 TAM:17:0 WAS:21:0
1997 ARI:15:0 ATL:18:0 BAL:17:1 BUF:15:1 CAR:11:1 CHI:13:1 CIN:13:0 DAL:7:0 DEN:18:0 DET:17:1
     GNB:21:0 IND:12:1 JAX:14:0 KAN:21:3 MIA:10:0 MIN:12:0 NOR:16:0 NWE:19:1 NYG:27:1 NYJ:18:0
     OAK:10:1 PHI:14:0 PIT:20:0 SDG:15:0 SEA:13:1 SFO:25:0 STL:25:0 TAM:13:0 TEN:14:0 WAS:16:0
1998 ARI:20:2 ATL:19:1 BAL:17:2 BUF:18:1 CAR:19:0 CHI:14:2 CIN:13:0 DAL:14:1 DEN:19:0 DET:12:0
     GNB:13:1 IND:8:0 JAX:13:0 KAN:13:1 MIA:29:0 MIN:19:1 NOR:21:2 NWE:24:0 NYG:19:0 NYJ:21:1
     OAK:21:0 PHI:9:1 PIT:16:0 SDG:20:1 SEA:24:0 SFO:21:0 STL:16:0 TAM:12:0 TEN:12:0 WAS:13:1
"""

# profootballarchives.com INTERCEPTIONS Team Totals (https://www.profootballarchives.com/
# {YYYY}nfl{team}.html; LA Rams "larm", Bears "chib", Chicago Cardinals "chic", 1950 Colts "bal",
# 1952 Texans "dal", Tampa Bay "tb") for all 69 1950-79 NFL team-seasons where NFL.com's team
# total and the sum of its player lines differ. The player rows add up to the Team Totals in
# all of them. Examples: 1950 PHI 31 and DET 31 (Dan Sandifer's 2 interceptions were for
# Detroit; 1950nfldet lists "Dan Sandifer 2 27", and NFL.com files his season under the Eagles),
# 1956 CRD 33, 1977 CHI 18 and TB 23 (Greg Johnson's interception, returned for a TD for Tampa
# Bay at New Orleans, is filed under the Bears), 1961 WAS 26 (Dale Hackbart's 6 and Jim
# Steffen's 1 missing from the scrape), 1978 DET 22 (Tony Leonard's 4 filed under Detroit). The
# 1952 DET/DTX, 1961 WAS, 1963 NYG and 1977-78 values used to be manual fixes; NFL.com's team
# totals now give the same values.
PFA_INT_CHECKS = """
1950 BCL:34 CRD:22 DET:31 PHI:31 WAS:19
1951 DET:15
1952 DET:32 DTX:28 GNB:22 PHI:20 WAS:18
1953 CHI:14 CRD:24
1954 PHI:28
1955 DET:15 NYG:23 PHI:16 WAS:19
1956 CHI:23 CRD:33 GNB:21 PIT:18 RAM:18 SFO:17
1957 BAL:28 DET:25
1958 CHI:22 GNB:13 PHI:15 SFO:16
1959 WAS:13
1961 BAL:16 MIN:22 PHI:17 WAS:26
1963 NYG:34
1966 CLE:30
1967 MIN:16 PIT:26
1969 NOR:12 PHI:15 PIT:25 SFO:20 STL:15
1970 CIN:23 PIT:23
1972 CLE:13 MIA:26 PIT:28 STL:11
1973 BUF:14 DEN:14 NWE:13 NYG:20
1974 BUF:20 NYJ:17
1975 BUF:25 CHI:13 CLE:10 NYG:16 SDG:20
1976 BAL:15 MIA:11
1977 CHI:18 TAM:23
1978 DET:22 SFO:18
1979 DET:14 MIN:22
"""

MIN_TREV_PLAYERS = 5  # fewer trevyoungquist defense players than this = coverage gap

# PFR multi-team ("2TM"/"3TM") rows with D/ST scoring that kendallgillies cannot split:
# (season, player as PFR spells him, stat) -> {team: count}. Evidence from web lookups;
# "pfa" = profootballarchives.com team page {YYYY}nfl{team}.html (roster, SCORING and the
# INTERCEPTIONS/FUMBLES/return tables).
MANUAL_PLACEMENTS = {
    # Wikipedia "Tillie Voss": fumble-return TD for Rock Island in the 43-0 win over Dayton.
    (1922, "Tillie Voss", "fbl_tds_def"): {"RII": 1},
    # pfa 1923 CHI: 2 TD and 1 INT for Knop; 1923 HAM: no scoring for him.
    (1923, "Oscar Knop", "int_tds"): {"CHI": 1},
    # pfa 1924 BUF: 6 TD and a punt return for Boynton; 1924 ROC: roster only (1 game).
    (1924, "Benny Boynton", "pr_tds"): {"BUF": 1},
    # pfa 1925 NYG: White's 3 TD are his 3 rushing TDs (statscrew 1925 NYG); 1925 KC: 2 TD
    # and his only interception. NFL.com files him under NYG.
    (1925, "Phil White", "int_tds"): {"KAN": 1},
    # pfa 1925 CLE: 1 TD for Nesser; 1925 AKR: no scoring.
    (1925, "Al Nesser", "fbl_tds_def"): {"CLE": 1},
    # pfa 1927 FRN: 2 TD for Kassel; 1927 CHI: no scoring.
    (1927, "Chuck Kassel", "fbl_tds_def"): {"FRN": 1},
    # pfa 1930 PRO: 2 TD and 1 INT for Peters; 1930 POR: roster only, no scoring.
    # NFL.com files him under Portsmouth.
    (1930, "Frosty Peters", "int_tds"): {"PRV": 1},
    # pfa 1930 SI: 1 TD and 1 INT for Lundell; 1930 MIN: roster only. (Wikipedia says his
    # touchdown was for the Red Jackets; the per-team tables are taken over that sentence.)
    (1930, "Bob Lundell", "int_tds"): {"SIS": 1},
    # pfa 1932 BOS: 1 TD and a kickoff return for Pape; 1932 SI: no scoring.
    (1932, "Oran Pape", "kr_tds"): {"BOS": 1},
    # pfa 1936 CHIC: 5 TD for Grosvenor; Wikipedia: sold by the Bears after the first game.
    (1936, "George Grosvenor", "pr_tds"): {"CRD": 1},
    # pfa 1938 NYG: 5 TD for Karcis; 1938 PIT: no scoring.
    (1938, "Bull Karcis", "fbl_tds_def"): {"NYG": 1},
    # pfa 1938 PIT: 2 TD for Ed Manske (1 receiving); 1938 CHI: 1 TD, his receiving TD.
    (1938, "Eggs Manske", "fbl_tds_def"): {"PIT": 1},
    # pfa 1942 PHI: KICKOFF RETURNS TD 1 for Pritchard; 1942 CLE: 0.
    (1942, "Bosh Pritchard", "kr_tds"): {"PHI": 1},
    # pfa 1948 LARM: 4 TD for Currivan, 3 receiving; 1948 BOS: no TD.
    (1948, "Don Currivan", "oth_tds"): {"RAM": 1},
    # pfa 1948 BOS: FUMBLES TD 2 for Heywood; 1948 DET: no scoring.
    (1948, "Ralph Heywood", "fbl_tds_def"): {"BOS": 2},
    # pfa 1950 SF: INTERCEPTIONS 4, 35t, TD 1 for Livingston; pfa 1950 BAL: 1, 29t, TD 1 for
    # Spaniel.
    (1950, "Howie Livingston", "int_tds"): {"SFO": 1},
    (1950, "Frank Spaniel", "int_tds"): {"BCL": 1},
    # pfa 1951 NYG: PUNT RETURNS 81t, TD 1 for Pritchard.
    (1951, "Bosh Pritchard", "pr_tds"): {"NYG": 1},
    # pfa 1952 DET: SAF 1 for Gandee (team SAF 1).
    (1952, "Sonny Gandee", "safeties"): {"DET": 1},
    # pfa 1955 WAS: FUMBLES OPP 1, 17 yds, TD 1 for Barni.
    (1955, "Roy Barni", "fbl_tds_def"): {"WAS": 1},
    # pfa 1955 DET: SAF 1 for Bob Long (team SAF 1).
    (1955, "Bob Long", "safeties"): {"DET": 1},
    # pfa 1961 WAS: INTERCEPTIONS 6, 128 yds, TD 2 for Hackbart.
    (1961, "Dale Hackbart", "int_tds"): {"WAS": 2},
    # pfa 1972 HOU: 1 TD for Walsh, not rushing or receiving.
    (1972, "Ward Walsh", "oth_tds"): {"HOU": 1},
    # pfa 1973 SD: FUMBLES 51 yds TD 1 for Rice (the PFR box score of 1973-12-02 SD at NE: "51
    # yard defensive fumble return"). PFR's second TD for him (OthTD) is not real: see
    # PFR_ROW_FIXES.
    (1973, "Floyd Rice", "fbl_tds_def"): {"SDG": 1},
    # pfa 1973 WAS: 1 TD for Ken Stone.
    (1973, "Ken Stone", "oth_tds"): {"WAS": 1},
    # pfa 1977 TB: INTERCEPTIONS 1, 0t, TD 1 for Greg Johnson; 1977 CHI: not listed.
    (1977, "Greg Johnson", "int_tds"): {"TAM": 1},
    # pfa 1978 SF: INTERCEPTIONS 4, 30t, TD 1 for Leonard.
    (1978, "Tony Leonard", "int_tds"): {"SFO": 1},
    # pfa 1979 LARM: 1 TD for Joe Harris.
    (1979, "Joe Harris", "oth_tds"): {"RAM": 1},
    # pfa 1980 GB: 1 TD for Marcol (his blocked-field-goal return vs the Bears).
    (1980, "Chester Marcol", "oth_tds"): {"GNB": 1},
    # pfa 1981 SEA: FUMBLES OPP 2, TD 1 for Rodell Thomas.
    (1981, "Rodell Thomas", "fbl_tds_def"): {"SEA": 1},
    # pfa 1983 SEA: KICKOFF RETURNS 94t, TD 1 for Dixon.
    (1983, "Zachary Dixon", "kr_tds"): {"SEA": 1},
    # pfa 1984 SF: FUMBLES OPP 3, 36 yds, TD 1 for Gary Johnson.
    (1984, "Gary Johnson", "fbl_tds_def"): {"SFO": 1},
    # pfa 1986 NYG: 1 TD for Flynn; 1986 GB: no TD.
    (1986, "Tom Flynn", "oth_tds"): {"NYG": 1},
    # pfa 1986 GB: 1 TD for John Simmons.
    (1986, "John Simmons", "oth_tds"): {"GNB": 1},
    # pfa 1988 MIN: FUMBLES OPP 1, TD 1 for Chris Martin.
    (1988, "Chris Martin", "fbl_tds_def"): {"MIN": 1},
    # pfa 1989 NO: PUNT RETURNS 56t, TD 1 for Shepard (also the PFR box score of 1989-09-10).
    (1989, "Derrick Shepard", "pr_tds"): {"NOR": 1},
    # pfa 1989 MIN: INTERCEPTIONS 90t, TD 1 for Holt (PFR box score of 1989-10-08 DET at MIN).
    (1989, "Issiac Holt", "int_tds"): {"MIN": 1},
    # pfa player page smit36000: his 1989 safety and sack were for Tampa Bay (3 games).
    (1989, "Sean Smith", "safeties"): {"TAM": 1},
    # pfa 1990 DET: FUMBLES OPP 3, TD 1 for Jimmy Williams.
    (1990, "Jimmy Williams", "fbl_tds_def"): {"DET": 1},
    # pfa 1991 PHX: FUMBLES OPP 1, TD 1 for Saddler.
    (1991, "Rod Saddler", "fbl_tds_def"): {"PHO": 1},
    # pfa 1992 HOU: FUMBLES OPP 1, TD 1 for Meads.
    (1992, "Johnny Meads", "fbl_tds_def"): {"HOU": 1},
}

# 1950-59 FblTD by players PFR lists only at offensive positions, kept as defensive TDs
# because profootballarchives' FUMBLES table shows the player with 0 OWN and >= 1 OPP
# recoveries (the TD came from an opponent's fumble). The other 9 of the 18 such 1950s TDs
# (Triplett 1950, Graham 1951, S. Williams 1952, Mathews 1953, Switzer and Goode 1954,
# Ed Brown 1956, Crow 1958, Huth 1959) show own-fumble recoveries, a QB, or an unclear
# row, and stay excluded.
FBL_TD_DEFENSIVE_1950S = {
    (1950, "Ken Kavanaugh"), (1950, "Dick Woodard"), (1952, "Bob Carey"), (1953, "Bill McColl"),
    (1954, "Wayne Hansen"), (1954, "Leon Hart"), (1954, "Harley Sewell"), (1955, "Bob Schnelker"),
    (1956, "Billy Wells"),
}

# PFR scoring rows that fail the row check or the points check (see the docstring), corrected
# from a web lookup: (season, player as PFR spells him, PFR team) -> {column: value}. Columns
# are load_pfr_scoring's names (rsh_tds, rec_tds, pr_tds, kr_tds, fbl_tds, int_tds, oth_tds,
# pts). The rushing fixes only make the row add up; they don't feed this table.
PFR_ROW_FIXES = {
    # https://www.profootballarchives.com/1940nflchib.html: Clarke SCORING 3 TD, 18 pts = RUSHING
    # 2 TD + INTERCEPTIONS 4-62, TD 1; the FUMBLES table's only TD is Johnny Siegal's (PFR has
    # it too). PFR also gives Clarke FblTD 1 (4 TD for 18 pts). Joe Maniaci's 3rd TD (PFR
    # "other") is his interception return (INTERCEPTIONS 2-38, TD 1; Team Totals TD 2).
    (1940, "Harry Clarke", "CHI"): {"fbl_tds": 0},
    (1940, "Joe Maniaci", "CHI"): {"oth_tds": 0, "int_tds": 1},
    # https://www.profootballarchives.com/1941nflchib.html: McAfee 12 TD, 72 pts = RUSHING 6,
    # RECEIVING 3, PUNT RETURNS 1, KICKOFF RETURNS 1, INTERCEPTIONS 6-78, TD 1. PFR has 5
    # rushing + 1 "other" and no INT-return TD (11 TD for 72 pts).
    (1941, "George McAfee", "CHI"): {"rsh_tds": 6, "oth_tds": 0, "int_tds": 1},
    # https://www.statscrew.com/football/stats/t-PHI/y-1945: Steele rushing 20-212-2, 12 pts (team
    # 26 rushing TDs). PFR has 1 rushing TD for 12 pts. No D/ST score is missing.
    (1945, "Ernie Steele", "PHI"): {"rsh_tds": 2},
    # https://www.statscrew.com/football/stats/t-DET/y-1948: LeForce rushing 28-86-1, 3 receiving,
    # 1 other, 30 pts. PFR has no rushing TD (4 TD for 30 pts). No D/ST score is missing.
    (1948, "Clyde LeForce", "DET"): {"rsh_tds": 1},
    # https://www.profootballarchives.com/1952nflpit.html: Hogan SCORING 1 TD, 6 pts; INTERCEPTIONS
    # 4-50, TD 0 (George Hays has the team's only INT-return TD). PFR has IntTD 1 and OthTD 1
    # (2 TD for 6 pts). The Steelers' 42 TDs = 12 rushing + 21 receiving + 1 INT + 1 fumble + 3 PR
    # + 2 KR + 2 other (Dodrill, Hogan).
    (1952, "Darrell Hogan", "PIT"): {"int_tds": 0},
    # https://www.profootballarchives.com/1973nflsd.html: Rice SCORING 1 TD, 6 pts (FUMBLES 51 yds,
    # TD 1); https://www.profootballarchives.com/1973nflhou.html: no scoring for him (the Oilers'
    # 22 TDs = 9 rushing + 11 receiving + 1 KR + 1 other). PFR has FblTD 1 and OthTD 1, 12 pts.
    # The points check agrees: Houston's 199 points leave no room for a second TD.
    (1973, "Floyd Rice", "2TM"): {"oth_tds": 0, "pts": 6},
}

# NFL points PFR's NFL table lacks: players whose season was split between the AFL and the NFL
# have no NFL row. Only used by the points check. (season, team) -> (player, non-safety points),
# from the SCORING tables of https://www.profootballarchives.com/{YYYY}nfl{team}.html.
# The AFL part of each season: kendallgillies (Agajanian DTX/GNB, McCarthy ATL/DEN), NFL.com's
# player line (trevyoungquist files Bivins 1967 under the Bills), https://en.wikipedia.org/wiki/
# Gene_Mingo (Dolphins 1966-67, Redskins 1967) and https://en.wikipedia.org/wiki/
# Mike_Mercer_(American_football) (Bills 1967-68, Packers 1968-69).
AFL_NFL_SPLIT_SCORERS = {
    (1961, "GNB"): ("Ben Agajanian", 11),     # 1961nflgb: 8 XP, 1 FG; also the AFL Texans
    (1967, "WAS"): ("Gene Mingo", 32),        # 1967nflwas: 20 XP, 4 FG; also the AFL Dolphins
    (1967, "PIT"): ("Charlie Bivins", 6),     # 1967nflpit: 1 rushing TD; also the AFL Bills
    (1968, "GNB"): ("Mike Mercer", 33),       # 1968nflgb: 12 XP, 7 FG; also the AFL Bills
    (1968, "ATL"): ("Brendan McCarthy", 6),   # 1968nflatl: 1 rushing TD; also the AFL Broncos
}

# --- teams --------------------------------------------------------------------

# (era code, first season, last season, era name, 538 franchise code). 1920-1998 only.
TEAMS = [
    ("AKR", 1920, 1925, "Akron Pros", "AKR"), ("AKR", 1926, 1926, "Akron Indians", "AKR"),
    ("BUF", 1920, 1923, "Buffalo All-Americans", "BFF"), ("BUF", 1924, 1925, "Buffalo Bisons", "BFF"),
    ("BUF", 1926, 1926, "Buffalo Rangers", "BFF"), ("BUF", 1927, 1929, "Buffalo Bisons", "BFF"),
    ("CAN", 1920, 1926, "Canton Bulldogs", "CBD"),
    ("CRD", 1920, 1943, "Chicago Cardinals", "ARI"), ("CRD", 1944, 1944, "Card-Pitt Combine", "CRP"),
    ("CRD", 1945, 1959, "Chicago Cardinals", "ARI"), ("STL", 1960, 1987, "St. Louis Cardinals", "ARI"),
    ("PHO", 1988, 1993, "Phoenix Cardinals", "ARI"), ("ARI", 1994, 1998, "Arizona Cardinals", "ARI"),
    ("DEC", 1920, 1920, "Decatur Staleys", "CHI"), ("CHI", 1921, 1921, "Chicago Staleys", "CHI"),
    ("CHI", 1922, 1998, "Chicago Bears", "CHI"),
    ("CHT", 1920, 1920, "Chicago Tigers", "CHT"),
    ("CLE", 1920, 1920, "Cleveland Tigers", "CTI"), ("CLE", 1921, 1921, "Cleveland Indians", "CTI"),
    ("CLI", 1923, 1923, "Cleveland Indians", "CIB"), ("CLE", 1924, 1927, "Cleveland Bulldogs", "CIB"),
    ("CLE", 1931, 1931, "Cleveland Indians", "CLI"), ("CLE", 1950, 1995, "Cleveland Browns", "CLE"),
    ("COL", 1920, 1922, "Columbus Panhandles", "COL"), ("COL", 1923, 1926, "Columbus Tigers", "COL"),
    ("DAY", 1920, 1929, "Dayton Triangles", "DAY"),
    ("DET", 1920, 1920, "Detroit Heralds", "DHR"), ("DET", 1921, 1921, "Detroit Tigers", "DTI"),
    ("DET", 1925, 1926, "Detroit Panthers", "DPN"), ("DET", 1928, 1928, "Detroit Wolverines", "DWL"),
    ("PRT", 1930, 1933, "Portsmouth Spartans", "DET"), ("DET", 1934, 1998, "Detroit Lions", "DET"),
    ("HAM", 1920, 1926, "Hammond Pros", "HAM"), ("MUN", 1920, 1921, "Muncie Flyers", "MUN"),
    ("RCH", 1920, 1925, "Rochester Jeffersons", "RCH"), ("RII", 1920, 1925, "Rock Island Independents", "RII"),
    ("GNB", 1921, 1998, "Green Bay Packers", "GB"),
    ("EVN", 1921, 1922, "Evansville Crimson Giants", "ECG"), ("CIN", 1921, 1921, "Cincinnati Celts", "CCL"),
    ("WSN", 1921, 1921, "Washington Senators", "SEN"), ("TON", 1921, 1921, "Tonawanda Kardex", "TON"),
    ("LOU", 1921, 1923, "Louisville Brecks", "LOU"), ("LOU", 1926, 1926, "Louisville Colonels", "LOU"),
    ("MIN", 1921, 1924, "Minneapolis Marines", "MNN"), ("MIN", 1929, 1930, "Minneapolis Red Jackets", "MNN"),
    ("NYG", 1921, 1921, "New York Brickley Giants", "NG1"),
    ("MIL", 1922, 1926, "Milwaukee Badgers", "MIL"), ("OOR", 1922, 1923, "Oorang Indians", "OOR"),
    ("RAC", 1922, 1924, "Racine Legion", "RAC"), ("RAC", 1926, 1926, "Racine Tornadoes", "RAC"),
    ("TOL", 1922, 1923, "Toledo Maroons", "TOL"),
    ("DUL", 1923, 1925, "Duluth Kelleys", "DUL"), ("DUL", 1926, 1927, "Duluth Eskimos", "DUL"),
    ("STL", 1923, 1923, "St. Louis All-Stars", "SLA"),
    ("KAN", 1924, 1924, "Kansas City Blues", "KCB"), ("KAN", 1925, 1926, "Kansas City Cowboys", "KCB"),
    ("KEN", 1924, 1924, "Kenosha Maroons", "KEN"), ("FRN", 1924, 1931, "Frankford Yellow Jackets", "FYJ"),
    ("NYG", 1925, 1998, "New York Giants", "NYG"), ("PRV", 1925, 1931, "Providence Steam Roller", "PRV"),
    ("POT", 1925, 1928, "Pottsville Maroons", "PTB"), ("BOS", 1929, 1929, "Boston Bulldogs", "PTB"),
    ("BRL", 1926, 1926, "Brooklyn Lions", "BRL"), ("HRT", 1926, 1926, "Hartford Blues", "HRT"),
    ("LAB", 1926, 1926, "Los Angeles Buccaneers", "LAB"),
    ("NYY", 1927, 1928, "New York Yankees", "NYA"),
    ("SIS", 1929, 1932, "Staten Island Stapletons", "SIS"),
    ("TOR", 1929, 1929, "Orange Tornadoes", "TOR"), ("TOR", 1930, 1930, "Newark Tornadoes", "TOR"),
    ("BKN", 1930, 1943, "Brooklyn Dodgers", "BKN"), ("BKN", 1944, 1944, "Brooklyn Tigers", "BKN"),
    ("BOS", 1932, 1932, "Boston Braves", "WSH"), ("BOS", 1933, 1936, "Boston Redskins", "WSH"),
    ("WAS", 1937, 1998, "Washington Redskins", "WSH"),
    ("PHI", 1933, 1942, "Philadelphia Eagles", "PHI"), ("PHI", 1943, 1943, "Phil-Pitt Combine", "STG"),
    ("PHI", 1944, 1998, "Philadelphia Eagles", "PHI"),
    ("PIT", 1933, 1939, "Pittsburgh Pirates", "PIT"), ("PIT", 1940, 1942, "Pittsburgh Steelers", "PIT"),
    ("PIT", 1945, 1998, "Pittsburgh Steelers", "PIT"),
    ("CIN", 1933, 1934, "Cincinnati Reds", "RED"), ("STL", 1934, 1934, "St. Louis Gunners", "GUN"),
    ("RAM", 1937, 1945, "Cleveland Rams", "LAR"), ("RAM", 1946, 1994, "Los Angeles Rams", "LAR"),
    ("STL", 1995, 1998, "St. Louis Rams", "LAR"),
    ("BOS", 1944, 1948, "Boston Yanks", "BYK"),
    ("NYY", 1949, 1949, "New York Bulldogs", "NYY"), ("NYY", 1950, 1951, "New York Yanks", "NYY"),
    ("BCL", 1950, 1950, "Baltimore Colts", "BCL"), ("SFO", 1950, 1998, "San Francisco 49ers", "SF"),
    ("DTX", 1952, 1952, "Dallas Texans", "DTX"),
    ("BAL", 1953, 1983, "Baltimore Colts", "IND"), ("IND", 1984, 1998, "Indianapolis Colts", "IND"),
    ("DAL", 1960, 1998, "Dallas Cowboys", "DAL"),
    ("BOS", 1960, 1970, "Boston Patriots", "NE"), ("NWE", 1971, 1998, "New England Patriots", "NE"),
    ("BUF", 1960, 1998, "Buffalo Bills", "BUF"),
    ("DTX", 1960, 1962, "Dallas Texans", "KC"), ("KAN", 1963, 1998, "Kansas City Chiefs", "KC"),
    ("DEN", 1960, 1998, "Denver Broncos", "DEN"),
    ("HOU", 1960, 1996, "Houston Oilers", "TEN"), ("TEN", 1997, 1998, "Tennessee Oilers", "TEN"),
    ("LAC", 1960, 1960, "Los Angeles Chargers", "LAC"), ("SDG", 1961, 1998, "San Diego Chargers", "LAC"),
    ("NYT", 1960, 1962, "New York Titans", "NYJ"), ("NYJ", 1963, 1998, "New York Jets", "NYJ"),
    ("OAK", 1960, 1981, "Oakland Raiders", "OAK"), ("RAI", 1982, 1994, "Los Angeles Raiders", "OAK"),
    ("OAK", 1995, 1998, "Oakland Raiders", "OAK"),
    ("MIN", 1961, 1998, "Minnesota Vikings", "MIN"),
    ("MIA", 1966, 1998, "Miami Dolphins", "MIA"), ("ATL", 1966, 1998, "Atlanta Falcons", "ATL"),
    ("NOR", 1967, 1998, "New Orleans Saints", "NO"), ("CIN", 1968, 1998, "Cincinnati Bengals", "CIN"),
    ("SEA", 1976, 1998, "Seattle Seahawks", "SEA"), ("TAM", 1976, 1998, "Tampa Bay Buccaneers", "TB"),
    ("CAR", 1995, 1998, "Carolina Panthers", "CAR"), ("JAX", 1995, 1998, "Jacksonville Jaguars", "JAX"),
    ("BAL", 1996, 1998, "Baltimore Ravens", "BAL"),
]
# 538 codes of AAFC teams (1946-49). 538 files the AAFC Browns and 49ers under CLE/SF
# and the AAFC Colts under BCL, so these codes mean AAFC only in 1946-49.
AAFC_538 = {"BBA", "BDA", "CRA", "LDA", "MSA", "NAA", "CLE", "SF", "BCL"}
# AFL team codes (1960-69; MIA from 1966, CIN from 1968).
AFL_CODES = {"BOS", "BUF", "DTX", "DEN", "HOU", "KAN", "LAC", "SDG", "NYT", "NYJ", "OAK", "MIA", "CIN"}
# Name spellings in NFL.com / PFR files that differ from TEAMS.
NAME_ALIASES = {"chicagoracinecardinals": "chicagocardinals", "cardpitt": "cardpittcombine",
                "philpitt": "philpittcombine", "philpittsteagles": "philpittcombine"}
AAFC_NAMES = {"losangelesdons", "chicagohornets", "chicagorockets", "miamiseahawks", "newyorkyankees",
              "brooklyndodgers", "buffalobills", "buffalobisons", "baltimorecolts", "clevelandbrowns",
              "sanfrancisco49ers"}


def letters(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _expand():
    by_538, names, by_label = {}, {}, {}
    for code, first, last, name, f538 in TEAMS:
        for season in range(first, last + 1):
            assert (f538, season) not in by_538, ("538 code twice", f538, season)
            assert (code, season) not in names, ("era code twice", code, season)
            by_538[(f538, season)] = code
            names[(code, season)] = name
            by_label.setdefault((letters(name), season), code)
    return by_538, names, by_label


BY_538, TEAM_NAMES, BY_LABEL = _expand()
TEAM_SEASONS = set(TEAM_NAMES)


def team_name(code, season):
    return TEAM_NAMES[(code, season)]


def is_afl(code, season):
    return 1960 <= season <= 1969 and code in AFL_CODES


def code_from_name(full, season):
    """A full team name ("St.LouisCardinals", "Houston Oilers") -> era code; None for AAFC."""
    key = letters(full)
    if season in AAFC_SEASONS and key in AAFC_NAMES:
        return None
    key = NAME_ALIASES.get(key, key)
    if (key, season) in BY_LABEL:
        return BY_LABEL[(key, season)]
    # A source may keep a name a season too long or too early (1940 "Pittsburgh Pirates",
    # 1925 "Akron Indians"): accept it if one code ever had that name and it existed that season.
    codes = {code for code, _, _, name, _ in TEAMS if letters(name) == key}
    codes = {c for c in codes if (c, season) in TEAM_SEASONS}
    if len(codes) == 1:
        return codes.pop()
    raise KeyError(f"unmapped team {full!r} in {season}")




# --- raw files ------------------------------------------------------------------


def raw(name):
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        print(f"  downloading {name} ...", file=sys.stderr, flush=True)
        with urllib.request.urlopen(URLS[name], timeout=300) as resp:
            body = resp.read()
        tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
        tmp.write_bytes(body)
        tmp.replace(path)
    return path


def read_zip_csv(zip_name, member):
    with zipfile.ZipFile(raw(zip_name)) as zf:
        return pd.read_csv(io.BytesIO(zf.read(member)), dtype=str, low_memory=False)


def read_trev(member):
    extracted = RAW / "trev" / member
    if extracted.exists():
        return pd.read_csv(extracted, dtype=str, low_memory=False)
    return read_zip_csv("trev.zip", member)


def num(series):
    """Numbers from text cells: thousands commas stripped, '--' and blanks become NaN."""
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")


def name_key(s):
    s = re.sub(r"[+*]|\(\d+\)", "", str(s))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", " ", s.replace("-", " ").replace(".", " "))
    return " ".join(t for t in s.split() if t not in {"jr", "sr", "ii", "iii", "iv"})


def pfr_name(s):
    """PFR's player name without its Pro Bowl/All-Pro marks ("Benny Boynton+")."""
    return re.sub(r"[+*]", "", str(s)).strip()


def first_last(s):
    """kendallgillies writes "Last, First"."""
    s = str(s)
    if ", " in s:
        last, first = s.split(", ", 1)
        return f"{first} {last}"
    return s


def pfa_table(text):
    """One of the profootballarchives tables above, indexed by (season, team)."""
    t = pd.read_csv(io.StringIO(text.strip()), sep=r"\s+")
    assert not t.duplicated(["season", "team"]).any()
    return t.set_index(["season", "team"])


def token_table(text, columns):
    """A "YYYY team:n:n ..." table above (a 4-digit token starts a season), indexed by
    (season, team) with one int column per name in columns."""
    rows, season = [], None
    for tok in text.split():
        if re.fullmatch(r"\d{4}", tok):
            season = int(tok)
            continue
        team, *values = tok.split(":")
        assert season is not None and len(values) == len(columns), tok
        rows.append((season, team, *map(int, values)))
    t = pd.DataFrame(rows, columns=["season", "team", *columns])
    assert not t.duplicated(["season", "team"]).any()
    return t.set_index(["season", "team"])


# --- games (538) ----------------------------------------------------------------


def load_games(log):
    g = pd.read_csv(raw("fivethirtyeight_nfl_games.csv"))
    g = pd.concat([g, pd.DataFrame(MANUAL_GAMES).assign(source="manual")], ignore_index=True)
    g["source"] = g["source"].fillna("fivethirtyeight")
    g = g[g["season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    n_all = len(g)
    playoff = g["playoff"] == 1
    g = g[~playoff]

    in_aafc = g["season"].isin(AAFC_SEASONS)
    aafc1, aafc2 = in_aafc & g["team1"].isin(AAFC_538), in_aafc & g["team2"].isin(AAFC_538)
    assert (aafc1 == aafc2).all(), "an AAFC team played a non-AAFC team"
    g = g[~aafc1]

    g["home"] = [BY_538.get((t, s)) for t, s in zip(g["team1"], g["season"])]
    g["away"] = [BY_538.get((t, s)) for t, s in zip(g["team2"], g["season"])]
    nonleague = g["home"].isna() | g["away"].isna()
    bad = g[nonleague & ~g["season"].isin([1920, 1921])]
    assert bad.empty, f"unmapped 538 teams:\n{bad[['season', 'team1', 'team2']]}"
    log.append(f"538 games {FIRST_SEASON}-{LAST_SEASON} (+{len(MANUAL_GAMES)} manual): {n_all}; dropped "
               f"{int(playoff.sum())} playoff, {int(aafc1.sum())} AAFC, {int(nonleague.sum())} 1920-21 "
               f"games vs non-league teams")
    g = g[~nonleague].copy()

    g["date"] = pd.to_datetime(g["date"])
    g["game_id"] = (g["season"].astype(str) + "_" + g["date"].dt.strftime("%Y%m%d") + "_"
                    + g["away"] + "_" + g["home"])
    assert g["game_id"].is_unique
    sides = []
    for us, them, their_score in (("home", "away", "score2"), ("away", "home", "score1")):
        sides.append(pd.DataFrame({
            "game_id": g["game_id"], "date": g["date"], "season": g["season"].astype(int),
            "team": g[us], "opponent": g[them], "points_allowed": g[their_score].astype(int),
            "source": g["source"],
        }))
    games = pd.concat(sides, ignore_index=True).sort_values(["season", "team", "date", "game_id"])
    games["week"] = games.groupby(["season", "team"]).cumcount() + 1
    games["team_name"] = [team_name(t, s) for t, s in zip(games["team"], games["season"])]
    return games.sort_values(["season", "date", "game_id", "team"]).reset_index(drop=True)


# --- player sources -------------------------------------------------------------


def load_trev(kind):
    """trevyoungquist player-team-season rows for one stat table, with an era team code."""
    d = pd.concat([read_trev(f"RetiredPlayer_{kind}_Stats.csv"), read_trev(f"ActivePlayer_{kind}_Stats.csv")],
                  ignore_index=True)
    d = d[d["Year"] != "TOTAL"].copy()
    d["season"] = num(d["Year"])
    d = d[d["season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    d["season"] = d["season"].astype(int)
    # 28 players are in both the Retired and the Active files.
    d = d.drop_duplicates(["Player_Id", "season", "Team"])
    d["team"] = [code_from_name(t, s) for t, s in zip(d["Team"], d["season"])]
    d = d[d["team"].notna()].copy()  # AAFC
    d["games"] = num(d["Games_Played"])
    return d


def trev_names():
    basic = pd.concat([read_trev("Retired_Player_Basic_Stats (1).csv"), read_trev("Active_Player_Basic_Stats.csv")],
                      ignore_index=True)
    basic = basic.dropna(subset=["Full_Name"]).drop_duplicates("Player_Id")
    return dict(zip(basic["Player_Id"], basic["Full_Name"].map(name_key)))


DEF_COLS = ["sacks", "interceptions", "int_tds", "safeties"]


def trev_defense():
    d = load_trev("Defense")
    # The header is shifted by one column from Sack_Yards on (see the docstring).
    d = d.rename(columns={"Sacks": "sacks", "Sack_Yards": "safeties", "Safties": "passes_defended",
                          "Passes_Deflected": "interceptions", "INTs": "int_tds", "TDs": "int_yards"})
    for col in DEF_COLS + ["int_yards"]:
        d[col] = num(d[col])
    return d


KENDALL_FILES = {
    "Career_Stats_Defensive.csv": {"Sacks": "sacks", "Ints": "interceptions", "Ints for TDs": "int_tds",
                                   "Safties": "safeties"},
    "Career_Stats_Kick_Return.csv": {"Returns for TDs": "kr_tds"},
    "Career_Stats_Punt_Return.csv": {"Returns for TDs": "pr_tds"},
    "Career_Stats_Passing.csv": {}, "Career_Stats_Rushing.csv": {}, "Career_Stats_Receiving.csv": {},
    "Career_Stats_Fumbles.csv": {}, "Career_Stats_Field_Goal_Kickers.csv": {}, "Career_Stats_Punting.csv": {},
    "Career_Stats_Kickoff.csv": {}, "Career_Stats_Offensive_Line.csv": {},
}


def kendall_rows():
    """kendallgillies player-team-season rows from every career file: games per team, plus the
    defense/return stats where the file has them (header not shifted: NFL.com's 11 columns)."""
    frames = []
    for member, stats in KENDALL_FILES.items():
        d = read_zip_csv("kendallgillies.zip", member)
        d["season"] = num(d["Year"])
        d = d[d["season"].between(FIRST_SEASON, LAST_SEASON) & d["Team"].notna() & d["Name"].notna()].copy()
        d["season"] = d["season"].astype(int)
        d["team"] = [code_from_name(t, s) for t, s in zip(d["Team"], d["season"])]
        d = d[d["team"].notna()].copy()
        out = pd.DataFrame({"kid": d["Player Id"], "key": d["Name"].map(first_last).map(name_key),
                            "season": d["season"], "team": d["team"], "games": num(d["Games Played"])})
        for theirs, ours in stats.items():
            out[ours] = num(d[theirs]).fillna(0)  # '--' is how NFL.com shows none
        out["in_defense"] = member == "Career_Stats_Defensive.csv"
        frames.append(out.drop_duplicates(["kid", "season", "team"]))
    k = pd.concat(frames, ignore_index=True)
    stat_cols = [c for c in k.columns if c not in ("kid", "key", "season", "team", "games", "in_defense")]
    agg = {"key": ("key", "first"), "games": ("games", "max"), "in_defense": ("in_defense", "max"),
           **{c: (c, "sum") for c in stat_cols}}
    return k.groupby(["kid", "season", "team"], as_index=False).agg(**agg)


def split_traded(dfn, kendall, names, log):
    """Replace a traded player's single-team trevyoungquist defense line with kendallgillies'
    per-team lines when kendallgillies has him on 2+ teams and the season totals agree."""
    kd = kendall[kendall["in_defense"]]
    kd = kd[kd.groupby(["kid", "season"])["team"].transform("nunique") > 1]
    ktot = kd.groupby(["kid", "key", "season"], as_index=False)[DEF_COLS].sum()
    t = dfn.copy()
    t["key"] = t["Player_Id"].map(names)  # NaN for the few players without a name: never matched
    single = t[t.groupby(["Player_Id", "season"])["team"].transform("nunique") == 1]
    m = single.dropna(subset=["key"]).merge(ktot, on=["key", "season"], suffixes=("", "_k"))
    same = pd.Series(True, index=m.index)
    for col in DEF_COLS:
        same &= m[col].fillna(0) == m[f"{col}_k"].fillna(0)
    m = m[same].drop_duplicates(["Player_Id", "season"], keep=False).drop_duplicates(["kid", "season"], keep=False)
    drop = set(zip(m["Player_Id"], m["season"]))
    kept = t[[(p, s) not in drop for p, s in zip(t["Player_Id"], t["season"])]]
    added = kd.merge(m[["kid", "season", "Player_Id"]], on=["kid", "season"])
    log.append(f"traded players: {len(m)} trevyoungquist single-team defense lines split by team "
               f"with kendallgillies ({len(added)} team lines)")
    cols = ["Player_Id", "season", "team", "games", *DEF_COLS]
    return pd.concat([kept[cols], added[cols]], ignore_index=True)


PFR_TD_COLS = ["rsh_tds", "rec_tds", "pr_tds", "kr_tds", "fbl_tds", "int_tds", "oth_tds"]
PFR_DST_COLS = ["pr_tds", "kr_tds", "fbl_tds", "int_tds", "oth_tds", "safeties"]


def load_pfr_scoring(log):
    m = pd.read_csv(raw("michaelmallari_nfl_players_1922_2022.csv"), low_memory=False)
    m = m[m["Season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    m = m.rename(columns={"Season": "season", "Tm": "team", "RshTD": "rsh_tds", "RecTD": "rec_tds",
                          "PR TD": "pr_tds", "KR TD": "kr_tds", "FblTD": "fbl_tds", "IntTD": "int_tds",
                          "OthTD": "oth_tds", "AllTD": "all_tds", "Sfty": "safeties", "XPM": "xpm", "FGM": "fgm",
                          "2PM": "two_pm", "Pts": "pts"})
    for col in (*PFR_TD_COLS, "all_tds", "safeties", "xpm", "fgm", "two_pm", "pts", "G"):
        m[col] = num(m[col]).fillna(0)
    m["season"] = m["season"].astype(int)
    m["player"] = m["Player"].map(pfr_name)
    assert (m[PFR_TD_COLS].sum(axis=1) == m["all_tds"]).all(), "PFR TD types do not add up to AllTD"

    # corrections from a web lookup (PFR_ROW_FIXES), then the row check (see the docstring)
    for (y, p, t), fix in PFR_ROW_FIXES.items():
        hit = m.index[(m["season"] == y) & (m["player"] == p) & (m["team"] == t)]
        assert len(hit) == 1, f"PFR_ROW_FIXES {(y, p, t)} matches {len(hit)} PFR rows"
        for col, v in fix.items():
            assert m.at[hit[0], col] != v, f"PFR_ROW_FIXES {(y, p, t)}: PFR already has {col} = {v}"
            m.at[hit[0], col] = v
    m["tds"] = m[PFR_TD_COLS].sum(axis=1)
    m["nonsafety_pts"] = 6 * m["tds"] + m["xpm"] + 3 * m["fgm"] + 2 * m["two_pm"]
    gap = m["pts"] - m["nonsafety_pts"] - 2 * m["safeties"]
    dst = m[PFR_DST_COLS].sum(axis=1) > 0
    hides = (gap >= 6) | ((gap < 0) & dst)

    def show(rows):
        return "; ".join(f"{r.season} {r.player} ({r.team}) {r.pts:g} pts vs {r.pts - g:g} from its scores"
                         for r, g in zip(rows.itertuples(index=False), gap[rows.index]))

    assert not hides.any(), ("PFR rows whose points can hide or double a D/ST score; look them up and add "
                             "them to PFR_ROW_FIXES: " + show(m[hides]))
    log.append(f"PFR scoring rows: {len(PFR_ROW_FIXES)} corrected (PFR_ROW_FIXES); {int((gap != 0).sum())} "
               f"others whose points differ by an XP, safety or 2PT, or score less with no D/ST score "
               f"(no effect here): " + show(m[gap != 0]))
    offense = offense_only(m["Pos"], m["season"])
    kept = pd.Series([(y, p) in FBL_TD_DEFENSIVE_1950S for y, p in zip(m["season"], m["player"])], index=m.index)
    hit = m[kept]
    assert len(hit) == len(FBL_TD_DEFENSIVE_1950S) and (hit["fbl_tds"] > 0).all() and offense[kept].all(), \
        "FBL_TD_DEFENSIVE_1950S does not match PFR's offensive-position fumble TDs"
    m["fbl_tds_def"] = m["fbl_tds"].where(~offense | kept, 0)
    m["fbl_tds_offense"] = m["fbl_tds"] - m["fbl_tds_def"]
    return m


OFFENSE_POS = {"QB", "RB", "HB", "FB", "TB", "WB", "BB", "LH", "RH", "WR", "FL", "SE", "TE", "LE", "RE",
               "LT", "RT", "LG", "RG", "C", "G", "T", "OL", "OT", "OG"}


def offense_only(pos, season):
    """True for a platoon-era player listed only at offensive positions (PFR 'Pos': 'WR', 'HB/RH')."""
    def one(p, s):
        if s < PLATOON_FROM or not isinstance(p, str) or not p.strip():
            return False
        tokens = [t for t in re.split(r"[/\-, ]+", p.upper()) if t]
        return bool(tokens) and all(t in OFFENSE_POS for t in tokens)
    return pd.Series([one(p, s) for p, s in zip(pos, season)], index=pos.index, dtype=bool)


# --- PFR multi-team rows -------------------------------------------------------

PFR_STATS = ["int_tds", "fbl_tds_def", "kr_tds", "pr_tds", "oth_tds", "safeties"]
SPLITTABLE = {"int_tds", "safeties", "kr_tds", "pr_tds"}  # stats kendallgillies has per team


def stat_used(stat, season):
    """Whether this PFR stat is placed on teams in this (NFL) season: TDs feed def_tds/st_tds;
    player safeties are compared with the team totals."""
    return season >= (PFR_SAFETIES_FROM if stat == "safeties" else TDS_FROM)


def kendall_split(kendall, season, player):
    """kendallgillies' per-team lines for this player-season, when it has him on 2+ teams."""
    rows = kendall[(kendall["season"] == season) & (kendall["key"] == name_key(player))]
    if rows["kid"].nunique() > 1:  # namesakes: keep the one on 2+ teams
        n = rows.groupby("kid")["team"].nunique()
        rows = rows[rows["kid"].isin(n[n > 1].index)]
    if rows["kid"].nunique() != 1 or rows["team"].nunique() < 2:
        return None
    return rows.groupby("team")[sorted(SPLITTABLE)].sum()


def split_multi_team(pfr, kendall, log):
    """Place PFR "2TM"/"3TM" rows with D/ST scoring on teams: kendallgillies' per-team split of
    the same stat when it adds up, else MANUAL_PLACEMENTS. Fails on anything else."""
    multi = pfr[pfr["team"].str.fullmatch(r"\dTM") & (pfr[PFR_STATS].sum(axis=1) > 0)]
    out, unresolved, used = [], [], set()
    for r in multi.itertuples(index=False):
        per_team = kendall_split(kendall, r.season, r.player)
        for stat in PFR_STATS:
            value = getattr(r, stat)
            if not value:
                continue
            if not stat_used(stat, r.season):
                log.append(f"  {r.season} {r.player} ({r.team}) {stat}={value:g}: not used (column from "
                           f"another source that season)")
                continue
            key = (r.season, r.player, stat)
            if key in MANUAL_PLACEMENTS:
                split, how = pd.Series(MANUAL_PLACEMENTS[key], dtype=float), "manual, web evidence"
                assert split.sum() == value, (key, value)
                used.add(key)
            elif per_team is not None and stat in per_team and per_team[stat].sum() == value:
                split, how = per_team[stat][per_team[stat] > 0], "kendallgillies split"
            else:
                unresolved.append(f"{r.season} {r.player} ({r.team}) {stat}={value:g}")
                continue
            for team, v in split.items():
                assert (team, r.season) in TEAM_SEASONS, (key, team)
                out.append({"season": r.season, "team": team, stat: v})
            log.append(f"  {r.season} {r.player} ({r.team}) {stat}={value:g} -> "
                       + ", ".join(f"{t} {v:g}" for t, v in split.items()) + f" [{how}]")
    assert not unresolved, "multi-team PFR rows with no evidence-backed placement: " + "; ".join(unresolved)
    stale = set(MANUAL_PLACEMENTS) - used
    assert not stale, f"MANUAL_PLACEMENTS entries that match no PFR row: {sorted(stale)}"
    log.append(f"  {len(multi)} multi-team rows: {len(used)} stats placed manually, none unresolved")
    return pd.DataFrame(out, columns=["season", "team", *PFR_STATS])


# --- PFR team defense (allenjake440) ---------------------------------------------


def pfr_team_defense(keys):
    a = pd.read_csv(raw("allenjake440_all_team_defense_data.csv"), encoding="utf-8-sig")
    a = a[a["season"].between(FR_FROM, LAST_SEASON)].copy()
    a["team"] = [code_from_name(t, y) for t, y in zip(a["Team"], a["season"])]
    p = "team_defense_"
    plays, pass_att, rush_att = a[p + "Tot Yds & TO_Ply"], a[p + "Tot Yds & TO_Att"], a[p + "Passing_Att"]
    pass_yds, rush_yds = a[p + "Passing_Yds"], a[p + "Rushing_Yds"]
    sacks = plays - pass_att - rush_att
    # The group labels are shifted (see the docstring); these identities prove which column is which.
    shift_ok = {
        "total yards = passing + rushing yards": (a[p + "Tot Yds & TO_Yds"] == pass_yds + rush_yds).all(),
        "turnovers = FL + Int": (a[p + "Tot Yds & TO_TO"] == a[p + "Tot Yds & TO_FL"] + a[p + "Passing_Int"]).all(),
        "completions <= pass attempts": (a[p + "Tot Yds & TO_Cmp"] <= pass_att).all(),
        "rushing Y/A = rush yards / 'Passing_Att' (>= 99%)":
            ((rush_yds / rush_att).round(1) == a[p + "Rushing_Y/A"]).mean() >= 0.99,
        "NY/A = pass yards / (pass att + derived sacks)":
            ((pass_yds / (pass_att + sacks)).round(1) == a[p + "Passing_NY/A"]).all(),
        "derived sacks between 5 and 80": sacks.between(5, 80).all(),
    }
    a = a.assign(pfr_sacks=sacks).rename(columns={
        p + "G": "pfr_g", p + "PA": "pfr_pa", p + "Tot Yds & TO_FL": "pfr_fr", p + "Passing_Int": "pfr_int"})
    a = a.set_index(["season", "team"])[["pfr_g", "pfr_pa", "pfr_fr", "pfr_int", "pfr_sacks"]]
    assert a.index.is_unique and set(a.index) <= set(keys), "allenjake440 teams do not match the games"
    return a, shift_ok


# --- season totals --------------------------------------------------------------


def build_seasons(games, log):
    keys = games[["season", "team"]].drop_duplicates().sort_values(["season", "team"])
    s = keys.copy()
    s["team_name"] = [team_name(t, y) for t, y in zip(s["team"], s["season"])]
    s["afl"] = [is_afl(t, y) for t, y in zip(s["team"], s["season"])]
    s = s.set_index(["season", "team"])
    names = trev_names()
    kendall = kendall_rows()

    # trevyoungquist defense (traded players split by team where possible)
    dfn_raw = trev_defense()
    dfn = split_traded(dfn_raw, kendall, names, log)
    raw_sums = dfn_raw.groupby(["season", "team"])["interceptions"].sum()
    tdef = dfn.groupby(["season", "team"])[DEF_COLS].sum()
    unknown = set(tdef.index) - set(s.index)
    assert not unknown, f"trevyoungquist team-seasons with no games: {sorted(unknown)[:10]}"
    trev = tdef.reindex(s.index).fillna(0)

    # PFR team defense 1980+: sacks, interceptions and fumble recoveries
    a, shift_ok = pfr_team_defense(s.index)

    # PFR scoring 1922+: TDs and safeties (NFL only)
    pfr = load_pfr_scoring(log)
    single = pfr[~pfr["team"].str.fullmatch(r"\dTM")]
    unknown = set(zip(single["season"], single["team"])) - set(s.index)
    assert not unknown, f"PFR scoring team-seasons with no games: {sorted(unknown)}"
    log.append("PFR multi-team rows with D/ST scoring, placed on teams:")
    multi = split_multi_team(pfr, kendall, log)
    pfr_team = pd.concat([single[["season", "team", *PFR_STATS, "fbl_tds_offense"]], multi], ignore_index=True)
    pfr_team = pfr_team.groupby(["season", "team"])[[*PFR_STATS, "fbl_tds_offense"]].sum()
    pfr_team = pfr_team.reindex(s.index).fillna(0)

    # points check data (see the docstring): PFR's non-safety points by team-season (single-team
    # rows plus the NFL lines PFR lacks) and by season for its multi-team rows
    for (y, t), (player, _) in AFL_NFL_SPLIT_SCORERS.items():
        assert (t, y) in TEAM_SEASONS and not ((pfr["season"] == y) & (pfr["player"] == player)).any(), \
            f"AFL_NFL_SPLIT_SCORERS: PFR has a {y} row for {player}"
    split = pd.Series([pts for _, pts in AFL_NFL_SPLIT_SCORERS.values()], dtype=float,
                      index=pd.MultiIndex.from_tuples(list(AFL_NFL_SPLIT_SCORERS), names=["season", "team"]))
    s["pfr_nonsafety_pts"] = (single.groupby(["season", "team"])["nonsafety_pts"].sum().reindex(s.index).fillna(0)
                              + split.reindex(s.index).fillna(0))
    multi_pts = pfr[pfr["team"].str.fullmatch(r"\dTM")].groupby("season")["nonsafety_pts"].sum()

    # profootballarchives team totals: NFL 1940-49 and AFL 1960-69
    season = s.index.get_level_values("season")
    afl = s["afl"].to_numpy()
    pfa40 = pfa_table(PFA_NFL_1940S)
    assert set(pfa40.index) == set(s.index[season.isin(PFA_NFL_SEASONS)]), "PFA_NFL_1940S teams != 1940-49 games"
    pfa_afl = pfa_table(PFA_AFL)
    assert set(pfa_afl.index) == set(s.index[afl]), "PFA_AFL teams != AFL games"
    pfa_afl["st_tds"] = pfa_afl["pr_td"] + pfa_afl["kr_td"]
    pfa_afl["def_tds"] = pfa_afl["td"] - pfa_afl["rush_td"] - pfa_afl["rec_td"] - pfa_afl["st_tds"]
    assert (pfa_afl["def_tds"] >= pfa_afl["int_td"]).all(), "AFL non-offensive TDs < INT-return TDs"
    in40 = season.isin(PFA_NFL_SEASONS)
    p40, pafl = pfa40.reindex(s.index), pfa_afl.reindex(s.index)

    # NFL.com team totals 1940-98: INT and SFTY
    nfc = token_table(NFLCOM_TEAM_DEFENSE, ["int", "saf"])
    assert set(nfc.index) == set(s.index[season >= INT_FROM]), "NFLCOM_TEAM_DEFENSE teams != 1940-98 games"
    nfc = nfc.reindex(s.index)
    s["nflcom_int"], s["nflcom_saf"] = nfc["int"], nfc["saf"]

    nan = float("nan")
    s["sacks"] = a["pfr_sacks"].reindex(s.index).where(season >= SACKS_FROM, nan)
    s["pfr_sacks"] = a["pfr_sacks"].reindex(s.index)
    s["trev_sacks"] = trev["sacks"].where(season >= 1982, nan)
    s["trev_int_raw"] = raw_sums.reindex(s.index).fillna(0)
    s["trev_int"] = trev["interceptions"]
    s = s.join(a.drop(columns="pfr_sacks"))
    ints = nfc["int"].where(~in40, p40["int"]).where(~afl, pafl["int"])  # NaN before 1940
    s["interceptions"] = ints.where(s["pfr_int"].isna(), s["pfr_int"])
    s["fumble_recoveries"] = s["pfr_fr"].where(season >= FR_FROM, nan)

    s["int_tds_pfr"], s["int_tds_trev"] = pfr_team["int_tds"], trev["int_tds"]
    s["int_tds_pfa"] = p40["int_td"].where(in40, pafl["int_td"])
    s["fbl_tds_offense"] = pfr_team["fbl_tds_offense"]
    nfl_def = pfr_team["int_tds"] + pfr_team["fbl_tds_def"]
    nfl_st = pfr_team["kr_tds"] + pfr_team["pr_tds"] + pfr_team["oth_tds"]
    s["def_tds"] = nfl_def.where(~afl, pafl["def_tds"]).where(season >= TDS_FROM, nan)
    s["st_tds"] = nfl_st.where(~afl, pafl["st_tds"]).where(season >= TDS_FROM, nan)
    s["pfr_safeties"] = pfr_team["safeties"]
    sfty = nfc["saf"].where(~in40, p40["saf"]).where(~afl, pafl["saf"])
    s["safeties"] = sfty.where(season >= SAFETIES_FROM, nan)
    s["blocked_kicks"] = nan

    # coverage gaps in the NFL.com scrape where its player interceptions are compared with the
    # team totals (NFL 1950-79)
    use_trev = (season >= PLATOON_FROM) & (season < FR_FROM) & ~afl
    players = dfn_raw.groupby(["season", "team"])["Player_Id"].nunique().reindex(s.index[use_trev]).fillna(0)
    gaps = sorted(players[players < MIN_TREV_PLAYERS].index)
    assert not gaps, f"trevyoungquist coverage gaps where its interceptions are compared: {gaps}"
    pre = a[a.index.get_level_values("season") < SACKS_FROM]
    if len(pre):
        log.append("PFR also has unofficial team sacks for "
                   + ", ".join(f"{y} (league {int(v)})" for y, v in pre.groupby("season")["pfr_sacks"].sum().items())
                   + f"; left empty (SACKS_FROM = {SACKS_FROM})")

    notes = []
    for (y, t), row in s.iterrows():
        if y < INT_FROM:
            n_int = "int=unknown"
        elif y >= FR_FROM:
            n_int = "int=pfr"
        elif row["afl"] or y in PFA_NFL_SEASONS:
            n_int = "int=profootballarchives"
        else:
            n_int = "int=nfl.com team totals"
        n = ["sacks=pfr team totals" if y >= SACKS_FROM else "sacks=unknown", n_int,
             "fr=pfr (opponent fumbles lost)" if y >= FR_FROM else "fr=unknown"]
        if y < TDS_FROM:
            n.append("tds=unknown")
        elif row["afl"]:
            n.append("tds=profootballarchives (def_tds = INT, fumble and other non-offense/non-return TDs; "
                     "st_tds = PR+KR TDs)")
        else:
            n.append("tds=pfr")
        if y < SAFETIES_FROM:
            n.append("sfty=unknown")
        elif row["afl"] or y in PFA_NFL_SEASONS:
            n.append("sfty=profootballarchives (incl. team safeties)")
        else:
            n.append("sfty=nfl.com team totals (incl. team safeties)")
        n.append("blk=unknown")
        notes.append("; ".join(n))
    s["source_notes"] = notes
    return s.reset_index(), shift_ok, multi_pts


# --- checks and summary ---------------------------------------------------------

CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""))


def pa_fp(points):
    for limit, fp in SCORING["defense"]["points_allowed"]:
        if points <= limit:
            return fp
    return SCORING["defense"]["points_allowed"][-1][1]


def fantasy_points(games, seasons):
    d = SCORING["defense"]
    g = games.assign(fp_pa=games["points_allowed"].map(pa_fp))
    tot = g.groupby(["season", "team"]).agg(games=("game_id", "nunique"), points_allowed=("points_allowed", "sum"),
                                           fp_points_allowed=("fp_pa", "sum")).reset_index()
    tot = tot.merge(seasons, on=["season", "team"], how="left")
    z = tot[SEASON_STATS].fillna(0)
    tot["fp"] = (z["sacks"] * d["sacks"] + z["interceptions"] * d["interceptions"]
                 + z["fumble_recoveries"] * d["fumble_recoveries"]
                 + (z["def_tds"] + z["st_tds"]) * d["touchdowns"] + z["safeties"] * d["safeties"]
                 + z["blocked_kicks"] * d["blocked_kicks"] + tot["fp_points_allowed"]).round(2)
    return tot


def points_for(games):
    """Points scored per (season, team): the opponent's points allowed in each game."""
    pf = games.merge(games[["game_id", "team", "points_allowed"]].rename(
        columns={"team": "opponent", "points_allowed": "pf"}), on=["game_id", "opponent"])
    return pf.groupby(["season", "team"])["pf"].sum()


def octonion_compare(games):
    o = pd.read_csv(raw("octonion_nfl_team_standings.csv"), sep="\t")
    o = o[o["season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    o["team"] = [code_from_name(n, y) for n, y in zip(o["team_name"], o["season"])]
    o = o[o["team"].notna()].set_index(["season", "team"])  # AAFC dropped
    ours = games.groupby(["season", "team"]).agg(pa=("points_allowed", "sum"), g=("game_id", "nunique"))
    ours["pf"] = points_for(games)
    both = ours.join(o[["points_for", "points_against", "wins", "losses", "ties", "team_name"]], how="outer")
    both["g_std"] = both["wins"] + both["losses"] + both["ties"]
    return both


def league_int(seasons):
    """Per season and league: team interceptions vs NFL.com passing interceptions thrown."""
    p = load_trev("Passing")
    p["ints"] = num(p["INTs"])
    p["afl"] = [is_afl(t, y) for t, y in zip(p["team"], p["season"])]
    thrown = p.groupby(["season", "afl"])["ints"].sum()
    caught = seasons[seasons["interceptions"].notna()].groupby(["season", "afl"])["interceptions"].sum()
    t = pd.DataFrame({"caught": caught, "thrown": thrown}).dropna().astype(int)
    t["gap"] = t["caught"] - t["thrown"]
    return t


def fmt(v):
    return "-" if pd.isna(v) else f"{v:g}"


def main():
    log = []
    games = load_games(log)
    seasons, shift_ok, multi_pts = build_seasons(games, log)

    out_games = games[GAME_COLUMNS].copy()
    out_seasons = seasons[SEASON_COLUMNS].copy()
    for col in SEASON_STATS:
        known = out_seasons[col].dropna()
        assert ((known >= 0) & (known % 1 == 0)).all(), f"{col}: not a whole number"
        out_seasons[col] = out_seasons[col].map(lambda v: "" if pd.isna(v) else str(int(v)))
    OUT_GAMES.parent.mkdir(parents=True, exist_ok=True)
    out_games.to_csv(OUT_GAMES, index=False)
    out_seasons.to_csv(OUT_SEASONS, index=False)

    # ---------------------------------------------------------------- summary
    print("\n".join(log))
    print(f"\nwrote {OUT_GAMES.relative_to(ROOT)}: {len(out_games)} rows ({out_games['game_id'].nunique()} games)")
    print(f"wrote {OUT_SEASONS.relative_to(ROOT)}: {len(out_seasons)} rows")
    g_dec = games["season"] // 10 * 10
    s_dec = seasons["season"] // 10 * 10
    print("\nrows per decade (game rows / team-seasons):")
    for dec in sorted(g_dec.unique()):
        print(f"  {dec}s: {int((g_dec == dec).sum()):6d} / {int((s_dec == dec).sum()):4d}")
    per_season = seasons.groupby("season").size()
    gpt = games.groupby(["season", "team"]).size().groupby("season").agg(["min", "max"])
    print("\nteam-seasons per season (games per team min-max):")
    items = [f"{y}:{per_season[y]}({gpt.at[y, 'min']}-{gpt.at[y, 'max']})" for y in per_season.index]
    for i in range(0, len(items), 10):
        print("  " + "  ".join(items[i:i + 10]))
    print("\nempty (unknown) cells per column, first season with a value:")
    for col in SEASON_STATS:
        known = seasons.loc[seasons[col].notna(), "season"]
        print(f"  {col:18s} empty {int(seasons[col].isna().sum()):5d}   first known "
              f"{int(known.min()) if len(known) else '-'}")
    print("\nsample rows (1932, 1962, 1985 Bears; 1962 Titans):")
    sample = out_seasons[((out_seasons["team"] == "CHI") & out_seasons["season"].isin([1932, 1962, 1985]))
                         | ((out_seasons["team"] == "NYT") & (out_seasons["season"] == 1962))]
    print(sample.to_string(index=False))

    print("\nSELF-CHECKS")
    g = games.groupby(["season", "team"]).agg(pa=("points_allowed", "sum"), n=("game_id", "nunique"))
    S = seasons.set_index(["season", "team"])

    def stat(y, t, c):
        v = S.at[(y, t), c]
        return None if pd.isna(v) else int(v)

    def stats(y, t, *cols):
        return tuple(stat(y, t, c) for c in cols)

    def pa_g(y, t):
        return int(g.at[(y, t), "pa"]), int(g.at[(y, t), "n"])

    def expect(name, got, want):
        check(name, got == want, str(got))

    expect("1985 Bears: 198 PA in 16 games", pa_g(1985, "CHI"), (198, 16))
    expect("1985 Bears: 64 sacks, 34 INT, 20 fumble recoveries",
           stats(1985, "CHI", "sacks", "interceptions", "fumble_recoveries"), (64, 34, 20))
    expect("1977 Falcons: 129 PA in 14 games", pa_g(1977, "ATL"), (129, 14))
    expect("1950 Browns: 144 PA in 12 games", pa_g(1950, "CLE"), (144, 12))
    expect("1929 Orange Tornadoes: 90 PA in 12 games (with the manual game)", pa_g(1929, "TOR"), (90, 12))
    expect("1932 Bears: 44 PA in 14 games (Spartans 'playoff' counted)", pa_g(1932, "CHI"), (44, 14))

    # sacks: PFR team totals (web-checked: Pro Football Hall of Fame, chicagobears.com, NBC Sports
    # Philadelphia, profootballarchives.com team pages)
    for name, ok in shift_ok.items():
        check(f"allenjake440 column shift: {name}", ok)
    want = {(1984, "CHI"): 72, (1989, "MIN"): 71, (1987, "CHI"): 70, (1991, "PHI"): 55, (1998, "SEA"): 53,
            (1987, "NYG"): 55, (1998, "MIN"): 38, (1985, "MIA"): 38, (1983, "RAI"): 57, (1990, "MIN"): 47}
    got = {k: stat(*k, "sacks") for k in want}
    check("team sacks = official totals (1984 CHI 72, 1989 MIN 71, 1987 CHI 70, 1991 PHI 55, 1998 SEA 53, "
          "1987 NYG 55, 1998 MIN 38, 1985 MIA 38, 1983 RAI 57, 1990 MIN 47)", got == want,
          "wrong: " + str({k: v for k, v in got.items() if v != want[k]}) if got != want else "")
    x = seasons[seasons["season"] >= 1982]  # NFL.com player sacks are official from 1982
    diff = (x["sacks"] - x["trev_sacks"]).round().abs()
    check("1982-98 sacks: NFL.com player sums within 2 of PFR team totals for >= 95%, never more than 5 off",
          (diff <= 2).mean() >= 0.95 and (diff <= 5).all(),
          f"player sums equal the team total in {(diff == 0).mean():.0%} of team-seasons, off by 1-2 in "
          f"{diff.between(1, 2).mean():.0%}, by 3-5 in {(diff > 2).mean():.1%} ("
          + ", ".join(f"{r.season} {r.team} {r.sacks:g} vs {r.trev_sacks:g}" for r in x[diff > 2].itertuples())
          + f"); league {int(x['sacks'].sum())} team vs {x['trev_sacks'].sum():.1f} player")

    # interceptions
    expect("1961 Chargers: 49 INT, 9 INT-return TDs (AFL/NFL records)",
           (stat(1961, "SDG", "interceptions"), stat(1961, "SDG", "int_tds_pfa")), (49, 9))
    expect("1943 Packers: 42 INT (most before 1961)", stat(1943, "GNB", "interceptions"), 42)
    want = {(1943, "CRD"): 16, (1945, "PHI"): 19, (1947, "PHI"): 23, (1949, "RAM"): 30, (1949, "CHI"): 27,
            (1949, "GNB"): 20, (1943, "PHI"): 22, (1944, "CRD"): 16, (1940, "GNB"): 40, (1949, "NYG"): 22}
    got = {k: stat(*k, "interceptions") for k in want}
    check("1940s INT = profootballarchives team totals (1943 CRD 16, 1945 PHI 19, 1947 PHI 23, 1949 RAM 30, "
          "1949 CHI 27, ...)", got == want, "wrong: " + str({k: v for k, v in got.items() if v != want[k]})
          if got != want else "")
    x = seasons[seasons["season"].isin(PFA_NFL_SEASONS)]
    print(f"    (NFL.com player sums would give {int(x['trev_int'].sum())} vs {int(x['interceptions'].sum())} "
          f"for 1940-49; equal in {(x['trev_int'] == x['interceptions']).mean():.0%} of team-seasons)")
    expect("1977: CHI 18 INT, TAM 23 INT (Greg Johnson's interception moved to Tampa Bay)",
           stats(1977, "CHI", "interceptions") + stats(1977, "TAM", "interceptions"), (18, 23))
    expect("1950: PHI 31 INT, DET 31 (Dan Sandifer's 2 were Detroit's; NFL.com files his season under the "
           "Eagles); 1956 CRD 33", stats(1950, "PHI", "interceptions") + stats(1950, "DET", "interceptions")
           + stats(1956, "CRD", "interceptions"), (31, 31, 33))
    x = seasons[seasons["season"].isin(PFA_NFL_SEASONS) | seasons["afl"]]
    check("NFL.com team INT and SFTY = profootballarchives team totals in every 1940-49 NFL and 1960-69 AFL "
          "team-season (so NFL.com's SFTY counts safeties credited to no player)",
          (x["nflcom_int"] == x["interceptions"]).all() and (x["nflcom_saf"] == x["safeties"]).all(),
          f"{len(x)} team-seasons")
    # https://www.profootballarchives.com/1988nfllarm.html, 1991nflden.html, 1991nflwas.html:
    # INTERCEPTIONS Team Totals 22, 23, 27 (NFL.com 23, 24, 28)
    pfa_side = {(1988, "RAM"): 22, (1991, "DEN"): 23, (1991, "WAS"): 27}
    x = seasons[seasons["pfr_int"].notna()].set_index(["season", "team"])
    off = x[x["nflcom_int"] != x["pfr_int"]]
    check("1980-98: NFL.com team INT = PFR's in all but 3 team-seasons, where profootballarchives agrees with PFR "
          "(1988 RAM 22, 1991 DEN 23, WAS 27)",
          set(off.index) == set(pfa_side) and all(off.at[k, "pfr_int"] == v for k, v in pfa_side.items()),
          f"{len(x) - len(off)}/{len(x)} equal; differ: "
          + ", ".join(f"{y} {t} {r.nflcom_int:g} vs {r.pfr_int:g}" for (y, t), r in off.iterrows()))
    pfa_int = token_table(PFA_INT_CHECKS, ["int"])["int"]
    x = seasons[seasons["season"].between(PLATOON_FROM, FR_FROM - 1) & ~seasons["afl"]].set_index(["season", "team"])
    differ = x[x["nflcom_int"] != x["trev_int"]]
    ok = (set(differ.index) == set(pfa_int.index) and (x["interceptions"] == x["nflcom_int"]).all()
          and (x["interceptions"].reindex(pfa_int.index) == pfa_int).all())
    check("1950-79 NFL INT = NFL.com team totals; profootballarchives' Team Totals agree with them in all "
          f"{len(pfa_int)} team-seasons where NFL.com's player sums differ (PFA_INT_CHECKS)", ok,
          f"player sums {int(x['trev_int'].sum())} vs team totals {int(x['interceptions'].sum())}; differ by "
          + ", ".join(f"{d:+d}: {n}" for d, n in (differ["trev_int"] - differ["nflcom_int"]).astype(int)
                      .value_counts().sort_index().items()))
    li = league_int(seasons)
    exact_nfl = [(y, False) for y in [1949, *range(1970, LAST_SEASON + 1)]]
    exact_afl = [(y, True) for y in (1960, 1961, 1963, 1964, 1965, 1966, 1968)]
    bad = {k: int(li.at[k, "gap"]) for k in exact_nfl + exact_afl if li.at[k, "gap"] != 0}
    check("league INT caught = INT thrown (NFL.com passing): NFL 1949 and 1970-98, AFL 1960-61, 1963-66, 1968",
          not bad, f"gaps: {bad}" if bad else f"{len(exact_nfl) + len(exact_afl)} league-seasons")
    print("    caught/thrown (gap) where they differ -- the thrown side (NFL.com player lines) is incomplete: "
          "NFL.com lacks some passers (e.g. 1962 OAK 78 attempts) and some 1950s-60s lines:")
    rows = [f"{y}{' AFL' if lg else ''} {r.caught}/{r.thrown} ({r.gap:+d})" for (y, lg), r in li.iterrows() if r.gap]
    for i in range(0, len(rows), 7):
        print("      " + "; ".join(rows[i:i + 7]))
    x = seasons[seasons["pfr_int"].notna()]
    raw_exact = (x["trev_int_raw"] == x["pfr_int"]).mean()
    exact = x["trev_int"] == x["pfr_int"]
    close = (x["trev_int"] - x["pfr_int"]).abs() <= 1
    check("1980-98 INT: trevyoungquist team sums vs PFR (allenjake440), >= 90% exact",
          exact.mean() >= 0.90, f"exact {exact.mean():.1%} ({raw_exact:.1%} before splitting traded players), "
          f"within 1 {close.mean():.1%}; league totals {int(x['trev_int'].sum())} vs {int(x['pfr_int'].sum())}")
    x = seasons[seasons["afl"]]
    print(f"    (AFL: NFL.com player sums would give {int(x['trev_int'].sum())} vs profootballarchives "
          f"{int(x['interceptions'].sum())}; equal in {(x['trev_int'] == x['interceptions']).mean():.0%})")

    # TDs and safeties
    expect("INT-return TDs: 1998 Seahawks 8, 1984 Seahawks 7",
           (stat(1998, "SEA", "int_tds_pfr"), stat(1984, "SEA", "int_tds_pfr")), (8, 7))
    expect("1989 multi-team TDs: MIN def_tds 6 (Holt), DAL def_tds 3, DAL st_tds 1, NOR st_tds 2 (Shepard)",
           stats(1989, "MIN", "def_tds") + stats(1989, "DAL", "def_tds", "st_tds") + stats(1989, "NOR", "st_tds"),
           (6, 3, 1, 2))
    expect("1977: CHI def_tds 0, TAM def_tds 4 (Greg Johnson)",
           stats(1977, "CHI", "def_tds") + stats(1977, "TAM", "def_tds"), (0, 4))
    expect("1990 MIN def_tds 4, DET 3 (Jimmy Williams); 1992 WAS 3, HOU 4 (Johnny Meads)",
           stats(1990, "MIN", "def_tds") + stats(1990, "DET", "def_tds") + stats(1992, "WAS", "def_tds")
           + stats(1992, "HOU", "def_tds"), (4, 3, 3, 4))
    expect("1989 Sean Smith safety: RAM 0, TAM 1 of its safeties", stat(1989, "RAM", "safeties") == 0
           and stat(1989, "TAM", "safeties") >= 1, True)
    expect("1952 Rams def_tds 9 (Bob Carey's fumble return kept)", stat(1952, "RAM", "def_tds"), 9)
    expect("1952 Steelers def_tds 2, st_tds 7: 9 non-offensive TDs (Darrell Hogan scored 1 TD, an 'other', "
           "and no INT-return TD)", stats(1952, "PIT", "def_tds", "st_tds"), (2, 7))
    expect("1940 Bears def_tds 3, st_tds 3 (Harry Clarke's PFR fumble TD dropped; Joe Maniaci's 'other' TD an "
           "INT return); 1941 Bears def_tds 4, st_tds 3 (George McAfee's INT-return TD)",
           stats(1940, "CHI", "def_tds", "st_tds") + stats(1941, "CHI", "def_tds", "st_tds"), (3, 3, 4, 3))
    expect("1973 Floyd Rice scored 1 TD (San Diego fumble return): SDG def_tds 2, st_tds 2; HOU def_tds 0, "
           "st_tds 2", stats(1973, "SDG", "def_tds", "st_tds") + stats(1973, "HOU", "def_tds", "st_tds"), (2, 2, 0, 2))
    pf = points_for(games)
    x = seasons[~seasons["afl"] & seasons["season"].between(TDS_FROM, LAST_SEASON)].set_index(["season", "team"])
    left = pf.reindex(x.index) - x["pfr_nonsafety_pts"] - 2 * x["safeties"].fillna(0)
    check("no NFL team-season 1922-98 scored fewer points than PFR's single-team players' TDs and kicks plus 2 "
          "per known team safety (no TD counted twice)", (left >= 0).all(),
          ", ".join(f"{y} {t} {v:+g}" for (y, t), v in left[left < 0].items()))
    by_season = left[left.index.get_level_values("season") >= PFR_SAFETIES_FROM].groupby(level="season").sum()
    off = (by_season - multi_pts.reindex(by_season.index).fillna(0)).astype(int)
    check("1950-98, every season: points scored - PFR's single-team players' TDs/kicks - 2 x NFL.com team "
          "safeties = PFR's multi-team players' TDs/kicks (plus AFL_NFL_SPLIT_SCORERS)", (off == 0).all(),
          f"off: {off[off != 0].to_dict()}" if (off != 0).any()
          else f"{len(by_season)} seasons; multi-team players {int(multi_pts.reindex(by_season.index).sum())} pts")
    x = seasons[~seasons["afl"] & (seasons["season"] >= PFR_SAFETIES_FROM)]
    check("1950-98 NFL safeties = NFL.com team totals, never fewer than PFR's player-credited safeties",
          (x["safeties"] == x["nflcom_saf"]).all() and (x["safeties"] >= x["pfr_safeties"]).all(),
          f"{int(x['safeties'].sum())} vs {int(x['pfr_safeties'].sum())} player-credited; more in "
          f"{int((x['safeties'] > x['pfr_safeties']).sum())} of {len(x)} team-seasons")
    want = {(1996, "CAR"): 2, (1996, "SFO"): 4, (1996, "NYG"): 2, (1996, "OAK"): 2, (1996, "HOU"): 2,
            (1994, "KAN"): 2, (1994, "NYG"): 2, (1991, "ATL"): 3}
    got = {k: stat(*k, "safeties") for k in want}
    league = seasons.groupby("season")["safeties"].sum()
    got_league = [int(league[y]) for y in (1996, 1994, 1991)]
    check("team safeties incl. those credited to no player: 1996 CAR 2 (player-credited 0), SFO 4 (2), NYG 2, "
          "OAK 2, HOU 2; 1994 KAN 2, NYG 2; 1991 ATL 3; league 1996 20, 1994 13, 1991 12",
          got == want and got_league == [20, 13, 12],
          f"league {got_league}" + ("; wrong: " + str({k: v for k, v in got.items() if v != want[k]})
                                    if got != want else ""))
    expect("1944 Giants 2 safeties (incl. a team safety)", stat(1944, "NYG", "safeties"), 2)
    expect("AFL: 1960 Texans 32 INT; 1962 Titans st_tds 3 (Christy 2, Cooke 1), def_tds 2 (INT + Grantham "
           "fumble return), 1 safety", stats(1960, "DTX", "interceptions") + stats(1962, "NYT", "st_tds", "def_tds",
                                                                              "safeties"), (32, 3, 2, 1))
    x = seasons[seasons["int_tds_pfa"].notna() & ~seasons["afl"]]
    agree = x["int_tds_pfa"] == x["int_tds_pfr"]
    check("1940-49 INT-return TDs: profootballarchives (transcribed) vs PFR agree for >= 95%", agree.mean() >= 0.95,
          f"{int(agree.sum())}/{len(x)}; differ: "
          + ", ".join(f"{r.season} {r.team} {r.int_tds_pfa:g}/{r.int_tds_pfr:g}" for r in x[~agree].itertuples()))
    x = seasons[seasons["season"].isin(PFA_NFL_SEASONS)]
    check("1940-49 safeties: profootballarchives team totals >= PFR player-credited safeties",
          (x["safeties"] >= x["pfr_safeties"]).all(), f"{int(x['safeties'].sum())} vs {int(x['pfr_safeties'].sum())}")
    x = seasons[seasons["afl"]]
    agree = x["int_tds_pfa"] == x["int_tds_trev"]
    check("AFL INT-return TDs: profootballarchives vs NFL.com (trevyoungquist) agree for >= 85%",
          agree.mean() >= 0.85, f"{int(agree.sum())}/{len(x)}; AFL def_tds {int(x['def_tds'].sum())} of which "
          f"INT-return {int(x['int_tds_pfa'].sum())}; AFL safeties {int(x['safeties'].sum())}")
    x = seasons[(~seasons["afl"]) & seasons["season"].between(TDS_FROM, LAST_SEASON)]
    agree = (x["int_tds_pfr"] == x["int_tds_trev"]).mean()
    check("NFL INT-return TDs: PFR vs trevyoungquist agree for >= 90% of team-seasons", agree >= 0.90, f"{agree:.1%}")
    print(f"    (fumble TDs by offensive-position players left out of def_tds, 1950-98: "
          f"{int(seasons['fbl_tds_offense'].sum())})")
    lane = trev_defense()
    lane = lane.loc[(lane["Player_Id"] == "night-train-lane") & (lane["season"] == 1952),
                    ["interceptions", "int_tds", "int_yards"]].iloc[0].tolist()
    expect("trevyoungquist Defense header shift: Night Train Lane 1952 = 14 INT, 2 TD, 298 yds", lane, [14, 2, 298])

    expected = {1920: 14, 1921: 21, 1925: 20, 1932: 8, 1933: 10, 1943: 8, 1944: 10, 1946: 10, 1949: 10,
                1950: 13, 1951: 12, 1960: 21, 1961: 22, 1966: 24, 1967: 25, 1968: 26, 1970: 26,
                1976: 28, 1982: 28, 1994: 28, 1995: 30, 1998: 30}
    wrong = {y: int(per_season.get(y, 0)) for y, n in expected.items() if per_season.get(y, 0) != n}
    check("team-seasons per season = league size (1920:14, 1932:8, 1950:13, 1960:21 = 13 NFL + 8 AFL, "
          "1970:26, 1976:28, 1995:30, ...)", not wrong, f"wrong: {wrong}" if wrong else f"{len(expected)} seasons")
    check("every season 1970-75 has 26 teams, 1976-94 has 28, 1995-98 has 30",
          all(per_season[y] == 26 for y in range(1970, 1976)) and all(per_season[y] == 28 for y in range(1976, 1995))
          and all(per_season[y] == 30 for y in range(1995, 1999)))

    # structure
    check("game rows: two per game_id, opposite teams, each (game_id, team) once",
          out_games.groupby("game_id").size().eq(2).all() and not out_games.duplicated(["game_id", "team"]).any()
          and (out_games.groupby("game_id")["team"].apply(frozenset)
               == out_games.groupby("game_id")["opponent"].apply(frozenset)).all())
    check("(season, team, week) unique and weeks run 1..N",
          not out_games.duplicated(["season", "team", "week"]).any()
          and (out_games.groupby(["season", "team"])["week"].max()
               == out_games.groupby(["season", "team"]).size()).all())
    check("season table keys == game table keys, one row each",
          not out_seasons.duplicated(["season", "team"]).any()
          and set(zip(out_seasons["season"], out_seasons["team"])) == set(zip(out_games["season"], out_games["team"])))
    names_g = out_games.groupby(["season", "team"])["team_name"].agg(set)
    check("team_name is the same in both tables", all(
        names_g[(y, t)] == {n}
        for y, t, n in zip(out_seasons["season"], out_seasons["team"], out_seasons["team_name"])))
    check("seasons 1920-1998 only, no AAFC teams in 1946-49",
          out_games["season"].between(FIRST_SEASON, LAST_SEASON).all()
          and not (out_games["season"].isin(AAFC_SEASONS) & out_games["team"].isin({"CLE", "SFO", "BCL"})).any())
    vals = seasons[SEASON_STATS].stack().dropna()
    check("season stats are non-negative whole numbers", ((vals >= 0) & (vals % 1 == 0)).all())
    first_known = {"sacks": SACKS_FROM, "interceptions": INT_FROM, "fumble_recoveries": FR_FROM,
                   "def_tds": TDS_FROM, "st_tds": TDS_FROM, "safeties": SAFETIES_FROM}
    ok = all(seasons.loc[seasons["season"] < y, c].isna().all() and seasons.loc[seasons["season"] >= y, c].notna().all()
             for c, y in first_known.items()) and seasons["blocked_kicks"].isna().all()
    check(f"each stat is empty exactly before its first known season (sacks {SACKS_FROM}, INT {INT_FROM}, "
          f"FR {FR_FROM}, TDs {TDS_FROM}, safeties {SAFETIES_FROM}, blocks never)", ok)

    # points allowed vs octonion (NFL.com standings)
    both = octonion_compare(games)
    m = both.dropna(subset=["pa", "points_against"])
    match = m["pa"] == m["points_against"]
    check("season PA matches octonion standings for >= 95% of team-seasons",
          match.mean() >= 0.95, f"{int(match.sum())}/{len(m)} = {match.mean():.1%}")
    later = m[m.index.get_level_values("season") > 1920]
    exact = ((later["pa"] == later["points_against"]) & (later["pf"] == later["points_for"])
             & (later["g"] == later["g_std"]))
    check("1921-1998: games, PF and PA all match octonion for every team-season", exact.all(),
          f"{int(exact.sum())}/{len(later)}")
    missing = both[both["pa"].isna() | both["points_against"].isna()]
    check("every team-season is in octonion and vice versa", missing.empty,
          "" if missing.empty else f"{len(missing)} unmatched: {list(missing.index)[:8]}")
    mism = m[~match | (m["g"] != m["g_std"])]
    if len(mism):
        print("  mismatches vs octonion (season team: PA ours/theirs, games ours vs W-L-T) -- 1920 standings "
              "include some non-league games:")
        print("    " + "; ".join(f"{y} {t} {int(r['pa'])}/{int(r['points_against'])} {int(r['g'])}g vs "
                                 f"{int(r['wins'])}-{int(r['losses'])}-{int(r['ties'])}"
                                 for (y, t), r in mism.iterrows()))
    diff_names = [(y, t, TEAM_NAMES[(t, y)], o) for (y, t), o in zip(both.index, both["team_name"])
                  if isinstance(o, str) and letters(TEAM_NAMES[(t, y)]) != letters(o)]
    print("  team_name differs from NFL.com's standings name (PFR naming kept): "
          + "; ".join(f"{y} {t} {n!r} vs {o!r}" for y, t, n, o in diff_names))
    x = seasons[seasons["pfr_pa"].notna()]
    pa = games.groupby(["season", "team"])["points_allowed"].sum().reindex(list(zip(x["season"], x["team"])))
    same = pa.to_numpy() == x["pfr_pa"].to_numpy()
    check("1980-98 PA: 538 equals PFR (allenjake440) for every team-season", same.all(), f"{int(same.sum())}/{len(x)}")

    # ---------------------------------------------------------------- top 10
    fp = fantasy_points(games, seasons)
    fp["decade"] = fp["season"] // 10 * 10
    print("\nTOP 10 team-seasons per decade by D/ST fantasy points "
          "(1/sack, 2/INT, 2/FR, 6/TD, 2/safety, 2/block + per-game points-allowed tiers; unknown = 0)")
    for dec, grp in fp.groupby("decade"):
        print(f"  {dec}s")
        top = grp.sort_values(["fp", "season", "team"], ascending=[False, True, True]).head(10)
        for i, r in enumerate(top.itertuples(index=False), 1):
            print(f"   {i:2d}. {r.season} {r.team:3s} {r.team_name:26s} fp {r.fp:6.1f}  g {r.games:2d} "
                  f"PA {r.points_allowed:3d} (PA fp {r.fp_points_allowed:+g})  sk {fmt(r.sacks)} "
                  f"int {fmt(r.interceptions)} fr {fmt(r.fumble_recoveries)} dtd {fmt(r.def_tds)} "
                  f"sttd {fmt(r.st_tds)} sfty {fmt(r.safeties)}")

    failed = [c for c in CHECKS if not c[1]]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} checks passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
