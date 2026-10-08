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
                  Also the 21 APFA team pages of 1921 (STATSCREW_1921), the
                  independent check of the 1921 PFA table.
  profootballarchives  Pro Football Archives (PFA) team-season pages
                  (profootballarchives.com/<season>apfa<team>.html), the SCORING
                  table of all 14 APFA teams of 1920 and all 21 of 1921, read once
                  and transcribed into EARLY_KICKING below; the rosters' games
                  played; and, for 1922-1945, the rosters and per-team PAT/FG lines
                  (profootballarchives.com/<season>nfl<team>.html) that split PFR's
                  "2TM" rows (MANUAL_TEAMS). For 1991-1998 also a few per-team
                  distance splits (MANUAL_BUCKETS).
  nflverse        players.csv, used only to attach pfr_id to kickers who also
                  played in 1999 or later, so their careers merge with nflverse.
  octonion        nfl_team_standings.csv (points for, touchdowns per team-season),
                  used only by the team reconciliation self-checks.

How each era is built:
  1920-1921 APFA  PFA team pages (EARLY_KICKING), checked against statscrew (1921),
                  the pages' own team totals and NFL.com's standings (octonion).
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
    NFL.com scrapes are dropped.
  * 1920-1921. PFR's scoring table (michaelmallari) starts in 1922 and the
    NFL.com kicking scrapes in 1926 (trevyoungquist) and 1933 (kendallgillies),
    so these two seasons come from the SCORING table of every PFA APFA team
    page (EARLY_KICKING: per kicker PAT and FG made, attempts when PFA has them,
    games from the page's roster). PFA counts only games between APFA members.
    For 1921 that is every game NFL.com's standings count: each PFA page's
    points and touchdowns equal octonion's for all 21 teams (a check), and the
    kicking matches statscrew's 1921 pages except one PAT (see
    STATSCREW_1921_DIFFERENCES). For 1920 NFL.com's standings also count games
    against non-members (Decatur 10-1-2 and 164 points, PFA 5-1-2 and 67), and
    no source has the kicking of those games, so the 1920 rows (and their games
    column) cover APFA-vs-APFA games only. A player's other-team stint without a
    kick is added from the PFA rosters (EARLY_STINTS), as for Gene Mingo 1964.
    Names follow PFR (later seasons) or NFL.com (the offense table) where PFA
    spells them differently (PFA's "Ed Sternaman" is PFR's Dutch Sternaman, see
    the comments in EARLY_KICKING). Where PFA and statscrew credit a kick to
    different players a third source decides: the 1921 Cardinals' FG is Ralph
    Horween's (statscrew and PFR's box score of 10/23/1921; PFA: Arnie Horween),
    and Canton's 7 PATs are all Al Feeney's (PFA's and PFR's box scores;
    statscrew credits one to Jim Morrow).
  * josephvm is the backbone for 1966-1998 as asked, but its per-season files
    keep only one team's stint for a player traded mid-season. For example,
    Greg Davis in 1989 shows 7/11 FG (ATL only) where the real total is 23/34
    (ATL+NWE). PFR's scoring table has the full multi-team totals, so from 1966
    on, wherever PFR has the player-season (all NFL rows, and every team from
    1970), PFR's FGM/FGA/XPM/XPA/G win. josephvm still supplies the distance
    buckets and the rows PFR lacks: kickers with attempts but no points, and
    the AFL 1966-69. On the 1,000+ single-team rows the two sources agree,
    except two off-by-one attempt counts.
  * Distance buckets, 1991+: fg_made_0_39 = 1-19 + 20-29 + 30-39, fg_made_40_49,
    fg_made_50_plus, from josephvm. Its row holds one stint of a kicker traded
    mid-season (and a few single-team kickers have no josephvm row), so the
    other stints come from kendallgillies' per-team NFL.com rows (20-29 + 30-39,
    40-49, 50+; used only when they add up to the stint's FGM, since the scrape
    has no 1-19 column), else from MANUAL_BUCKETS (NFL.com career pages and PFA
    team pages). A row takes them only when every made FG is then placed:
    fg_made_unknown = fg_made - buckets is 0 for every 1991+ row (a check). E.g.
    Greg Davis 1997 = SDG 14/5/0 (josephvm) + MIN 6/1/0 (kendallgillies).
    Before 1991, every made FG goes in fg_made_unknown and the buckets are 0.
  * PFR's scoring table records FG and XP attempts only from 1938. For
    1922-1937, fg_att and xp_att are empty (unknown), and a row is a kicker row
    when FGM or XPM is above 0. The same rule holds for 1920-1921: PFA has most
    attempts there, but they are kept only in EARLY_KICKING, not written, so
    that every pre-1938 season is scored alike (no misses counted); writing them
    would charge Elmer Oliphant 10 missed FGs in 1921 while no 1922-1937 kicker
    is charged any. From 1938 on, a row needs FGA > 0, XPA > 0 or
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
    RAM, STL, NYT, DTX, LAC, TEN, ...); 1920-21 clubs PFR has no tables for use
    the offense and defense tables' codes (DEC Decatur Staleys, CHT Chicago
    Tigers, MUN Muncie Flyers, TON Tonawanda Kardex, WSN Washington Senators).
    For a player on several teams in a season, the team column is "A/B" and
    team_name is "Name A / Name B", in alphabetical code order, because the
    sources do not say which stint came first. The teams of a PFR "2TM"/"3TM"/
    "4TM" row come from MANUAL_TEAMS, else from kendallgillies' per-team rows
    when they name exactly that many teams. MANUAL_TEAMS covers every row
    kendallgillies can't split: after 1945 from NFL.com career pages,
    Wikipedia and PFA; 1922-1945 from the PFA team pages, where the player is
    on each team's roster (games played) and his per-team PATs and FGs add up
    to PFR's row (e.g. Joey Sternaman 1923: Bears 2 PAT 1 FG, Duluth 2 PAT 5 FG
    = PFR's 4 and 6). No placeholder team is left (a check), so the joined
    teams string never shows "2TM".
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
  fg_att, xp_att   1920-1937 only: attempts were not recorded (PFR leaves them
                   blank; for 1920-21 see above). From 1938 on both are always
                   known.
  pfr_id           kickers with no nflverse (1999+) record.
  games            never empty in practice. The check below asserts it.
Every other cell is a known integer (buckets are 0 when distance is unknown).

NOTE for consumers: an empty fg_att or xp_att means attempts are unknown, not
zero. Fill them with fg_made and xp_made before scoring "missed" kicks, or the
misses come out negative. The 1920 rows cover APFA-vs-APFA games only (see
above), which a coverage note may want to say.
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

