#!/usr/bin/env python3
"""One-time build of sources/legacy_offense_seasons.csv: QB/RB/WR seasons, 1920-1998.

Run from the repo root:  python3 bot/legacy_build/offense.py

Downloads raw files once into .cache/legacy/raw/ (gitignored; reused when present),
reads them with pandas only, and writes one row per player per regular season in
the canonical offense columns of bot/common.py. The weekly bot only reads the CSV.
The script prints a summary and runs self-checks; it exits non-zero if one fails.

Sources
  * Backbone: NFL.com career stats scraped by trevyoungquist (Kaggle
    trevyoungquist/2020-nfl-stats-active-and-retired-players): passing, rushing,
    receiving, kick/punt returns, fumbles, positions. Regular season only: all
    13,000+ 1970-98 lines that link to PFR's regular-season tables are identical.
  * kendallgillies NFL.com scrape (Kaggle kendallgillies/nflstatistics): per-team
    season lines for about a third of all players. Used to repair split seasons
    and to add player-seasons the first scrape lacks (see below).
  * Pro Football Reference fantasy tables (github fantasydatapros/data, 1970-98):
    cross-check, per-season PFR position, fumbles lost.
  * Pro Football Reference scoring table (huggingface michaelmallari/nfl,
    1922-98, NFL only): games and TDs of multi-team seasons, return/fumble/other
    TDs, 2-point conversions, TD cross-check, and TD counts for players missing
    from both NFL.com scrapes.
  * Hand-checked lines (WEB_LINES, WEB_TEAMS, PFR_MULTI_TEAMS below, one URL per
    line): per-team season tables and player pages of jt-sw.com, whose lines are
    identical to NFL.com's wherever both exist (Zimmerman 1943, Layne 1958 and
    every first stint below), plus Wikipedia / HOF / profootballarchives for
    1920s teams. Looked up once with a web search tool; the script doesn't fetch them.
  * nflverse players.csv: Pro Football Reference ids (pfr_id).
  * octonion NFL.com standings: team games per season, for the postseason check.

Known gaps in the NFL.com backbone, and what this script does about them
  * Split seasons before 1970: the trevyoungquist scrape has one line per season,
    and for a player who changed teams that line is the FIRST team's line (its
    games and stats) filed under the LAST team's name: Bobby Layne 1958 shows
    his 2 Detroit games under Pittsburgh, Earl Morrall 1958 his 2 Pittsburgh
    games under Detroit. (Checked on the 189 split seasons kendallgillies has
    per-team lines for: the name is the last team's in all 189, the line the
    first team's in 186; and on all 43 checked on jt-sw.com.)
    From 1970 the scrape has full-season totals. Repairs, in order:
      1. kendallgillies has the per-team lines: the season is their sum, teams
         named in order ("nflcom+kg"); if the other stint had no stats, only
         its team and games are added.
      2. PFR's scoring table shows the season as 2TM/3TM: games and rushing/
         receiving TDs become PFR's full-season numbers (a season whose first
         stint had no stats is no longer dropped), and the row is flagged
         "+split" because its yardage is one stint's. All 35 such 1932-69 rows
         that the position rules keep (3 more are a kicker, a DB and George
         Blanda's empty 1950) were then replaced by hand-checked full lines
         (WEB_LINES), so none is left; the flag stays for future rebuilds. 1922-31
         rows have TDs only anyway; their team stays NFL.com's single team unless
         PFR_MULTI_TEAMS names both.
      3. QBs, players without rushing/receiving TDs, AFL players and 1920-21
         seasons are invisible to PFR's scoring table. split_candidates() lists
         1932-69 single-team rows whose team differs from the player's previous
         season and that have <= 70% of the team's games (151 rows, mostly
         off-season moves). Every QB (>= 20 passes) and AFL (>= 20 PPR points)
         candidate was checked on jt-sw.com: 5 were split seasons and are in
         WEB_LINES (Morrall 1958, Bratkowski 1963, Bukich 1958, King Hill 1968,
         Haynes 1967; also Alex Hawkins 1967, whose empty first stint had been
         dropped), 41 checked lines are single-team (CHECKED_NOT_SPLIT). The
         other ~150 candidates (NFL backs and receivers with few points) are not
         checked, and a split season that doesn't look like one (the player
         keeps his previous team's name, or plays most of the team's games) is
         not even a candidate: such seasons may still be one stint filed under
         the last team. 1922-31 seasons that PFR doesn't show as multi-team
         and 1920-21 seasons are only fixed where listed (WEB_TEAMS).
  * Some profiles have no stat lines at all (e.g. Roy Zimmerman, Ernie Steele,
    Bill Hewitt). Seasons through 1969 are added from kendallgillies when it has
    them; otherwise, when PFR's scoring table shows rushing/receiving TDs, a
    TD-only row is added (source "pfr-scoring"; for a 2TM/3TM line only with
    the teams of PFR_MULTI_TEAMS, else it is skipped and logged). From 1932 all
    of them (Hewitt, Steele, Grigas, Currivan, Bova, Sherman, Hinkle, Butler,
    Rucinski, McCullough, McDonough, Tom Miller: the hollow 1939-49 Pirates/
    Steelers, Phil-Pitt, Card-Pitt and Boston Yanks lines) were replaced by
    hand-checked full lines, including their seasons without a TD. The 24
    TD-only rows left are 1922-29, where no row has yardage.
  * 1920-31: the NFL kept no official statistics. PFR shows partial unofficial
    yardage for some players (and jt-sw.com some), but none of the sources used
    here has it, so these columns are empty; TDs come from NFL.com and, for
    1922-31 split seasons and players NFL.com lacks, from PFR's scoring table.

Judgement calls
  * Seasons 1920-1998, regular season only. The AFL (1960-69) is included; the
    AAFC (1946-49: Browns, 49ers, Colts, Bills, Dons, Yankees, Dodgers, Rockets,
    Hornets, Bisons, Seahawks) is excluded because the NFL does not count it.
  * One row per player-season; a split season sums the teams and joins their
    codes with "/" in the order played (e.g. "RAM/IND"; for Scotty Bierce 1923
    the order isn't known), when a source names both teams. Otherwise team is
    NFL.com's single team for that season (1970-98 split seasons that
    kendallgillies doesn't name have full stats but only the last team).
  * Team codes are Pro Football Reference's season-table codes of the era (the
    "Tm" column of the PFR tables above): GNB, CRD, BOS for every Boston team,
    RAM for the Cleveland/LA Rams, STL for the St. Louis Cardinals and Rams,
    BAL for the Colts and Ravens, BCL 1950 Colts, HOU/TEN Oilers, RAI/OAK,
    PHO/ARI, NWE ... PFR tables have no 1920-21 or AFL rows, so those follow
    PFR style: DEC Decatur Staleys, CHT Chicago Tigers, MUN Muncie Flyers, WSN
    1921 Washington Senators, LAC 1960 LA Chargers, NYT NY Titans, DTX Dallas
    Texans. team_name is NFL.com's name for that season (e.g. "Portsmouth
    Spartans", "Boston Redskins"), except 1920 Chicago Cardinals (NFL.com:
    "Chicago (Racine) Cardinals"; the defense tables use "Chicago Cardinals"),
    1921 New York Brickley Giants (NFL.com: "New York Giants", but not today's
    franchise; the code stays NYG as in the defense tables), 1925 Akron Pros,
    1940 Pittsburgh Steelers, 1943 Phil-Pitt Combine and 1944 Card-Pitt
    Combine, where NFL.com's labels are mixed or out of date. Split seasons
    join the names with " / ".
  * Position: NFL.com's career position. QB -> QB; RB/HB/FB/TB/BB/WB/B -> RB;
    WR/E/OE/SE/FL -> WR; TE -> dropped (no TE list). A back's season counts as
    QB when he mostly passed: passing out-scored his running and receiving
    (>= 20 attempts, or >= 2 TD passes in 1920-31 when attempts are unknown),
    or, before 1960, by usage: >= 20 passes and more passes than runs (the
    single-wing tailbacks, e.g. Ace Parker, Harry Newman 1933: the era's
    interceptions make their passing points look small). Before 1950 a career
    "QB" who ran more than he passed (>= 20 runs) and gained more yards running
    and receiving than passing counts as RB: NFL.com lists single-wing blocking
    backs as QBs (e.g. Gene Ronzani). Players with no position or a non-offense
    one (two-way era DBs and linemen, kickers, punters, CBs who also played WR)
    get a per-season position from PFR's fantasy table (1970-98) or else from
    where their points came from (passing -> QB, rushing -> RB, receiving ->
    WR; before 1960 a "RB" with the passing usage above -> QB). Those rows are
    kept only with meaningful offense: >= 10 touches, or before 1950 (two-way
    football) >= 6 PPR points, so a tackle-eligible TD catch or a punter's fake
    run doesn't make a lineman a WR. Inferred TEs are dropped. Finally a player
    with two positions inside one decade gets the one that scored most for
    that decade, so his decade isn't split across two lists; before 1960 a back
    with QB and RB seasons in a decade also gets QB if he threw more than he ran
    over the decade (e.g. Ed Matesic 1930s; Tuffy Leemans stays a 1940s RB).
  * Rows with no offensive production at all are dropped (nflverse likewise
    only has weeks where a player recorded a stat).
  * other_tds = punt + kick return TDs + PFR's "other" TDs (blocked/missed kick
    returns: special-teams TDs, like nflverse's special_teams_tds) + PFR's
    fumble-return TDs from 1950 on when PFR's season position for the player
    isn't a defensive one (like nflverse's offensive fumble_recovery_tds).
    Return TDs are PFR's for lines linked to its scoring table (it files some
    as "other", which would count twice if NFL.com's were added too; the two
    agree on 99.9% of lines) and NFL.com's otherwise (AFL, unlinked lines).
    Before 1950 (two-way football) a fumble-return TD was usually a defensive
    play (e.g. George Halas's 98-yard return against Oorang in 1923), so none
    is counted; AFL fumble-recovery TDs are unknown and count as 0.
  * two_point_conversions: 0 for NFL seasons before 1994 (no such play); empty
    for AFL 1960-69 (the AFL had them; no source). 1994-98 is PFR's 2PM, which
    counts conversions a player scored (ran or caught); conversions a QB threw
    are in no source here.
  * fumbles_lost: PFR's fantasy table only has real values from 1994 (its
    1970-93 column is all zeros); NFL.com has them from 1992 but agrees with PFR
    on only ~89% of 1994-98 lines, so 1992-93 is left empty too. 1994-98 = PFR
    (NFL.com for the few lines that don't link to PFR); empty before 1994.
  * pfr_id: matched to nflverse players.csv (starts with 1974 rookies) by name
    + career years (+ college, position as tie-breaks), one-to-one. nflverse
    has no pfr_id for 10 players whose careers run into 1999+ (Raghib Ismail,
    Jeff Graham, Bill Schroeder, ...); their pfr_id stays empty (none is
    invented) and the summary lists them with their nflverse gsis_id, so the
    bot will count their 1999+ seasons as a different player unless it also
    matches on gsis_id.

source column
  nflcom          trevyoungquist NFL.com line as is
  nflcom+kg       split season rebuilt from kendallgillies' per-team lines
  nflcom-kg       season found only in the kendallgillies scrape
  ...+web         line replaced by a hand-checked one (WEB_LINES / WEB_TEAMS)
  web             hand-checked line of a player missing from both NFL.com scrapes
  ...+pfr         linked to a PFR table (fumbles lost, 2PM, return/fumble/other
                  TDs; for multi-team seasons also games and rushing/receiving TDs)
  ...+split       multi-team season with one stint's yardage (none left; see above)
  pfr-scoring     TD-only row from PFR's scoring table (player missing from both
                  NFL.com scrapes; 1922-29 only)

Unknown (empty) cells
  * 1920-1931: completions, attempts, passing_yards, interceptions, carries,
    rushing_yards, receptions, receiving_yards (no official statistics; see above).
  * Before 1994: fumbles_lost.
  * AFL 1960-69: two_point_conversions.
  * Rows with source "pfr-scoring" (1922-29 players missing from both NFL.com
    scrapes): also passing_tds.
"""

import re
import sys
import unicodedata
import urllib.request
import zipfile
from difflib import SequenceMatcher
from functools import reduce
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bot"))
from scoring import score_offense  # noqa: E402  (the bot's own scoring, for the printout only)

RAW = ROOT / ".cache" / "legacy" / "raw"
OUT = ROOT / "sources" / "legacy_offense_seasons.csv"
FIRST_SEASON, LAST_SEASON = 1920, 1998
NO_YARDAGE_BEFORE = 1932  # 1920-31: TD counts only
COMBINED_SPLITS_FROM = 1970  # trevyoungquist has full split seasons from here on
FUMBLES_LOST_FROM = 1994
TWO_POINT_FROM = 1994
PLATOON_FROM = 1950  # free substitution; from here on non-offense players need 10 touches
SINGLE_WING_UNTIL = 1960  # before this, a back who threw more than he ran is a QB

