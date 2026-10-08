#!/usr/bin/env python3
"""Build sources/legacy_kicker_seasons.csv: kicker seasons for 1920-1998.

One-time build script. It downloads the raw sources into .cache/legacy/raw/
(gitignored, reused when present) and writes one clean CSV that the weekly bot
only reads. Run from the repo root:

    python3 bot/legacy_build/kickers.py

One row per player per season, regular season only, columns in the order
listed in COLUMNS. position is always "K"; anyone with a kicking attempt is
included, since before the 1960s most kickers were position players.

Sources (all treated as untrusted data and read with pandas):
  michaelmallari  Pro Football Reference season scoring tables, NFL 1922-2022
                  (huggingface.co/datasets/michaelmallari/nfl). Has XPM/XPA/FGM/
                  FGA/G per player. It has no AFL (1960-69) and no AAFC rows.
  josephvm        Kaggle josephvm/nfl-kickers-data, reg/reg_YYYY.csv for
                  1966-2019, NFL and AFL, with made/attempted by distance from
                  1991 on (the buckets are zero before 1991).
  trevyoungquist  Kaggle trevyoungquist/2020-nfl-stats-active-and-retired-players
                  (an NFL.com scrape). Kicking has FG made/att and games but no XP.
                  Used for games, the 1966-68 stint checks and as the NFL.com
                  cross-check of the AFL 1960-65 table.
  kendallgillies  Kaggle kendallgillies/nflstatistics (another NFL.com scrape).
                  Career_Stats_Field_Goal_Kickers has FG and XP per player-team-
                  season but covers only some players.
  statscrew       The Kicking table of every AFL team-season page for 1960-1965
                  (https://www.statscrew.com/football/stats/t-<code>/y-<season>),
                  48 pages read with a web lookup and transcribed into
                  AFL_KICKING below, one row per kicker per team, XP and FG.
  nflverse        players.csv, used only to attach pfr_id to kickers who also
                  played in 1999 or later, so their careers merge with nflverse.
  octonion        nfl_team_standings.csv (points for, touchdowns per team-season),
                  used only by the team reconciliation self-checks.

How each era is built:
  1922-1965 NFL   michaelmallari (PFR). kendallgillies adds the few kicking rows
                  PFR lacks: players with attempts but no points, and Ben
                  Agajanian's 1961 Green Bay stint.
  1960-1965 AFL   statscrew team pages (AFL_KICKING) for XP and FG, every kicker
                  of every team, including XP-only kickers. Where statscrew and
                  NFL.com (trevyoungquist / kendallgillies) disagree, the value is
                  settled by majority with Pro Football Archives team pages
                  (profootballarchives.com/<season>afl<team>.html) and PFR-derived
                  figures; see AFL_OVERRIDES. Games come from NFL.com.
  1966-1969       josephvm, which covers NFL and AFL. NFL rows are checked
                  against PFR and take PFR's totals and games.
  1970-1998       PFR totals (michaelmallari) for every team. josephvm adds the
                  distance buckets (1991+) and the kickers PFR leaves out.

Judgement calls:
  * Seasons 1920-1998, regular season only. The AFL (1960-69) is included. The
    AAFC (1946-49) is excluded: PFR has no AAFC rows, and AAFC teams in the
    NFL.com scrapes are dropped. 1920-1921 have no rows because no source has
    individual kicking stats for those seasons.
  * josephvm is the backbone for 1966-1998 as asked, but its per-season files
    keep only one team's stint for a player traded mid-season. For example,
    Greg Davis in 1989 shows 7/11 FG (ATL only) where the real total is 23/34
    (ATL+NWE). PFR's scoring table has the full multi-team totals, so from 1966
    on, wherever PFR has the player-season (all NFL rows, and every team from
    1970), PFR's FGM/FGA/XPM/XPA/G win. josephvm still supplies the distance
    buckets and the rows PFR lacks: kickers with attempts but no points, and
    the AFL 1966-69. On the 1,000+ single-team rows the two sources agree,
    except two off-by-one attempt counts.
  * Distance buckets are filled only from josephvm, for 1991+:
    fg_made_0_39 = 1-19 + 20-29 + 30-39, fg_made_40_49, fg_made_50_plus.
    fg_made_unknown = fg_made - buckets. That is 0 normally, and above 0 only
    for a traded kicker whose josephvm row holds just one stint. Before 1991,
    every made FG goes in fg_made_unknown and the buckets are 0.
  * PFR's scoring table records FG and XP attempts only from 1938. For
    1922-1937, fg_att and xp_att are empty (unknown), and a row is a kicker row
    when FGM or XPM is above 0. From 1938 on, a row needs FGA > 0, XPA > 0 or
    XPM > 0. One 1938+ row has makes but blank attempts in PFR (Dave Smukler,
    PHI 1938, XPM 6): its attempts come from Pro Football Archives
    (profootballarchives.com/1938nflphi.html: 6/6 XP, 0/2 FG; that page matches
    PFR exactly for the other two PHI kickers), see MANUAL_FILLS.
  * Run or pass conversions. In the NFL before the 2-point conversion of 1994
    a PAT run or passed in scored one point, and PFR's scoring table credits
    it as XPM/XPA to the scorer, e.g. Dick Butkus 1971 and Bobby Douglass 1971
    (the same fake-PAT pass). Those are not kicks. (In the AFL, 1960-69, such
    a conversion scored two points and is not in XP.) From
    1960 on, a PFR row with FGA = 0, XPA <= 2 and a PFR position other than K/P
    (or blank) is dropped unless a kicking table confirms the kick: josephvm
    (built from season kicking tables, which list kicked attempts only) for
    1966+, the NFL.com kicking file (kendallgillies) for 1960-65, or
    KICK_ALLOWLIST (Tom Tracy 1963, see there). Dan Reeves 1971 DAL, Deacon
    Jones 1974 WAS, Steve Zabel 1976 and George Yarno 1983 stay: josephvm lists
    their kicks. Before 1960 no source separates a kick from a run/pass
    conversion, and position players routinely kicked, so pre-1960 xp_made can
    include a few non-kicked conversions.
  * AFL 1960-1965 sources disagree on some FG attempt counts (by 1-3 attempts).
    Every disagreement between statscrew and NFL.com was put to a third source
    (Pro Football Archives team pages, which give per-kicker FG and PAT lines
    with distance splits, plus PFR-derived Wikipedia or PFR career totals) and
    settled by majority, counting the two NFL.com scrapes as one source. On a
    2-2 tie the NFL.com value is kept (only Cappelletti 1961 FGA, 31 vs 32;
    PFR's career total of 333 does not support raising it). AFL_OVERRIDES holds
    each decision with its votes. XP comes from statscrew except Mack Yoho
    1963 (32/37, NFL.com and PFA, against statscrew's 32/35). Dick Guesman 1962
    XP is 2/2 on statscrew and 2/3 on PFA (team total 32 attempts either way);
    statscrew's value is kept. A check confirms that for all 48 AFL
    team-seasons, points for - 6*TD - XP - 3*FG (octonion standings) is 0-10
    and even, i.e. only 2-point conversions and safeties are left over.
  * Cappelletti 1966 FG attempts: josephvm and NFL.com say 16/33, statscrew
    16/32, a PFR-derived Wikipedia table 16/34. josephvm's 33 is kept.
  * Kickers traded mid-season in 1966-68, including moves between the AFL and
    the NFL: josephvm keeps only the last stint. trevyoungquist keeps only the
    first stint, but labels it with the last team. PFR's NFL table drops a
    player entirely when he also played in the AFL that season. Three such
    seasons exist, each checked against Pro Football Reference's per-team
    lines (via web search) and statscrew team pages. MANUAL_ROWS adds the
    missing stint and MANUAL_GAMES fixes the games:
      Mike Mercer 1966  OAK 1/4 FG, 2/3 XP, 2 g + KAN 20/26, 33/35, 10 g
      Gene Mingo 1967   MIA 1/6 FG, 9/9 XP, 6 g + WAS 4/10, 20/22, 6 g
      Mike Mercer 1968  BUF 0/4 FG, 4/4 XP, 3 g + GNB 7/12, 12/14, 6 g
    A check fails if trevyoungquist and josephvm disagree on any other
    1966-69 row that PFR lacks.
  * AFL 1960-65 traded kickers: trevyoungquist keeps one team per season.
    Bill Shockley 1961 was BUF (2 g, 1/2 FG) and NYT (6 g, 3/7 FG, 13/13 XP),
    and Gene Mingo 1964 kicked only for DEN (7 g, 8/12 FG, 9/10 XP) before
    playing 7 games for OAK without kicking (NFL.com career pages, statscrew
    DEN/OAK 1964). Their rows are BUF/NYT and DEN/OAK with all games.
  * Team codes are Pro Football Reference codes for that era (CRD, PRT, BOS,
    RAM, STL, NYT, DTX, LAC, TEN, ...). For a player on several teams in a
    season, the team column is "A/B" and team_name is "Name A / Name B", in
    alphabetical code order, because the sources do not say which stint came
    first. The teams come from kendallgillies' per-team rows, or, for every
    post-1945 PFR "2TM" row, from MANUAL_TEAMS (NFL.com career pages,
    Wikipedia, PFA). Only 1922-1945 rows that no source splits keep PFR's
    "2TM"/"3TM", with team_name "2 teams" etc.
  * player_id is "k:" plus a slug of the name, so it does not change between
    sources. The same person under different names in different sources (e.g.
    "Richie Szaro" in josephvm, "Rich Szaro" in PFR) is matched within a season
    on surname plus first initial; NICKNAMES maps names that share no initial
    ("Frank Ivy" in kendallgillies is PFR's "Pop Ivy"). josephvm marks a
    namesake as "Wayne Walker (1)" (HOU 1968), which becomes k:wayne-walker-2.
    The Detroit linebacker who also kicked keeps k:wayne-walker.
  * pfr_id is set only for kickers whose nflverse record (position K) runs past
    1998. nflverse's own pfr_id is used, so 1990s seasons merge with nflverse's
    1999+ seasons in the bot.

Columns that are empty, and why:
  fg_att, xp_att   1922-1937 only: attempts were not recorded (PFR leaves them
                   blank). From 1938 on both are always known.
  pfr_id           kickers with no nflverse (1999+) record.
  games            never empty in practice. The check below asserts it.
Every other cell is a known integer (buckets are 0 when distance is unknown).

NOTE for consumers: an empty fg_att or xp_att means attempts are unknown, not
zero. Fill them with fg_made and xp_made before scoring "missed" kicks, or the
misses come out negative (bot/legacy.py currently fills them with 0, which
turns every pre-1938 make into a bonus point).
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
from common import KICKING_STATS  # noqa: E402  (read-only: canonical column names)

RAW = ROOT / ".cache" / "legacy" / "raw"
OUT = ROOT / "sources" / "legacy_kicker_seasons.csv"

FIRST_SEASON, LAST_SEASON = 1920, 1998
ATTEMPTS_FROM = 1938  # PFR has FG/XP attempts from this season on
BUCKETS_FROM = 1991  # josephvm has FG distance buckets from this season on

COLUMNS = ["player_id", "pfr_id", "name", "position", "season", "team", "team_name", "games",
           *KICKING_STATS, "source"]
assert KICKING_STATS == ["fg_made", "fg_att", "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus",
                         "fg_made_unknown", "xp_made", "xp_att"]

URLS = {
    "michaelmallari_nfl_players_1922_2022.csv":
        "https://huggingface.co/datasets/michaelmallari/nfl/resolve/main/nfl-players-1922-2022.csv",
    "josephvm.zip": "https://www.kaggle.com/api/v1/datasets/download/josephvm/nfl-kickers-data",
    "kendallgillies.zip": "https://www.kaggle.com/api/v1/datasets/download/kendallgillies/nflstatistics",
    "trev.zip": "https://www.kaggle.com/api/v1/datasets/download/"
                "trevyoungquist/2020-nfl-stats-active-and-retired-players",
    "nflverse_players.csv": "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
    "octonion_nfl_team_standings.csv":
        "https://raw.githubusercontent.com/octonion/football-public/master/nfl/csv/nfl_team_standings.csv",
}

# --- teams --------------------------------------------------------------------

# (PFR code, first season, last season, name of the era). Only 1920-1998.
TEAMS = [
    ("AKR", 1920, 1925, "Akron Pros"), ("AKR", 1926, 1926, "Akron Indians"),
    ("ARI", 1994, 1998, "Arizona Cardinals"), ("ATL", 1966, 1998, "Atlanta Falcons"),
    ("BAL", 1953, 1983, "Baltimore Colts"), ("BAL", 1996, 1998, "Baltimore Ravens"),
    ("BCL", 1950, 1950, "Baltimore Colts"),
    ("BKN", 1930, 1943, "Brooklyn Dodgers"), ("BKN", 1944, 1944, "Brooklyn Tigers"),
    ("BOS", 1929, 1929, "Boston Bulldogs"), ("BOS", 1932, 1932, "Boston Braves"),
    ("BOS", 1933, 1936, "Boston Redskins"), ("BOS", 1944, 1948, "Boston Yanks"),
    ("BOS", 1960, 1970, "Boston Patriots"),
    ("BRL", 1926, 1926, "Brooklyn Lions"),
    ("BUF", 1920, 1923, "Buffalo All-Americans"), ("BUF", 1924, 1925, "Buffalo Bisons"),
    ("BUF", 1926, 1926, "Buffalo Rangers"), ("BUF", 1927, 1929, "Buffalo Bisons"),
    ("BUF", 1960, 1998, "Buffalo Bills"),
    ("CAN", 1920, 1926, "Canton Bulldogs"), ("CAR", 1995, 1998, "Carolina Panthers"),
    ("CHI", 1920, 1920, "Decatur Staleys"), ("CHI", 1921, 1921, "Chicago Staleys"),
    ("CHI", 1922, 1998, "Chicago Bears"),
    ("CIN", 1933, 1934, "Cincinnati Reds"), ("CIN", 1968, 1998, "Cincinnati Bengals"),
    ("CLE", 1920, 1920, "Cleveland Tigers"), ("CLE", 1921, 1921, "Cleveland Indians"),
    ("CLE", 1924, 1927, "Cleveland Bulldogs"), ("CLE", 1931, 1931, "Cleveland Indians"),
    ("CLE", 1950, 1995, "Cleveland Browns"),
    ("CLI", 1923, 1923, "Cleveland Indians"),
    ("COL", 1920, 1922, "Columbus Panhandles"), ("COL", 1923, 1926, "Columbus Tigers"),
    ("CRD", 1920, 1959, "Chicago Cardinals"),
    ("DAL", 1960, 1998, "Dallas Cowboys"), ("DAY", 1920, 1929, "Dayton Triangles"),
    ("DEN", 1960, 1998, "Denver Broncos"),
    ("DET", 1925, 1926, "Detroit Panthers"), ("DET", 1928, 1928, "Detroit Wolverines"),
    ("DET", 1934, 1998, "Detroit Lions"),
    ("DTX", 1952, 1952, "Dallas Texans"), ("DTX", 1960, 1962, "Dallas Texans"),
    ("DUL", 1923, 1925, "Duluth Kelleys"), ("DUL", 1926, 1927, "Duluth Eskimos"),
    ("EVN", 1921, 1922, "Evansville Crimson Giants"), ("FRN", 1924, 1931, "Frankford Yellow Jackets"),
    ("GNB", 1921, 1998, "Green Bay Packers"), ("HAM", 1920, 1926, "Hammond Pros"),
    ("HOU", 1960, 1996, "Houston Oilers"), ("HRT", 1926, 1926, "Hartford Blues"),
    ("IND", 1984, 1998, "Indianapolis Colts"), ("JAX", 1995, 1998, "Jacksonville Jaguars"),
    ("KAN", 1924, 1924, "Kansas City Blues"), ("KAN", 1925, 1926, "Kansas City Cowboys"),
    ("KAN", 1963, 1998, "Kansas City Chiefs"),
    ("KEN", 1924, 1924, "Kenosha Maroons"), ("LAB", 1926, 1926, "Los Angeles Buccaneers"),
    ("LAC", 1960, 1960, "Los Angeles Chargers"),
    ("LOU", 1921, 1923, "Louisville Brecks"), ("LOU", 1926, 1926, "Louisville Colonels"),
    ("MIA", 1966, 1998, "Miami Dolphins"), ("MIL", 1922, 1926, "Milwaukee Badgers"),
    ("MIN", 1921, 1924, "Minneapolis Marines"), ("MIN", 1929, 1930, "Minneapolis Red Jackets"),
    ("MIN", 1961, 1998, "Minnesota Vikings"),
    ("NOR", 1967, 1998, "New Orleans Saints"), ("NWE", 1971, 1998, "New England Patriots"),
    ("NYG", 1925, 1998, "New York Giants"), ("NYJ", 1963, 1998, "New York Jets"),
    ("NYT", 1960, 1962, "New York Titans"),
    ("NYY", 1927, 1928, "New York Yankees"), ("NYY", 1949, 1949, "New York Bulldogs"),
    ("NYY", 1950, 1951, "New York Yanks"),
    ("OAK", 1960, 1981, "Oakland Raiders"), ("OAK", 1995, 1998, "Oakland Raiders"),
    ("OOR", 1922, 1923, "Oorang Indians"),
    ("PHI", 1933, 1998, "Philadelphia Eagles"), ("PHO", 1988, 1993, "Phoenix Cardinals"),
    ("PIT", 1933, 1939, "Pittsburgh Pirates"), ("PIT", 1940, 1998, "Pittsburgh Steelers"),
    ("POT", 1925, 1928, "Pottsville Maroons"), ("PRT", 1930, 1933, "Portsmouth Spartans"),
    ("PRV", 1925, 1931, "Providence Steam Roller"),
    ("RAC", 1922, 1924, "Racine Legion"), ("RAC", 1926, 1926, "Racine Tornadoes"),
    ("RAI", 1982, 1994, "Los Angeles Raiders"),
    ("RAM", 1937, 1945, "Cleveland Rams"), ("RAM", 1946, 1994, "Los Angeles Rams"),
    ("RCH", 1920, 1925, "Rochester Jeffersons"), ("RII", 1920, 1925, "Rock Island Independents"),
    ("SDG", 1961, 1998, "San Diego Chargers"), ("SEA", 1976, 1998, "Seattle Seahawks"),
    ("SFO", 1950, 1998, "San Francisco 49ers"), ("SIS", 1929, 1932, "Staten Island Stapletons"),
    ("STL", 1923, 1923, "St. Louis All-Stars"), ("STL", 1934, 1934, "St. Louis Gunners"),
    ("STL", 1960, 1987, "St. Louis Cardinals"), ("STL", 1995, 1998, "St. Louis Rams"),
    ("TAM", 1976, 1998, "Tampa Bay Buccaneers"), ("TEN", 1997, 1998, "Tennessee Oilers"),
    ("TOL", 1922, 1923, "Toledo Maroons"),
    ("TOR", 1929, 1929, "Orange Tornadoes"), ("TOR", 1930, 1930, "Newark Tornadoes"),
    ("WAS", 1937, 1998, "Washington Redskins"),
]
# The wartime mergers, under the codes PFR files them under.
SPECIAL_NAMES = {("PHI", 1943): "Phil-Pitt Combine", ("CRD", 1944): "Card-Pitt Combine"}
CODE_FIXES = {("PIT", 1943): "PHI", ("PIT", 1944): "CRD"}
NAME_ALIASES = {"philpittcombine": "philadelphiaeagles", "philpittsteagles": "philadelphiaeagles",
                "cardpittcombine": "chicagocardinals", "cardpitt": "chicagocardinals",
                "chicagoracinecardinals": "chicagocardinals"}
AAFC_NAMES = {"losangelesdons", "chicagohornets", "chicagorockets", "miamiseahawks", "newyorkyankees",
              "brooklyndodgers", "buffalobills", "buffalobisons", "baltimorecolts", "clevelandbrowns",
              "sanfrancisco49ers"}
AFL_CODES = {"BOS", "BUF", "DTX", "DEN", "HOU", "KAN", "LAC", "SDG", "NYT", "NYJ", "OAK", "MIA", "CIN"}
JOSEPHVM_CODES = {"GB": "GNB", "KC": "KAN", "LA": "RAM", "NE": "NWE", "NO": "NOR", "SD": "SDG",
                  "SF": "SFO", "TB": "TAM", "JAC": "JAX"}

# --- AFL 1960-1965: statscrew team pages -------------------------------------------

STATSCREW_CODES = {"BOS": "BOS", "BUF": "BUF", "DTX": "DAT", "DEN": "DEN", "HOU": "HOO", "LAC": "LAC",
                   "NYT": "NYT", "NYJ": "NYJ", "OAK": "OAK", "SDG": "SD", "KAN": "KC"}


def statscrew_url(team, season):
    return f"https://www.statscrew.com/football/stats/t-{STATSCREW_CODES[team]}/y-{season}"


# The Kicking table of each AFL team-season page (statscrew_url), transcribed as
# (name, xp_made, xp_att, fg_made, fg_att) per kicker, plus the page's Totals row
# (xp_made, xp_att, fg_made, fg_att). A check asserts the rows add up to the Totals.
AFL_KICKING = {
    (1960, "BOS"): ([("Gino Cappelletti", 30, 32, 8, 21), ("Jim Crawford", 0, 0, 0, 1),
                     ("Walt Cudzik", 0, 0, 0, 1)], (30, 32, 8, 23)),
    (1960, "BUF"): ([("Billy Atkins", 27, 33, 6, 13), ("Darrell Harper", 1, 2, 2, 3), ("Joe Hergert", 0, 0, 2, 4),
                     ("Mack Yoho", 0, 0, 2, 5), ("Tommy O'Connell", 0, 0, 0, 1)], (28, 35, 12, 26)),
    (1960, "DTX"): ([("Jack Spikes", 35, 37, 13, 31), ("Cotton Davidson", 7, 7, 1, 1), ("Don Flynn", 0, 0, 0, 1),
                     ("Curley Johnson", 0, 0, 0, 1)], (42, 44, 14, 34)),
    (1960, "DEN"): ([("Gene Mingo", 33, 36, 18, 28)], (33, 36, 18, 28)),
    (1960, "HOU"): ([("George Blanda", 46, 47, 15, 33)], (46, 47, 15, 33)),
    (1960, "LAC"): ([("Ben Agajanian", 46, 47, 13, 24)], (46, 47, 13, 24)),
    (1960, "NYT"): ([("Bill Shockley", 47, 50, 9, 21)], (47, 50, 9, 21)),
    (1960, "OAK"): ([("Larry Barnes", 37, 39, 6, 25)], (37, 39, 6, 25)),
    (1961, "BOS"): ([("Gino Cappelletti", 48, 50, 17, 32)], (48, 50, 17, 32)),
    (1961, "BUF"): ([("Joe Hergert", 0, 0, 6, 14), ("Billy Atkins", 29, 31, 2, 6), ("Bill Shockley", 0, 0, 1, 2),
                     ("Mack Yoho", 0, 0, 0, 4)], (29, 31, 9, 26)),
    (1961, "DTX"): ([("Jack Spikes", 10, 14, 4, 13), ("Ben Agajanian", 7, 7, 3, 9),
                     ("Cotton Davidson", 20, 20, 0, 2)], (37, 41, 7, 24)),
    (1961, "DEN"): ([("Jack Hill", 16, 16, 5, 15), ("Gene Mingo", 11, 11, 3, 10)], (27, 27, 8, 25)),
    (1961, "HOU"): ([("George Blanda", 64, 65, 16, 26), ("Charlie Milstead", 1, 1, 0, 0)], (65, 66, 16, 26)),
    (1961, "NYT"): ([("Dick Guesman", 24, 26, 5, 15), ("Bill Shockley", 13, 13, 3, 7),
                     ("Thurlow Cooper", 0, 0, 0, 1)], (37, 39, 8, 23)),
    (1961, "OAK"): ([("George Fleming", 24, 25, 11, 26)], (24, 25, 11, 26)),
    (1961, "SDG"): ([("George Blair", 42, 47, 13, 27), ("Bob Laraba", 1, 2, 0, 0)], (43, 49, 13, 27)),
    (1962, "BOS"): ([("Gino Cappelletti", 38, 40, 20, 37)], (38, 40, 20, 37)),
    (1962, "BUF"): ([("Cookie Gilchrist", 14, 17, 8, 20), ("Mack Yoho", 20, 22, 1, 3),
                     ("Ralph Felton", 0, 1, 0, 0)], (34, 40, 9, 23)),
    (1962, "DTX"): ([("Tommy Brooker", 33, 33, 12, 22), ("Tom Pennington", 13, 15, 2, 5),
                     ("Jack Spikes", 1, 1, 0, 0)], (47, 49, 14, 27)),
    (1962, "DEN"): ([("Gene Mingo", 32, 34, 27, 39), ("Jim Fraser", 2, 2, 0, 0)], (34, 36, 27, 39)),
    (1962, "HOU"): ([("George Blanda", 48, 49, 11, 26)], (48, 49, 11, 26)),
    (1962, "NYT"): ([("Bill Shockley", 29, 30, 13, 26), ("Dick Guesman", 2, 2, 0, 1)], (31, 32, 13, 27)),
    (1962, "OAK"): ([("Ben Agajanian", 10, 11, 5, 14), ("Jackie Simpson", 6, 7, 3, 10), ("Cotton Davidson", 4, 5, 1, 2),
                     ("Dan Birdwell", 0, 0, 0, 1)], (20, 23, 9, 27)),
    (1962, "SDG"): ([("George Blair", 31, 34, 17, 20)], (31, 34, 17, 20)),
    (1963, "BOS"): ([("Gino Cappelletti", 35, 36, 22, 38)], (35, 36, 22, 38)),
    (1963, "BUF"): ([("Mack Yoho", 32, 35, 10, 24)], (32, 35, 10, 24)),
    (1963, "DEN"): ([("Gene Mingo", 35, 35, 16, 30)], (35, 35, 16, 30)),
    (1963, "HOU"): ([("George Blanda", 39, 39, 9, 24)], (39, 39, 9, 24)),
    (1963, "KAN"): ([("Tommy Brooker", 20, 20, 6, 14), ("Jack Spikes", 23, 24, 2, 13)], (43, 44, 8, 27)),
    (1963, "NYJ"): ([("Dick Guesman", 30, 30, 9, 24)], (30, 30, 9, 24)),
    (1963, "OAK"): ([("Mike Mercer", 47, 47, 8, 21)], (47, 47, 8, 21)),
    (1963, "SDG"): ([("George Blair", 44, 48, 17, 28)], (44, 48, 17, 28)),
    (1964, "BOS"): ([("Gino Cappelletti", 36, 36, 25, 39)], (36, 36, 25, 39)),
    (1964, "BUF"): ([("Pete Gogolak", 45, 46, 19, 29)], (45, 46, 19, 29)),
    (1964, "DEN"): ([("Gene Mingo", 9, 10, 8, 12), ("Dick Guesman", 13, 15, 6, 22)], (22, 25, 14, 34)),
    (1964, "HOU"): ([("George Blanda", 37, 38, 13, 29)], (37, 38, 13, 29)),
    (1964, "KAN"): ([("Tommy Brooker", 46, 46, 8, 17)], (46, 46, 8, 17)),
    (1964, "NYJ"): ([("Jim Turner", 33, 33, 13, 27)], (33, 33, 13, 27)),
    (1964, "OAK"): ([("Mike Mercer", 34, 34, 15, 24)], (34, 34, 15, 24)),
    (1964, "SDG"): ([("Keith Lincoln", 16, 17, 5, 12), ("George Blair", 5, 6, 3, 5), ("Herb Travenio", 10, 12, 2, 5),
                     ("Ben Agajanian", 8, 8, 2, 4)], (39, 43, 12, 26)),
    (1965, "BOS"): ([("Gino Cappelletti", 27, 27, 17, 27)], (27, 27, 17, 27)),
    (1965, "BUF"): ([("Pete Gogolak", 31, 31, 28, 46)], (31, 31, 28, 46)),
    (1965, "DEN"): ([("Gary Kroner", 32, 32, 13, 29)], (32, 32, 13, 29)),
    (1965, "HOU"): ([("George Blanda", 28, 28, 11, 21), ("Jack Spikes", 6, 6, 1, 2)], (34, 34, 12, 23)),
    (1965, "KAN"): ([("Tommy Brooker", 37, 37, 13, 30)], (37, 37, 13, 30)),
    (1965, "NYJ"): ([("Jim Turner", 31, 31, 20, 34)], (31, 31, 20, 34)),
    (1965, "OAK"): ([("Mike Mercer", 35, 35, 9, 15), ("Gene Mingo", 0, 0, 8, 19)], (35, 35, 17, 34)),
    (1965, "SDG"): ([("Herb Travenio", 40, 40, 18, 30)], (40, 40, 18, 30)),
}

PFA = "profootballarchives.com/{}.html"
# Where statscrew and NFL.com disagree, the majority of independent sources wins (NFL.com's
# two scrapes count once; a 2-2 tie keeps NFL.com). (name, season, team) -> corrected
# values and the votes. PFA = Pro Football Archives team-season page.
AFL_OVERRIDES = {
    ("Gino Cappelletti", 1960, "BOS"): dict(fg_att=22, why="22: NFL.com, PFA " + PFA.format("1960aflbos")
                                            + ", Wikipedia (PFR) table; 21: statscrew"),
    ("George Blanda", 1960, "HOU"): dict(fg_att=32, why="32: NFL.com, PFA " + PFA.format("1960aflhou")
                                         + ", Wikipedia (PFR) table; 33: statscrew"),
    ("George Blanda", 1961, "HOU"): dict(fg_att=29, why="29: NFL.com, PFA " + PFA.format("1961aflhou")
                                         + " (with distance splits), Wikipedia (PFR) table; 26: statscrew"),
    ("Gino Cappelletti", 1961, "BOS"): dict(fg_att=31, why="tie, NFL.com kept. 31: NFL.com, PFA "
                                            + PFA.format("1961aflbos") + " player line; 32: statscrew, Wikipedia"
                                            " table. PFR career total 176/333 is already 1 below this table's sum"),
    ("George Fleming", 1961, "OAK"): dict(fg_att=28, why="28: NFL.com, PFA " + PFA.format("1961afloak")
                                          + " (with distance splits); 26: statscrew"),
    ("Tommy Brooker", 1962, "DTX"): dict(fg_att=23, why="23: NFL.com, PFA " + PFA.format("1962afldal")
                                         + ", PFR Chiefs career table 41/87; 22: statscrew, Wikipedia text"),
    ("Dick Guesman", 1962, "NYT"): dict(fg_att=2, why="2: NFL.com, PFA " + PFA.format("1962aflny")
                                        + " (0/2 from 50+); 1: statscrew"),
    ("Cotton Davidson", 1962, "OAK"): dict(fg_att=1, why="1: NFL.com, PFA " + PFA.format("1962afloak")
                                           + "; 2: statscrew"),
    ("Gene Mingo", 1963, "DEN"): dict(fg_att=29, why="29: NFL.com, PFA " + PFA.format("1963aflden")
                                      + " (with distance splits), PFR career total 112/219; 30: statscrew"),
    ("Tommy Brooker", 1963, "KAN"): dict(fg_att=15, why="15: NFL.com, PFA " + PFA.format("1963aflkc")
                                         + ", PFR Chiefs career table 41/87; 14: statscrew"),
    ("Mike Mercer", 1963, "OAK"): dict(fg_att=20, why="20: NFL.com, PFA " + PFA.format("1963afloak")
                                       + "; 21: statscrew"),
    ("Mack Yoho", 1963, "BUF"): dict(xp_att=37, why="32/37: NFL.com (kendallgillies), PFA "
                                     + PFA.format("1963aflbuf") + "; 32/35: statscrew"),
}
# Player-seasons where the final AFL line still differs from NFL.com (trevyoungquist), with
# the reason. A check asserts this list is exactly the set of differences.
AFL_NFLCOM_DIFFERENCES = {
    ("gene mingo", 1961): "FG 3/10 (statscrew, PFA 1961aflden, PFR career 112/219) vs NFL.com 3/12",
    ("cotton davidson", 1961): "FG 0/2 (statscrew, PFA 1961afldal) vs NFL.com 0/4",
    ("bill shockley", 1961): "NFL.com's scrape lost his BUF stint (1/2 FG, 2 g; nfl.com career page has it)",
}

# --- other verified fixes -----------------------------------------------------------

# Multi-team PFR rows ("2TM") after 1945 -> the teams, alphabetical. Sources: NFL.com career
# pages (nfl.com/players/<slug>/stats/career), Wikipedia, PFA team pages, josephvm stints.
MANUAL_TEAMS = {
    ("george blanda", 1950): "BCL/CHI",    # Wikipedia (PFR) table: BAL 1 g, CHI 11 g 6/15
    ("rex grossman", 1950): "BCL/DET",     # PFR line via search: BAL 8 g 16/19 XP, DET no kicking
    ("tom tracy", 1963): "PIT/WAS",        # PFA 1963nflpit (2/2 PAT, 6 g) and 1963nflwas (2 g)
    ("chuck mercein", 1967): "GNB/NYG",    # nfl.com: NYG 1 g 0/1, GNB 6 g
    ("skip butler", 1971): "NOR/NYG",      # nfl.com: NOR 2 g 1/5, NYG 1 g
    ("nick mike mayer", 1977): "ATL/PHI",  # nfl.com: ATL 7 g 7/19, PHI 3 g 3/3
    ("mike wood", 1979): "SDG/STL",        # Wikipedia: San Diego, then St. Louis Cardinals (3 G)
    ("dan miller", 1982): "BAL/NWE",       # nfl.com: BAL 3 g 4/8, NWE 2 g 2/3
    ("fred steinfort", 1983): "BUF/NWE",   # nfl.com: NWE 9 g 6/15, BUF 2 g 1/6
    ("mark moseley", 1986): "CLE/WAS",     # Wikipedia: WAS 6 g 6/12, CLE 4 g 6/7; josephvm CLE
    ("dean dorsey", 1988): "GNB/PHI",      # nfl.com: GNB 3 g 1/3, PHI 3 g 4/7
    ("roger ruzek", 1989): "DAL/PHI",      # released by DAL, signed by PHI; josephvm PHI
    ("eddie murray", 1992): "KAN/TAM",     # nfl.com: KC 1 g 1/1, TB 7 g 4/8
    ("ken willis", 1992): "NYG/TAM",       # nfl.com: TB 9 g 8/14, NYG 6 g 2/2
    ("doug brien", 1995): "NOR/SFO",       # released by SF, signed by NO; josephvm NO 12/17
    ("carlos huerta", 1996): "CHI/STL",    # nfl.com: STL 1 g, CHI 3 g 4/7
    ("scott bentley", 1997): "ATL/DEN",    # nfl.com: ATL 2 g, DEN 1 g 2/3
}
# PFR rows with blank attempts that another source fills (see the docstring).
MANUAL_FILLS = {("dave smukler", 1938, "PHI"): dict(fg_att=2, xp_att=6)}  # PFA 1938nflphi
# Kicks no kicking table confirms but a source documents (rows otherwise dropped as run/pass PATs).
KICK_ALLOWLIST = {
    ("tom tracy", 1963): "PFA 1963nflpit credits 2/2 PATs; a 1959 Steelers profile says he kicked FG and PAT",
}
# Different names for the same person in different sources -> PFR's name.
NICKNAMES = {"frank ivy": "pop ivy"}  # kendallgillies "Ivy, Frank" = PFR "Pop Ivy" (CRD 1940-47)


def _letters(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


_TEAM_KEYS = [(code, first, last, _letters(name)) for code, first, last, name in TEAMS]


def team_name(code, season):
    if (code, season) in SPECIAL_NAMES:
        return SPECIAL_NAMES[(code, season)]
    m = re.fullmatch(r"(\d)TM", code)
    if m:
        return f"{m.group(1)} teams"
    for c, first, last, name in TEAMS:
        if c == code and first <= season <= last:
            return name
    raise KeyError(f"no team name for {code} {season}")


def code_from_name(full, season):
    """NFL.com full team name ("St.LouisCardinals", "Boston Patriots") -> PFR code, None for AAFC."""
    key = _letters(full)
    if 1946 <= season <= 1949 and key in AAFC_NAMES:
        return None
    key = NAME_ALIASES.get(key, key)
    for code, first, last, k in _TEAM_KEYS:
        if k == key and first <= season <= last:
            return CODE_FIXES.get((code, season), code)
    # NFL.com sometimes keeps a name a season too long (1940 "Pittsburgh Pirates"):
    # accept the code if it is the only one ever called that which existed that season.
    codes = {code for code, _, _, k in _TEAM_KEYS if k == key}
    codes = {c for c in codes if any(c == code and first <= season <= last for code, first, last, _ in _TEAM_KEYS)}
    if len(codes) == 1:
        code = codes.pop()
        return CODE_FIXES.get((code, season), code)
    raise KeyError(f"unmapped team {full!r} in {season}")


def is_afl(code, season):
    return 1960 <= season <= 1969 and code in AFL_CODES


def afl_mask(df):
    return pd.Series([is_afl(t, s) for t, s in zip(df["team"], df["season"])], index=df.index, dtype=bool)


# --- names --------------------------------------------------------------------

SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def clean_name(s):
    s = re.sub(r"\(\d+\)", "", str(s))
    s = re.sub(r"[+*]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def name_key(s):
    s = unicodedata.normalize("NFKD", clean_name(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", "", s.replace("-", " ").replace(".", " "))
    key = " ".join(t for t in s.split() if t not in SUFFIXES)
    return NICKNAMES.get(key, key)


def namesake_marker(s):
    m = re.search(r"\((\d+)\)", str(s))
    return int(m.group(1)) if m else 0


def surname_initial(key):
    parts = key.split()
    return (parts[-1], parts[0][:1]) if parts else ("", "")


def first_last(s):
    """kendallgillies writes "Last, First"."""
    s = str(s)
    if ", " in s:
        last, first = s.split(", ", 1)
        return f"{first} {last}"
    return s


# --- raw files ----------------------------------------------------------------


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


def read_zip_csv(zip_name, member, **kw):
    with zipfile.ZipFile(raw(zip_name)) as zf:
        return pd.read_csv(io.BytesIO(zf.read(member)), **kw)


def read_trev(member):
    extracted = RAW / "trev" / member
    if extracted.exists():
        return pd.read_csv(extracted, dtype=str, low_memory=False)
    return read_zip_csv("trev.zip", member, dtype=str, low_memory=False)


def num(series):
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(),
                         errors="coerce")


# Every loader returns these columns. b_0_39/b_40_49/b_50 are made FGs by distance,
# NaN when the source has no distance split.
ROW_COLS = ["name", "key", "season", "team", "games", "fg_made", "fg_att",
            "b_0_39", "b_40_49", "b_50", "xp_made", "xp_att", "source", "pos"]


def frame(df):
    for col in ROW_COLS:
        if col not in df.columns:
            df[col] = float("nan")
    return df[ROW_COLS].reset_index(drop=True)


def load_pfr():
    df = pd.read_csv(raw("michaelmallari_nfl_players_1922_2022.csv"), low_memory=False)
    df = df[df["Season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    for col in ("G", "FGM", "FGA", "XPM", "XPA"):
        df[col] = num(df[col])
    early = df["Season"] < ATTEMPTS_FROM
    made = (df["FGM"].fillna(0) > 0) | (df["XPM"].fillna(0) > 0)
    tried = (df["FGA"].fillna(0) > 0) | (df["XPA"].fillna(0) > 0)
    df = df[made | (~early & tried)].copy()
    early = df["Season"] < ATTEMPTS_FROM
    # 1938+: a blank FGA/XPA means none, except XPA blank next to XPM > 0 (unknown; MANUAL_FILLS).
    xp_unknown = early | (df["XPA"].isna() & (df["XPM"].fillna(0) > 0))
    out = pd.DataFrame({
        "name": df["Player"].map(clean_name),
        "season": df["Season"].astype(int),
        "team": df["Tm"],
        "games": df["G"],
        "fg_made": df["FGM"].fillna(0),
        "fg_att": df["FGA"].fillna(0).mask(early),
        "xp_made": df["XPM"].fillna(0),
        "xp_att": df["XPA"].fillna(0).mask(xp_unknown),
        "source": "michaelmallari",
        "pos": df["Pos"],
    })
    out["key"] = out["name"].map(name_key)
    for (key, season, team), fill in MANUAL_FILLS.items():
        at = (out["key"] == key) & (out["season"] == season) & (out["team"] == team)
        assert at.sum() == 1, (key, season, team)
        for col, value in fill.items():
            out.loc[at, col] = value
        out.loc[at, "source"] = "michaelmallari+manual"
    return frame(out)


KICKER_POS = {"K", "P"}


def kicker_pos(pos):
    """PFR position is blank or contains K or P (e.g. "K", "P/K")."""
    return pd.isna(pos) or bool(set(re.split(r"[/-]", str(pos))) & KICKER_POS)


def run_pass_pat(row):
    """A 1960+ PFR row that looks like a run/pass conversion, not a kick (see the docstring)."""
    return (row["season"] >= 1960 and row["fg_att"] == 0 and row["xp_att"] <= 2
            and not kicker_pos(row["pos"]))


def load_josephvm():
    frames = []
    for season in range(1966, LAST_SEASON + 1):
        d = read_zip_csv("josephvm.zip", f"reg/reg_{season}.csv")
        d["season"] = season
        frames.append(d)
    d = pd.concat(frames, ignore_index=True)
    for col in d.columns:
        if col not in ("Player", "Team"):
            d[col] = num(d[col])
    d = d[(d["FG Att"] > 0) | (d["XPA"] > 0) | (d["FGM"] > 0) | (d["XPM"] > 0)].copy()
    has_buckets = d["season"] >= BUCKETS_FROM
    marker = d["Player"].map(namesake_marker)
    out = pd.DataFrame({
        "name": d["Player"].map(clean_name),
        "season": d["season"].astype(int),
        "team": d["Team"].map(lambda t: JOSEPHVM_CODES.get(t, t)),
        "fg_made": d["FGM"], "fg_att": d["FG Att"], "xp_made": d["XPM"], "xp_att": d["XPA"],
        "b_0_39": (d["1-19_M"] + d["20-29_M"] + d["30-39_M"]).where(has_buckets),
        "b_40_49": d["40-49_M"].where(has_buckets),
        "b_50": d["50+_M"].where(has_buckets),
        "source": "josephvm",
    })
    # "Wayne Walker (1)" is a different person from "Wayne Walker": keep the marker in the key.
    out["key"] = [name_key(n) + (f" {m + 1}" if m else "") for n, m in zip(out["name"], marker)]
    return frame(out)


def trev_names():
    return pd.concat([
        read_trev("Retired_Player_Basic_Stats (1).csv")[["Player_Id", "Full_Name"]],
        read_trev("Active_Player_Basic_Stats.csv")[["Player_Id", "Full_Name"]],
    ]).drop_duplicates("Player_Id")


TREV_TABLES = ["Passing", "Rushing", "Receiving", "Defense", "Fumbles", "KickReturns", "PuntReturns",
               "Punting", "Kicking"]


def load_trev_games():
    """(name key, season) -> games played, the most any trevyoungquist table shows."""
    frames = [read_trev(f"{w}Player_{t}_Stats.csv")[["Player_Id", "Year", "Games_Played"]]
              for w in ("Retired", "Active") for t in TREV_TABLES]
    d = pd.concat(frames)
    d = d[d["Year"] != "TOTAL"].merge(trev_names(), on="Player_Id", how="left")
    d["key"] = d["Full_Name"].map(name_key)
    d["season"] = num(d["Year"])
    d["games"] = num(d["Games_Played"])
    return d.dropna(subset=["season", "games"]).groupby(["key", "season"])["games"].max()


def load_trev():
    kick = pd.concat([read_trev(f"{w}Player_Kicking_Stats.csv") for w in ("Retired", "Active")])
    kick = kick[kick["Year"] != "TOTAL"].merge(trev_names(), on="Player_Id", how="left")
    kick["season"] = num(kick["Year"]).astype(int)
    kick = kick[kick["season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    kick["team"] = [code_from_name(t, s) for t, s in zip(kick["Team"], kick["season"])]
    kick = kick[kick["team"].notna()]  # AAFC
    out = pd.DataFrame({
        "name": kick["Full_Name"].map(clean_name),
        "season": kick["season"],
        "team": kick["team"],
        "games": num(kick["Games_Played"]),
        "fg_made": num(kick["FGs"]),
        "fg_att": num(kick["FG_Attempts"]),
        "source": "trevyoungquist",
    })
    out["key"] = out["name"].map(name_key)
    return frame(out)


def load_kg():
    d = read_zip_csv("kendallgillies.zip", "Career_Stats_Field_Goal_Kickers.csv", dtype=str, low_memory=False)
    d["season"] = num(d["Year"]).astype(int)
    d = d[d["season"].between(FIRST_SEASON, LAST_SEASON)].copy()
    d["team"] = [code_from_name(t, s) for t, s in zip(d["Team"], d["season"])]
    d = d[d["team"].notna()]  # AAFC
    out = pd.DataFrame({
        "name": d["Name"].map(first_last).map(clean_name),
        "season": d["season"],
        "team": d["team"],
        "games": num(d["Games Played"]),
        "fg_made": num(d["FGs Made"]), "fg_att": num(d["FGs Attempted"]),
        "xp_made": num(d["Extra Points Made"]), "xp_att": num(d["Extra Points Attempted"]),
        "source": "kendallgillies",
    })
    out["key"] = out["name"].map(name_key)
    return frame(out)


def load_kg_index():
    """From every kendallgillies career file: (name key, season) -> team codes the player
    appeared for (games > 0), and (name key, season) -> games summed over those teams."""
    with zipfile.ZipFile(raw("kendallgillies.zip")) as zf:
        members = sorted(m for m in zf.namelist() if m.startswith("Career_Stats_"))
    frames = [read_zip_csv("kendallgillies.zip", m, dtype=str, usecols=["Name", "Year", "Team", "Games Played"])
              for m in members]
    d = pd.concat(frames)
    d["season"] = num(d["Year"])
    d = d[d["season"].between(FIRST_SEASON, LAST_SEASON) & d["Team"].notna()].copy()
    d["season"] = d["season"].astype(int)
    d["games"] = num(d["Games Played"])
    d = d[d["games"].isna() | (d["games"] > 0)]

    def code(team, season):
        try:
            return code_from_name(team, season)
        except KeyError:
            return None

    d["team"] = [code(t, s) for t, s in zip(d["Team"], d["season"])]
    d = d[d["team"].notna()]
    d["key"] = d["Name"].map(first_last).map(name_key)
    per_team = d.groupby(["key", "season", "team"])["games"].max()
    teams = {k: set(g.index.get_level_values("team")) for k, g in per_team.groupby(level=["key", "season"])}
    games = per_team.groupby(level=["key", "season"]).sum(min_count=1)
    return teams, games


# --- matching -------------------------------------------------------------------


def match_rows(left, right, label, log, alias=None):
    """Pair rows of two sources for the same player-season.

    Exact name key first (team breaks ties); then, for what's left, a unique
    candidate in the same season with the same surname and first initial.
    Returns {left index: right index}; fills alias[left key] = right key for the
    fuzzy matches so the same spelling can be fixed in other seasons.
    """
    pairs, used = {}, set()
    by_key = {}
    for ri, (k, s) in enumerate(zip(right["key"], right["season"])):
        by_key.setdefault((k, s), []).append(ri)
    for li, row in left.iterrows():
        cands = [ri for ri in by_key.get((row["key"], row["season"]), []) if ri not in used]
        if len(cands) > 1:
            cands = [ri for ri in cands if right.at[ri, "team"] == row["team"]]
        if len(cands) == 1:
            pairs[li] = cands[0]
            used.add(cands[0])
    by_surname = {}
    for ri, (k, s) in enumerate(zip(right["key"], right["season"])):
        by_surname.setdefault((surname_initial(k), s), []).append(ri)
    for li, row in left.iterrows():
        if li in pairs:
            continue
        cands = [ri for ri in by_surname.get((surname_initial(row["key"]), row["season"]), [])
                 if ri not in used]
        if len(cands) == 1:
            ri = cands[0]
            pairs[li] = ri
            used.add(ri)
            if alias is not None:
                alias[row["key"]] = right.at[ri, "key"]
            log.append(f"  {label}: matched {row['name']!r} {row['season']} {row['team']} "
                       f"to {right.at[ri, 'name']!r} {right.at[ri, 'team']}")
    return pairs


# --- build ----------------------------------------------------------------------

# Verified corrections that no bulk source gets right (see the docstring).
# The first stint of three 1966-68 seasons that josephvm and PFR both miss. trevyoungquist
# has these FG numbers but under the later team; the XP and the team come from PFR's
# per-team lines (checked by web search) and statscrew (Mercer OAK 1966: 2/3 XP, 1/4 FG).
# Gene Mingo 1964 OAK: 7 games after his DEN stint, no kicks (nfl.com career page).
MANUAL_ROWS = [
    {"name": "Mike Mercer", "season": 1966, "team": "OAK", "games": 2, "fg_made": 1, "fg_att": 4,
     "xp_made": 2, "xp_att": 3, "source": "manual"},
    {"name": "Gene Mingo", "season": 1967, "team": "MIA", "games": 6, "fg_made": 1, "fg_att": 6,
     "xp_made": 9, "xp_att": 9, "source": "manual"},
    {"name": "Mike Mercer", "season": 1968, "team": "BUF", "games": 3, "fg_made": 0, "fg_att": 4,
     "xp_made": 4, "xp_att": 4, "source": "manual"},
    {"name": "Gene Mingo", "season": 1964, "team": "OAK", "games": 7, "fg_made": 0, "fg_att": 0,
     "xp_made": 0, "xp_att": 0, "source": "manual"},
]
# Games of one stint where the sources' games belong to another stint (nfl.com career pages).
MANUAL_GAMES = {("mike mercer", 1966, "KAN"): 10, ("gene mingo", 1967, "WAS"): 6,
                ("mike mercer", 1968, "GNB"): 6, ("gene mingo", 1964, "DEN"): 7,
                ("bill shockley", 1961, "BUF"): 2, ("bill shockley", 1961, "NYT"): 6}


STATE = {}  # facts build() hands to the checks


def load_afl():
    """AFL 1960-1965 kicker stints from AFL_KICKING, with AFL_OVERRIDES applied."""
    rows = []
    for (season, team), (kickers, _totals) in AFL_KICKING.items():
        for name, xpm, xpa, fgm, fga in kickers:
            row = {"name": name, "season": season, "team": team, "xp_made": xpm, "xp_att": xpa,
                   "fg_made": fgm, "fg_att": fga, "source": "statscrew"}
            fix = AFL_OVERRIDES.get((name, season, team))
            if fix:
                row.update({k: v for k, v in fix.items() if k != "why"})
                row["source"] = "statscrew+manual"
            rows.append(row)
    out = pd.DataFrame(rows)
    out["key"] = out["name"].map(name_key)
    return frame(out)


def check_afl(afl, trev, kg, log):
    """Compare the AFL table with NFL.com (trevyoungquist FG by player-season, kendallgillies
    XP by player-team-season). Returns differences not listed in AFL_NFLCOM_DIFFERENCES."""
    unexplained = []
    mine = afl.groupby(["key", "season"])[["fg_made", "fg_att"]].sum()
    t = trev[trev["season"].between(1960, 1965) & afl_mask(trev)]
    t = t[(t["fg_att"] > 0) | (t["fg_made"] > 0)]  # rows of '--' carry no kicking line
    theirs = t.groupby(["key", "season"])[["fg_made", "fg_att"]].sum()
    found = set()
    for k in theirs.index:
        if k not in mine.index:
            unexplained.append(f"NFL.com has {k} but statscrew does not")
            continue
        if tuple(mine.loc[k]) != tuple(theirs.loc[k]):
            found.add(k)
            log.append(f"  AFL vs NFL.com {k[0]} {k[1]}: FG {mine.loc[k, 'fg_made']:.0f}/{mine.loc[k, 'fg_att']:.0f}"
                       f" vs {theirs.loc[k, 'fg_made']:.0f}/{theirs.loc[k, 'fg_att']:.0f}"
                       f" -- {AFL_NFLCOM_DIFFERENCES.get(k, 'UNEXPLAINED')}")
    unexplained += [f"{k} differs from NFL.com" for k in found - set(AFL_NFLCOM_DIFFERENCES)]
    unexplained += [f"{k} listed but agrees with NFL.com" for k in set(AFL_NFLCOM_DIFFERENCES) - found]
    k_afl = kg[kg["season"].between(1960, 1965) & afl_mask(kg) & kg["xp_att"].notna()]
    mine = afl.set_index(["key", "season", "team"])
    for _, r in k_afl.iterrows():
        k = (r["key"], r["season"], r["team"])
        if k not in mine.index:
            if r["xp_att"] > 0 or r["fg_att"] > 0:
                unexplained.append(f"kendallgillies has {k} but statscrew does not")
            continue
        m = mine.loc[k]
        if (m["xp_made"], m["xp_att"]) != (r["xp_made"], r["xp_att"]):
            unexplained.append(f"XP {k}: {m['xp_made']}/{m['xp_att']} vs kendallgillies {r['xp_made']}/{r['xp_att']}")
        if (pd.notna(r["fg_att"]) and (m["fg_made"], m["fg_att"]) != (r["fg_made"], r["fg_att"])
                and k[:2] not in AFL_NFLCOM_DIFFERENCES):
            unexplained.append(f"FG {k}: {m['fg_made']}/{m['fg_att']} vs kendallgillies {r['fg_made']}/{r['fg_att']}")
    return unexplained


def build(log):
    pfr = load_pfr()
    jvm = load_josephvm()
    trev = load_trev()
    kg = load_kg()
    kg_teams, kg_games = load_kg_index()
    alias = {}  # other sources' spelling -> PFR's ("tilly manton" -> "tillie manton")
    dropped = []  # run/pass conversions taken out (see run_pass_pat)

    confirmed = set(KICK_ALLOWLIST) | set(zip(jvm["key"], jvm["season"]))
    confirmed |= set(zip(kg.loc[kg["xp_att"].fillna(0) > 0, "key"], kg.loc[kg["xp_att"].fillna(0) > 0, "season"]))
    STATE["confirmed_kicks"] = confirmed

    def confirmed_kick(key, season):
        return (key, season) in confirmed

    rows = []

    # 1922-1965 NFL: PFR, plus kendallgillies rows PFR lacks.
    pfr_old = pfr[pfr["season"] < 1966].reset_index(drop=True)
    drop = [run_pass_pat(r) and not confirmed_kick(r["key"], r["season"])
            for _, r in pfr_old.iterrows()]
    dropped += [f"{r['name']} {r['season']} {r['team']} ({r['pos']})" for (_, r), d in zip(pfr_old.iterrows(), drop) if d]
    pfr_old = pfr_old[[not d for d in drop]].reset_index(drop=True)
    rows.append(pfr_old)
    kg_nfl = kg[(kg["season"] < 1966) & ~afl_mask(kg)].reset_index(drop=True)
    kg_nfl = kg_nfl[(kg_nfl[["fg_made", "fg_att", "xp_made", "xp_att"]].fillna(0) > 0).any(axis=1)]
    kg_nfl = kg_nfl.reset_index(drop=True)
    paired = match_rows(kg_nfl, pfr_old, "kendallgillies->PFR", log, alias)
    # A PFR "2TM" row already holds every stint, so any kendallgillies row for a
    # player-season PFR has (under either spelling) is covered. So is a row whose
    # surname, season, team and numbers equal a PFR row's (one person, two first names).
    covered = set(zip(pfr_old["key"], pfr_old["season"]))
    covered |= {(kg_nfl.at[i, "key"], kg_nfl.at[i, "season"]) for i in paired}
    stat_cols = ["fg_made", "fg_att", "xp_made", "xp_att"]
    pfr_lines = {(k.split()[-1], s, t, *(-1 if pd.isna(v) else v for v in vals))
                 for k, s, t, *vals in pfr_old[["key", "season", "team", *stat_cols]].itertuples(index=False)}
    keep = []
    for _, r in kg_nfl.iterrows():
        line = (r["key"].split()[-1], r["season"], r["team"],
                *(-1 if r["season"] < ATTEMPTS_FROM and c.endswith("_att") else r[c] for c in stat_cols))
        known = (r["key"], r["season"]) in covered or (alias.get(r["key"], r["key"]), r["season"]) in covered
        if line in pfr_lines and not known:
            log.append(f"  kendallgillies {r['name']} {r['season']} {r['team']} equals a PFR line "
                       f"under another first name: skipped")
        keep.append(line not in pfr_lines and not known)
    extra = kg_nfl[keep].copy()
    early = extra["season"] < ATTEMPTS_FROM
    for c in ("fg_made", "fg_att", "xp_made", "xp_att"):
        extra[c] = extra[c].fillna(0)
    extra["fg_att"] = extra["fg_att"].mask(early)
    extra["xp_att"] = extra["xp_att"].mask(early)
    for _, r in extra.iterrows():
        log.append(f"  added from kendallgillies (not in PFR): {r['name']} {r['season']} {r['team']} "
                   f"FG {r['fg_made']:.0f}/{r['fg_att']:.0f} XP {r['xp_made']:.0f}/{r['xp_att']:.0f}")
    rows.append(frame(extra))

    # 1960-1965 AFL: statscrew team pages, settled against NFL.com and PFA.
    afl = load_afl()
    STATE["afl_unexplained"] = check_afl(afl, trev, kg, log)
    STATE["afl_stints"] = afl
    for (name, season, team), fix in AFL_OVERRIDES.items():
        log.append(f"  AFL override {name} {season} {team}: "
                   + ", ".join(f"{k}={v}" for k, v in fix.items() if k != "why") + f" ({fix['why']})")
    rows.append(afl)

    # 1966-1998: josephvm backbone, PFR totals wherever PFR has the player-season.
    pfr_new = pfr[pfr["season"] >= 1966].reset_index(drop=True)
    paired = match_rows(jvm, pfr_new, "josephvm->PFR", log, alias)
    team_disagree = 0
    new_rows = []
    for ji, j in jvm.iterrows():
        if ji not in paired:
            new_rows.append(j.to_dict())
            continue
        p = pfr_new.loc[paired[ji]].to_dict()
        if not re.fullmatch(r"\dTM", p["team"]) and p["team"] != j["team"]:
            team_disagree += 1
            log.append(f"  team code disagree {j['name']} {j['season']}: josephvm {j['team']} PFR {p['team']}")
        diff = [c for c in ("fg_made", "fg_att", "xp_made", "xp_att") if j[c] != p[c]]
        if diff:
            log.append(f"  josephvm vs PFR {p['name']} {p['season']} {p['team']}: " + ", ".join(
                f"{c} {j[c]:.0f}->{p[c]:.0f}" for c in diff))
        row = dict(p)
        if pd.notna(j["b_0_39"]) and j["fg_made"] <= p["fg_made"]:
            row.update(b_0_39=j["b_0_39"], b_40_49=j["b_40_49"], b_50=j["b_50"])
            row["source"] = "michaelmallari+josephvm"
        new_rows.append(row)
    # PFR rows josephvm lacks. Those without FG attempts and with a non-kicker position are
    # run/pass conversions: josephvm's kicking tables list kicked attempts only.
    for pi in sorted(set(range(len(pfr_new))) - set(paired.values())):
        r = pfr_new.loc[pi]
        if run_pass_pat(r) and not confirmed_kick(r["key"], r["season"]):
            dropped.append(f"{r['name']} {r['season']} {r['team']} ({r['pos']})")
            continue
        new_rows.append(r.to_dict())
    log.append(f"  dropped {len(dropped)} run/pass conversions credited as XP (1960+, FGA 0, XPA <= 2, "
               f"PFR position not K/P, no kicking-table record):")
    log.append("    " + ", ".join(dropped))
    STATE["dropped_pats"] = dropped
    # Traded 1966-69 kickers that PFR lacks: trevyoungquist holds a different stint than josephvm.
    trev_fg = trev.groupby(["key", "season"])[["fg_made", "fg_att"]].sum()
    manual_keys = {(name_key(r["name"]), r["season"]) for r in MANUAL_ROWS}
    unexplained = []
    for ji, j in jvm[jvm["season"] <= 1969].iterrows():
        if ji in paired or (j["key"], j["season"]) not in trev_fg.index:
            continue
        t = trev_fg.loc[(j["key"], j["season"])]
        if (t["fg_made"], t["fg_att"]) != (j["fg_made"], j["fg_att"]):
            known = (j["key"], j["season"]) in manual_keys
            log.append(f"  josephvm/trev stint split {j['name']} {j['season']}: josephvm {j['team']} "
                       f"{j['fg_made']:.0f}/{j['fg_att']:.0f}, trev {t['fg_made']:.0f}/{t['fg_att']:.0f}"
                       f" -> {'handled in MANUAL_ROWS' if known else 'UNEXPLAINED'}")
            if not known:
                unexplained.append(f"{j['name']} {j['season']}")
    STATE["unexplained_splits"] = unexplained
    rows.append(frame(pd.DataFrame(new_rows)))
    log.append(f"  josephvm/PFR team-code disagreements on single-team rows: {team_disagree}")

    manual = pd.DataFrame(MANUAL_ROWS)
    manual["key"] = manual["name"].map(name_key)
    rows.append(frame(manual))

    df = pd.concat(rows, ignore_index=True)
    df["season"] = df["season"].astype(int)
    for c in ("games", "fg_made", "fg_att", "b_0_39", "b_40_49", "b_50", "xp_made", "xp_att"):
        df[c] = pd.to_numeric(df[c]).astype("float64")

    # Games: fill gaps from trevyoungquist kicking, kendallgillies kicking (summed over stints),
    # then any trevyoungquist table, then any kendallgillies file (looked up by the source's own key).
    for (key, season, team), g in MANUAL_GAMES.items():
        at = (df["key"] == key) & (df["season"] == season) & (df["team"] == team)
        assert at.sum() == 1, (key, season, team)
        df.loc[at, "games"] = g
    # Looked up by (name, season, team) first so two namesakes' games never add up.
    base_key = df["key"].str.replace(r" \d+$", "", regex=True)  # namesake marker off
    trev_kick = trev[(trev["fg_att"] > 0) | (trev["fg_made"] > 0)]  # not the '--' stub rows (Davidson 1962: 1 g)
    by_team = [src.groupby(["key", "season", "team"])["games"].max() for src in (trev_kick, kg)]
    by_season = [trev_kick.groupby(["key", "season"])["games"].sum(min_count=1),
                 kg.groupby(["key", "season"])["games"].sum(min_count=1),
                 load_trev_games(), kg_games]
    for games in by_team:
        fill = pd.Series([games.get(k, float("nan")) for k in zip(base_key, df["season"], df["team"])],
                         index=df.index, dtype="float64")
        df["games"] = df["games"].fillna(fill)
    for games in by_season:
        fill = pd.Series([games.get(k, float("nan")) for k in zip(base_key, df["season"])],
                         index=df.index, dtype="float64")
        df["games"] = df["games"].fillna(fill)

    # Multi-team PFR rows ("2TM"): MANUAL_TEAMS, else kendallgillies when it agrees on the count.
    spellings = {}
    for other, pfr_key in alias.items():
        spellings.setdefault(pfr_key, set()).add(other)
    unresolved, used = [], set()
    for i in df.index[df["team"].str.fullmatch(r"\dTM")]:
        n = int(df.at[i, "team"][0])
        key, season = df.at[i, "key"], df.at[i, "season"]
        if (key, season) in MANUAL_TEAMS:
            df.at[i, "team"] = MANUAL_TEAMS[(key, season)]
            used.add((key, season))
            continue
        teams = set()
        for k in {key} | spellings.get(key, set()):
            teams |= kg_teams.get((k, season), set())
        if len(teams) == n:
            df.at[i, "team"] = "/".join(sorted(teams))
        else:
            unresolved.append(f"{df.at[i, 'name']} {df.at[i, 'season']} {df.at[i, 'team']}")
    STATE["manual_teams_unused"] = sorted(set(MANUAL_TEAMS) - used)
    log.append(f"  multi-team rows left as PFR's NTM (no per-team source): {len(unresolved)}")
    log.append("    " + ", ".join(unresolved))

    # One spelling per person, PFR's where a fuzzy match found it.
    df["key"] = df["key"].map(lambda k: alias.get(k, k))
    STATE["pfr_pos"] = {(name_key(n), s): p for n, s, p in zip(pfr["name"], pfr["season"], pfr["pos"])}
    return df


def assign_ids(df, log):
    """One player_id per person: "k:" + name slug (namesakes carry josephvm's marker in the key)."""
    df["player_id"] = "k:" + df["key"].str.replace(" ", "-", regex=False)
    # One display name per id: PFR's spelling when the person has PFR rows, else the latest source's.
    pref = df.assign(pfr=df["source"].str.contains("michaelmallari"))
    names = (pref.sort_values(["pfr", "season"], ascending=[False, False])
             .groupby("player_id")["name"].first())
    df["name"] = df["player_id"].map(names)
    # Review aid: the same id with a long gap between kicking seasons.
    for pid, g in df.groupby("player_id"):
        seasons = sorted(set(g["season"]))
        gaps = [(a, b) for a, b in zip(seasons, seasons[1:]) if b - a >= 8]
        if gaps:
            log.append(f"  long gap for {pid}: {gaps} teams {sorted(set(g['team']))}")
    return df


SOURCE_ORDER = ["michaelmallari", "josephvm", "statscrew", "kendallgillies", "trevyoungquist", "manual"]


def aggregate(df):
    """One row per player_id and season, summing stints (unknown parts are left out of a sum)."""
    df = df.sort_values(["player_id", "season", "team", "source"]).reset_index(drop=True)
    out = []
    for (pid, season), g in df.groupby(["player_id", "season"], sort=True):
        teams = []
        for t in g["team"]:
            for part in t.split("/"):
                if part not in teams:
                    teams.append(part)
        teams = sorted(teams) if len(teams) > 1 else teams
        row = {"player_id": pid, "name": g["name"].iloc[0], "season": season,
               "team": "/".join(teams),
               "team_name": " / ".join(team_name(t, season) for t in teams),
               "source": "+".join(sorted(set("+".join(g["source"]).split("+")), key=SOURCE_ORDER.index))}
        for c in ("games", "fg_made", "fg_att", "xp_made", "xp_att"):
            row[c] = g[c].sum(min_count=1)
        known = g["b_0_39"].notna()
        row["fg_made_0_39"] = g.loc[known, "b_0_39"].sum()
        row["fg_made_40_49"] = g.loc[known, "b_40_49"].sum()
        row["fg_made_50_plus"] = g.loc[known, "b_50"].sum()
        out.append(row)
    out = pd.DataFrame(out)
    out["fg_made_unknown"] = out["fg_made"] - out[["fg_made_0_39", "fg_made_40_49", "fg_made_50_plus"]].sum(axis=1)
    out["position"] = "K"
    return out


def attach_pfr_ids(df, log):
    players = pd.read_csv(raw("nflverse_players.csv"), low_memory=False,
                          usecols=["gsis_id", "display_name", "position", "pfr_id", "rookie_season", "last_season"])
    k = players[(players["position"] == "K") & players["pfr_id"].notna() & players["gsis_id"].notna()
                & (players["last_season"] > LAST_SEASON)].copy()
    k["key"] = k["display_name"].map(name_key)
    span = df.groupby("player_id")["season"].agg(["min", "max"])
    keys = df.groupby("player_id")["name"].first().map(name_key)
    ids = {}
    for pid, key in keys.items():
        first, last = span.loc[pid, "min"], span.loc[pid, "max"]
        cand = k[k["key"] == key]
        cand = cand[cand["rookie_season"].isna() | ((cand["rookie_season"] - first).abs() <= 2)]
        if last < 1990 or cand.empty:
            continue
        if len(cand) > 1:
            log.append(f"  ambiguous nflverse match for {pid}: {list(cand['pfr_id'])}")
            continue
        ids[pid] = cand["pfr_id"].iloc[0]
    df["pfr_id"] = df["player_id"].map(ids)
    log.append(f"  pfr_id attached to {len(ids)} kickers who also kicked after {LAST_SEASON}")
    return df


# --- summary & checks -------------------------------------------------------------


def fantasy_points(df):
    """3/FG (under 40 or unknown distance), 4/40-49, 5/50+, -1/miss, 1/XP, -1/missed XP.
    Unknown attempts count as no misses."""
    fg_att = df["fg_att"].fillna(df["fg_made"])
    xp_att = df["xp_att"].fillna(df["xp_made"])
    xp_made = df["xp_made"].fillna(0)
    return (3 * (df["fg_made_0_39"] + df["fg_made_unknown"]) + 4 * df["fg_made_40_49"]
            + 5 * df["fg_made_50_plus"] - (fg_att - df["fg_made"]) + xp_made - (xp_att.fillna(0) - xp_made))


def load_team_points():
    """octonion standings -> {(PFR code, season): (points for, touchdowns)}, NFL and AFL."""
    d = pd.read_csv(raw("octonion_nfl_team_standings.csv"), sep="\t")
    d = d[d["season"].between(FIRST_SEASON, LAST_SEASON)]
    out, unmapped = {}, []
    for season, name, pf, td in zip(d["season"], d["team_name"], d["points_for"], d["touchdowns"]):
        try:
            code = code_from_name(name, season)
        except KeyError:  # a team with no kicker rows in TEAMS (e.g. 1920-21 clubs)
            unmapped.append(f"{name} {season}")
            continue
        if code is not None:
            out[(code, int(season))] = (int(pf), int(td))
    STATE["standings_unmapped"] = unmapped
    return out


def team_remainders(rows, points):
    """PF - 6*TD - XP - 3*FG per team-season: what is left for safeties and 2-point
    conversions. Only team-seasons where every kicker row names that one team."""
    multi = {(t, s) for team, s in zip(rows["team"], rows["season"]) if "/" in team or "TM" in team
             for t in team.split("/")}
    single = rows[~rows["team"].str.contains("/|TM")]
    kick = single.assign(pts=single["xp_made"].fillna(0) + 3 * single["fg_made"]).groupby(["team", "season"])["pts"].sum()
    out = {}
    for (team, season), pts in kick.items():
        if (team, season) in multi or (team, season) not in points:
            continue
        pf, td = points[(team, season)]
        out[(team, season)] = pf - 6 * td - pts
    return pd.Series(out, dtype="float64")


def summarize(df):
    df = df.copy()
    df["decade"] = df["season"] // 10 * 10
    df["fp"] = fantasy_points(df)
    print(f"\n{len(df)} kicker seasons, {df['player_id'].nunique()} kickers, seasons "
          f"{df['season'].min()}-{df['season'].max()}")
    print("\nRows per decade:")
    for d, n in df.groupby("decade").size().items():
        print(f"  {d}s: {n}")
    print("\nRows per season:")
    per = df.groupby("season").size()
    for d in sorted(df["decade"].unique()):
        print("  " + "  ".join(f"{s}:{per.get(s, 0):>3}" for s in range(d, d + 10) if s in per.index))
    print("\nUnknown cells per decade (rows with an empty value):")
    for col in ("fg_att", "xp_made", "xp_att", "pfr_id"):
        counts = df[df[col].isna()].groupby("decade").size()
        print(f"  {col:8s} " + ", ".join(f"{d}s:{n}" for d, n in counts.items()))
    multi = df[df["team"].str.fullmatch(r"\dTM")]
    print(f"\nRows whose teams no source splits ({len(multi)}, all 1922-1945): "
          + ", ".join(f"{n} {s}" for n, s in zip(multi["name"], multi["season"])))
    print("\nTop 10 kickers per decade by fantasy points (unknown attempts = no misses):")
    for d, g in df.groupby("decade"):
        tot = g.groupby("player_id").agg(name=("name", "first"), fp=("fp", "sum"), fg=("fg_made", "sum"),
                                          xp=("xp_made", "sum"), seasons=("season", "nunique"))
        tot = tot.sort_values(["fp", "name"], ascending=[False, True]).head(10)
        print(f"  {d}s:")
        for rank, (_, r) in enumerate(tot.iterrows(), 1):
            print(f"    {rank:2d}. {r['name']:<22s} {r['fp']:7.0f} fp  FG {r['fg']:.0f}  XP {r['xp']:.0f}  "
                  f"({r['seasons']} seasons)")


def run_checks(df):
    results = []

    def check(desc, ok, detail=""):
        results.append(bool(ok))
        print(f"  [{'PASS' if ok else 'FAIL'}] {desc}{(' -- ' + detail) if detail else ''}")

    def line(name, season):
        g = df[(df["name"] == name) & (df["season"] == season)]
        return g.iloc[0] if len(g) == 1 else None

    def stat_check(name, season, desc, **want):
        r = line(name, season)
        if r is None:
            check(f"{name} {season} {desc}", False, "row missing or duplicated")
            return
        got = {k: (None if pd.isna(r[k]) else (r[k] if isinstance(r[k], str) else int(r[k]))) for k in want}
        check(f"{name} {season} {desc}", got == want, str(got))

    print("\nSelf-checks (known stat lines):")
    stat_check("Lou Groza", 1953, "FG 23/26 XP 39/40", fg_made=23, fg_att=26, xp_made=39, xp_att=40)
    stat_check("Jan Stenerud", 1970, "FG 30/42 XP 26/26", fg_made=30, fg_att=42, xp_made=26, xp_att=26)
    stat_check("Garo Yepremian", 1971, "FG 28/40 XP 33/33", fg_made=28, fg_att=40, xp_made=33, xp_att=33)
    stat_check("Mark Moseley", 1982, "FG 20/21 XP 16/19", fg_made=20, fg_att=21, xp_made=16, xp_att=19)
    stat_check("Morten Andersen", 1995, "FG 31/37, 8 from 50+", fg_made=31, fg_att=37, fg_made_50_plus=8,
               fg_made_unknown=0)
    stat_check("Gary Anderson", 1998, "FG 35/35 XP 59/59 (perfect)", fg_made=35, fg_att=35, xp_made=59, xp_att=59)
    stat_check("Gino Cappelletti", 1964, "AFL, 25 FG, BOS", fg_made=25, team="BOS")
    print("  -- independent web lookups --")
    stat_check("Jim Turner", 1968, "FG 34/46 XP 43/43 (footballdb)", fg_made=34, fg_att=46, xp_made=43, xp_att=43)
    stat_check("Paul Hornung", 1960, "15 FG, 41 XP (Britannica: 176 pts)", fg_made=15, xp_made=41)
    stat_check("Gene Mingo", 1962, "AFL FG 27/39 (NFL.com, Statscrew)", fg_made=27, fg_att=39)
    stat_check("Chester Marcol", 1972, "FG 33/48, 128 pts = 99 + 29 XP", fg_made=33, fg_att=48, xp_made=29)
    stat_check("Jack Manders", 1934, "10 FG, attempts unknown", fg_made=10, fg_att=None)
    stat_check("Mike Mercer", 1966, "AFL OAK+KAN 21/30, XP 33/35 + 2/3 (statscrew KC, OAK 1966), 12 g", fg_made=21,
               fg_att=30, xp_made=35, xp_att=38, team="KAN/OAK", games=12)
    stat_check("Mike Mercer", 1968, "BUF+GNB 7/16 FG, 16/18 XP, 9 g (PFR)", fg_made=7, fg_att=16, xp_made=16,
               xp_att=18, games=9, team="BUF/GNB")
    stat_check("Gene Mingo", 1967, "MIA+WAS 5/16 FG (NFL.com log)", fg_made=5, fg_att=16, team="MIA/WAS")
    print("  -- AFL 1960-65 (statscrew, PFA, NFL.com) --")
    stat_check("George Blanda", 1961, "XP 64/65 (Wikipedia/PFR), FG 16/29 (PFA, NFL.com)", xp_made=64, xp_att=65,
               fg_made=16, fg_att=29)
    blanda = df[df["name"] == "George Blanda"]
    check("George Blanda career XP 943/959 (PFR, Wikipedia)",
          (blanda["xp_made"].sum(), blanda["xp_att"].sum()) == (943, 959),
          f"{blanda['xp_made'].sum()}/{blanda['xp_att'].sum()}")
    stat_check("Gene Mingo", 1964, "DEN 8/12 FG 9/10 XP, then 7 g at OAK (nfl.com)", team="DEN/OAK", games=14,
               fg_made=8, fg_att=12, xp_made=9, xp_att=10)
    mingo = df[df["name"] == "Gene Mingo"]
    check("Gene Mingo career FG 112/219 (PFR via Wikipedia)",
          (mingo["fg_made"].sum(), mingo["fg_att"].sum()) == (112, 219),
          f"{mingo['fg_made'].sum()}/{mingo['fg_att'].sum()}")
    brooker = df[df["name"] == "Tommy Brooker"]
    check("Tommy Brooker career FG 41/87 (PFR Chiefs table, NFL.com), XP 149/149",
          (brooker["fg_made"].sum(), brooker["fg_att"].sum(), brooker["xp_made"].sum(), brooker["xp_att"].sum())
          == (41, 87, 149, 149))
    stat_check("Bill Shockley", 1961, "BUF 1/2 + NYT 3/7 FG, 13/13 XP, 2+6 g", team="BUF/NYT", games=8,
               fg_made=4, fg_att=9, xp_made=13, xp_att=13)
    stat_check("Charlie Milstead", 1961, "HOU XP-only kicker 1/1", xp_made=1, xp_att=1, fg_att=0)
    stat_check("Jim Fraser", 1962, "DEN XP-only kicker 2/2", xp_made=2, xp_att=2, team="DEN")
    stat_check("Mack Yoho", 1963, "XP 32/37 (NFL.com, PFA)", xp_made=32, xp_att=37)
    cap = df[df["name"] == "Gino Cappelletti"]
    check("Gino Cappelletti career 176 FG (PFR 176/333)", cap["fg_made"].sum() == 176, str(cap["fg_att"].sum()))
    print("  -- other fixes --")
    stat_check("Dave Smukler", 1938, "XP 6/6, FG 0/2 (PFA 1938nflphi)", xp_made=6, xp_att=6, fg_made=0, fg_att=2)
    ivy = df[df["name"].str.contains("Ivy")]
    check("Pop Ivy is one player_id with one 1942 row", ivy["player_id"].nunique() == 1
          and (ivy["season"] == 1942).sum() == 1, str(sorted(set(ivy["player_id"]))))
    check("run/pass PATs gone (Butkus 1971-72, Douglass 1971, Largent)",
          df[df["name"].isin(["Dick Butkus", "Bobby Douglass", "Steve Largent", "Brian Sipe"])].empty)
    stat_check("Deacon Jones", 1974, "kicked PAT 1/1 kept (josephvm)", xp_made=1, xp_att=1)
    stat_check("Mark Moseley", 1986, "CLE/WAS", team="CLE/WAS")
    print("  -- josephvm multi-team fix (PFR totals) --")
    stat_check("Greg Davis", 1989, "FG 23/34 over ATL+NWE", fg_made=23, fg_att=34, team="ATL/NWE")
    stat_check("Greg Davis", 1995, "FG 30/39 single team, buckets complete", fg_made=30, fg_att=39,
               fg_made_unknown=0)

    print("\nSelf-checks (structure):")
    check("columns in canonical order", list(df.columns) == COLUMNS)
    check("no unexplained josephvm/trevyoungquist stint splits (1966-69)",
          not STATE.get("unexplained_splits"), ", ".join(STATE.get("unexplained_splits", [])))
    check(f"seasons within {FIRST_SEASON}-{LAST_SEASON}", df["season"].between(FIRST_SEASON, LAST_SEASON).all())
    check("one row per player_id and season", not df.duplicated(["player_id", "season"]).any())
    check("position is always K", (df["position"] == "K").all())
    check("player_id has k: prefix", df["player_id"].str.startswith("k:").all())
    aafc = df[df["season"].between(1946, 1949) & df["team_name"].str.contains(
        "Dons|Hornets|Rockets|Seahawks|Yankees|Brooklyn|Bills|Bisons|Baltimore|Browns|49ers")]
    check("no AAFC teams 1946-49", aafc.empty, ", ".join(aafc["name"]))
    check("Lou Groza has no 1946-49 (AAFC) rows",
          df[(df["name"] == "Lou Groza") & df["season"].between(1946, 1949)].empty)
    afl_only = df[df["team"].isin(["NYT", "LAC"]) | ((df["team"] == "DTX") & (df["season"] >= 1960))]
    check("AFL-only teams (NYT, LAC, DTX 1960-62) present, only 1960-62",
          len(afl_only) >= 10 and afl_only["season"].between(1960, 1962).all(), f"{len(afl_only)} rows")
    afl_seasons = df[[all(is_afl(t, s) for t in team.split("/")) for team, s in zip(df["team"], df["season"])]]
    check("AFL kickers every season 1960-69", afl_seasons.groupby("season").size().reindex(
        range(1960, 1970), fill_value=0).min() >= 8)
    buckets = df["fg_made_0_39"] + df["fg_made_40_49"] + df["fg_made_50_plus"] + df["fg_made_unknown"]
    check("fg_made = buckets + unknown", (buckets == df["fg_made"]).all())
    check("fg_made_unknown >= 0", (df["fg_made_unknown"] >= 0).all())
    check("no distance buckets before 1991", (df.loc[df["season"] < BUCKETS_FROM,
                                                     ["fg_made_0_39", "fg_made_40_49", "fg_made_50_plus"]] == 0).all().all())
    check("1991+ distance mostly known", (df.loc[df["season"] >= BUCKETS_FROM, "fg_made_unknown"] == 0).mean() > 0.95)
    known = df["fg_att"].notna()
    check("fg_made <= fg_att", (df.loc[known, "fg_made"] <= df.loc[known, "fg_att"]).all())
    known = df["xp_att"].notna() & df["xp_made"].notna()
    check("xp_made <= xp_att", (df.loc[known, "xp_made"] <= df.loc[known, "xp_att"]).all())
    check("attempts empty exactly for 1922-1937",
          df.loc[df["season"] < ATTEMPTS_FROM, ["fg_att", "xp_att"]].isna().all().all()
          and df.loc[df["season"] >= ATTEMPTS_FROM, ["fg_att", "xp_att"]].notna().all().all())
    check("fg_made and xp_made known for every row", df[["fg_made", "xp_made"]].notna().all().all())
    late_ntm = df[(df["season"] > 1945) & df["team"].str.contains("TM")]
    check("no 2TM/3TM team after 1945", late_ntm.empty, ", ".join(late_ntm["name"]))
    check("every MANUAL_TEAMS entry used", not STATE["manual_teams_unused"], str(STATE["manual_teams_unused"]))
    pos, confirmed = STATE["pfr_pos"], STATE["confirmed_kicks"]
    suspect = df[(df["season"] >= 1960) & (df["fg_att"] == 0) & (df["xp_att"] <= 2)]
    suspect = suspect[[not (kicker_pos(pos.get((pid[2:].replace("-", " "), s)))
                            or re.search("josephvm|statscrew|kendallgillies", src)
                            or (pid[2:].replace("-", " "), s) in confirmed)
                       for pid, s, src in zip(suspect["player_id"], suspect["season"], suspect["source"])]]
    check("no 1960+ XP-only row from a non-K/P without a kicking-table record or allowlist", suspect.empty,
          ", ".join(f"{n} {s}" for n, s in zip(suspect["name"], suspect["season"])))

    print("\nSelf-checks (AFL 1960-65 table and team reconciliation, octonion standings):")
    bad = [k for k, (rows, tot) in AFL_KICKING.items()
           if tuple(sum(r[i] for r in rows) for i in range(1, 5)) != tot]
    check("statscrew transcription: kicker rows add up to each page's Totals row", not bad, str(bad))
    check("statscrew: all 48 AFL team-seasons 1960-65 transcribed", len(AFL_KICKING) == 48
          and all(sum(1 for s, _ in AFL_KICKING if s == y) == 8 for y in range(1960, 1966)))
    check("AFL table vs NFL.com: every difference explained", not STATE["afl_unexplained"],
          "; ".join(STATE["afl_unexplained"]))
    points = load_team_points()
    afl_rem = team_remainders(STATE["afl_stints"], points)
    check("AFL 1960-65: PF - 6*TD - XP - 3*FG is 0-10 and even for all 48 team-seasons (2-pt tries, safeties)",
          len(afl_rem) == 48 and afl_rem.between(0, 10).all() and (afl_rem % 2 == 0).all(),
          f"{len(afl_rem)} teams, range {afl_rem.min():.0f}..{afl_rem.max():.0f}")
    rem = team_remainders(df, points)
    late = rem[[s >= ATTEMPTS_FROM for _, s in rem.index]]
    check("1938-1998: no team-season has more kicking points than PF - 6*TD", (late >= 0).all() and len(late) > 900,
          f"{len(late)} team-seasons; negative: {list(late[late < 0].index)}")
    early = rem[[s < ATTEMPTS_FROM for _, s in rem.index]]
    print(f"  (info) 1922-1937: {(early < 0).sum()} of {len(early)} team-seasons negative: "
          f"{[(t, s, int(v)) for (t, s), v in early[early < 0].items()]}")
    check("games known for every row", df["games"].notna().all(), str(df[df["games"].isna()][["name", "season"]].values[:5]))
    check("every row has a team_name", df["team_name"].notna().all() and (df["team_name"] != "").all())
    check("1920-1921 have no rows (no source)", df[df["season"] <= 1921].empty)
    check("pfr_id only for kickers with 1990s seasons",
          df.loc[df["pfr_id"].notna(), "season"].groupby(df["player_id"]).max().min() >= 1990)
    check("Morten Andersen and Gary Anderson carry pfr_id",
          df.loc[df["name"].isin(["Morten Andersen", "Gary Anderson"]), "pfr_id"].notna().all())
    ww = df[(df["season"] == 1968) & df["name"].eq("Wayne Walker")]
    check("two different Wayne Walkers in 1968 (DET, HOU)", sorted(ww["team"]) == ["DET", "HOU"]
          and ww["player_id"].nunique() == 2)
    per_season = df.groupby("season").size()
    check("at least 15 kickers every season 1922-1998",
          per_season.reindex(range(1922, LAST_SEASON + 1), fill_value=0).min() >= 15,
          f"min {per_season.min()} in {per_season.idxmin()}")
    return all(results)


def main():
    log = []
    print("Building legacy kicker seasons ...", flush=True)
    df = build(log)
    df = assign_ids(df, log)
    out = aggregate(df)
    out = attach_pfr_ids(out, log)
    out = out[COLUMNS].sort_values(["season", "player_id"]).reset_index(drop=True)
    for col in ("season", "games", *KICKING_STATS):
        out[col] = pd.to_numeric(out[col]).round().astype("Int64")

    print("\nReconciliation notes:")
    for msg in log:
        print(msg)
    summarize(out)
    ok = run_checks(out)
    if not ok:
        print("\nSELF-CHECKS FAILED; not writing the CSV.", file=sys.stderr)
        sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"\nwrote {OUT.relative_to(ROOT)} ({len(out)} rows)")


if __name__ == "__main__":
    main()