# (PFR code, first season, last season, name of the era). Only 1920-1998. 1920-21 clubs that
# PFR has no tables for carry the offense/defense tables' codes (DEC, CHT, MUN, TON, WSN).
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
    ("DEC", 1920, 1920, "Decatur Staleys"), ("CHI", 1921, 1921, "Chicago Staleys"),
    ("CHI", 1922, 1998, "Chicago Bears"),
    ("CHT", 1920, 1920, "Chicago Tigers"), ("CIN", 1921, 1921, "Cincinnati Celts"),
    ("CIN", 1933, 1934, "Cincinnati Reds"), ("CIN", 1968, 1998, "Cincinnati Bengals"),
    ("CLE", 1920, 1920, "Cleveland Tigers"), ("CLE", 1921, 1921, "Cleveland Indians"),
    ("CLE", 1924, 1927, "Cleveland Bulldogs"), ("CLE", 1931, 1931, "Cleveland Indians"),
    ("CLE", 1950, 1995, "Cleveland Browns"),
    ("CLI", 1923, 1923, "Cleveland Indians"),
    ("COL", 1920, 1922, "Columbus Panhandles"), ("COL", 1923, 1926, "Columbus Tigers"),
    ("CRD", 1920, 1959, "Chicago Cardinals"),
    ("DAL", 1960, 1998, "Dallas Cowboys"), ("DAY", 1920, 1929, "Dayton Triangles"),
    ("DEN", 1960, 1998, "Denver Broncos"),
    ("DET", 1920, 1920, "Detroit Heralds"), ("DET", 1921, 1921, "Detroit Tigers"),
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
    ("MUN", 1920, 1921, "Muncie Flyers"),
    ("MIA", 1966, 1998, "Miami Dolphins"), ("MIL", 1922, 1926, "Milwaukee Badgers"),
    ("MIN", 1921, 1924, "Minneapolis Marines"), ("MIN", 1929, 1930, "Minneapolis Red Jackets"),
    ("MIN", 1961, 1998, "Minnesota Vikings"),
    ("NOR", 1967, 1998, "New Orleans Saints"), ("NWE", 1971, 1998, "New England Patriots"),
    ("NYG", 1921, 1921, "New York Brickley Giants"), ("NYG", 1925, 1998, "New York Giants"),
    ("NYJ", 1963, 1998, "New York Jets"),
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
    ("TOL", 1922, 1923, "Toledo Maroons"), ("TON", 1921, 1921, "Tonawanda Kardex"),
    ("TOR", 1929, 1929, "Orange Tornadoes"), ("TOR", 1930, 1930, "Newark Tornadoes"),
    ("WAS", 1937, 1998, "Washington Redskins"), ("WSN", 1921, 1921, "Washington Senators"),
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

# --- APFA 1920-1921: Pro Football Archives team pages -----------------------------------