COLUMNS = [
    "player_id", "pfr_id", "name", "position", "season", "team", "team_name", "games",
    "completions", "attempts", "passing_yards", "passing_tds", "interceptions",
    "carries", "rushing_yards", "rushing_tds", "receptions", "receiving_yards",
    "receiving_tds", "two_point_conversions", "fumbles_lost", "other_tds", "source",
    # nflverse's player id, only for players nflverse has without a pfr_id, so the bot can
    # still merge their 1990s seasons with their 1999+ ones.
    "gsis_id",
]
STATS = COLUMNS[8:22]
LINE = ["completions", "attempts", "passing_yards", "passing_tds", "interceptions",
        "carries", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds"]
YARDAGE = ["completions", "attempts", "passing_yards", "interceptions", "carries",
           "rushing_yards", "receptions", "receiving_yards"]
TDS = ["passing_tds", "rushing_tds", "receiving_tds"]
SIG = ["passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "receptions",
       "receiving_yards", "receiving_tds"]

KAGGLE = "https://www.kaggle.com/api/v1/datasets/download/"
MALLARI = "michaelmallari_nfl_players_1922_2022.csv"
URLS = {
    "trev.zip": KAGGLE + "trevyoungquist/2020-nfl-stats-active-and-retired-players",
    "kendallgillies.zip": KAGGLE + "kendallgillies/nflstatistics",
    MALLARI: "https://huggingface.co/datasets/michaelmallari/nfl/resolve/main/nfl-players-1922-2022.csv",
    "nflverse/players.csv": "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
    "octonion_nfl_team_standings.csv":
        "https://raw.githubusercontent.com/octonion/football-public/master/nfl/csv/nfl_team_standings.csv",
}
for _y in range(1970, LAST_SEASON + 1):
    URLS[f"fdp/{_y}.csv"] = f"https://raw.githubusercontent.com/fantasydatapros/data/master/yearly/{_y}.csv"

# NFL.com team label -> [(first season, last season, PFR-style code)]. Names come from the label.
TEAMS = {
    "AkronPros": [(1920, 1925, "AKR")], "AkronIndians": [(1925, 1926, "AKR")],
    "BuffaloAll-Americans": [(1920, 1923, "BUF")],
    "BuffaloBisons": [(1924, 1925, "BUF"), (1927, 1927, "BUF"), (1929, 1929, "BUF")],
    "BuffaloRangers": [(1926, 1926, "BUF")], "BuffaloBills": [(1960, 1998, "BUF")],
    "Chicago(Racine)Cardinals": [(1920, 1920, "CRD")], "ChicagoCardinals": [(1921, 1959, "CRD")],
    "Card-PittCombine": [(1944, 1944, "CRD")], "St.LouisCardinals": [(1960, 1987, "STL")],
    "PhoenixCardinals": [(1988, 1993, "PHO")], "ArizonaCardinals": [(1994, 1998, "ARI")],
    "DecaturStaleys": [(1920, 1920, "DEC")], "ChicagoStaleys": [(1921, 1921, "CHI")],
    "ChicagoBears": [(1922, 1998, "CHI")], "ChicagoTigers": [(1920, 1920, "CHT")],
    "CantonBulldogs": [(1920, 1926, "CAN")],
    "ColumbusPanhandles": [(1920, 1922, "COL")], "ColumbusTigers": [(1923, 1926, "COL")],
    "ClevelandTigers": [(1920, 1920, "CLE")],
    "ClevelandIndians": [(1921, 1921, "CLE"), (1923, 1923, "CLI"), (1931, 1931, "CLE")],
    "ClevelandBulldogs": [(1924, 1927, "CLE")], "ClevelandBrowns": [(1950, 1995, "CLE")],
    "ClevelandRams": [(1937, 1945, "RAM")], "LosAngelesRams": [(1946, 1994, "RAM")],
    "St.LouisRams": [(1995, 1998, "STL")],
    "DaytonTriangles": [(1920, 1929, "DAY")],
    "DetroitHeralds": [(1920, 1920, "DET")], "DetroitTigers": [(1921, 1921, "DET")],
    "DetroitPanthers": [(1925, 1926, "DET")], "DetroitWolverines": [(1928, 1928, "DET")],
    "PortsmouthSpartans": [(1930, 1933, "PRT")], "DetroitLions": [(1934, 1998, "DET")],
    "HammondPros": [(1920, 1926, "HAM")], "MuncieFlyers": [(1920, 1921, "MUN")],
    "RockIslandIndependents": [(1920, 1925, "RII")], "RochesterJeffersons": [(1920, 1925, "RCH")],
    "GreenBayPackers": [(1921, 1998, "GNB")], "EvansvilleCrimsonGiants": [(1921, 1922, "EVN")],
    "WashingtonSenators": [(1921, 1921, "WSN")],
    "MinneapolisMarines": [(1921, 1924, "MIN")], "MinneapolisRedJackets": [(1929, 1930, "MIN")],
    "MinnesotaVikings": [(1961, 1998, "MIN")],
    "LouisvilleBrecks": [(1921, 1923, "LOU")], "LouisvilleColonels": [(1926, 1926, "LOU")],
    "CincinnatiCelts": [(1921, 1921, "CIN")], "CincinnatiReds": [(1933, 1934, "CIN")],
    "CincinnatiBengals": [(1968, 1998, "CIN")],
    "NewYorkGiants": [(1921, 1921, "NYG"), (1925, 1998, "NYG")],
    "MilwaukeeBadgers": [(1922, 1926, "MIL")],
    "RacineLegion": [(1922, 1924, "RAC")], "RacineTornadoes": [(1926, 1926, "RAC")],
    "OorangIndians": [(1922, 1923, "OOR")], "ToledoMaroons": [(1922, 1923, "TOL")],
    "DuluthKelleys": [(1923, 1925, "DUL")], "DuluthEskimos": [(1926, 1927, "DUL")],
    "St.LouisAll-Stars": [(1923, 1923, "STL")], "St.LouisGunners": [(1934, 1934, "STL")],
    "KenoshaMaroons": [(1924, 1924, "KEN")],
    "FrankfordYellowJackets": [(1924, 1931, "FRN")],
    "KansasCityBlues": [(1924, 1924, "KAN")], "KansasCityCowboys": [(1925, 1926, "KAN")],
    "KansasCityChiefs": [(1963, 1998, "KAN")], "DallasTexans": [(1952, 1952, "DTX"), (1960, 1962, "DTX")],
    "ProvidenceSteamRoller": [(1925, 1931, "PRV")], "PottsvilleMaroons": [(1925, 1928, "POT")],
    "HartfordBlues": [(1926, 1926, "HRT")], "LosAngelesBuccaneers": [(1926, 1926, "LAB")],
    "BrooklynLions": [(1926, 1926, "BRL")],
    "NewYorkYankees": [(1927, 1928, "NYY")], "NewYorkBulldogs": [(1949, 1949, "NYY")],
    "NewYorkYanks": [(1950, 1951, "NYY")],
    "OrangeTornadoes": [(1929, 1929, "TOR")], "NewarkTornadoes": [(1930, 1930, "TOR")],
    "StatenIslandStapletons": [(1929, 1932, "SIS")],
    "BostonBulldogs": [(1929, 1929, "BOS")], "BostonBraves": [(1932, 1932, "BOS")],
    "BostonRedskins": [(1933, 1936, "BOS")], "WashingtonRedskins": [(1937, 1998, "WAS")],
    "BostonYanks": [(1944, 1948, "BOS")], "BostonPatriots": [(1960, 1970, "BOS")],
    "NewEnglandPatriots": [(1971, 1998, "NWE")],
    "BrooklynDodgers": [(1930, 1944, "BKN")], "BrooklynTigers": [(1944, 1944, "BKN")],
    "PittsburghPirates": [(1933, 1940, "PIT")], "PittsburghSteelers": [(1941, 1998, "PIT")],
    "PhiladelphiaEagles": [(1933, 1998, "PHI")], "Phil-PittCombine": [(1943, 1943, "PHI")],
    "SanFrancisco49ers": [(1950, 1998, "SFO")],
    "BaltimoreColts": [(1950, 1950, "BCL"), (1953, 1983, "BAL")],
    "IndianapolisColts": [(1984, 1998, "IND")], "BaltimoreRavens": [(1996, 1998, "BAL")],
    "DallasCowboys": [(1960, 1998, "DAL")],
    "OaklandRaiders": [(1960, 1981, "OAK"), (1995, 1998, "OAK")], "LosAngelesRaiders": [(1982, 1994, "RAI")],
    "NewYorkTitans": [(1960, 1962, "NYT")], "NewYorkJets": [(1963, 1998, "NYJ")],
    "HoustonOilers": [(1960, 1996, "HOU")], "TennesseeOilers": [(1997, 1998, "TEN")],
    "DenverBroncos": [(1960, 1998, "DEN")],
    "LosAngelesChargers": [(1960, 1960, "LAC")], "SanDiegoChargers": [(1961, 1998, "SDG")],
    "MiamiDolphins": [(1966, 1998, "MIA")], "AtlantaFalcons": [(1966, 1998, "ATL")],
    "NewOrleansSaints": [(1967, 1998, "NOR")], "TampaBayBuccaneers": [(1976, 1998, "TAM")],
    "SeattleSeahawks": [(1976, 1998, "SEA")], "CarolinaPanthers": [(1995, 1998, "CAR")],
    "JacksonvilleJaguars": [(1995, 1998, "JAX")],
}
# Where NFL.com's label isn't the team's name that season (or varies between players).
TEAM_NAME_OVERRIDES = {
    ("CRD", 1920): "Chicago Cardinals",  # NFL.com: "Chicago (Racine) Cardinals"; same name as the defense tables
    ("NYG", 1921): "New York Brickley Giants",  # not the 1925- Giants franchise
    ("AKR", 1925): "Akron Pros",  # NFL.com labels some 1925 lines with the 1926 name
    ("PIT", 1940): "Pittsburgh Steelers",  # renamed from Pirates before the 1940 season
    ("PHI", 1943): "Phil-Pitt Combine",  # merged Eagles/Steelers; some lines say Eagles
    ("CRD", 1944): "Card-Pitt Combine",  # merged Cardinals/Steelers; some lines say Cardinals
}
AAFC_SEASONS = range(1946, 1950)
AAFC_TEAMS = {
    "ClevelandBrowns", "SanFrancisco49ers", "BaltimoreColts", "BuffaloBills", "BuffaloBisons",
    "LosAngelesDons", "NewYorkYankees", "BrooklynDodgers", "ChicagoRockets", "ChicagoHornets",
    "MiamiSeahawks",
}
AFL_TEAMS = {
    "BostonPatriots", "BuffaloBills", "DallasTexans", "KansasCityChiefs", "DenverBroncos",
    "HoustonOilers", "LosAngelesChargers", "SanDiegoChargers", "NewYorkTitans", "NewYorkJets",
    "OaklandRaiders", "MiamiDolphins", "CincinnatiBengals",
}

JTSW = "https://www.jt-sw.com/football/pro/"

# Teams of some 2TM/3TM lines of PFR's scoring table (keyed by its name for the player, after
# PFR_ALIASES), in the order played, checked by hand (URL per line): players missing from both
# NFL.com scrapes, whose TD-only rows need a team, and 1922-31 split seasons.
PFR_MULTI_TEAMS = {
    ("Buck Gavin", 1922): ("RII/BUF", "en.wikipedia.org/wiki/Buck_Gavin; statscrew 1922 RII (7 G) and BUF (3 G) rosters"),
    ("Tillie Voss", 1922): ("RII/AKR", "en.wikipedia.org/wiki/Tillie_Voss"),
    ("Eddie Usher", 1922): ("RII/GNB", "en.wikipedia.org/wiki/Eddie_Usher; profootballarchives.com/players/u/ushe00400.html"),
    ("Scotty Bierce", 1923): ("CLI/BUF", "statscrew.com/football/roster/t-CL2/y-1923; profootballarchives.com/players/b/bier00200.html (order not known)"),
    ("Mickey MacDonell", 1925): ("DUL/CRD", "en.wikipedia.org/wiki/Mickey_MacDonnell; profootballarchives.com/1925nfldul.html"),
    ("Adrian Ford", 1927): ("FRN/POT", "en.wikipedia.org/wiki/Adrian_Ford; statscrew.com/football/stats/p-fordadr001"),
    ("Don Hill", 1929): ("CRD/GNB", "en.wikipedia.org/wiki/Don_Hill_(American_football) (PFR: CRD 10 G, GNB 3 G)"),
    ("Gus Sonnenberg", 1923): ("BUF/COL", "en.wikipedia.org/wiki/Gus_Sonnenberg (Buffalo one game, then Columbus)"),
    ("Ed Halicki", 1930): ("FRN/MIN", "en.wikipedia.org/wiki/Ed_Halicki_(American_football) (FRN 13 G, MIN 1 G)"),
    ("Chief McLain", 1931): ("PRT/SIS", "profootballarchives.com/players/m/mcla00600.html (PRT 1 G, SIS 9 G)"),
    ("Coley McDonough", 1939): ("CRD/PIT", JTSW + "players.nsf/ID/02020005"),
    ("Johnny Butler", 1944): ("CRD/BKN", JTSW + "players.nsf/ID/02420006"),
    ("Don Currivan", 1948): ("BOS/RAM", JTSW + "players.nsf/ID/02450020"),
}

def _web(teams, games, url, p=(0, 0, 0, 0, 0), r=(0, 0, 0), c=(0, 0, 0)):
    """A hand-checked season line: p = completions, attempts, yards, TDs, INTs; r = carries,
    yards, TDs; c = receptions, yards, TDs. teams = era codes joined in the order played."""
    return {"teams": teams, "games": games, "url": url, **dict(zip(LINE, (*p, *r, *c)))}


# Full season lines checked by hand on jt-sw.com (per-team season tables and player pages,
# whose lines match NFL.com's where both exist, e.g. Zimmerman 1943, Layne 1958). They replace
# what the scrapes have: split seasons where NFL.com kept one stint (labelled with the other
# team), and players missing from both NFL.com scrapes (TD-only rows from PFR's scoring table,
# or no row at all). Each is also a self-check.
_GRIGAS = JTSW + "players.nsf/ID/02420021"
_CURRIVAN = JTSW + "players.nsf/ID/02450020"
_HEWITT = JTSW + "players.nsf/ID/01350005"
_STEELE = JTSW + "players.nsf/ID/02320006"
_BOVA = JTSW + "players.nsf/ID/02350004"
_HINKLE = JTSW + "players.nsf/ID/02120008"
_BUTLER = JTSW + "players.nsf/ID/02420006"
_SHERMAN = JTSW + "players.nsf/ID/02410004"
_MILLER = JTSW + "players.nsf/ID/02460011"
_MCCULLOUGH = JTSW + "players.nsf/ID/02080004"
_MCDONOUGH = JTSW + "players.nsf/ID/02020005"
_RUCINSKI = JTSW + "players.nsf/ID/02250014"
WEB_LINES = {
    # Split seasons: NFL.com shows the first stint under the second team's name.
    # From Wikipedia's per-team 1967 table (BOS 7 G 27/81 442 1 TD 7 INT, 19-35-3; HOU 3 G
    # 4/11 38, 3 for -5).
    ("nflcom:don-trull", 1967): _web("BOS/HOU", 10, "https://en.wikipedia.org/wiki/Don_Trull",
                                    p=(31, 92, 480, 1, 7), r=(22, 30, 3)),
    # Wikipedia gives only his combined 1963 passing (NYG 4 G, PHI 2 G: 7/24, 118 yds, 0 TD,
    # 3 INT); rushing is NFL.com's one stint (3 for 3), the other stint's runs are unknown.
    ("nflcom:ralph-guglielmi", 1963): _web("NYG/PHI", 6, "https://en.wikipedia.org/wiki/Ralph_Guglielmi",
                                          p=(7, 24, 118, 0, 3), r=(3, 3, 0)),
    ("nflcom:earl-morrall", 1958): _web("PIT/DET", 11, JTSW + "stats.nsf/Annual/1958-pit and 1958-det",
                                       p=(25, 78, 463, 5, 9), r=(11, 80, 0)),
    ("nflcom:zeke-bratkowski", 1963): _web("RAM/GNB", 6, JTSW + "players.nsf/ID/03510029",
                                          p=(49, 93, 567, 4, 9), r=(4, -3, 0)),
    ("nflcom:abner-haynes", 1967): _web("MIA/NYJ", 14, JTSW + "players.nsf/ID/04120072",
                                       r=(72, 346, 2), c=(16, 100, 0)),
    ("nflcom:alex-hawkins", 1967): _web("ATL/BAL", 14, JTSW + "players.nsf/ID/04020019",
                                       r=(2, 12, 0), c=(27, 469, 4)),
    ("nflcom:king-hill", 1968): _web("PHI/MIN", 11, JTSW + "players.nsf/ID/03910034",
                                    p=(33, 71, 531, 3, 6), r=(1, 1, 0)),
    ("nflcom:rudy-bukich", 1958): _web("WAS/CHI", 4, JTSW + "players.nsf/ID/03410042",
                                      p=(8, 23, 166, 1, 1), r=(2, 16, 0)),
    # The split seasons PFR's scoring table shows as 2TM/3TM that kendallgillies didn't rebuild
    # (the '+split' rows): in every one NFL.com's line is the first team's line, as above.
    ("nflcom:bo-molenda", 1932): _web("GNB/NYG", 12, JTSW + "players.nsf/ID/00820025",
                                     p=(7, 15, 106, 1, 1), r=(34, 66, 0), c=(1, 15, 0)),
    ("nflcom:stu-clancy", 1932): _web("SIS/NYG", 12, JTSW + "players.nsf/ID/01180049",
                                     p=(2, 13, 45, 0, 4), r=(54, 181, 0), c=(4, 58, 1)),
    ("nflcom:walt-holmer", 1933): _web("BOS/PIT", 10, JTSW + "players.nsf/ID/01020087",
                                      p=(11, 32, 193, 0, 6), r=(13, 36, 1)),
    ("nflcom:red-corzine", 1934): _web("CIN/STL", 10, JTSW + "players.nsf/ID/01470042",
                                      p=(5, 11, 33, 0, 2), r=(62, 167, 1), c=(2, 22, 0)),
    ("nflcom:swede-johnston", 1934): _web("GNB/STL", 4, JTSW + "players.nsf/ID/01220042 and stats.nsf/Annual/1934-stl",
                                         p=(3, 4, 17, 0, 0), r=(42, 107, 1), c=(1, 25, 0)),
    ("nflcom:algy-clark", 1934): _web("CIN/PHI", 10, JTSW + "players.nsf/ID/01180006",
                                     p=(4, 10, 28, 0, 2), r=(1, 0, 0), c=(2, 18, 0)),
    ("nflcom:bill-shepherd", 1935): _web("BOS/DET", 12, JTSW + "players.nsf/ID/01620045",
                                        p=(28, 64, 417, 2, 14), r=(143, 425, 4), c=(4, 33, 0)),
    ("nflcom:george-grosvenor", 1936): _web("CHI/CRD", 10, JTSW + "players.nsf/ID/01620028",
                                           p=(12, 34, 173, 0, 6), r=(170, 612, 4), c=(1, 6, 0)),
    ("nflcom:dick-tuckey", 1938): _web("WAS/RAM", 7, JTSW + "players.nsf/ID/01920093",
                                      p=(8, 32, 140, 1, 3), r=(23, 76, 0), c=(1, 10, 0)),
    ("nflcom:boyd-brumbaugh", 1939): _web("BKN/PIT", 11, JTSW + "players.nsf/ID/01920007",
                                         p=(3, 9, 121, 2, 1), r=(111, 343, 2), c=(5, 95, 1)),
    ("nflcom:doug-russell", 1939): _web("CRD/RAM", 8, JTSW + "players.nsf/ID/01520041 and stats.nsf/Annual/1939-cle",
                                       p=(1, 7, 0, 0, 0), r=(9, 21, 0), c=(5, 67, 1)),
    ("nflcom:red-hickey", 1941): _web("PIT/RAM", 10, JTSW + "players.nsf/ID/02250005", r=(7, 7, 0), c=(21, 294, 4)),
    ("nflcom:bosh-pritchard", 1942): _web("RAM/PHI", 7, JTSW + "players.nsf/ID/02330060", r=(38, 166, 0), c=(2, 4, 0)),
    ("nflcom:flip-mcdonald", 1944): _web("BKN/PHI", 7, JTSW + "players.nsf/ID/02540093", c=(4, 26, 1)),
    ("nflcom:paul-duhart", 1945): _web("PIT/BOS", 5, JTSW + "players.nsf/ID/02530035", p=(3, 9, 27, 0, 2), r=(17, 17, 1)),
    ("nflcom:ed-frutig", 1945): _web("GNB/DET", 9, JTSW + "players.nsf/ID/02250088", c=(2, 5, 1)),
    ("nflcom:jim-poole", 1945): _web("CRD/NYG", 12, JTSW + "players.nsf/ID/01850032", c=(6, 82, 2)),
    ("nflcom:ken-roskie", 1948): _web("GNB/DET", 13, JTSW + "players.nsf/ID/02920100", r=(6, 29, 1)),
    ("nflcom:ralph-heywood", 1948): _web("DET/BOS", 10, JTSW + "players.nsf/ID/02840088", r=(1, 11, 0), c=(14, 208, 1)),
    ("nflcom:john-hollar", 1949): _web("DET/WAS", 8, JTSW + "players.nsf/ID/02920066", r=(13, 35, 1), c=(4, 38, 1)),
    ("nflcom:hal-prescott", 1949): _web("PHI/DET/NYY", 9, JTSW + "players.nsf/ID/02750059", c=(10, 162, 1)),
    ("nflcom:steve-pritko", 1949): _web("NYY/GNB", 10, JTSW + "players.nsf/ID/02450049", c=(7, 98, 2)),
    ("nflcom:frank-spaniel", 1950): _web("WAS/BCL", 12, JTSW + "players.nsf/ID/03130193", r=(15, 22, 1), c=(5, 84, 0)),
    ("nflcom:bosh-pritchard", 1951): _web("PHI/NYG", 11, JTSW + "players.nsf/ID/02330060", r=(42, 29, 0), c=(8, 103, 0)),
    ("nflcom:frank-tripucka", 1952): _web("CRD/DTX", 12, JTSW + "players.nsf/ID/03010030",
                                         p=(91, 186, 809, 3, 17), r=(10, 25, 3)),
    ("nflcom:steve-romanik", 1953): _web("CHI/CRD", 7, JTSW + "players.nsf/ID/03110067",
                                        p=(51, 125, 650, 4, 11), r=(2, 1, 1)),
    ("nflcom:hank-burnine", 1956): _web("NYG/PHI", 10, JTSW + "players.nsf/ID/03750025", c=(10, 208, 2)),
    ("nflcom:mike-sommer", 1959): _web("WAS/BAL", 9, JTSW + "players.nsf/ID/03930038", r=(62, 231, 2), c=(7, 111, 0)),
    ("nflcom:j-w-lockett", 1961): _web("SFO/DAL", 14, JTSW + "players.nsf/ID/04220133", r=(77, 298, 1), c=(19, 149, 2)),
    ("nflcom:tom-tracy", 1963): _web("PIT/WAS", 8, JTSW + "players.nsf/ID/03720032",
                                    p=(1, 4, 23, 0, 0), r=(29, 61, 1), c=(7, 112, 0)),
    ("nflcom:joe-don-looney", 1966): _web("DET/WAS", 13, JTSW + "players.nsf/ID/04520085", r=(63, 220, 4), c=(12, 49, 0)),
    ("nflcom:chuck-mercein", 1967): _web("NYG/GNB", 7, JTSW + "players.nsf/ID/04620087", r=(14, 56, 1), c=(1, 6, 0)),
    ("nflcom:jerry-simmons", 1967): _web("NOR/ATL", 14, JTSW + "players.nsf/ID/04640047", c=(23, 312, 2)),
    ("nflcom:junior-coffey", 1969): _web("ATL/NYG", 12, JTSW + "players.nsf/ID/04620112", r=(131, 511, 2), c=(14, 89, 3)),
    # Players missing from both NFL.com scrapes (1939-49 Pirates/Steelers, Phil-Pitt, Card-Pitt,
    # Boston Yanks and others).
    ("nflcom:john-grigas", 1943): _web("CRD", 10, _GRIGAS, p=(4, 19, 98, 0, 4), r=(105, 333, 3), c=(19, 225, 0)),
    ("nflcom:john-grigas", 1944): _web("CRD", 9, _GRIGAS, p=(50, 131, 690, 6, 21), r=(185, 610, 3), c=(2, 33, 0)),
    ("nflcom:john-grigas", 1945): _web("BOS", 10, _GRIGAS, p=(5, 14, 85, 0, 1), r=(64, 160, 2), c=(5, 59, 0)),
    ("nflcom:john-grigas", 1946): _web("BOS", 11, _GRIGAS, p=(1, 2, 16, 0, 1), r=(84, 426, 2), c=(3, 61, 1)),
    ("nflcom:john-grigas", 1947): _web("BOS", 9, _GRIGAS, r=(27, 52, 0), c=(1, 1, 0)),
    ("nflcom:don-currivan", 1943): _web("CRD", 7, _CURRIVAN, c=(5, 79, 1)),
    ("nflcom:don-currivan", 1944): _web("CRD", 10, _CURRIVAN, c=(7, 163, 2)),
    ("nflcom:don-currivan", 1945): _web("BOS", 10, _CURRIVAN, c=(16, 397, 4)),
    ("nflcom:don-currivan", 1946): _web("BOS", 11, _CURRIVAN, c=(11, 262, 4)),
    ("nflcom:don-currivan", 1947): _web("BOS", 12, _CURRIVAN, c=(24, 782, 9)),
    ("nflcom:don-currivan", 1948): _web("BOS/RAM", 13, _CURRIVAN, r=(1, -4, 0), c=(12, 218, 3)),
    ("nflcom:don-currivan", 1949): _web("RAM", 12, _CURRIVAN, c=(3, 78, 1)),
    ("nflcom:bill-hewitt", 1932): _web("CHI", 13, _HEWITT, r=(1, 29, 1), c=(7, 77, 0)),
    ("nflcom:bill-hewitt", 1933): _web("CHI", 13, _HEWITT, p=(4, 7, 59, 3, 0), r=(2, 1, 0), c=(14, 273, 2)),
    ("nflcom:bill-hewitt", 1934): _web("CHI", 13, _HEWITT, p=(1, 2, 4, 0, 0), r=(1, 14, 0), c=(11, 151, 5)),
    ("nflcom:bill-hewitt", 1935): _web("CHI", 12, _HEWITT, p=(0, 1, 0, 0, 0), r=(1, 0, 0), c=(5, 80, 0)),
    ("nflcom:bill-hewitt", 1936): _web("CHI", 12, _HEWITT, r=(2, -9, 0), c=(15, 358, 6)),
    ("nflcom:bill-hewitt", 1937): _web("PHI", 11, _HEWITT, c=(16, 197, 5)),
    ("nflcom:bill-hewitt", 1938): _web("PHI", 11, _HEWITT, c=(18, 237, 4)),
    ("nflcom:bill-hewitt", 1939): _web("PHI", 10, _HEWITT, r=(1, 1, 0), c=(15, 243, 1)),
    ("nflcom:bill-hewitt", 1943): _web("PHI", 6, _HEWITT, c=(2, 22, 0)),
    ("nflcom:ernie-steele", 1942): _web("PHI", 10, _STEELE, r=(24, 124, 0), c=(7, 114, 1)),
    ("nflcom:ernie-steele", 1943): _web("PHI", 10, _STEELE, p=(0, 1, 0, 0, 1), r=(85, 409, 4), c=(9, 168, 2)),
    ("nflcom:ernie-steele", 1944): _web("PHI", 9, _STEELE, r=(59, 247, 5), c=(1, 22, 0)),
    ("nflcom:ernie-steele", 1945): _web("PHI", 7, _STEELE, p=(1, 2, 12, 0, 1), r=(20, 212, 2), c=(3, 42, 0)),
    ("nflcom:ernie-steele", 1946): _web("PHI", 9, _STEELE, r=(31, 108, 1), c=(5, 69, 0)),
    ("nflcom:ernie-steele", 1947): _web("PHI", 12, _STEELE, r=(26, 138, 1), c=(4, 62, 0)),
    ("nflcom:ernie-steele", 1948): _web("PHI", 12, _STEELE, p=(0, 1, 0, 0, 1), r=(13, 99, 1), c=(2, 43, 1)),
    ("nflcom:tony-bova", 1942): _web("PIT", 11, _BOVA, c=(3, 37, 0)),
    ("nflcom:tony-bova", 1943): _web("PHI", 10, _BOVA, r=(1, 11, 0), c=(17, 419, 5)),
    ("nflcom:tony-bova", 1944): _web("CRD", 9, _BOVA, p=(6, 30, 96, 0, 1), r=(14, -22, 0), c=(19, 287, 2)),
    ("nflcom:tony-bova", 1945): _web("PIT", 10, _BOVA, p=(0, 1, 0, 0, 0), r=(6, 11, 0), c=(15, 215, 0)),
    ("nflcom:tony-bova", 1946): _web("PIT", 11, _BOVA, c=(6, 171, 0)),
    ("nflcom:jack-hinkle", 1940): _web("NYG", 3, _HINKLE, c=(3, 23, 0)),
    ("nflcom:jack-hinkle", 1943): _web("PHI", 10, _HINKLE, r=(116, 571, 3), c=(1, 3, 0)),
    ("nflcom:jack-hinkle", 1944): _web("PHI", 10, _HINKLE, r=(92, 421, 2), c=(2, 34, 0)),
    ("nflcom:jack-hinkle", 1945): _web("PHI", 3, _HINKLE, r=(11, 40, 0), c=(1, 8, 0)),
    ("nflcom:jack-hinkle", 1946): _web("PHI", 10, _HINKLE, r=(18, 33, 0)),
    ("nflcom:jack-hinkle", 1947): _web("PHI", 3, _HINKLE, r=(1, 2, 0)),
    ("nflcom:johnny-butler", 1943): _web("PHI", 10, _BUTLER, p=(6, 13, 84, 0, 1), r=(87, 362, 3), c=(3, 63, 0)),
    ("nflcom:johnny-butler", 1944): _web("CRD/BKN", 9, _BUTLER, p=(8, 23, 107, 0, 1), r=(60, 94, 0), c=(3, 109, 2)),
    ("nflcom:johnny-butler", 1945): _web("PHI", 7, _BUTLER, r=(21, 61, 1), c=(2, 14, 0)),
    ("nflcom:allie-sherman", 1943): _web("PHI", 9, _SHERMAN, p=(16, 37, 208, 2, 1), r=(17, -20, 1)),
    ("nflcom:allie-sherman", 1944): _web("PHI", 10, _SHERMAN, p=(16, 31, 156, 1, 2), r=(22, -42, 1)),
    ("nflcom:allie-sherman", 1945): _web("PHI", 10, _SHERMAN, p=(15, 29, 172, 2, 3), r=(16, -7, 1)),
    ("nflcom:allie-sherman", 1946): _web("PHI", 11, _SHERMAN, p=(17, 33, 264, 4, 3), r=(21, 8, 0)),
    ("nflcom:allie-sherman", 1947): _web("PHI", 11, _SHERMAN, p=(2, 5, 23, 0, 1), r=(17, 17, 1)),
    ("nflcom:tom-miller", 1943): _web("PHI", 8, _MILLER, c=(3, 60, 1)),
    ("nflcom:tom-miller", 1944): _web("PHI", 10, _MILLER, r=(1, -2, 0), c=(8, 135, 0)),
    ("nflcom:tom-miller", 1945): _web("WAS", 9, _MILLER, c=(11, 84, 0)),
    ("nflcom:hugh-mccullough", 1939): _web("PIT", 10, _MCCULLOUGH, p=(32, 100, 443, 2, 12), r=(60, 96, 1), c=(4, 57, 0)),
    ("nflcom:hugh-mccullough", 1940): _web("CRD", 11, _MCCULLOUGH, p=(43, 116, 529, 4, 21), r=(57, 278, 3)),
    ("nflcom:hugh-mccullough", 1941): _web("CRD", 7, _MCCULLOUGH, p=(12, 32, 133, 0, 5), r=(15, 22, 0)),
    # (1945 BOS 7 G, 0/6 passing, 3 INT, 2-1 rushing, 1-17 receiving: too little offense for a
    # career DB to be kept, so not listed.)
    ("nflcom:coley-mcdonough", 1939): _web("CRD/PIT", 11, _MCDONOUGH, p=(17, 47, 365, 2, 8), r=(29, 75, 0), c=(1, 3, 1)),
    ("nflcom:coley-mcdonough", 1940): _web("PIT", 4, _MCDONOUGH, p=(8, 14, 92, 0, 3), r=(15, 33, 1)),
    ("nflcom:coley-mcdonough", 1941): _web("PIT", 6, _MCDONOUGH, p=(12, 41, 200, 1, 7), r=(20, 64, 0)),
    ("nflcom:coley-mcdonough", 1944): _web("CRD", 2, _MCDONOUGH, p=(10, 23, 208, 2, 4), r=(3, 7, 0)),
    ("nflcom:eddie-rucinski", 1941): _web("BKN", 11, _RUCINSKI, r=(2, 13, 0), c=(17, 204, 1)),
    ("nflcom:eddie-rucinski", 1942): _web("BKN", 11, _RUCINSKI, c=(9, 99, 1)),
    ("nflcom:eddie-rucinski", 1943): _web("CRD", 10, _RUCINSKI, c=(26, 398, 3)),
    ("nflcom:eddie-rucinski", 1944): _web("CRD", 10, _RUCINSKI, r=(16, 72, 0), c=(22, 284, 1)),
    ("nflcom:eddie-rucinski", 1945): _web("CRD", 8, _RUCINSKI, c=(23, 400, 2)),
    ("nflcom:eddie-rucinski", 1946): _web("CRD", 10, _RUCINSKI, c=(2, 23, 0)),
}
# 1920-21 split seasons (PFR's scoring table starts in 1922): NFL.com shows the first stint
# under the last team's name. Teams and games, plus TDs where the other stint scored (no
# yardage is kept before 1932).
WEB_TEAMS = {
    # NFL.com: Decatur Staleys, 9 G. He played 9 games for the (Racine) Cardinals and the
    # season finale for Decatur: HOF profile "1920 Chicago (Racine) Car/Decatur 10";
    # statscrew 1920 Decatur roster (1 G).
    ("nflcom:paddy-driscoll", 1920): ("CRD/DEC", 10, "profootballhof.com/players/john-paddy-driscoll", {}),
    ("nflcom:pete-calac", 1921): ("CLE/WSN", 9, JTSW + "players.nsf/ID/00120033 (CLE 8 G, WAS 1 G)", {}),
    ("nflcom:jerry-noonan", 1921): ("RCH/NYG", 6, JTSW + "players.nsf/ID/00220164 (ROC 5 G, NYG 1 G)", {}),
    ("nflcom:benny-boynton", 1921): ("RCH/WSN", 5, JTSW + "players.nsf/ID/00220021 (ROC 3 G 2 rush/3 pass TD, "
                                     "WAS 2 G 1 rush/2 pass TD)", {"rushing_tds": 3, "passing_tds": 5}),
}


# Candidate split seasons (see split_candidates) checked by hand on jt-sw.com team pages: the
# player's line for the team NFL.com names equals NFL.com's line, so it isn't a split season.
CHECKED_NOT_SPLIT = [
    ("nflcom:gary-cuozzo", 1968), ("nflcom:al-dorow", 1962), ("nflcom:al-dorow", 1957), ("nflcom:george-izo", 1966),
    ("nflcom:george-izo", 1965), ("nflcom:george-izo", 1961), ("nflcom:ron-smith", 1966),
    ("nflcom:jim-ninowski", 1969), ("nflcom:karl-sweetan", 1968), ("nflcom:george-shaw", 1959),
    ("nflcom:ted-marchibroda", 1957), ("nflcom:terry-nofsinger", 1965), ("nflcom:joe-don-looney", 1965),
    ("nflcom:m-c-reynolds", 1960), ("nflcom:mike-taliaferro", 1968), ("nflcom:gene-thomas", 1968),
    ("nflcom:art-powell", 1967), ("nflcom:bob-long", 1968), ("nflcom:bob-berry", 1968),
    ("nflcom:bob-celeri", 1952), ("nflcom:fred-enke", 1953), ("nflcom:harry-gilmer", 1955),
    ("nflcom:rudy-bukich", 1957), ("nflcom:george-shaw", 1961), ("nflcom:ralph-guglielmi", 1961),
    ("nflcom:clem-daniels", 1961), ("nflcom:willard-dewveall", 1961), ("nflcom:butch-songin", 1962),
    ("nflcom:jim-ninowski", 1962), ("nflcom:lee-grosscup", 1962), ("nflcom:charlie-flowers", 1962),
    ("nflcom:john-mccormick", 1963), ("nflcom:john-roach", 1964), ("nflcom:dick-compton", 1965),
    ("nflcom:buddy-humphrey", 1966), ("nflcom:dennis-claridge", 1966), ("nflcom:cookie-gilchrist", 1966),
    ("nflcom:rick-casares", 1966), ("nflcom:terry-nofsinger", 1967), ("nflcom:lionel-taylor", 1967),
    ("nflcom:george-mira", 1969),
]

# PFR scoring-table names -> NFL.com profile names, where the two differ too much to match.
PFR_ALIASES = {
    "Mayes McLain": "Chief McLain",  # played as "Chief McLain" (en.wikipedia.org/wiki/Mayes_McLain)
    "Mickey MacDonnell": "Mickey MacDonell",  # NFL.com spelling; same Cardinals wingback 1925-30
}

DEFENSIVE_POSITIONS = {
    "DE", "LDE", "RDE", "DT", "LDT", "RDT", "NT", "MG", "DG", "LB", "LLB", "RLB", "MLB", "LILB", "RILB",
    "ILB", "OLB", "LOLB", "ROLB", "CB", "LCB", "RCB", "DB", "S", "SS", "FS", "DH", "LDH", "RDH", "K", "P",
}

CAREER_POSITION = {
    "QB": "QB",
    "RB": "RB", "HB": "RB", "FB": "RB", "TB": "RB", "BB": "RB", "WB": "RB", "B": "RB",
    "WR": "WR", "E": "WR", "OE": "WR", "SE": "WR", "FL": "WR",
    "TE": "TE",
}


def log(msg=""):
    print(msg, flush=True)


# --- raw files -----------------------------------------------------------------


def raw_file(name):
    """Path of a raw source file, downloading it the first time."""
    path = RAW / name
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log(f"  downloading {name} ...")
    with urllib.request.urlopen(URLS[name], timeout=300) as resp:
        body = resp.read()
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(body)
    tmp.replace(path)
    return path


def read_zip_csv(zip_name, member, **kw):
    with zipfile.ZipFile(raw_file(zip_name)) as zf, zf.open(member) as fh:
        return pd.read_csv(fh, **kw)


def trev_csv(member):
    kw = {"dtype": str, "keep_default_na": False}
    extracted = RAW / "trev" / member
    if extracted.exists():
        return pd.read_csv(extracted, **kw)
    return read_zip_csv("trev.zip", member, **kw)


def num(series):
    """'1,234' -> 1234; '--', '' and other non-numbers -> NaN."""
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")


# --- names and teams -----------------------------------------------------------

SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv)\b\.?")


def ascii_lower(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()


def norm_name(s):
    s = SUFFIX.sub(" ", re.sub(r"[*+.,]", " ", ascii_lower(s)))
    return re.sub(r"[^a-z]", "", s)


def last_name(s):
    words = SUFFIX.sub(" ", re.sub(r"[*+.,]", " ", ascii_lower(s))).split()
    return re.sub(r"[^a-z]", "", words[-1]) if words else ""


def first_name(s):
    words = re.sub(r"[*+.,]", " ", ascii_lower(s)).split()
    return re.sub(r"[^a-z]", "", words[0]) if words else ""


def words(s):
    return [re.sub(r"[^a-z]", "", w) for w in SUFFIX.sub(" ", re.sub(r"[*+.,()]", " ", ascii_lower(s))).split()]


def similar_names(a, b):
    """Spelling variants of one player: 'Walt LeJeune' ~ 'Walt LeJean', 'Johnny Blood' ~ 'Johnny (Blood) McNally'."""
    la, lb = last_name(a), last_name(b)
    if la and lb and SequenceMatcher(None, la, lb).ratio() >= 0.75:
        return True
    return la in words(b) or lb in words(a)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", ascii_lower(s)).strip("-")


def team_code(label, season):
    for first, last, code in TEAMS.get(label, []):
        if first <= season <= last:
            return code
    raise KeyError(f"no team code for {label} {season}")


def label_for(code, season):
    """NFL.com label of a team code in a season (the most specific one, e.g. Card-Pitt for CRD 1944)."""
    hits = [(b - a, lab) for lab, spans in TEAMS.items() for a, b, c in spans if c == code and a <= season <= b]
    if not hits:
        raise KeyError(f"no team label for {code} {season}")
    return min(hits)[1]


def team_display(label):
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", label)
    s = re.sub(r"(?<=[a-z])(?=[0-9])", " ", s)
    s = re.sub(r"\.(?=[A-Z])", ". ", s)
    s = re.sub(r"(?<=\S)\(", " (", s)
    return re.sub(r"\)(?=\S)", ") ", s)


def fill_line(df):
    """TDs default to 0; yardage is unknown (NaN) before 1932 and 0 when missing after."""
    early = df["season"] < NO_YARDAGE_BEFORE
    for c in TDS + ["kr_tds", "pr_tds"]:
        df[c] = df[c].fillna(0)
    for c in YARDAGE:
        df[c] = df[c].where(~early).where(early, df[c].fillna(0))
    return df


# --- NFL.com backbone (trevyoungquist) -------------------------------------------

TREV_KINDS = {
    "Passing": {"Completions": "completions", "Attempts": "attempts", "Yards": "passing_yards",
                "TDs": "passing_tds", "INTs": "interceptions"},
    "Rushing": {"Attempts": "carries", "Yards": "rushing_yards", "TDs": "rushing_tds"},
    "Receiving": {"Receptions": "receptions", "Yards": "receiving_yards", "TDs": "receiving_tds"},
    "KickReturns": {"TDs": "kr_tds"},
    "PuntReturns": {"TDs": "pr_tds"},
    "Fumbles": {"Fumbles_Lost": "nflcom_fumbles_lost"},
}
SPAN_ONLY_KINDS = ["Defense", "Kicking", "Punting"]


def trev_kind(kind):
    frames = [trev_csv(f"{who}Player_{kind}_Stats.csv") for who in ("Retired", "Active")]
    df = pd.concat(frames, ignore_index=True)
    df = df[df["Year"].str.fullmatch(r"\d{4}")].copy()
    df["Year"] = df["Year"].astype(int)
    return df


def load_trev():
    """One row per NFL.com profile per season (1920-98), plus career spans and bios."""
    spans, seasons = [], []
    for kind, cols in TREV_KINDS.items():
        df = trev_kind(kind)
        spans.append(df[["Player_Id", "Year"]])
        df = df[df["Year"].between(FIRST_SEASON, LAST_SEASON)]
        # A few profiles are in both the Retired and Active files with identical lines.
        df = df.drop_duplicates(["Player_Id", "Year"])
        out = df[["Player_Id", "Year", "Team", "Games_Played"]].rename(
            columns={"Team": f"team_{kind}", "Games_Played": f"g_{kind}"}
        )
        for theirs, ours in cols.items():
            out[ours] = num(df[theirs])
        out[f"g_{kind}"] = num(out[f"g_{kind}"])
        seasons.append(out)
    for kind in SPAN_ONLY_KINDS:
        spans.append(trev_kind(kind)[["Player_Id", "Year"]])

    df = reduce(lambda a, b: a.merge(b, on=["Player_Id", "Year"], how="outer"), seasons)
    team_cols = [f"team_{k}" for k in TREV_KINDS]
    teams = df[team_cols].replace("", pd.NA)
    df["label"] = teams.bfill(axis=1).iloc[:, 0]
    conflicts = int((teams.nunique(axis=1) > 1).sum())
    df["games"] = df[[f"g_{k}" for k in TREV_KINDS]].max(axis=1)
    df = df.rename(columns={"Player_Id": "nflcom_id", "Year": "season"})
    df = df.drop(columns=team_cols + [f"g_{k}" for k in TREV_KINDS])

    span = pd.concat(spans, ignore_index=True).groupby("Player_Id")["Year"].agg(["min", "max"])
    span.columns = ["span_first", "span_last"]

    bios = []
    for member in ("Retired_Player_Basic_Stats (1).csv", "Active_Player_Basic_Stats.csv"):
        b = trev_csv(member)
        bios.append(b[["Player_Id", "Full_Name", "Position", "College"]])
    bio = pd.concat(bios, ignore_index=True)
    bio["Position"] = bio["Position"].replace("--", "")
    bio = bio.sort_values("Position", ascending=False, kind="stable").drop_duplicates("Player_Id")
    bio = bio.set_index("Player_Id")
    bio["name"] = bio["Full_Name"].str.strip()
    bio["nname"] = bio["name"].map(norm_name)
    bio["college_n"] = bio["College"].map(lambda c: "" if c in ("No College", "--", "") else norm_name(c))
    return df, conflicts, span, bio


def prepare_base(df, bio):
    aafc = df["season"].isin(AAFC_SEASONS) & df["label"].isin(AAFC_TEAMS)
    no_team = df["label"].isna()
    log(f"  dropping {int(aafc.sum())} AAFC player-seasons (1946-49) and {int(no_team.sum())} without a team")
    df = df[~aafc & ~no_team].copy()
    df["player_id"] = "nflcom:" + df["nflcom_id"]
    df["labels"] = df["label"]
    df = df.join(bio[["name", "Position", "college_n"]], on="nflcom_id")
    missing = df["name"].fillna("") == ""
    df.loc[missing, "name"] = df.loc[missing, "nflcom_id"].str.replace(r"-\d+$", "", regex=True).str.replace("-", " ").str.title()
    df["career_pos"] = df["Position"].fillna("")
    df["college_n"] = df["college_n"].fillna("")
    df["src"] = "nflcom"
    df = df.drop(columns=["Position"])
    return fill_line(df).reset_index(drop=True)


def add_names(df, col="name"):
    df["nname"] = df[col].map(norm_name)
    df["lname"] = df[col].map(last_name)
    return df


# --- kendallgillies NFL.com scrape: per-team lines -----------------------------------

KG_FILES = {
    "Career_Stats_Passing.csv": {"Passes Completed": "completions", "Passes Attempted": "attempts",
                                 "Passing Yards": "passing_yards", "TD Passes": "passing_tds", "Ints": "interceptions"},
    "Career_Stats_Rushing.csv": {"Rushing Attempts": "carries", "Rushing Yards": "rushing_yards",
                                 "Rushing TDs": "rushing_tds"},
    "Career_Stats_Receiving.csv": {"Receptions": "receptions", "Receiving Yards": "receiving_yards",
                                   "Receiving TDs": "receiving_tds"},
    "Career_Stats_Kick_Return.csv": {"Returns for TDs": "kr_tds"},
    "Career_Stats_Punt_Return.csv": {"Returns for TDs": "pr_tds"},
}
KG_STATS = LINE + ["kr_tds", "pr_tds"]


def load_kg():
    """Per-team lines and per-season sums from the kendallgillies scrape."""
    frames = []
    for member, cols in KG_FILES.items():
        k = read_zip_csv("kendallgillies.zip", member, dtype=str, keep_default_na=False)
        df = pd.DataFrame({"kg_id": k["Player Id"], "kg_name": k["Name"], "season": num(k["Year"]),
                           "team_full": k["Team"].str.strip(), "g": num(k["Games Played"])})
        # Each player's lines are listed newest first; remember the position.
        df["order"] = df.groupby(["kg_id", "season"]).cumcount()
        for theirs, ours in cols.items():
            df[ours] = num(k[theirs])
        frames.append(df.dropna(subset=["season"]))
    keys = ["kg_id", "season", "team_full"]
    lines = frames[0]
    for f in frames[1:]:
        lines = lines.merge(f, on=keys, how="outer", suffixes=("", "_r"))
        for c in ("kg_name", "g", "order"):
            lines[c] = lines[c].fillna(lines[c + "_r"])
        lines = lines.drop(columns=[c + "_r" for c in ("kg_name", "g", "order")])
    lines["season"] = lines["season"].astype(int)
    lines = lines[lines["season"].between(FIRST_SEASON, LAST_SEASON) & (lines["team_full"] != "")].copy()
    lines["label"] = lines["team_full"].str.replace(" ", "", regex=False)
    lines = lines[~(lines["season"].isin(AAFC_SEASONS) & lines["label"].isin(AAFC_TEAMS))]
    unknown = ~lines["label"].isin(TEAMS.keys())
    if unknown.any():
        log(f"  kendallgillies: ignoring {int(unknown.sum())} lines with unknown teams: "
            + ", ".join(sorted(lines.loc[unknown, "label"].unique())[:8]))
        lines = lines[~unknown]
    name = lines["kg_name"].str.split(",", n=1)
    lines["name"] = [f"{p[1].strip()} {p[0].strip()}" if len(p) == 2 else p[0] for p in name]
    lines = fill_line(add_names(lines))

    lines = lines.sort_values(["kg_id", "season", "order"], ascending=[True, True, False])
    g = lines.groupby(["kg_id", "season"], sort=False)
    seasons = g[KG_STATS + ["g"]].sum(min_count=1)
    seasons["labels"] = g["label"].agg(lambda s: "/".join(dict.fromkeys(s)))
    seasons["n_teams"] = g["label"].nunique()
    for c in ("name", "nname", "lname"):
        seasons[c] = g[c].first()
    seasons = fill_line(seasons.reset_index())
    basic = read_zip_csv("kendallgillies.zip", "Basic_Stats.csv", dtype=str, keep_default_na=False)
    basic = basic.set_index("Player Id")
    seasons["college_n"] = seasons["kg_id"].map(basic["College"]).fillna("").map(norm_name)
    seasons["kg_pos"] = seasons["kg_id"].map(basic["Position"]).fillna("")
    return lines, seasons


def sig_string(df, cols):
    return df[cols].fillna(0).round().astype(int).astype(str).agg("|".join, axis=1)


def weight(df, cols):
    return df[cols].fillna(0).abs().sum(axis=1)


def map_kg_players(lines, kg_seasons, base, bio):
    """kendallgillies player id -> our player_id, by identical stat lines (+ name), else name + college."""
    b = base[["player_id", "season", "nname", "lname"] + SIG].copy()
    b["sig"], b["w"] = sig_string(b, SIG), weight(b, SIG)
    k = pd.concat([lines[["kg_id", "season", "nname", "lname"] + SIG], kg_seasons[["kg_id", "season", "nname", "lname"] + SIG]])
    k["sig"], k["w"] = sig_string(k, SIG), weight(k, SIG)
    k = k[k["w"] > 0].drop_duplicates(["kg_id", "season", "sig"])
    j = k.merge(b[b["w"] > 0], on=["season", "sig"], suffixes=("_k", "_b"))
    j = j[(j["nname_k"] == j["nname_b"]) | ((j["lname_k"] == j["lname_b"]) & (j["w_k"] >= 30)) | (j["w_k"] >= 300)]
    n = j.groupby(["kg_id", "player_id"])["season"].nunique().rename("n").reset_index()
    n = n.sort_values(["kg_id", "n", "player_id"], ascending=[True, False, True])
    n["tie"] = n.groupby("kg_id")["n"].transform(lambda s: (s == s.max()).sum() > 1)
    best = n[~n["tie"]].drop_duplicates("kg_id")
    # One kendallgillies profile per player: the one with the most identical seasons.
    best = best.sort_values(["player_id", "n", "kg_id"], ascending=[True, False, True]).drop_duplicates("player_id")
    mapping = dict(zip(best["kg_id"], best["player_id"]))

    # Profiles without stat lines (or partial ones): same name and same college.
    used = set(mapping.values())
    prof = bio[bio["college_n"] != ""].reset_index()
    prof = prof[~prof.duplicated(["nname", "college_n"], keep=False)]
    prof_key = dict(zip(zip(prof["nname"], prof["college_n"]), "nflcom:" + prof["Player_Id"]))
    by_college = 0
    for kg_id, nn, col in kg_seasons.drop_duplicates("kg_id")[["kg_id", "nname", "college_n"]].itertuples(index=False):
        if kg_id in mapping or not col:
            continue
        pid = prof_key.get((nn, col))
        if pid and pid not in used:
            mapping[kg_id] = pid
            used.add(pid)
            by_college += 1
    return mapping, len(best), by_college


def apply_kg(base, bio):
    lines, kg = load_kg()
    mapping, by_stats, by_college = map_kg_players(lines, kg, base, bio)
    log(f"  kendallgillies: {kg['kg_id'].nunique()} players; {by_stats} matched to NFL.com profiles by identical "
        f"lines, {by_college} by name + college")
    kg["player_id"] = kg["kg_id"].map(mapping)
    idx = {k: i for i, k in enumerate(zip(base["player_id"], base["season"]))}
    repaired, named, added, clash, disagree, games_raised = [], 0, [], 0, 0, 0
    names_by_team = base.groupby(["season", "label"])["name"].apply(list).to_dict()
    new_rows = []
    for r in kg.itertuples(index=False):
        i = idx.get((r.player_id, r.season)) if isinstance(r.player_id, str) else None
        if i is not None:
            if r.n_teams < 2:
                continue
            ours = base.loc[i, LINE].fillna(0).to_numpy()
            theirs = pd.Series({c: getattr(r, c) for c in LINE}).fillna(0).to_numpy()
            if (ours == theirs).all():
                # The other stint(s) had no stats ('--'), but they still count as games.
                base.at[i, "labels"] = r.labels
                if r.g > base.at[i, "games"]:
                    base.at[i, "games"] = r.g
                    games_raised += 1
                named += 1
            elif r.season < COMBINED_SPLITS_FROM:
                for c in KG_STATS:
                    base.at[i, c] = getattr(r, c)
                base.at[i, "games"] = r.g
                base.at[i, "labels"] = r.labels
                base.at[i, "src"] = "nflcom+kg"
                repaired.append(f"{r.name} {r.season}")
            else:
                disagree += 1
            continue
        if r.season >= COMBINED_SPLITS_FROM:
            continue
        labels = r.labels.split("/")
        if not isinstance(r.player_id, str) and any(
            similar_names(r.name, n) for l in labels for n in names_by_team.get((r.season, l), [])
        ):
            clash += 1  # probably a profile we have under another spelling; don't risk a duplicate
            continue
        pid = r.player_id if isinstance(r.player_id, str) else "nflcom-kg:" + r.kg_id.replace("/", "-")
        row = {c: getattr(r, c) for c in KG_STATS}
        nflcom = pid[len("nflcom:"):] if pid.startswith("nflcom:") else None
        info = bio.loc[nflcom] if nflcom in bio.index else None
        row.update(
            player_id=pid, nflcom_id=nflcom, season=r.season, games=r.g, labels=r.labels, label=labels[-1],
            name=info["name"] if info is not None else r.name,
            career_pos=info["Position"] if info is not None else r.kg_pos,
            college_n=info["college_n"] if info is not None else r.college_n,
            src="nflcom-kg",
        )
        new_rows.append(row)
        added.append(f"{row['name']} {r.season}")
    if new_rows:
        base = pd.concat([base, pd.DataFrame(new_rows)], ignore_index=True)
    log(f"  split seasons before {COMBINED_SPLITS_FROM} rebuilt from per-team lines: {len(repaired)} "
        f"(e.g. {', '.join(repaired[:4])}); {named} more split seasons named ({games_raised} of them also "
        "get the other stint's games)")
    log(f"  added {len(added)} player-seasons missing from the trevyoungquist scrape "
        f"(e.g. {', '.join(added[:4])}); {clash} skipped as possible duplicates; "
        f"{disagree} 1970+ split seasons differ (kept NFL.com)")
    return add_names(base), {"repaired": len(repaired), "added": len(added)}


# --- PFR tables ----------------------------------------------------------------


def load_pfr_fantasy():
    frames = []
    for season in range(1970, LAST_SEASON + 1):
        f = pd.read_csv(raw_file(f"fdp/{season}.csv"))
        frames.append(
            pd.DataFrame(
                {
                    "season": season,
                    "name": f["Player"].astype(str),
                    "tm": f["Tm"].astype(str),
                    "pfr_pos": f["Pos"].astype(str),
                    "passing_yards": f["PassingYds"],
                    "passing_tds": f["PassingTD"],
                    "attempts": f["PassingAtt"],
                    "interceptions": f["Int"],
                    "carries": f["RushingAtt"],
                    "rushing_yards": f["RushingYds"],
                    "rushing_tds": f["RushingTD"],
                    "receptions": f["Rec"],
                    "receiving_yards": f["ReceivingYds"],
                    "receiving_tds": f["ReceivingTD"],
                    "pfr_fumbles_lost": f["FumblesLost"],
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def load_pfr_scoring():
    m = pd.read_csv(raw_file(MALLARI))
    m = m[m["Season"].between(FIRST_SEASON, LAST_SEASON)]
    return pd.DataFrame(
        {
            "season": m["Season"].astype(int),
            "name": m["Player"].astype(str).str.replace(r"[*+]", "", regex=True).str.strip().replace(PFR_ALIASES),
            "tm": m["Tm"].astype(str),
            "pos": m["Pos"].fillna("").astype(str).str.upper(),
            "g": m["G"],
            "rushing_tds": m["RshTD"].fillna(0),
            "receiving_tds": m["RecTD"].fillna(0),
            "pr_td": m["PR TD"].fillna(0),
            "kr_td": m["KR TD"].fillna(0),
            "fbl_td": m["FblTD"].fillna(0),
            "oth_td": m["OthTD"].fillna(0),
            "two_pm": m["2PM"].fillna(0),
        }
    ).reset_index(drop=True)


def pfr_prepare(df):
    df = add_names(df)
    df["multi"] = df["tm"].str.fullmatch(r"\dTM")
    df["code"] = df["tm"].where(~df["multi"])
    return df


def link(src, base, sig_cols, strong_min):
    """Link source rows to backbone rows one-to-one within a season.

    Passes, each on rows still unlinked, keeping only keys unique on both sides:
    name+team, name, last name+team+stats, last name+stats, team+stats (lines
    worth >= strong_min yards/TDs only). Name-only links whose stats disagree
    are rejected. Returns a frame of (src index, base index, pass).
    """
    s = src.copy()
    b = base.copy()
    s["sig"], b["sig"] = sig_string(s, sig_cols), sig_string(b, sig_cols)
    s["strong"] = weight(s, sig_cols) >= strong_min
    b["strong"] = weight(b, sig_cols) >= strong_min
    passes = [
        ("name+team", ["season", "nname", "code"], False),
        ("name", ["season", "nname"], False),
        ("last+team+stats", ["season", "lname", "code", "sig"], False),
        ("last+stats", ["season", "lname", "sig"], True),
        ("team+stats", ["season", "code", "sig"], True),
    ]
    links = []
    done_s, done_b = set(), set()
    for label, keys, need_strong in passes:
        rs = s[~s.index.isin(done_s)].dropna(subset=keys)
        rb = b[~b.index.isin(done_b)].dropna(subset=keys)
        if need_strong:
            rs, rb = rs[rs["strong"]], rb[rb["strong"]]
        rs = rs[~rs.duplicated(keys, keep=False)]
        rb = rb[~rb.duplicated(keys, keep=False)]
        j = rs.reset_index(names="si").merge(rb.reset_index(names="bi"), on=keys, suffixes=("_s", "_b"))
        if label == "name":
            j = j[j["sig_s"] == j["sig_b"]]
        links += [(si, bi, label) for si, bi in zip(j["si"], j["bi"])]
        done_s.update(j["si"])
        done_b.update(j["bi"])
    return pd.DataFrame(links, columns=["si", "bi", "how"])


def apply_pfr_scoring(base, bio):
    """Fumble/other TDs and 2PM from PFR's scoring table; split seasons; TD-only rows for missing players."""
    sco = pfr_prepare(load_pfr_scoring())
    base["code"] = [team_code(l, s) for l, s in zip(base["label"], base["season"])]
    sl = link(sco, base[base["season"] >= 1922], ["rushing_tds", "receiving_tds"], strong_min=10**9)
    log(f"  linked {len(sl)} of {len(sco)} scoring lines: " + ", ".join(f"{k} {v}" for k, v in sl["how"].value_counts().items()))
    sp = sco.loc[sl["si"]].reset_index(drop=True).join(base.loc[sl["bi"]].reset_index(drop=True), rsuffix="_b")
    td_agree = ((sp["rushing_tds"] == sp["rushing_tds_b"]) & (sp["receiving_tds"] == sp["receiving_tds_b"])).mean()
    ret_agree = ((sp["pr_td"] + sp["kr_td"]) == (sp["pr_tds"] + sp["kr_tds"])).mean()
    log(f"  rush+rec TDs agree for {td_agree:.2%}, return TDs for {ret_agree:.2%} of linked lines")

    # Before 1970 an unlinked scoring line is the player's NFL.com line when it is the only
    # line that season with the same name (any team), else the only similar name with the same
    # initial on the same team ('Ed' ~ 'Eddie', 'Wiesenbaugh' ~ 'Weisenbaugh') or, for a 2TM/3TM
    # line (no team), anywhere that season. Their TDs usually
    # differ because NFL.com kept one stint of a split season only.
    by_name = base.groupby(["season", "nname"]).groups
    rows_by_season = {s: g for s, g in base[["name", "code"]].groupby(base["season"])}
    linked_b = set(sl["bi"])
    extra, similar = [], []
    for r in sco[~sco.index.isin(sl["si"]) & (sco["season"] < COMBINED_SPLITS_FROM)].itertuples():
        hits = list(by_name.get((r.season, r.nname), []))
        how = "name, TDs differ"
        if not hits:
            g = rows_by_season.get(r.season, base.iloc[:0])
            ok = [similar_names(r.name, n) and first_name(n)[:1] == first_name(r.name)[:1] for n in g["name"]]
            if not r.multi:
                ok = (g["code"] == r.code).to_numpy() & ok
            same = g[list(ok)]
            hits, how = list(same.index), "similar name"
        if len(hits) == 1 and hits[0] not in linked_b:
            extra.append((r.Index, hits[0], how))
            linked_b.add(hits[0])
            if how == "similar name":
                similar.append(f"{r.name} {r.season} {r.tm} = {base.at[hits[0], 'name']}")
    sl = pd.concat([sl, pd.DataFrame(extra, columns=sl.columns)], ignore_index=True)
    log(f"  linked {len(extra)} more pre-1970 lines whose TDs differ: "
        + ", ".join(f"{k} {v}" for k, v in pd.Series([e[2] for e in extra]).value_counts().items())
        + " (" + "; ".join(similar) + ")")

    pcols = {"fbl_td": "fbl_td", "oth_td": "oth_td", "two_pm": "two_pm", "multi": "pfr_multi", "g": "pfr_g",
             "pr_td": "pfr_pr_td", "kr_td": "pfr_kr_td", "rushing_tds": "pfr_rush_td", "receiving_tds": "pfr_rec_td",
             "pos": "pfr_sco_pos", "name": "pfr_name"}
    cols = sco.loc[sl["si"], list(pcols)].set_axis(sl["bi"].values).rename(columns=pcols)
    base = base.join(cols)
    base["pfr_linked"] = base.index.isin(sl["bi"])

    # Split seasons PFR shows as 2TM/3TM that the kendallgillies per-team lines didn't rebuild:
    # NFL.com has only the first stint's line (under the last team's name). PFR's scoring
    # line covers the whole season, so take its games and rushing/receiving TDs; the yardage
    # stays the first stint's and the row is flagged "+split" in the source column.
    multi = base["pfr_multi"].fillna(False).astype(bool)
    split = multi & (base["season"] < COMBINED_SPLITS_FROM) & ~base["labels"].str.contains("/", na=False)
    pfr_td = base["pfr_rush_td"].fillna(0) + base["pfr_rec_td"].fillna(0)
    more_tds = split & (pfr_td > base["rushing_tds"].fillna(0) + base["receiving_tds"].fillna(0))
    base.loc[more_tds, "rushing_tds"] = base.loc[more_tds, "pfr_rush_td"].fillna(0)
    base.loc[more_tds, "receiving_tds"] = base.loc[more_tds, "pfr_rec_td"].fillna(0)
    more_games = split & (base["pfr_g"] > base["games"].fillna(0))
    base.loc[more_games, "games"] = base.loc[more_games, "pfr_g"]
    named = 0
    for i in base.index[split]:
        codes = PFR_MULTI_TEAMS.get((base.at[i, "pfr_name"], base.at[i, "season"]), (None,))[0]
        if codes:
            base.at[i, "labels"] = "/".join(label_for(c, base.at[i, "season"]) for c in codes.split("/"))
            named += 1
    base["split_partial"] = split & (base["season"] >= NO_YARDAGE_BEFORE)
    early = split & (base["season"] < NO_YARDAGE_BEFORE)
    single_differs = (base["pfr_linked"] & ~multi & (base["season"] < COMBINED_SPLITS_FROM)
                      & (pfr_td != base["rushing_tds"].fillna(0) + base["receiving_tds"].fillna(0)))
    log(f"  split seasons PFR shows as multi-team that NFL.com has one stint of: {int(split.sum())} "
        f"({int(early.sum())} in 1922-31, where only TDs are kept anyway); TDs raised to PFR's for "
        f"{int(more_tds.sum())}, games for {int(more_games.sum())}; teams named by hand for {named}; "
        f"{int(base['split_partial'].sum())} "
        f"1932-69 rows have one stint's yardage (source '+split' unless a hand-checked line replaces it); "
        f"{int(single_differs.sum())} single-team lines differ from PFR's TDs (kept NFL.com)")

    # Scoring lines with rushing/receiving TDs that found no NFL.com line (before 1970;
    # PFR's fantasy tables show NFL.com is complete from then on).
    un = sco[~sco.index.isin(sl["si"]) & (sco["season"] < COMBINED_SPLITS_FROM)
             & ((sco["rushing_tds"] + sco["receiving_tds"]) > 0)]
    names_by_team = base.groupby(["season", "code"])["name"].apply(list).to_dict()
    profiles = bio.reset_index()
    profiles = profiles[~profiles.duplicated("nname", keep=False)].set_index("nname")["Player_Id"]
    bio_last = bio.reset_index().assign(lname=lambda d: d["name"].map(last_name), fname=lambda d: d["name"].map(first_name))
    bio_last = bio_last.groupby("lname")[["Player_Id", "fname"]].apply(lambda g: list(zip(g["Player_Id"], g["fname"]))).to_dict()

    def profile_for(name, nname):
        """NFL.com profile of a player missing from the stat files: same name, else same last
        name with a compatible first name ('Ed' ~ 'Eddie'), when unique."""
        if isinstance(profiles.get(nname), str):
            return profiles[nname]
        fn = first_name(name)
        hits = [pid for pid, f in bio_last.get(last_name(name), []) if f and fn and (f.startswith(fn) or fn.startswith(f))]
        return hits[0] if len(hits) == 1 else None
    variants, new_rows, unnamed = [], [], []
    by_name = base.groupby(["season", "nname"]).groups
    for r in un.itertuples():
        hits = by_name.get((r.season, r.nname))
        if hits is not None or any(similar_names(r.name, n) for n in names_by_team.get((r.season, r.code), [])):
            variants.append(f"{r.name} {r.season} {r.tm}")
            continue
        if r.multi:
            # PFR's 2TM/3TM line names no team: use the hand-checked teams, in the order played.
            codes = PFR_MULTI_TEAMS.get((r.name, r.season), (None, None))[0]
            labels = "/".join(label_for(c, r.season) for c in codes.split("/")) if codes else None
        else:
            try:
                labels = label_for(r.code, r.season)
            except KeyError:
                labels = None
        if labels is None:
            unnamed.append(f"{r.name} {r.season} {r.tm}")
            continue
        prof = profile_for(r.name, r.nname)
        pid = f"nflcom:{prof}" if isinstance(prof, str) else f"pfr-name:{slug(r.name)}"
        info = bio.loc[prof] if isinstance(prof, str) else None
        row = {c: float("nan") for c in LINE}
        row.update(
            player_id=pid, nflcom_id=prof if isinstance(prof, str) else None, season=r.season,
            games=r.g, labels=labels, label=labels.split("/")[-1], rushing_tds=r.rushing_tds,
            receiving_tds=r.receiving_tds, kr_tds=r.kr_td, pr_tds=r.pr_td, fbl_td=r.fbl_td, oth_td=r.oth_td,
            two_pm=r.two_pm, pfr_pr_td=r.pr_td, pfr_kr_td=r.kr_td, pfr_sco_pos=r.pos, pfr_name=r.name,
            pfr_rush_td=r.rushing_tds, pfr_rec_td=r.receiving_tds, pfr_g=r.g,
            name=info["name"] if info is not None else r.name,
            career_pos=info["Position"] if info is not None else "",
            college_n=info["college_n"] if info is not None else "",
            src="pfr-scoring", pfr_linked=True, pfr_multi=r.multi, split_partial=False,
            code=r.code if not r.multi else None,
        )
        new_rows.append(row)
    if new_rows:
        base = pd.concat([base, pd.DataFrame(new_rows)], ignore_index=True)
        base = add_names(base)
    log(f"  added {len(new_rows)} TD-only rows for players missing from both NFL.com scrapes "
        f"(e.g. {', '.join(sorted({r['name'] for r in new_rows})[:8])}); {len(variants)} unlinked lines look "
        f"like name variants of a player with another line ({', '.join(variants)}); {len(unnamed)} multi-team lines without a hand-checked team skipped: "
        + ", ".join(unnamed))
    split_rows = base[base["split_partial"].fillna(False).astype(bool)]
    return base, [f"{r.name} {r.season}" for r in split_rows.itertuples()]


def apply_web_lines(base, bio):
    """Replace/add the hand-checked lines of WEB_LINES and WEB_TEAMS."""
    replaced, added, compared, differ = 0, [], 0, []
    for (pid, season), w in sorted(WEB_LINES.items()):
        labels = "/".join(label_for(c, season) for c in w["teams"].split("/"))
        hit = base.index[(base["player_id"] == pid) & (base["season"] == season)]
        if len(hit) > 1:
            raise ValueError(f"{pid} {season}: {len(hit)} rows")
        if len(hit) == 1 and pd.notna(base.at[hit[0], "pfr_rush_td"]):
            # Independent check of the hand-copied line: PFR's full-season TDs and games.
            i = hit[0]
            compared += 1
            pfr = tuple(int(base.at[i, c]) if pd.notna(base.at[i, c]) else None
                        for c in ("pfr_rush_td", "pfr_rec_td", "pfr_g"))
            if pfr != (w["rushing_tds"], w["receiving_tds"], w["games"]):
                differ.append(f"{pid} {season}: PFR {pfr}, hand {w['rushing_tds'], w['receiving_tds'], w['games']}")
        if len(hit) == 1:
            i = hit[0]
            src = base.at[i, "src"]
            base.at[i, "src"] = "web" if src.startswith("pfr-scoring") else src + "+web"
            replaced += 1
        else:
            nflcom = pid.split(":", 1)[1]
            info = bio.loc[nflcom]
            i = len(base)
            base.loc[i, ["player_id", "nflcom_id", "season", "name", "career_pos", "college_n", "src"]] = [
                pid, nflcom, season, info["name"], info["Position"], info["college_n"], "web"]
            for c in ("kr_tds", "pr_tds", "fbl_td", "oth_td"):
                base.at[i, c] = 0
            base.at[i, "pfr_linked"] = False
            added.append(f"{info['name']} {season}")
        for c in LINE:
            base.at[i, c] = w[c]
        base.at[i, "games"] = w["games"]
        base.at[i, "labels"] = labels
        base.at[i, "label"] = labels.split("/")[-1]
        base.at[i, "split_partial"] = False
    for (pid, season), (teams, games, _url, tds) in WEB_TEAMS.items():
        hit = base.index[(base["player_id"] == pid) & (base["season"] == season)]
        if len(hit) != 1:
            raise ValueError(f"{pid} {season}: {len(hit)} rows")
        i = hit[0]
        labels = "/".join(label_for(c, season) for c in teams.split("/"))
        base.at[i, "labels"], base.at[i, "label"], base.at[i, "games"] = labels, labels.split("/")[-1], games
        for c, v in tds.items():
            base.at[i, c] = v
        base.at[i, "src"] = base.at[i, "src"] + "+web"
    log(f"  hand-checked lines: {replaced} replaced, {len(added)} added ({', '.join(added)}); "
        f"{len(WEB_TEAMS)} team/games fixes; rushing/receiving TDs and games equal PFR's scoring table on "
        f"{compared - len(differ)} of {compared} lines it has ({'; '.join(differ)})")
    return add_names(base), {"web_compared": compared, "web_differ": differ}


# --- pfr ids -------------------------------------------------------------------


def attach_pfr_ids(players):
    """players: one row per player_id with name, college, career span, position.

    Matches to nflverse players.csv (all rows, with or without pfr_id).
    Returns (Series player_id -> pfr_id, Series player_id -> gsis_id for 1999+ players nflverse
    has without a pfr_id, matched-without-pfr_id list, ambiguous list, fuzzy list).
    """
    nv = pd.read_csv(raw_file("nflverse/players.csv"), low_memory=False, dtype=str)
    for c in ("rookie_season", "last_season"):
        nv[c] = pd.to_numeric(nv[c], errors="coerce")
    nv = nv.dropna(subset=["rookie_season", "last_season"]).copy()
    nv["college_n"] = nv["college_name"].fillna("").map(lambda c: norm_name(c.split(";")[0]))
    nv["lname"] = nv["last_name"].fillna("").map(norm_name)
    nv["fname"] = nv["first_name"].fillna("").map(norm_name)
    keyed = []
    for col_first in ("first_name", "common_first_name", "football_name"):
        keyed.append(pd.DataFrame({"key": (nv[col_first].fillna("") + " " + nv["last_name"].fillna("")).map(norm_name),
                                   "row": nv.index}))
    keyed.append(pd.DataFrame({"key": nv["display_name"].fillna("").map(norm_name), "row": nv.index}))
    keyed = pd.concat(keyed).drop_duplicates()
    by_key = keyed.groupby("key")["row"].apply(list).to_dict()
    by_last = nv.reset_index().groupby("lname")["index"].apply(list).to_dict()

    def gap(r, p):
        return abs(nv.at[r, "rookie_season"] - p["career_first"]) + abs(nv.at[r, "last_season"] - p["career_last"])

    def plausible(r, p):
        return (p["career_first"] - 4 <= nv.at[r, "rookie_season"] <= p["career_first"] + 2
                and abs(nv.at[r, "last_season"] - p["career_last"]) <= 2)

    def narrow(cands, p):
        if len(cands) > 1 and p["college_n"]:
            cands = [c for c in cands if nv.at[c, "college_n"] == p["college_n"]] or cands
        if len(cands) > 1:
            pos = {"QB": {"QB"}, "RB": {"RB", "FB"}, "WR": {"WR"}}.get(p["position"], set())
            cands = [c for c in cands if nv.at[c, "position"] in pos] or cands
        if len(cands) > 1:
            best = min(gap(c, p) for c in cands)
            cands = [c for c in cands if gap(c, p) == best]
        return cands

    chosen, ambiguous, fuzzy = {}, [], []
    for pid, p in players.iterrows():
        if p["career_last"] < 1974:
            continue
        cands = [r for r in by_key.get(p["nname"], []) if plausible(r, p)]
        how = "name"
        if not cands and p["college_n"]:
            # Nicknames / middle initials: same last name, same college, first names alike.
            fn = first_name(p["name"])
            cands = [r for r in by_last.get(p["lname"], [])
                     if nv.at[r, "college_n"] == p["college_n"] and plausible(r, p)
                     and (nv.at[r, "fname"][:3] == fn[:3] or fn.startswith(nv.at[r, "fname"]) or nv.at[r, "fname"].startswith(fn))]
            how = "last name + college + first name"
        if not cands:
            continue
        cands = narrow(cands, p)
        desc = f"{p['name']} ({int(p['career_first'])}-{int(p['career_last'])})"
        if len(cands) == 1:
            chosen[pid] = cands[0]
            if how != "name":
                fuzzy.append(f"{desc} -> {nv.at[cands[0], 'display_name']} {nv.at[cands[0], 'pfr_id']}")
        else:
            ambiguous.append(f"{desc}: " + ", ".join(f"{nv.at[c, 'display_name']} {nv.at[c, 'pfr_id']}" for c in cands))
    rows = pd.Series(chosen, dtype="object")
    dup = rows[rows.duplicated(keep=False)]
    for r in sorted(set(dup)):
        ambiguous.append(f"{nv.at[r, 'display_name']} {nv.at[r, 'pfr_id']} claimed by "
                         f"{', '.join(sorted(dup[dup == r].index))} (left empty)")
    rows = rows[~rows.index.isin(dup.index)]
    pfr = rows.map(nv["pfr_id"])
    later = [pid for pid, r in rows.items() if pd.isna(nv.at[r, "pfr_id"]) and players.at[pid, "career_last"] >= 1999]
    no_pfr = [f"{pid} -> nflverse {nv.at[rows[pid], 'display_name']} gsis_id {nv.at[rows[pid], 'gsis_id']}" for pid in later]
    gsis = rows[later].map(nv["gsis_id"]) if later else pd.Series(dtype="object")
    return pfr.dropna(), gsis.dropna(), no_pfr, ambiguous, fuzzy


# --- positions -----------------------------------------------------------------


def fantasy_parts(df):
    f = df[STATS].fillna(0)
    passing = f["passing_yards"] * 0.04 + f["passing_tds"] * 4 - f["interceptions"] * 2
    rushing = f["rushing_yards"] * 0.1 + f["rushing_tds"] * 6
    receiving = f["receiving_yards"] * 0.1 + f["receiving_tds"] * 6 + f["receptions"]
    return passing, rushing, receiving


def ppr(df):
    p, r, c = fantasy_parts(df)
    return (p + r + c).round(2)


def assign_positions(df):
    passing, rushing, receiving = fantasy_parts(df)
    f = df[STATS].fillna(0)
    touches = f["attempts"] + f["carries"] + f["receptions"]
    total = passing + rushing + receiving
    produced = pd.concat({"QB": passing, "RB": rushing, "WR": receiving}, axis=1).idxmax(axis=1)

    career = df["career_pos"].fillna("").map(CAREER_POSITION)
    pos = career.copy()
    att, car = f["attempts"], f["carries"]
    known = df["attempts"].notna()
    # A back whose season was mostly passing is a QB (single-wing tailbacks): passing
    # out-scored his running and receiving (>= 20 passes, or >= 2 TD passes in 1920-31 when
    # attempts are unknown), or, before 1960, by usage: >= 20 passes and more passes than runs,
    # because the era's many interceptions make passing points look small (Ace Parker,
    # Harry Newman 1933).
    by_usage = known & (df["season"] < SINGLE_WING_UNTIL)
    usage_passer = (att >= 20) & (att > car)
    points_passer = (passing > rushing + receiving) & ((att >= 20) | (~known & (f["passing_tds"] >= 2)))
    passer = points_passer | (by_usage & usage_passer)
    # Before 1950 NFL.com's "QB" is often the single wing's blocking back, who ran and caught
    # far more than he threw (e.g. Gene Ronzani): RB when he ran more than he passed and his
    # running and receiving yards exceed his passing yards.
    runner = (known & (df["season"] < PLATOON_FROM) & (car >= 20) & (att < car)
              & (f["passing_yards"] < f["rushing_yards"] + f["receiving_yards"]))
    pos = pos.mask((career == "RB") & passer, "QB")
    pos = pos.mask((career == "QB") & runner, "RB")
    # No usable career position: PFR's season position (1970-98), else where the points came
    # from, with the same usage rules before 1960.
    inferred = df["pfr_pos"].where(df["pfr_pos"].isin(["QB", "RB", "WR", "TE"]), produced)
    inferred = inferred.mask(by_usage & (inferred == "RB") & usage_passer & (att >= 20), "QB")
    # Two-way era: a lineman/defender listed player who scored was usually a real back or end.
    # Platoon era (1950+): ten touches, so trick plays by linemen/kickers/punters don't count.
    meaningful = (touches >= 10) | ((total >= 6) & (df["season"] < PLATOON_FROM))
    unknown = career.isna()
    pos = pos.mask(unknown & meaningful, inferred)
    pos = pos.mask(unknown & ~meaningful, None)
    # Tight ends aren't ranked. From 1950, PFR's season position catches the ones NFL.com
    # files as ends ("OE"/"E") or whose position was inferred from receiving (Retzlaff,
    # Carpenter, Kramer, ...).
    pfr_te = df["pfr_pos"].fillna("").eq("TE")
    if "pfr_sco_pos" in df:
        pfr_te |= df["pfr_sco_pos"].fillna("").eq("TE")
    pos = pos.mask(pfr_te & (df["season"] >= PLATOON_FROM), None)
    df["position"] = pos
    df["inferred_position"] = unknown & meaningful
    df = df[df["position"].isin(["QB", "RB", "WR"])].copy()

    # One position per player per decade: the one that scored most; but a back who was QB in
    # some seasons and RB in others before 1960 is also QB when he threw more than he ran over
    # the decade (>= 20 passes), for the same reason as the usage rule above.
    df["decade"] = df["season"] // 10 * 10
    df["_fp"] = ppr(df)
    by = df.groupby(["player_id", "decade", "position"])["_fp"].sum().reset_index()
    by = by.sort_values(["player_id", "decade", "_fp", "position"], ascending=[True, True, False, True])
    main = by.drop_duplicates(["player_id", "decade"]).set_index(["player_id", "decade"])["position"]
    g = df.assign(_att=df["attempts"].fillna(0), _car=df["carries"].fillna(0)).groupby(["player_id", "decade"])
    usage = g.agg(positions=("position", lambda x: frozenset(x)), att=("_att", "sum"), car=("_car", "sum"),
                  known=("attempts", lambda x: x.notna().any()))
    backs = usage[(usage["positions"] == frozenset({"QB", "RB"})) & usage["known"]
                  & (usage.index.get_level_values("decade") < SINGLE_WING_UNTIL)]
    passers = backs[(backs["att"] >= 20) & (backs["att"] > backs["car"])]
    main = pd.Series("QB", index=passers.index).combine_first(main)
    smoothed = pd.Series([main[(i, d)] for i, d in zip(df["player_id"], df["decade"])], index=df.index)
    changed = int((smoothed != df["position"]).sum())
    df["position"] = smoothed
    return df.drop(columns=["_fp"]), changed


# --- build ---------------------------------------------------------------------


def build():
    log("Loading NFL.com career stats (trevyoungquist) ...")
    raw, team_conflicts, span, bio = load_trev()
    log(f"  {len(raw)} player-seasons {FIRST_SEASON}-{LAST_SEASON}; {team_conflicts} with conflicting team labels")
    base = add_names(prepare_base(raw, bio))

    log("Repairing split seasons / filling holes from the kendallgillies NFL.com scrape ...")
    base, kg_report = apply_kg(base, bio)

    log("Linking PFR scoring table (michaelmallari, 1922-98, NFL only) ...")
    base, partial = apply_pfr_scoring(base, bio)

    log("Applying hand-checked lines (jt-sw.com and others) ...")
    base, web_report = apply_web_lines(base, bio)

    # --- PFR fantasy tables, 1970-98 ---
    log("Linking PFR fantasy tables (fantasydatapros, 1970-98) ...")
    fan = pfr_prepare(load_pfr_fantasy())
    fl = link(fan, base[base["season"] >= 1970], SIG, strong_min=60)
    log(f"  linked {len(fl)} of {len(fan)} PFR lines: " + ", ".join(f"{k} {v}" for k, v in fl["how"].value_counts().items()))
    pair = fan.loc[fl["si"]].reset_index(drop=True).join(base.loc[fl["bi"]].reset_index(drop=True), rsuffix="_b")
    check_cols = SIG + ["attempts", "carries", "interceptions"]
    diff = (pair[check_cols].fillna(0).to_numpy() != pair[[c + "_b" for c in check_cols]].fillna(0).to_numpy()).any(axis=1)
    log(f"  NFL.com vs PFR stat lines identical for {1 - diff.mean():.2%} of linked lines ({int(diff.sum())} differ)")
    unl = fan[~fan.index.isin(fl["si"])].copy()
    for c in STATS:
        if c not in unl:
            unl[c] = 0
    unl["fp"] = ppr(unl)
    log(f"  {len(unl)} PFR lines not linked, worth at most {unl['fp'].max():.1f} PPR points "
        f"({', '.join(f'{r.name} {r.season} {r.fp:.1f}' for r in unl.nlargest(3, 'fp').itertuples())})")
    base = base.join(fan.loc[fl["si"], ["pfr_pos", "pfr_fumbles_lost", "multi"]].set_axis(fl["bi"].values))
    base["pfr_pos"] = base["pfr_pos"].fillna("")
    base["pfr_linked"] = base["pfr_linked"].fillna(False).astype(bool) | base.index.isin(fl["bi"])

    # --- derived columns ---
    # other_tds: return TDs (PFR's for lines linked to its scoring table, NFL.com's otherwise;
    # they agree on 99.9% of lines, and PFR files some as "other" TDs, which would count twice
    # if NFL.com's were added) + PFR's other TDs (blocked/missed kick returns) + PFR's fumble
    # return TDs from 1950 when PFR's season position isn't a defensive one. Before 1950
    # (two-way football) a fumble return TD was usually a defensive play, so it isn't counted.
    sco_linked = base["pfr_pr_td"].notna()
    returns = (base["pfr_pr_td"] + base["pfr_kr_td"].fillna(0)).where(
        sco_linked, base["kr_tds"].fillna(0) + base["pr_tds"].fillna(0))
    defensive = base["pfr_sco_pos"].fillna("").str.split("/").str[0].isin(DEFENSIVE_POSITIONS)
    fbl = base["fbl_td"].fillna(0)
    fbl_kept = fbl.where((base["season"] >= PLATOON_FROM) & ~defensive, 0)
    base["other_tds"] = returns + base["oth_td"].fillna(0) + fbl_kept
    base["fbl_dropped"] = fbl - fbl_kept
    afl = base["label"].isin(AFL_TEAMS) & base["season"].between(1960, 1969)
    base["two_point_conversions"] = 0.0
    recent = base["season"] >= TWO_POINT_FROM
    base.loc[recent, "two_point_conversions"] = base.loc[recent, "two_pm"].fillna(0)
    base.loc[afl, "two_point_conversions"] = float("nan")
    base["fumbles_lost"] = float("nan")
    fl_rows = base["season"] >= FUMBLES_LOST_FROM
    both = fl_rows & base["pfr_fumbles_lost"].notna() & base["nflcom_fumbles_lost"].notna()
    agree = (base.loc[both, "pfr_fumbles_lost"] == base.loc[both, "nflcom_fumbles_lost"]).mean()
    log(f"  fumbles lost 1994-98: NFL.com agrees with PFR on {agree:.2%} of {int(both.sum())} lines; using PFR")
    base.loc[fl_rows, "fumbles_lost"] = base.loc[fl_rows, "pfr_fumbles_lost"].fillna(base.loc[fl_rows, "nflcom_fumbles_lost"]).fillna(0)

    labels = base["labels"].str.split("/")
    base["team"] = [ "/".join(team_code(l, s) for l in ls) for ls, s in zip(labels, base["season"])]
    base["team_name"] = [
        " / ".join(TEAM_NAME_OVERRIDES.get((team_code(l, s), s), team_display(l)) for l in ls)
        for ls, s in zip(labels, base["season"])
    ]
    split = base["team"].str.contains("/")
    flagged = base["multi"].fillna(False).astype(bool) | base["pfr_multi"].fillna(False).astype(bool)
    one_team = flagged & ~split
    log(f"  split seasons: {int(split.sum())} name every team; flagged multi-team by PFR but naming one team: "
        f"{int((one_team & (base['season'] < NO_YARDAGE_BEFORE)).sum())} in 1922-31 (TDs only), "
        f"{int((one_team & base['season'].between(NO_YARDAGE_BEFORE, COMBINED_SPLITS_FROM - 1)).sum())} in 1932-69, "
        f"{int((one_team & (base['season'] >= COMBINED_SPLITS_FROM)).sum())} in 1970-98 (full-season stats, last team only)")

    # --- positions ---
    produced = base[STATS].fillna(0).abs().sum(axis=1) > 0
    base = base[produced].copy()
    base, smoothed = assign_positions(base)
    log(f"Positions: {int(base['inferred_position'].sum())} rows inferred from production; "
        f"{smoothed} rows moved to the player's main position for the decade")
    by_decade = base.groupby((base["season"] // 10 * 10).astype(int))["fbl_dropped"].sum()
    log(f"  fumble-return TDs left out of other_tds as probably defensive (before 1950, or PFR position "
        f"defensive), on the rows kept: {int(by_decade.sum())} (" + ", ".join(
            f"{d}s {int(v)}" for d, v in by_decade.items() if v) + ")")

    # --- pfr ids ---
    base["span_first"] = base["nflcom_id"].map(span["span_first"])
    base["span_last"] = base["nflcom_id"].map(span["span_last"])
    players = base.sort_values("season").groupby("player_id").agg(
        name=("name", "last"), nname=("nname", "last"), lname=("lname", "last"), college_n=("college_n", "last"),
        span_first=("span_first", "min"), span_last=("span_last", "max"),
        first_out=("season", "min"), last_out=("season", "max"), position=("position", "last"),
    )
    players["career_first"] = players[["span_first", "first_out"]].min(axis=1)
    players["career_last"] = players[["span_last", "last_out"]].max(axis=1)
    players["college_n"] = players["college_n"].fillna("")
    pfr_ids, gsis_ids, no_pfr, ambiguous, fuzzy = attach_pfr_ids(players)
    base["pfr_id"] = base["player_id"].map(pfr_ids)
    base["gsis_id"] = base["player_id"].map(gsis_ids)

    base["source"] = base["src"] + base["pfr_linked"].map({True: "+pfr", False: ""}).where(
        ~base["src"].str.contains("pfr"), "")
    partial_rows = base["split_partial"].fillna(False).astype(bool)
    base.loc[partial_rows, "source"] += "+split"
    partial = [f"{r.name} {int(r.season)} {r.team}" for r in base[partial_rows].itertuples()]
    # A player's name is the same on every row.
    base["name"] = base["player_id"].map(players["name"])
    out = base[COLUMNS].sort_values(["season", "position", "player_id"]).reset_index(drop=True)
    for c in ["season", "games"] + STATS:
        out[c] = out[c].round().astype("Int64")
    report = {"players": players, "pfr_ids": pfr_ids, "no_pfr": no_pfr, "ambiguous": ambiguous,
              "fuzzy": fuzzy, "partial": partial, **kg_report, **web_report}
    return out, report


# --- report and checks ---------------------------------------------------------


def summary(out, rep):
    out = out.copy()
    out["decade"] = out["season"] // 10 * 10
    log()
    log(f"Wrote {len(out)} rows, {out['player_id'].nunique()} players -> {OUT.relative_to(ROOT)}")
    log("Rows per decade (QB / RB / WR):")
    for d, g in out.groupby("decade"):
        c = g["position"].value_counts()
        log(f"  {d}s: {len(g):5d}  ({c.get('QB', 0)} / {c.get('RB', 0)} / {c.get('WR', 0)})")
    log("Rows per season (sample): " + ", ".join(
        f"{s}: {int((out['season'] == s).sum())}" for s in (1920, 1925, 1932, 1943, 1950, 1960, 1965, 1975, 1987, 1998)))
    log("Rows by source: " + ", ".join(f"{k} {v}" for k, v in out["source"].value_counts().items()))
    log("Unknown (empty) cells by column:")
    for c in STATS:
        empty = out[out[c].isna()]
        if len(empty):
            nfl = empty[~empty["source"].str.startswith("pfr-scoring")]
            span = f"seasons {nfl['season'].min()}-{nfl['season'].max()}" if len(nfl) else "-"
            log(f"  {c:22s} {len(empty):6d} rows: {len(nfl)} in {span}, {len(empty) - len(nfl)} TD-only pfr-scoring rows")

    players, pfr_ids = rep["players"], rep["pfr_ids"]
    recent = players[players["last_out"] >= 1995]
    log(f"pfr_id: {len(pfr_ids)} players matched; {int(recent.index.isin(pfr_ids.index).sum())} of {len(recent)} "
        "players with a 1995-98 season")
    cont = players[players["career_last"] >= 1999]
    log(f"  careers continuing into 1999+: {int(cont.index.isin(pfr_ids.index).sum())} of {len(cont)} have a pfr_id")
    log(f"  matched to nflverse but nflverse has no pfr_id ({len(rep['no_pfr'])}):")
    for x in rep["no_pfr"]:
        log(f"    {x}")
    unmatched = [p for p in cont.index if p not in pfr_ids.index and not any(x.startswith(p + " ") for x in rep["no_pfr"])]
    log(f"  not found in nflverse ({len(unmatched)}): {', '.join(unmatched)}")
    log(f"  ambiguous ({len(rep['ambiguous'])}):")
    for a in rep["ambiguous"]:
        log(f"    {a}")
    log(f"  matched on last name + college + first name ({len(rep['fuzzy'])}):")
    for f in rep["fuzzy"]:
        log(f"    {f}")

    log(f"Split seasons PFR shows as multi-team where only one stint's yardage is known (source '+split', "
        f"TDs and games are PFR's full-season numbers) ({len(rep['partial'])}): " + ", ".join(rep["partial"]))
    cand = split_candidates(out)
    log(f"Possible split seasons no source flags (1932-69 single-team NFL.com lines whose team differs from the "
        f"player's previous season and with <= 70% of the team's games; most are off-season moves) "
        f"({len(cand)}, not counting {len(CHECKED_NOT_SPLIT)} checked by hand); QBs and AFL players among them "
        "not yet checked by hand: "
        + (", ".join(f"{r.name} {r.season} {r.team} {r.games}G" for r in cand[cand["show"]].itertuples()) or "none"))
    hollow = out[(out["season"] >= NO_YARDAGE_BEFORE) & (out["season"] < 1950)].groupby(["season", "team"]).agg(
        rows=("player_id", "size"), td_only=("source", lambda x: int(x.str.startswith("pfr-scoring").sum())))
    hollow = hollow[hollow["td_only"] > 0]
    log("1932-49 team-seasons with TD-only rows left: " + (", ".join(
        f"{s} {t} {r.td_only} of {r.rows}" for (s, t), r in hollow.iterrows()) or "none"))

    out["fp"] = ppr(out)
    bot = out[["season", "position"] + STATS].copy()
    bot[STATS] = bot[STATS].astype("float").fillna(0)  # the bot reads empty cells as 0
    out["bot_fp"] = score_offense(bot)["fp"]
    log("Top 10 per position per decade by yardage-and-TD PPR points (0.04/pass yd, 4/pass TD, -2/INT, "
        "0.1/yd, 6/TD, 1/rec); in brackets the bot's points (scoring.json: also other TDs, 2-pt "
        "conversions, fumbles lost):")
    key = out["pfr_id"].fillna(out["player_id"])
    totals = out.assign(key=key).groupby(["decade", "position", "key"]).agg(
        name=("name", "last"), fp=("fp", "sum"), bot_fp=("bot_fp", "sum")).reset_index()
    for (d, pos), g in totals.groupby(["decade", "position"]):
        top = g.sort_values("fp", ascending=False).head(10)
        log(f"  {d}s {pos}: " + "; ".join(f"{r.name} {r.fp:.0f} ({r.bot_fp:.0f})" for r in top.itertuples()))


def split_candidates(out):
    """1932-69 single-team NFL.com rows that might be undetected split seasons (see docstring)."""
    st = pd.read_csv(raw_file("octonion_nfl_team_standings.csv"), sep="\t")
    st["team_name"] = st["team_name"].str.replace(r"\s+", " ", regex=True).str.strip()
    sched = st.assign(g=st["wins"] + st["losses"] + st["ties"]).groupby(["season", "team_name"])["g"].max()
    prev = out[["player_id", "season"]].assign(season=out["season"] + 1, prev_team=out["team"].str.split("/").str[-1])
    c = out.merge(prev, on=["player_id", "season"], how="left").join(sched, on=["season", "team_name"])
    c = c[(c["season"] >= NO_YARDAGE_BEFORE) & (c["season"] < COMBINED_SPLITS_FROM)
          & c["source"].isin(["nflcom", "nflcom+pfr"]) & ~c["team"].str.contains("/")
          & c["prev_team"].notna() & (c["prev_team"] != c["team"]) & (c["games"] <= 0.7 * c["g"])]
    checked = set(CHECKED_NOT_SPLIT)
    c = c[[(p, s) not in checked for p, s in zip(c["player_id"], c["season"])]].copy()
    afl = c["team_name"].str.replace(" ", "").isin(AFL_TEAMS) & c["season"].between(1960, 1969)
    c["show"] = (c["position"] == "QB") & (c["attempts"] >= 20) | afl & (ppr(c) >= 20)
    return c


CHECKS = [
    # Required lines.
    ("Johnny Unitas", 1959, {"passing_yards": 2899, "passing_tds": 32, "completions": 193, "attempts": 367,
                             "interceptions": 14, "position": "QB", "team": "BAL", "team_name": "Baltimore Colts"}),
    ("Jim Brown", 1963, {"rushing_yards": 1863, "carries": 291, "rushing_tds": 12, "position": "RB", "team": "CLE"}),
    ("Don Hutson", 1942, {"receptions": 74, "receiving_yards": 1211, "receiving_tds": 17, "position": "WR", "team": "GNB"}),
    ("Eric Dickerson", 1984, {"rushing_yards": 2105, "team": "RAM", "team_name": "Los Angeles Rams"}),
    ("O.J. Simpson", 1973, {"rushing_yards": 2003, "team": "BUF"}),
    ("Dan Marino", 1984, {"passing_yards": 5084, "passing_tds": 48, "team": "MIA", "pfr_id": "MariDa00"}),
    ("Jerry Rice", 1987, {"receiving_tds": 22, "team": "SFO", "pfr_id": "RiceJe00"}),
    ("Walter Payton", 1977, {"rushing_yards": 1852, "team": "CHI"}),
    ("Terrell Davis", 1998, {"rushing_yards": 2008, "team": "DEN", "fumbles_lost": 2}),
    ("Sammy Baugh", 1947, {"passing_yards": 2938, "team": "WAS", "team_name": "Washington Redskins"}),
    # Independent lookups (Pro Football Hall of Fame / NFL.com / NFL record book).
    ("Bobby Layne", 1958, {"passing_yards": 2510, "passing_tds": 14, "completions": 145, "attempts": 294,
                           "interceptions": 12, "games": 12, "team": "DET/PIT"}),
    ("Roy Zimmerman", 1943, {"passing_yards": 846, "passing_tds": 9, "interceptions": 17, "completions": 43,
                             "attempts": 124, "rushing_yards": -41, "team": "PHI", "team_name": "Phil-Pitt Combine"}),
    ("Joe Namath", 1967, {"passing_yards": 4007, "team": "NYJ", "two_point_conversions": None}),
    ("Lance Alworth", 1965, {"receptions": 69, "receiving_yards": 1602, "receiving_tds": 14, "team": "SDG"}),
    ("Beattie Feathers", 1934, {"rushing_yards": 1004, "team": "CHI"}),
    ("Crazy Legs Hirsch", 1951, {"receptions": 66, "receiving_yards": 1495, "receiving_tds": 17, "team": "RAM"}),
    ("Sid Luckman", 1943, {"passing_yards": 2194, "passing_tds": 28}),
    ("Cecil Isbell", 1942, {"passing_tds": 24, "position": "QB"}),
    ("Eric Dickerson", 1987, {"rushing_yards": 1288, "team": "RAM/IND", "games": 12}),
    ("Dutch Clark", 1932, {"team": "PRT", "team_name": "Portsmouth Spartans"}),
    ("Cliff Battles", 1933, {"team": "BOS", "team_name": "Boston Redskins"}),
    ("Earl Campbell", 1980, {"rushing_yards": 1934, "team": "HOU", "team_name": "Houston Oilers"}),
    ("Barry Sanders", 1997, {"rushing_yards": 2053, "pfr_id": "SandBa00"}),
    ("Emmitt Smith", 1995, {"rushing_tds": 25, "pfr_id": "SmitEm00"}),
    ("Brett Favre", 1996, {"passing_tds": 39, "pfr_id": "FavrBr00"}),
    # Split seasons NFL.com filed under the wrong team with one stint only (jt-sw.com, WEB_LINES).
    ("Earl Morrall", 1958, {"team": "PIT/DET", "team_name": "Pittsburgh Steelers / Detroit Lions", "games": 11,
                            "completions": 25, "attempts": 78, "passing_yards": 463, "passing_tds": 5,
                            "interceptions": 9}),
    ("Zeke Bratkowski", 1963, {"team": "RAM/GNB", "games": 6, "completions": 49, "attempts": 93,
                               "passing_yards": 567, "passing_tds": 4, "interceptions": 9}),
    ("Abner Haynes", 1967, {"team": "MIA/NYJ", "team_name": "Miami Dolphins / New York Jets", "games": 14,
                            "carries": 72, "rushing_yards": 346, "rushing_tds": 2}),
    ("Alex Hawkins", 1967, {"team": "ATL/BAL", "games": 14, "receptions": 27, "receiving_yards": 469,
                            "receiving_tds": 4}),
    # Players missing from both NFL.com scrapes, now full lines.
    ("John Grigas", 1944, {"carries": 185, "rushing_yards": 610, "rushing_tds": 3, "team": "CRD",
                           "team_name": "Card-Pitt Combine", "position": "RB"}),
    ("John Grigas", 1945, {"carries": 64, "rushing_yards": 160, "rushing_tds": 2, "team_name": "Boston Yanks"}),
    ("Don Currivan", 1947, {"receptions": 24, "receiving_yards": 782, "receiving_tds": 9, "games": 12, "team": "BOS"}),
    ("Bill Hewitt", 1936, {"receptions": 15, "receiving_yards": 358, "receiving_tds": 6, "games": 12, "team": "CHI"}),
    ("Allie Sherman", 1946, {"attempts": 33, "passing_yards": 264, "passing_tds": 4, "position": "QB"}),
    # Multi-team seasons: PFR's full-season TDs and games; split TD-only rows get their teams.
    ("Red Hickey", 1941, {"receiving_tds": 4, "games": 10}),
    ("Buck Gavin", 1922, {"team": "RII/BUF", "rushing_tds": 6, "games": 10}),
    ("Neil Ferris", 1952, {"games": 12}),  # kendallgillies: PHI 8 G + WAS 4 G (no stats)
    # Paddy Driscoll 1920: 9 games for the Cardinals and 1 for Decatur (HOF profile).
    ("Paddy Driscoll", 1920, {"team": "CRD/DEC", "team_name": "Chicago Cardinals / Decatur Staleys", "games": 10}),
    ("Benny Boynton", 1921, {"team": "RCH/WSN", "games": 5, "rushing_tds": 3, "passing_tds": 5}),
    ("Pete Calac", 1921, {"team": "CLE/WSN", "games": 9, "rushing_tds": 3}),
    ("Jerry Noonan", 1921, {"team": "RCH/NYG", "games": 6, "team_name": "Rochester Jeffersons / New York Brickley Giants"}),
    # Single-wing passers are QBs; the Bears' blocking back is not.
    ("Harry Newman", 1933, {"position": "QB", "attempts": 136}),
    ("Ace Parker", 1938, {"position": "QB"}),
    ("Ed Matesic", 1936, {"position": "QB", "attempts": 138}),
    ("Arnie Herber", 1936, {"position": "QB"}),
    # other_tds: no defensive fumble returns (Halas's 98-yard return vs Oorang, 1923), no
    # return TD counted twice (Sacksteder 1922: one TD, PFR files it as "other").
    ("Norb Sacksteder", 1922, {"other_tds": 1}),
    ("Ernie Steele", 1942, {"other_tds": 1}),
]


def self_checks(out):
    results = []
    for name, season, want in CHECKS:
        rows = out[(out["name"] == name) & (out["season"] == season)]
        if len(rows) != 1:
            results.append((f"{name} {season}", False, f"{len(rows)} rows"))
            continue
        r = rows.iloc[0]
        bad = {c: r[c] for c, v in want.items() if not ((v is None and pd.isna(r[c])) or (v is not None and r[c] == v))}
        results.append((f"{name} {season}", not bad, f"got {bad}"))

    def check(label, ok, detail=""):
        results.append((label, bool(ok), detail))

    for (pid, season), w in WEB_LINES.items():
        rows = out[(out["player_id"] == pid) & (out["season"] == season)]
        want = {c: w[c] for c in LINE} | {"team": w["teams"], "games": w["games"]}
        got = rows.iloc[0] if len(rows) == 1 else None
        bad = {c: got[c] for c, v in want.items() if got[c] != v} if got is not None else f"{len(rows)} rows"
        check(f"hand-checked line {pid} {season}", not bad, f"got {bad}")
    halas = out[(out["name"] == "George Halas") & (out["season"] == 1923)]
    check("George Halas 1923: his defensive fumble-return TD isn't an offensive TD (no row, or other_tds 0)",
          halas.empty or (halas["other_tds"] == 0).all())
    ronzani = out[(out["name"] == "Gene Ronzani") & out["season"].between(1930, 1939)]
    check("Gene Ronzani (blocking back) is no 1930s QB", len(ronzani) and (ronzani["position"] == "RB").all())
    qbs = out[(out["position"] == "QB")].groupby(out["season"] // 10 * 10)["player_id"].nunique()
    check("at least 40 QBs in the 1930s and 90 in the 1940s", qbs[1930] >= 40 and qbs[1940] >= 90, str(qbs.to_dict()))
    check("'+split' rows only 1932-69", out.loc[out["source"].str.contains(r"\+split"), "season"].between(1932, 1969).all())
    check("1921 New York team is the Brickley Giants",
          (out.loc[(out["season"] == 1921) & (out["team"] == "NYG"), "team_name"] == "New York Brickley Giants").all())
    check("one row per player-season", not out.duplicated(["player_id", "season"]).any())
    check("one name/pfr_id per player", (out.groupby("player_id")[["name", "pfr_id"]].nunique(dropna=False) <= 1).all().all())
    check("pfr_id never shared by two players", (out.dropna(subset=["pfr_id"]).groupby("pfr_id")["player_id"].nunique() == 1).all())
    check("seasons 1920-1998 only", out["season"].between(FIRST_SEASON, LAST_SEASON).all())
    check("positions QB/RB/WR only", out["position"].isin(["QB", "RB", "WR"]).all())
    aafc = out[out["season"].between(1946, 1949) & out["team_name"].str.contains(
        "Browns|49ers|Dons|Rockets|Hornets|Seahawks|Colts|Bisons|Yankees|Dodgers|Buffalo")]
    check("no AAFC rows (1946-49)", aafc.empty, f"{len(aafc)} rows")
    motley = out[out["name"] == "Marion Motley"]
    check("Marion Motley starts in 1950 (AAFC excluded)", not motley.empty and motley["season"].min() == 1950)
    nfl = out[~out["source"].str.startswith("pfr-scoring")]
    early, later = nfl[nfl["season"] < NO_YARDAGE_BEFORE], nfl[nfl["season"] >= NO_YARDAGE_BEFORE]
    check("1920-31 yardage unknown (empty)", out.loc[out["season"] < NO_YARDAGE_BEFORE, YARDAGE].isna().all().all())
    check("1920-31 TD counts present", early[TDS].notna().all().all() and early[TDS].sum().sum() > 500)
    check("1932+ NFL.com yardage present", later[YARDAGE].notna().all().all())
    td_only = out[out["source"].str.startswith("pfr-scoring")]
    check("TD-only rows are few and all before 1932 (later ones replaced by hand-checked lines)",
          len(td_only) < 100 and (td_only["season"] < NO_YARDAGE_BEFORE).all(), f"{len(td_only)} rows")
    check("fumbles_lost empty before 1994 only",
          out.loc[out["season"] < 1994, "fumbles_lost"].isna().all() and out.loc[out["season"] >= 1994, "fumbles_lost"].notna().all())
    afl = out[out["season"].between(1960, 1969) & out["team"].isin(
        ["BOS", "BUF", "DTX", "KAN", "DEN", "HOU", "LAC", "SDG", "NYT", "NYJ", "OAK", "MIA", "CIN"])]
    check("AFL included 1960-69", len(afl) > 1000, f"{len(afl)} rows")
    check("AFL 2-pt conversions unknown", afl["two_point_conversions"].isna().all())
    check("no 2-pt conversions before 1994 (NFL)", out.loc[out["season"] < 1994, "two_point_conversions"].fillna(0).eq(0).all())
    check("some 2-pt conversions 1994-98", out.loc[out["season"] >= 1994, "two_point_conversions"].sum() > 50)
    check("every team code has a team name", (out["team"].str.count("/") == out["team_name"].str.count(" / ")).all())
    parts = out.assign(t=out["team"].str.split("/"), n=out["team_name"].str.split(" / ")).explode(["t", "n"])
    names = parts.groupby(["season", "t"])["n"].nunique()
    check("one team name per team code per season", (names == 1).all(), str(names[names > 1].index.tolist()[:5]))

    # Postseason check: games played can't exceed the team's regular-season games.
    st = pd.read_csv(raw_file("octonion_nfl_team_standings.csv"), sep="\t")
    st["label"] = st["team_name"].str.replace(" ", "", regex=False)
    st["g"] = st["wins"] + st["losses"] + st["ties"]
    sched = st.groupby(["season", "label"])["g"].max()
    single = out[~out["team"].str.contains("/")].copy()
    single["label"] = single["team_name"].str.replace(" ", "", regex=False)
    single = single.join(sched, on=["season", "label"])
    known = single[single["g"].notna()]
    over = known[known["games"] > known["g"]]
    check("games <= team's regular-season games (no postseason)", len(over) <= 0.002 * len(known),
          f"{len(over)} of {len(known)} over: " + ", ".join(f"{r.name} {r.season} {r.games}>{int(r.g)}" for r in over.head(5).itertuples()))
    return results


def main():
    out, rep = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    summary(out, rep)
    written = pd.read_csv(OUT, dtype={"pfr_id": str})
    results = self_checks(written)
    # Steele 1945: PFR has 1 rushing TD but 12 points; jt-sw.com has 2 rushing TDs, 12 points.
    differ = [d for d in rep["web_differ"] if not d.startswith("nflcom:ernie-steele 1945")]
    results.append(("hand-checked lines agree with PFR's TDs and games (except Steele 1945)",
                    rep["web_compared"] >= 70 and not differ, "; ".join(differ)))
    float_cells = re.search(r",-?\d+\.\d+(,|\n)", OUT.read_text())
    results.append(("integers written as integers", not float_cells, float_cells.group(0) if float_cells else ""))
    log()
    log("Self-checks:")
    failed = 0
    for label, ok, detail in results:
        failed += not ok
        log(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f"  {detail}" if detail and not ok else ""))
    if failed:
        log(f"{failed} self-check(s) FAILED")
        sys.exit(1)
    log("All self-checks passed.")


if __name__ == "__main__":
    main()