PFA_APFA = "https://www.profootballarchives.com/{}apfa{}.html"  # season, PFA team slug
# The SCORING table of every APFA team page (PFA_APFA, slug in the trailing comment), transcribed
# as (name, xp_made, xp_att, fg_made, fg_att, games) per player with a kick or a try, plus the
# page's Team Totals row (points, touchdowns, xp_made, xp_att, fg_made, fg_att). None = blank on
# PFA. games = the page roster's GP. Attempts are kept here but not written (see the docstring).
# Checks: the rows add up to the Totals; points - 6*TD - XP - 3*FG leaves only safeties; 1921
# points and TDs equal NFL.com's standings; 1921 matches statscrew (STATSCREW_1921).
EARLY_KICKING = {
    # 1920: games between APFA members only (NFL.com's 1920 standings also count other games).
    (1920, "AKR"): ([("Charlie Copley", 12, 13, 1, 1, 9), ("Chief Crawford", 0, 0, 0, 2, 5)],
                    (95, 13, 12, 13, 1, 3)),  # akr
    (1920, "BUF"): ([("Bodie Weldon", 5, 5, 1, 3, 5),  # PFA "John Weldon"; NFL.com and PFR "Bodie Weldon"
                     ("Ockie Anderson", 1, 1, 0, 1, 6), ("Tommy Hughitt", 3, 3, 0, 0, 6),
                     ("Heinie Miller", 0, 1, 0, 0, 6)], (74, 10, 9, 10, 1, 4)),  # buf
    (1920, "CAN"): ([("Al Feeney", 8, 8, 1, 1, 8), ("Jim Thorpe", 0, 0, 3, 9, 6), ("Joe Guyon", 0, 0, 0, 4, 8)],
                    (72, 8, 8, 8, 4, 14)),  # can
    (1920, "CRD"): ([("Paddy Driscoll", 4, 5, 0, None, 6)], (34, 5, 4, 5, 0, None)),  # chic
    (1920, "CHT"): ([("Johnny Barrett", 0, 0, 1, 5, 6), ("Neil Mathews", 1, 1, 0, 0, 6), ("Milt Ghee", 0, 2, 0, 0, 7)],
                    (22, 3, 1, 3, 1, 5)),  # chit
    (1920, "CLE"): ([("Al Pierotti", 2, 2, 0, 0, 4), ("Mark Devlin", 0, 0, 0, 3, 3)], (14, 2, 2, 2, 0, 3)),  # cle
    (1920, "COL"): ([("Oscar Kuhner", 1, 1, 0, 0, 5), ("Frank Nesser", 0, 0, 0, 2, 5)], (7, 1, 1, 1, 0, 2)),  # col
    (1920, "DAY"): ([("Frank Bacon", 2, 2, 0, 1, 8), ("George Kinderdine", 12, 14, 0, 0, 8),
                     ("George Roudebush", 0, 0, 1, 1, 8), ("Dick Abrell", 2, 2, 0, 0, 5)],
                    (127, 18, 16, 18, 1, 2)),  # day
    (1920, "DEC"): ([("Dutch Sternaman", 1, 1, 3, 6, 8),  # PFA "Ed Sternaman"
                     ("Bob Koehler", 0, 0, 0, 1, 7), ("Jimmy Conzelman", 0, 0, 1, 2, 7),
                     ("Hugh Blacklock", 6, 7, 0, 1, 8)],  # X1A blank on PFA; 7 from its 85.7%
                    (67, 8, 7, 8, 4, None)),  # dec
    (1920, "DET"): ([("Clarence Horning", 0, 1, 0, 0, 4)], (6, 1, 0, 1, 0, 0)),  # det
    (1920, "HAM"): ([("Louie Kolls", 1, 1, 0, 0, 1)], (7, 1, 1, 1, 0, 0)),  # ham
    (1920, "MUN"): ([], (0, 0, 0, 0, 0, 0)),  # mun
    (1920, "RII"): ([("Rube Ursella", 5, 6, 1, 2, 5), ("Sid Nichols", 3, 3, 0, 1, 6), ("Bobby Marshall", 3, 5, 0, 0, 7),
                     ("Harry Webber", 0, 0, 0, 1, 2)], (98, 14, 11, 14, 1, 4)),  # ri
    (1920, "RCH"): ([("Jim Laird", 0, 0, 2, 2, 1)], (6, 0, 0, 0, 2, None)),  # roc
    # 1921: every game NFL.com's standings count.
    (1921, "AKR"): ([("Carl Cramer", 1, 2, 0, 1, 11),  # PFA "Earl Cramer"; NFL.com, PFR, statscrew "Carl"
                     ("Rip King", 3, 4, 0, 0, 11),  # PFA "Andy King"; NFL.com, PFR, statscrew "Rip King"
                     ("Paul Sheeks", 1, 1, 2, 6, 11), ("Charlie Copley", 10, 13, 0, 0, 11),
                     # PFA "Elgie Tobin" (the coach); statscrew and Wikipedia (Leo_Tobin: "his only
                     # statistic was one extra point") credit his brother Leo.
                     ("Leo Tobin", 1, 1, 0, 0, 9)],
                    (148, 21, 16, 21, 2, 6)),  # akr (PFA's FGA total 6, its rows 7)
    (1921, "BUF"): ([("Elmer Oliphant", 26, 26, 5, 15, 10), ("Johnny Scott", 0, 0, 0, 3, 7),
                     ("Tommy Hughitt", 2, 2, 0, 0, 12)], (211, 28, 28, 28, 5, 18)),  # buf
    (1921, "CAN"): ([("Bob Higgins", 2, 2, 0, 0, 9),
                     # PFA lists Feeney twice (7/7 PAT; 0/2 FG), one player link. PFA's box scores and
                     # PFR's (pro-football-reference.com/boxscores/192110090cbd, 192110160day,
                     # 192111060cbd, 192111130cti, 192111200bff, via search) give him all 7 PATs (1, 2, 2,
                     # 1, 1); statscrew credits one to Jim Morrow (6 + 1).
                     ("Al Feeney", 7, 7, 0, 2, 8), ("Belf West", 4, 6, 1, 4, 10),
                     ("Pete Henry", 0, 0, 0, 1, 10), ("Glenn Killinger", 0, 0, 0, 1, 1)],
                    (106, 15, 13, 15, 1, 8)),  # can
    (1921, "CRD"): ([("Paddy Driscoll", 4, None, 1, 4, 8), ("Bob Koehler", 2, 2, 0, 0, 8),
                     # PFA "Arnold Horween" (roster: Arnie, 4 g); statscrew and PFR's box score of
                     # 10/23/1921 (pro-football-reference.com/boxscores/192110230crd.htm, via search)
                     # credit the FG to Ralph Horween. Games: PFA's line.
                     ("Ralph Horween", 0, None, 1, 3, 4)], (54, 7, 6, 7, 2, 7)),  # chic
    (1921, "CIN"): ([("Art Lewis", 1, 1, 0, 0, 3), ("George Munns", 1, 1, 0, 0, 4)], (14, 2, 2, 2, 0, 0)),  # cin
    (1921, "CLE"): ([("Joe Guyon", 10, 11, 0, 0, 8), ("Jim Thorpe", 2, 2, 1, 2, 5), ("Phil Bower", 0, 0, 0, 1, 4)],
                    (95, 13, 12, 13, 1, None)),  # cle
    (1921, "COL"): ([("Emmett Ruh", 1, None, 2, 5, 7), ("Frank Nesser", 1, None, 0, 1, 9),
                     ("Harry Bliss", 1, None, 0, 0, 9)], (47, 6, 3, 6, 2, 6)),  # col
    (1921, "DAY"): ([("Russ Hathaway", 12, 12, 4, 6, 9)], (96, 12, 12, 12, 4, 6)),  # day
    (1921, "CHI"): ([("Dutch Sternaman", 9, None, 5, 12, 11),  # PFA "Ed Sternaman"
                     ("Hugh Blacklock", 2, 3, 0, 0, 11),  # X1A blank on PFA; 3 from its 66.7%
                     ("Chic Harley", 0, None, 0, 1, 8)], (128, 17, 11, 17, 5, 13)),  # dec (the Staleys)
    (1921, "DET"): ([("Tillie Voss", 2, 2, 0, 0, 7),
                     ("Cy DeGree", 0, 0, 1, 1, 7)],  # PFA "Walt DeGree"; PFR, statscrew "Cy DeGree"
                    (19, 2, 2, 2, 1, 1)),  # det
    (1921, "EVN"): ([("Herb Henderson", 5, 5, 0, 0, 4), ("Bourbon Bondurant", 6, 7, 0, 1, 5),
                     ("Jerry Zeller", 0, 1, 0, 0, 3)], (89, 13, 11, 13, 0, None)),  # eva
    (1921, "GNB"): ([("Curly Lambeau", 7, 9, 3, 12, 6)], (70, 9, 7, 9, 3, 12)),  # gb
    (1921, "HAM"): ([("Charlie Mathys", 0, 0, 1, 2, 5), ("Elliott Risley", 2, 2, 0, 1, 5),
                     ("Marshall Jones", 0, 0, 0, 1, None)], (17, 2, 2, 2, 1, 4)),  # ham (Jones: not on its roster)
    (1921, "LOU"): ([], (0, 0, 0, 0, 0, None)),  # lou
    (1921, "MIN"): ([("Eber Sampson", 0, 1, 0, 1, 4), ("Rube Ursella", 4, 4, 1, 4, 4)], (37, 5, 4, 5, 1, 5)),  # min
    (1921, "MUN"): ([], (0, 0, 0, 0, 0, 0)),  # mun
    (1921, "NYG"): ([], (0, 0, 0, 0, 0, None)),  # ny (the Brickley Giants)
    (1921, "RII"): ([("Obe Wenig", 8, 9, 0, 1, 7), ("Jimmy Conzelman", 0, 0, 1, 7, 7), ("Sid Nichols", 0, 0, 0, 1, 5),
                     ("Walt Brindley", 0, 0, 0, 1, 2)], (65, 9, 8, 9, 1, 10)),  # ri
    (1921, "RCH"): ([("Benny Boynton", 8, None, 1, None, 3), ("Howard Berry", 2, None, 2, 2, 4)],
                    (85, 11, 10, 11, 3, None)),  # roc
    (1921, "TON"): ([], (0, 0, 0, 0, 0, None)),  # ton
    (1921, "WSN"): ([("Benny Boynton", 3, 3, 0, None, 2)], (21, 3, 3, 3, 0, None)),  # was
}
# Stints of 1920-21 kickers on another team where they didn't kick: (name, season, team, games),
# from the PFA rosters (the same player link on both pages).
EARLY_STINTS = [("Paddy Driscoll", 1920, "DEC", 1), ("Al Pierotti", 1920, "AKR", 1), ("Louie Kolls", 1920, "CRD", 1),
                ("Jim Laird", 1920, "BUF", 1), ("Joe Guyon", 1921, "WSN", 1), ("Tillie Voss", 1921, "BUF", 5)]

# The Kicking table of statscrew's 21 team pages of 1921
# (https://www.statscrew.com/football/stats/t-<code>/y-1921, codes AKR BU1 CAN CHC CHI CI1 CL1 COL
# DAY DE1 EVA GB HAM LOU MI1 MUN NY1 RI ROC TON WA1): (name, xp_made, fg_made) per kicker.
# statscrew has no attempts for 1921. Pages with no kicker (LOU, MUN, NYG, TON) are left out.
STATSCREW_1921 = {
    "AKR": [("Paul Sheeks", 1, 2), ("Charlie Copley", 10, 0), ("Rip King", 3, 0), ("Leo Tobin", 1, 0),
            ("Carl Cramer", 1, 0)],
    "BUF": [("Elmer Oliphant", 26, 5), ("Tommy Hughitt", 2, 0)],
    "CAN": [("Belf West", 4, 1), ("Al Feeney", 6, 0), ("Bob Higgins", 2, 0), ("Jim Morrow", 1, 0)],
    "CRD": [("Paddy Driscoll", 4, 1), ("Ralph Horween", 0, 1), ("Bob Koehler", 2, 0)],
    "CHI": [("Dutch Sternaman", 9, 5), ("Hugh Blacklock", 2, 0)],
    "CIN": [("Art Lewis", 1, 0), ("George Munns", 1, 0)],
    "CLE": [("Jim Thorpe", 2, 1), ("Joe Guyon", 10, 0)],
    "COL": [("Emmett Ruh", 1, 2), ("Frank Nesser", 1, 0), ("Harry Bliss", 1, 0)],
    "DAY": [("Russ Hathaway", 12, 4)],
    "DET": [("Cy DeGree", 0, 1), ("Tillie Voss", 2, 0)],
    "EVN": [("Bourbon Bondurant", 6, 0), ("Herb Henderson", 5, 0)],
    "GNB": [("Curly Lambeau", 7, 3)],
    "HAM": [("Charlie Mathys", 0, 1), ("Elliott Risley", 2, 0)],
    "MIN": [("Rube Ursella", 4, 1)],
    "RII": [("Jimmy Conzelman", 0, 1), ("Obe Wenig", 8, 0)],
    "RCH": [("Howard Berry", 2, 2), ("Benny Boynton", 8, 1)],
    "WSN": [("Benny Boynton", 3, 0)],
}
# (name, team) lines where the final 1921 table differs from statscrew, with the reason.
# A check asserts this is exactly the set of differences.
STATSCREW_1921_DIFFERENCES = {
    ("Al Feeney", "CAN"): "7 PAT (PFA and PFR box scores) vs statscrew 6",
    ("Jim Morrow", "CAN"): "no PAT on PFA or in PFR's box scores; statscrew credits him 1",
}

# --- other verified fixes -----------------------------------------------------------

# Multi-team PFR rows ("2TM", "4TM") -> the teams, alphabetical; a check asserts every such row
# is resolved and names as many teams as PFR counts. Sources after 1945: NFL.com career pages
# (nfl.com/players/<slug>/stats/career), Wikipedia, PFA team pages, josephvm stints.
# 1922-1945: the PFA team pages "PFA <season>nfl<team>" = profootballarchives.com/<that>.html
# (read once, 2026-10): games played on each roster, and the per-team PAT/FG that add up to
# PFR's row (where they don't, it says so). Same teams as offense.py where it splits the season.
MANUAL_TEAMS = {
    ("jimmy conzelman", 1922): "MIL/RII",   # PFA 1922nflri 7 g 2 FG + 1922nflmil 3 g
    ("dutch lauer", 1922): "GNB/RII",       # PFA ("Hal Lauer") 1922nflri 7 g 1 PAT + 1922nflgb 2 g
    ("tillie voss", 1922): "AKR/RII",       # PFA 1922nflri 7 g 6 PAT + 1922nflakr 2 g; offense.py (Wikipedia)
    ("russ hathaway", 1922): "CAN/DAY",     # PFA 1922nflday 8 g 9 PAT 2 FG + 1922nflcan 2 g
    ("jerry johnson", 1922): "RAC/RII",     # PFA 1922nflri 5 g 6 PAT 1 FG + 1922nflrac 3 g
    ("charlie copley", 1922): "AKR/MIL",    # PFA 1922nflmil 4 g 1 PAT + 1922nflakr 3 g
    ("jab murray", 1922): "GNB/RAC",        # PFA 1922nflrac 8 g 1 PAT + 1922nflgb 3 g
    ("cliff steele", 1922): "AKR/RCH",      # PFA 1922nflroc 1 g 1 PAT + 1922nflakr 4 g
    ("joey sternaman", 1923): "CHI/DUL",    # PFA 1923nfldul 7 g 2 PAT 5 FG + 1923nflchib 3 g 2 PAT 1 FG
    ("dutch hendrian", 1923): "AKR/CAN",    # PFA 1923nflakr 5 g 1 PAT + 1923nflcan 4 g
    ("benny boynton", 1924): "BUF/RCH",     # PFA 1924nflbuf 9 g 11 PAT 4 FG + 1924nflroc 1 g
    ("frank morrissey", 1924): "BUF/MIL",   # PFA 1924nflbuf 2 g 2 FG + 1924nflmil 2 g
    ("phil white", 1925): "KAN/NYG",        # PFA 1925nflkc 8 g 1 PAT 1 FG + 1925nflnyg 2 g
    ("dutch hendrian", 1925): "NYG/RII",    # PFA 1925nflnyg 10 g 1 PAT 3 FG + 1925nflri 1 g
    ("jim kendrick", 1925): "BUF/HAM/RCH/RII",  # PFA 1925nflbuf 8 g 2 PAT 2 FG, 1925nflham 2 g 1 PAT 1 FG,
                                                # 1925nflroc 1 g, 1925nflri 1 g; Wikipedia Jim_Kendrick
    ("doc bruder", 1925): "BUF/FRN",        # PFA ("Woody Bruder") 1925nflfra 4 g 2 PAT + 1925nflbuf 5 g
    ("don curtin", 1926): "MIL/RAC",        # PFA 1926nflmil 3 g 1 PAT 2 FG; signed by Racine 10/5/1926 (PFA
                                            # player page curt00200, en.wikipedia.org/wiki/Donald_Curtin)
    ("paul hogan", 1926): "FRN/NYG",        # PFA 1926nflnyg 10 g 3 PAT + 1926nflfra 3 g 2 PAT
    ("hap moran", 1927): "CRD/FRN",         # PFA 1927nflfra 6 g 6 PAT 3 FG + 1927nflchic 5 g
    ("pete henry", 1927): "NYG/POT",        # PFA 1927nflpot 9 g 1 PAT 2 FG + 1927nflnyg 4 g
    ("earl britton", 1927): "DAY/FRN",      # PFA 1927nflday 8 g 1 FG + 1927nflfra 6 g
    ("red smith", 1928): "NYG/NYY",         # PFA 1928nflnyy 9 g 2 PAT + 1928nflnyg 1 g
    ("bo molenda", 1928): "GNB/NYY",        # PFA 1928nflnyy 8 g 3 PAT + 1928nflgb 3 g
    ("fait elkins", 1929): "CRD/FRN",       # PFA ("Chief Elkins") 1929nflchic 2 g 1 FG + 1929nflfra 9 g
    ("ed halicki", 1930): "FRN/MIN",        # PFA 1930nflfra 14 g 5 PAT + 1930nflmin 1 g; offense.py
    ("frosty peters", 1930): "PRT/PRV",     # PFA 1930nflpro 9 g 7 PAT 2 FG + 1930nflpor 3 g
    ("mally nydall", 1930): "FRN/MIN",      # PFA ("Mally Nydahl") 1930nflmin 8 g 1 PAT + 1930nflfra 4 g
    ("art pharmer", 1930): "FRN/MIN",       # PFA 1930nflfra 5 g 4 PAT + 1930nflmin 8 g 2 PAT
    ("tony kostos", 1930): "FRN/MIN",       # PFA 1930nflfra 15 g + 1930nflmin 2 g (PFA credits no PAT; PFR 1)
    ("jim mooney", 1930): "BKN/TOR",        # PFA 1930nflnew (Newark) 12 g 2 PAT + 1930nflbkn 3 g
    ("george bogue", 1930): "CRD/TOR",      # PFA 1930nflchic 3 g 1 PAT + 1930nflnew 3 g
    ("deck shelley", 1931): "PRT/PRV",      # PFA ("Dexter Shelley") 1931nflpro 8 g 4 PAT + 1931nflpor 2 g
    ("bo molenda", 1932): "GNB/NYG",        # PFA 1932nflnyg 10 g (4 PAT; PFR 3) + 1932nflgb 2 g; offense.py
    ("algy clark", 1934): "CIN/PHI",        # PFA 1934nflcin 7 g 1 FG + 1934nflphi 3 g; offense.py (jt-sw)
    ("bill shepherd", 1935): "BOS/DET",     # PFA 1935nflbos 7 g 1 PAT + 1935nfldet 5 g; offense.py (jt-sw)
    ("dick tuckey", 1938): "RAM/WAS",       # PFA 1938nflcle 4 g 2 PAT + 1938nflwas 3 g; offense.py (jt-sw)
    ("frank balazs", 1941): "CRD/GNB",      # PFA 1941nflgb 1 g 1 PAT + 1941nflchic 9 g
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
# 1991+ FG distance of a traded kicker's stint that neither josephvm nor kendallgillies splits:
# (name key, season, team) -> made FGs (under 40, 40-49, 50+). Each from the PFA team page's
# FIELD GOALS table (profootballarchives.com/<season>nfl<team>.html) and the NFL.com career page.
MANUAL_BUCKETS = {
    # 1995nflsf: 20-29 4/4, 30-39 0/1, 40-49 2/6, 50+ 1/1 (LG 51). nfl.com/players/doug-brien: 7/12,
    # its splits miss one make; the 51-yarder is in PFR's box score 199510150clt (via search).
    ("doug brien", 1995, "SFO"): (4, 2, 1),
    ("ken willis", 1992, "TAM"): (4, 4, 0),     # 1992nfltb 3/3, 1/4, 4/7; nfl.com/players/ken-willis same
    # 1992nflkc: 1/1 from 50+, LG 52; NFL.com shows 1/1 without a split; footballdb's 2-team line 50+ 1-1.
    ("eddie murray", 1992, "KAN"): (0, 0, 1),
    ("carlos huerta", 1996, "CHI"): (3, 1, 0),  # 1996nflchib 30-39 3/5, 40-49 1/2; nfl.com same
    ("scott bentley", 1997, "DEN"): (2, 0, 0),  # 1997nflden 20-29 1/1, 30-39 1/1; nfl.com same
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
# NaN when the source has no distance split; b_team is the team whose stint they cover.
ROW_COLS = ["name", "key", "season", "team", "games", "fg_made", "fg_att",
            "b_0_39", "b_40_49", "b_50", "b_team", "xp_made", "xp_att", "source", "pos"]


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
    out["b_team"] = out["team"].where(has_buckets)
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


KG_BUCKETS = ["FGs Made 20-29 Yards", "FGs Made 30-39 Yards", "FGs Made 40-49 Yards", "FGs Made 50+ Yards"]


def load_kg_buckets():
    """kendallgillies per-team distance splits, 1991+: (name key, season, team) -> (under 40,
    40-49, 50+). The scrape has no 1-19 column, so a row counts only when 20-29 + 30-39 +
    40-49 + 50+ equals its FGs Made (else a 1-19 make, or a gap, would go missing)."""
    d = read_zip_csv("kendallgillies.zip", "Career_Stats_Field_Goal_Kickers.csv", dtype=str, low_memory=False)
    d["season"] = num(d["Year"])
    d = d[d["season"].between(BUCKETS_FROM, LAST_SEASON)].copy()
    made = num(d["FGs Made"])
    b = [num(d[c]) for c in KG_BUCKETS]
    ok = made.notna() & (made > 0) & (b[0] + b[1] + b[2] + b[3] == made)
    out = {}
    for i in d.index[ok]:
        season = int(d.at[i, "season"])
        key = (name_key(first_last(d.at[i, "Name"])), season, code_from_name(d.at[i, "Team"], season))
        out[key] = (b[0][i] + b[1][i], b[2][i], b[3][i])
    return out


def load_early():
    """1920-1921 kicker stints from EARLY_KICKING (rows with a make; attempts not kept, as for
    1922-1937) plus the kick-less stints of EARLY_STINTS."""
    rows = []
    for (season, team), (kickers, _totals) in EARLY_KICKING.items():
        for name, xpm, _xpa, fgm, _fga, games in kickers:
            if xpm or fgm:
                rows.append({"name": name, "season": season, "team": team, "games": games,
                             "fg_made": fgm, "xp_made": xpm, "source": "profootballarchives"})
    kickers = {(r["name"], r["season"]) for r in rows}
    for name, season, team, games in EARLY_STINTS:
        assert (name, season) in kickers and (name, season, team) not in {
            (r["name"], r["season"], r["team"]) for r in rows}, (name, season, team)
        rows.append({"name": name, "season": season, "team": team, "games": games,
                     "fg_made": 0, "xp_made": 0, "source": "profootballarchives"})
    out = pd.DataFrame(rows)
    assert (out["season"] < ATTEMPTS_FROM).all()
    out["key"] = out["name"].map(name_key)
    return frame(out)  # fg_att, xp_att stay NaN (unknown)


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

    # 1920-1921 APFA: PFA team pages (no other source has these seasons).
    early = load_early()
    assert not ((pfr["season"] <= 1921).any() or (kg["season"] <= 1921).any() or (jvm["season"] <= 1921).any())
    rows.append(early)
    log.append(f"  1920-1921 from PFA team pages: {len(early)} stints, "
               f"{early.groupby('season')['key'].nunique().to_dict()} kickers per season")

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
            row.update(b_0_39=j["b_0_39"], b_40_49=j["b_40_49"], b_50=j["b_50"], b_team=j["b_team"])
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
    unresolved, used, by_manual, by_kg = [], set(), 0, 0
    for i in df.index[df["team"].str.fullmatch(r"\dTM")]:
        n = int(df.at[i, "team"][0])
        key, season = df.at[i, "key"], df.at[i, "season"]
        label = f"{df.at[i, 'name']} {season} {df.at[i, 'team']}"
        if (key, season) in MANUAL_TEAMS:
            used.add((key, season))
            teams = MANUAL_TEAMS[(key, season)].split("/")
            if len(set(teams)) != n or teams != sorted(teams):
                unresolved.append(f"{label} (MANUAL_TEAMS gives {'/'.join(teams)})")
                continue
            df.at[i, "team"] = "/".join(teams)
            by_manual += 1
            continue
        teams = set()
        for k in {key} | spellings.get(key, set()):
            teams |= kg_teams.get((k, season), set())
        if len(teams) == n:
            df.at[i, "team"] = "/".join(sorted(teams))
            by_kg += 1
        else:
            unresolved.append(label)
    STATE["manual_teams_unused"] = sorted(set(MANUAL_TEAMS) - used)
    STATE["ntm_unresolved"] = unresolved
    log.append(f"  multi-team PFR rows split: {by_manual} from MANUAL_TEAMS, {by_kg} from kendallgillies; "
               f"left as PFR's NTM: {len(unresolved)} {unresolved}")

    fill_buckets(df, spellings, log)

    # One spelling per person, PFR's where a fuzzy match found it.
    df["key"] = df["key"].map(lambda k: alias.get(k, k))
    STATE["pfr_pos"] = {(name_key(n), s): p for n, s, p in zip(pfr["name"], pfr["season"], pfr["pos"])}
    return df


def fill_buckets(df, spellings, log):
    """1991+ rows whose made FGs aren't all placed by distance (a traded kicker's josephvm row
    holds one stint; a few kickers have no josephvm row): add each other team's stint from
    MANUAL_BUCKETS, else kendallgillies' per-team row. Taken only if every made FG is then placed."""
    kgb = load_kg_buckets()
    filled, left, used = [], [], set()
    late = df.index[(df["season"] >= BUCKETS_FROM) & (df["fg_made"] > 0)]
    for i in late:
        r = df.loc[i]
        have = [0.0, 0.0, 0.0] if pd.isna(r["b_0_39"]) else [r["b_0_39"], r["b_40_49"], r["b_50"]]
        if sum(have) == r["fg_made"]:
            continue
        covered = set() if pd.isna(r["b_team"]) else {r["b_team"]}
        add, srcs = [0.0, 0.0, 0.0], []
        for team in sorted(set(r["team"].split("/")) - covered):
            mkey = (r["key"], r["season"], team)
            if mkey in MANUAL_BUCKETS:
                used.add(mkey)
                part, src = MANUAL_BUCKETS[mkey], "manual"
            else:
                part = next((kgb[(k, r["season"], team)] for k in sorted({r["key"]} | spellings.get(r["key"], set()))
                             if (k, r["season"], team) in kgb), None)
                src = "kendallgillies"
            if part is None:
                continue
            add = [a + b for a, b in zip(add, part)]
            srcs.append(f"{team} {'/'.join(f'{x:.0f}' for x in part)} ({src})")
        total = [a + b for a, b in zip(have, add)]
        label = f"{r['name']} {r['season']} {r['team']} FG {r['fg_made']:.0f}"
        if srcs and sum(total) == r["fg_made"]:
            df.loc[i, ["b_0_39", "b_40_49", "b_50"]] = total
            parts = set(r["source"].split("+")) | {s.split("(")[1][:-1] for s in srcs}
            df.at[i, "source"] = "+".join(sorted(parts, key=SOURCE_ORDER.index))
            filled.append(f"{label}: {'+'.join(srcs)} -> {'/'.join(f'{x:.0f}' for x in total)}")
        else:
            left.append(f"{label}: placed {sum(total):.0f} ({', '.join(srcs) or 'no per-team split'})")
    STATE["buckets_left"] = left
    STATE["manual_buckets_unused"] = sorted(set(MANUAL_BUCKETS) - used)
    log.append(f"  1991+ stints given distances from kendallgillies/MANUAL_BUCKETS: {len(filled)}")
    log += [f"    {f}" for f in filled]
    if left:
        log.append(f"  1991+ rows with made FGs of unknown distance: {left}")


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


SOURCE_ORDER = ["profootballarchives", "michaelmallari", "josephvm", "statscrew", "kendallgillies", "trevyoungquist",
                "manual"]


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
        except KeyError:  # a team TEAMS doesn't know (a check asserts there is none)
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
    multi = df[df["team"].str.contains("TM")]
    print(f"\nRows whose teams no source splits ({len(multi)}): "
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
    print("  -- 1991+ traded kickers: every stint's FGs by distance (josephvm + kendallgillies/MANUAL_BUCKETS) --")
    for name, season, teams, b in [
            ("Greg Davis", 1997, "MIN/SDG", (20, 6, 0)),     # SDG 14/5/0 (josephvm) + MIN 6/1/0 (kendallgillies)
            ("Doug Brien", 1995, "NOR/SFO", (12, 6, 1)),     # NOR 8/4/0 + SFO 4/2/1 (PFA 1995nflsf, 51-yarder)
            ("Matt Bahr", 1993, "NWE/PHI", (11, 2, 0)),      # NWE 5/0/0 + PHI 6/2/0
            ("Ken Willis", 1992, "NYG/TAM", (5, 5, 0)),      # NYG 1/1/0 + TAM 4/4/0 (nfl.com, PFA)
            ("Eddie Murray", 1992, "KAN/TAM", (2, 2, 1)),    # TAM 2/2/0 + KAN 0/0/1 (PFA 1992nflkc: 52 yards)
            ("Carlos Huerta", 1996, "CHI/STL", (3, 1, 0)),   # STL no FG + CHI 3/1/0
            ("Lin Elliott", 1993, "DAL", (1, 1, 0)),         # no josephvm row; kendallgillies DAL
            ("Tony Zendejas", 1995, "ATL/SFO", (1, 2, 0)),   # SFO 1/0/0 + ATL 0/2/0
            ("Charlie Baumann", 1991, "MIA/NWE", (4, 5, 0)),  # NWE 3/4/0 + MIA 1/1/0
            ("Raul Allegre", 1991, "NYG/NYJ", (4, 1, 0)),    # NYJ 2/1/0 + NYG 2/0/0
            ("Brad Daluiso", 1991, "ATL/BUF", (2, 0, 0)),    # ATL 2/0/0, BUF no FG
            ("Scott Bentley", 1997, "ATL/DEN", (2, 0, 0))]:  # DEN 2/0/0 (nfl.com, PFA), ATL no FG
        stat_check(name, season, f"{teams} buckets {'/'.join(map(str, b))}, none unknown", team=teams,
                   fg_made_0_39=b[0], fg_made_40_49=b[1], fg_made_50_plus=b[2], fg_made_unknown=0)
    print("  -- 1920-1921 (PFA team pages; statscrew 1921) --")
    stat_check("Elmer Oliphant", 1921, "BUF 5 FG 26 XP (statscrew; PFA 5/15, 26/26), attempts not kept", team="BUF",
               fg_made=5, xp_made=26, fg_att=None, xp_att=None, games=10)
    stat_check("Dutch Sternaman", 1921, "Staleys 5 FG 9 XP (statscrew, PFA)", team="CHI", fg_made=5, xp_made=9)
    stat_check("Paddy Driscoll", 1921, "Cardinals 1 FG 4 XP (statscrew, PFA)", team="CRD", fg_made=1, xp_made=4)
    stat_check("Charlie Copley", 1921, "Akron 10 XP (statscrew, PFA)", team="AKR", fg_made=0, xp_made=10)
    stat_check("Benny Boynton", 1921, "RCH 8 XP 1 FG + WSN 3 XP, 3+2 g", team="RCH/WSN", fg_made=1, xp_made=11,
               games=5)
    stat_check("Ralph Horween", 1921, "the Cardinals' other FG (statscrew, PFR box score; PFA: Arnie)", fg_made=1)
    check("Arnie Horween has no 1921 row", line("Arnie Horween", 1921) is None)
    stat_check("Dutch Sternaman", 1920, "Decatur 3 FG 1 XP (PFA, APFA games)", team="DEC", fg_made=3, xp_made=1,
               fg_att=None)
    stat_check("Paddy Driscoll", 1920, "Cardinals 4 XP, plus 1 g for Decatur (PFA)", team="CRD/DEC", fg_made=0,
               xp_made=4, games=7)
    stat_check("Hugh Blacklock", 1920, "Decatur 6 XP (PFA)", team="DEC", xp_made=6, fg_made=0)
    stern = df[df["name"] == "Dutch Sternaman"]
    check("Dutch Sternaman (PFA: Ed) is one player_id, 1920-1926", stern["player_id"].nunique() == 1
          and stern["season"].min() == 1920, str(sorted(set(stern["player_id"]))))
    print("  -- 1922-1945 multi-team rows (PFA rosters and per-team kicking) --")
    for name, season, teams in [
            ("Pete Henry", 1927, "NYG/POT"), ("Joey Sternaman", 1923, "CHI/DUL"),
            ("Jim Kendrick", 1925, "BUF/HAM/RCH/RII"),
            ("Tillie Voss", 1922, "AKR/RII"), ("Hap Moran", 1927, "CRD/FRN"), ("Bo Molenda", 1928, "GNB/NYY"),
            ("Benny Boynton", 1924, "BUF/RCH"), ("Jimmy Conzelman", 1922, "MIL/RII"),
            ("Bill Shepherd", 1935, "BOS/DET"), ("Algy Clark", 1934, "CIN/PHI"), ("Bo Molenda", 1932, "GNB/NYG"),
            ("Frosty Peters", 1930, "PRT/PRV"), ("Art Pharmer", 1930, "FRN/MIN"), ("Ed Halicki", 1930, "FRN/MIN"),
            ("Deck Shelley", 1931, "PRT/PRV")]:
        stat_check(name, season, teams, team=teams)
    stat_check("Joey Sternaman", 1923, "Bears 1 FG 2 XP + Duluth 5 FG 2 XP (PFA) = PFR", fg_made=6, xp_made=4)
    stat_check("Jim Kendrick", 1925, "team names", team_name="Buffalo Bisons / Hammond Pros / Rochester Jeffersons"
               " / Rock Island Independents")

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
    late_unknown = df[(df["season"] >= BUCKETS_FROM) & (df["fg_made_unknown"] != 0)]
    check("1991+: every made FG has a distance (fg_made_unknown 0 on every row)", late_unknown.empty,
          ", ".join(f"{n} {s}" for n, s in zip(late_unknown["name"], late_unknown["season"])))
    check("every MANUAL_BUCKETS entry used", not STATE["manual_buckets_unused"], str(STATE["manual_buckets_unused"]))
    known = df["fg_att"].notna()
    check("fg_made <= fg_att", (df.loc[known, "fg_made"] <= df.loc[known, "fg_att"]).all())
    known = df["xp_att"].notna() & df["xp_made"].notna()
    check("xp_made <= xp_att", (df.loc[known, "xp_made"] <= df.loc[known, "xp_att"]).all())
    check("attempts empty exactly for 1920-1937",
          df.loc[df["season"] < ATTEMPTS_FROM, ["fg_att", "xp_att"]].isna().all().all()
          and df.loc[df["season"] >= ATTEMPTS_FROM, ["fg_att", "xp_att"]].notna().all().all())
    check("fg_made and xp_made known for every row", df[["fg_made", "xp_made"]].notna().all().all())
    ntm = df[df["team"].str.contains("TM") | df["team_name"].str.contains(r"\d teams")]
    check("no 2TM/3TM/4TM placeholder team in any season", ntm.empty,
          ", ".join(f"{n} {s}" for n, s in zip(ntm["name"], ntm["season"])))
    check("every PFR multi-team row split into as many teams as PFR counts", not STATE["ntm_unresolved"],
          "; ".join(STATE["ntm_unresolved"]))
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
    early = rem[[1922 <= s < ATTEMPTS_FROM for _, s in rem.index]]
    print(f"  (info) 1922-1937: {(early < 0).sum()} of {len(early)} team-seasons negative: "
          f"{[(t, s, int(v)) for (t, s), v in early[early < 0].items()]}")
    check("every team in the 1920-1998 standings maps to a TEAMS code", not STATE["standings_unmapped"],
          ", ".join(STATE["standings_unmapped"]))
    check_early(check, points)
    compare_offense_teams(df)
    check("games known for every row", df["games"].notna().all(), str(df[df["games"].isna()][["name", "season"]].values[:5]))
    check("every row has a team_name", df["team_name"].notna().all() and (df["team_name"] != "").all())
    check("pfr_id only for kickers with 1990s seasons",
          df.loc[df["pfr_id"].notna(), "season"].groupby(df["player_id"]).max().min() >= 1990)
    check("Morten Andersen and Gary Anderson carry pfr_id",
          df.loc[df["name"].isin(["Morten Andersen", "Gary Anderson"]), "pfr_id"].notna().all())
    ww = df[(df["season"] == 1968) & df["name"].eq("Wayne Walker")]
    check("two different Wayne Walkers in 1968 (DET, HOU)", sorted(ww["team"]) == ["DET", "HOU"]
          and ww["player_id"].nunique() == 2)
    per_season = df.groupby("season").size()
    check(f"at least 15 kickers every season {FIRST_SEASON}-{LAST_SEASON}",
          per_season.reindex(range(FIRST_SEASON, LAST_SEASON + 1), fill_value=0).min() >= 15,
          f"min {per_season.min()} in {per_season.idxmin()}")
    return all(results)


def check_early(check, points):
    """Self-checks of the 1920-21 PFA table (EARLY_KICKING) against its own Totals rows, NFL.com's
    standings (octonion, `points`) and statscrew's 1921 pages."""
    print("\nSelf-checks (1920-21 PFA table):")
    made_bad, att_bad, left = [], set(), {}
    for (season, team), (rows, (pts, td, xpm, xpa, fgm, fga)) in EARLY_KICKING.items():
        if (sum(r[1] for r in rows), sum(r[3] for r in rows)) != (xpm, fgm):
            made_bad.append((season, team))
        for i, col, total in ((2, "xp_att", xpa), (4, "fg_att", fga)):
            vals = [r[i] for r in rows]
            if total is not None and None not in vals and sum(vals) != total:
                att_bad.add((season, team, col))
        left[(season, team)] = pts - 6 * td - xpm - 3 * fgm
    check("PFA transcription: kicker rows' PATs and FGs add up to each page's Totals row", not made_bad,
          str(made_bad))
    check("PFA attempts add up to the Totals wherever every row has them (except 1921 AKR FGA: PFA rows 7, "
          "Totals 6)", att_bad == {(1921, "AKR", "fg_att")}, str(sorted(att_bad)))
    check("PFA 1920-21: points - 6*TD - PAT - 3*FG is 0, 2 or 4 on every page (safeties only)",
          all(v in (0, 2, 4) for v in left.values()), str({k: v for k, v in left.items() if v not in (0, 2, 4)}))
    teams = {s: sorted(t for t, y in points if y == s) for s in (1920, 1921)}
    mine = {s: sorted(t for y, t in EARLY_KICKING if y == s) for s in (1920, 1921)}
    check("PFA: every team in NFL.com's 1920 (14) and 1921 (21) standings transcribed, no other",
          mine == teams and len(mine[1920]) == 14 and len(mine[1921]) == 21, str(mine))
    off = [(t, s) for (s, t), (_, (pts, td, *_r)) in EARLY_KICKING.items()
           if s == 1921 and points.get((t, s)) != (pts, td)]
    check("1921: every PFA page's points and TDs equal NFL.com's standings (every official game covered)",
          not off, str(off))
    pfa20 = sum(tot[0] for (s, _), (_, tot) in EARLY_KICKING.items() if s == 1920)
    nfl20 = sum(pf for (t, s), (pf, _) in points.items() if s == 1920)
    print(f"  (info) 1920: PFA (APFA-vs-APFA games) has {pfa20} of the {nfl20} points NFL.com's standings count")
    mine21 = {}
    for (season, team), (rows, _tot) in EARLY_KICKING.items():
        for name, xpm, _xpa, fgm, _fga, _g in rows:
            if season == 1921 and (xpm or fgm):
                mine21[(name, team)] = (xpm, fgm)
    theirs = {(name, team): (xpm, fgm) for team, rows in STATSCREW_1921.items() for name, xpm, fgm in rows}
    diff = {k for k in set(mine21) | set(theirs) if mine21.get(k) != theirs.get(k)}
    check("1921 PFA table vs statscrew: every difference explained (STATSCREW_1921_DIFFERENCES)",
          diff == set(STATSCREW_1921_DIFFERENCES), str(sorted(diff ^ set(STATSCREW_1921_DIFFERENCES))))
    for k in sorted(diff):
        print(f"  (info) vs statscrew {k[0]} {k[1]}: {mine21.get(k)} vs {theirs.get(k)} -- "
              f"{STATSCREW_1921_DIFFERENCES.get(k, 'UNEXPLAINED')}")


def compare_offense_teams(df):
    """Review aid: multi-team kicker seasons before 1970 against the same player-season's teams in
    sources/legacy_offense_seasons.csv (another script's output; info only)."""
    try:
        off = pd.read_csv(ROOT / "sources" / "legacy_offense_seasons.csv", usecols=["name", "season", "team"])
    except Exception as e:  # noqa: BLE001 (missing or mid-rewrite)
        print(f"  (info) offense table not compared: {e}")
        return
    off = {(name_key(n), s): set(str(t).split("/")) for n, s, t in zip(off["name"], off["season"], off["team"])}
    multi = df[df["team"].str.contains("/") & (df["season"] < 1970)]
    agree, differ = 0, []
    for n, s, t in zip(multi["name"], multi["season"], multi["team"]):
        theirs = off.get((name_key(n), s))
        if theirs is None:
            continue
        if theirs == set(t.split("/")):
            agree += 1
        else:
            differ.append(f"{n} {s} {t} vs {'/'.join(sorted(theirs))}")
    print(f"  (info) multi-team kicker seasons before 1970 vs the offense table: {agree} agree, "
          f"{len(differ)} differ: {differ}")


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
