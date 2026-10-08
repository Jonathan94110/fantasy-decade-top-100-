# Historical archive, scoring and draft tools

## Base verified coverage (before the kicker extension)

The playable snapshot contains **363 skill players, 32 franchise defenses, and 60,166 real performances**: 45,558 player lines plus 14,608 D/ST lines from 7,304 completed games. Loaded seasons span **1999–2026**, regular season and playoffs, through September 28, 2026. The 2026 snapshot covers weeks 1–3. Preseason, fabricated DNPs, projected statistics, season-total conversion and imputed zeroes are excluded.

The all-time editorial collection remains exactly **400 profiles: 100 each at QB/RB/WR/TE**. Of these, 233 have verified playable records and 167 remain profile-only. A separate explicitly selected collection adds **100 playable players** (21 QB, 30 RB, 37 WR, 12 TE) with **9,872 performances**. It is a bounded editorial selection, not an official all-time ranking. The original collection and its stable catalog mapping are unchanged. A subsequent 30-player selection (below) and the four dedicated Classic kicker profiles bring the current library to 534 individual profiles plus 32 franchise-defense entries.

Additional players include Todd Gurley, DeMarco Murray, Dez Bryant, Julian Edelman, Amon-Ra St. Brown, Jordan Love, Brock Purdy, Puka Nacua and Jahmyr Gibbs. Their displayed endpoints are verified **loaded-game windows**, not a claim of complete career coverage. All additional players deliberately have no Hall of Fame badge. Names alone are never used to merge identities.

The 1950–2026 range is a discovery target. No pre-1999 game records were added. Historical profiles, including 1960s–1980s players, remain outside scored play where complete permitted game records are missing.

## Original 100-player addition: preservation and independent verification

All **47,009 previously deployed rows** and all **265 prior athlete metadata objects** remain byte-identical. Every existing performance ID, athlete ID, Hall badge, saved pick and consumed-performance reference stays valid. All 14,608 D/ST rows, the 400-profile catalog, catalog mapping, HOF map, 7,304-game schedule and 20-game exclusion set are unchanged.

The importer checks all 85 raw-source hashes, schedule/team joins, completed dates, finite complete scoring fields, unique GSIS/game pairs, PBP-derived defensive scoring, and exact reconciliation. The independent audit checks literal old-row bytes, prior metadata, source hashes, and all 42,273 exported skill-player lines against raw records. All 131 nonzero differences from nflverse fantasy-PPR totals were reconciled under the legacy version-1/2/3 full lost-fumble and fumble-recovery-TD rules used for that source audit. The raw-source audit remains unchanged; version-4 gameplay scoring is described below.

Audit evidence is in `data/nflverse/audit.json` and `independent-audit.json`. The explicit additional identities and per-season source provenance are in `data/playable-expansion.json` and `data/nflverse/playable-expansion-source.json`. Regression anchors cover the original 6,109 records, the later 42,826-row dataset, and the full pre-update 47,009-row dataset.

### Identity safeguards

- Additional David Johnson is RB `00-0032187`, not TE `00-0026957`
- Playable Kellen Winslow II remains `00-0022922`; he is distinct from Hall of Fame TE Kellen Winslow and has no Hall badge
- Historical Mark Clayton and Stanley Morgan remain distinct from later namesakes
- Existing Adrian Peterson, Ricky Williams, Steve Smith and Antonio Brown keep their original GSIS identities
- OAK→LV, SD→LAC and STL→LA are stable franchise aliases; source-era labels remain visible on games

## Sources, rights and historical limitations

- nflverse data: https://github.com/nflverse/nflverse-data
- Supported weekly statistics loader, starting in 1999: https://github.com/nflverse/nflreadr/blob/main/R/load_stats.R
- Weekly release: https://github.com/nflverse/nflverse-data/releases/tag/stats_player
- License, CC BY 4.0: https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md
- Underlying-source terms notice: https://nflverse.nflverse.com/#terms-of-use
- nflfastR source maintenance warning: https://nflfastr.com/news/index.html
- Known exclusions: https://github.com/nflverse/nflverse-pbp/issues/92 and https://github.com/nflverse/nflverse-pbp/issues/99
- Unassigned source team aggregate: https://github.com/nflverse/nflverse-data/issues/98

Data attribution: nflverse contributors; schedules/final scores: Lee Sharpe and nflverse contributors. A license copy is retained. Underlying NFL data remain subject to their owners’ terms. This is not commercial-rights clearance, a legal guarantee, or NFL/club/player endorsement. No player photos, team logos, paid subscriptions, rights purchases, vendor outreach or restricted scraping were added.

**1999–2000 source data are no longer maintained by nflfastR because the underlying sources are inconsistent.** Structural validation cannot guarantee that every upstream statistic is historically error-free. The unchanged exclusion set includes malformed Jacksonville home-game attribution, missing team-game coverage, and corrupted 2011_13_DET_NO scoring. The Steve Bono row missing team/opponent remains excluded. Missing values are never filled as zero.

Official older game logs do exist, such as John Brodie’s 1970 logs: https://www.nfl.com/players/john-brodie/stats/logs/1970/. They were not systematically retrieved or imported. Scorer-relevant blanks need verification; franchise D/ST completeness remains unresolved; NFL terms §1.3 require written consent for systematic database retrieval: https://www.nfl.com/legal/terms/. PFR scraping is not used.

## Scoring and saved-game compatibility (prior reception-preset release)

New quick matchups and online leagues offer Standard (0), Half PPR (0.5), and Full PPR (1 point per reception). New practice demos choose the same scoring before the seven initial computer picks. Only reception scoring differs. Passing touchdowns remain 4, interceptions −2, and all other existing rates are unchanged.

Each new game stores a versioned scoring snapshot. Completed rounds store their own snapshot. Legacy games and records without one always resolve to the original Full PPR rules. No historic score is recalculated. Quick-matchup rules freeze at the first lineup lock; online rules freeze at draft start; a demo is fixed once created. Draw averages, player detail receipts, and computer draft strategies use the same selected scoring and the same equal-year-then-game weighting.

D/ST points allowed still use the opponent’s **entire final scoreboard total**, including points scored by its defense. This is the app’s existing rule, not a claim of matching any other fantasy platform.

The six-round demo still has eight teams and six-player rosters, with human picks at 8, 9, 24, 25, 40 and 41. It does not play a season or consume historical games. Online seasons retain ten roster spots: six starters (QB/RB/WR/TE/DEF/FLEX) plus four bench. Bench players never score or consume performances. Hall-of-Fame draft restrictions have been removed; legacy fields remain only for save compatibility. Quick matchups permit the same athlete on opposing teams with distinct unused performances; leagues use exclusive ownership. Existing tie rules are unchanged.

Draft queues are private to each account and draft context, saved in D1 with revision conflict checks. Timer preference is saved; advisory countdown display is local. Timers never pick, lock, skip or invoke commissioner actions. Human auto-pick is off. The existing commissioner’s explicitly confirmed manual pick remains separate.

## Reproduction and verification

Use the immutable pre-expansion baseline, exact vetted raw snapshot, original catalog, and separate 100-ID selection:

    python scripts/import-nflverse.py RAW_SOURCE OUTPUT data/historical-catalog.json BASELINE data/playable-expansion.json
    python scripts/qa/verify-expanded-assets.py BASELINE OUTPUT data/historical-catalog.json data/playable-expansion.json RAW_SOURCE
    node scripts/summarize-archive.mjs

The bounded importer intentionally rejects using the already-expanded dataset as its own prior baseline. No automatic source refresh is scheduled.

Checks:

    npx tsc --noEmit
    npm run lint
    node --experimental-strip-types --test tests/*.test.ts
    node scripts/qa/local-smoke.mjs

The local HTTP/D1 smoke uses only the starter’s local test identity and preview database. It never changes production data. DOM regression uses an isolated happy-dom harness; it is not a rendered browser or a substitute for visual desktop/mobile QA.

## Classic Legends metadata catalog (2026-10-04)

The Classic browsing collection covers actual playing seasons intersecting 1960–2010. It contains 103 verified Pro Football Hall of Famers plus two separately identified NFL 100 All-Time selections (Tom Brady and Rob Gronkowski). Its 105 identities are merged through reviewed existing profile IDs: 101 enrich existing profiles and four new dedicated kicker profiles bring the whole library to 504 players plus 32 franchise defenses. Existing 400-player editorial and 100-player additional memberships remain intact.

HOF primary-position counts: QB 26, RB 31, WR 32, TE 10, K 4. With the two non-HOF supplements: QB 27, RB 31, WR 32, TE 11, K 4. Fullbacks map to RB. George Blanda stays one QB identity with a discoverable K role; no dual-slot gameplay is enabled. Lou Groza is included solely for verified 1961–1967 kicking seasons, and Devin Hester for WR/return metadata. Individual defenders, offensive linemen and punters are excluded from this collection. Team defenses remain separate.

Official sources: https://www.profootballhof.com/players and each linked Hall profile, the reconciled 2026 class, and NFL 100 roster/position announcements at https://www.nfl.com/100/all-time-team/roster.html . Individual source URLs, observed provider IDs, aliases and exact career/eligible seasons are in `data/classic-legends.json` and the public `/classic-legends-sources.json` ledger. Only verified IDs are retained; unresolved IDs are omitted. The reviewed research input is retained in `data/classic-legends-verification.json`. Its research coverage flags describe existing game matches, not activation of a Classic league.

Recognition is distinct: 32 Classic QB/RB/WR/TE/K NFL 100 selections, plus Hester selected as a return specialist, are tagged for 33 total. NFL 100 is not Hall membership. Brady and Gronkowski receive no HOF tag or cap change.

Thirty-four identities already have 3,406 real game records in the 1999–2010 intersection (32 HOF / 3,225 games; two supplements / 181 games). This release adds zero performances. Exact loaded seasons are computed from the existing archive separately from verified career and Classic eligibility. Gaps such as Blanda's 1959 and Groza's 1960 are preserved. The entire 56,881-record archive, all 365 athlete entities, saved roster/season schemas, scoring, HOF cap and exact-game consumption remain unchanged.

Classic competition is not enabled: 1960–1998 game logs and a balanced era-wide pool are missing. Kickers are profile-only because the gameplay schema/scorer has no approved K support. No new records, season averages, projections, copied games or synthetic performances are used. No Pro Football Reference extraction, paid-provider accounts or outreach was performed.

Validation: catalog identity/position/source audit; real-record checksum and coverage reconciliation; unit and API regression suite; mounted client DOM filtering, alias search, paging, dialog close/reopen and original draft callback checks; type/lint/build and local HTTP checks. DOM tests do not establish rendered visual quality. This portable cloud environment does not provide supported rendered browser QA.

## Verified 30-player addition (2026-10-05)

Added 30 explicitly selected missing players: 8 QB, 8 RB, 10 WR and 4 TE, with **3,285 individual performances** (3,110 REG / 175 POST). Includes Brian Griese, Nick Foles, Colin Kaepernick, David Garrard, Jason Campbell, Kyle Orton, Vince Young, Jeff Blake; Kevin Faulk, Jonathan Stewart, Willie Parker, Ronnie Brown, LeGarrette Blount, Ahmad Bradshaw, Brandon Jacobs, Duce Staley; Troy Brown, Terry Glenn, Santonio Holmes, Jeremy Maclin, Chris Chambers, Darrell Jackson, Pierre Garcon, Dwayne Bowe, Lee Evans, Eddie Kennison; Daniel Graham, L.J. Smith, Jermaine Wiggins and Kyle Brady.

Each receives all eligible player-week rows from the same previously audited 1999–2026 source snapshot, using its existing 7,304-game set and 20 excluded games. These additions cover 1999–2022. Every scoring input is checked against raw source values; missing is never treated as zero. Seven defense-only dimensions are structurally inapplicable zeros for skill players. Passing, rushing and receiving two-point conversions are summed. Full lost-fumble statistics and recovery touchdowns remain in the source records; this addition’s scoring audit uses the legacy version-1/2/3 scorer. Postseason schedule labels WC/DIV/CON/SB map to POST. No NFL/AFL merger inference or pre-1999 import occurs.

All 56,881 v26 performance rows, 365 athlete metadata objects, 32 defenses, historical catalogs, recognition, exclusions, saved IDs and gameplay code remain unchanged. The 30 new players have no Hall badge. Existing raw source files pass all 85 original hashes. Loaded seasons explicitly describe source coverage, not complete careers or snap-only appearances. Existing 1999–2000 source-maintenance warnings remain. Early portions of Brian Griese, Jeff Blake, Duce Staley, Troy Brown, Terry Glenn, Eddie Kennison and Kyle Brady's careers are not represented by these loaded windows. No profile-only legend is newly activated.

The per-player source ledger is `data/verified-player-addition.json`, also published at `/verified-player-addition.json`. Field provenance is in `manifest.json` under `verifiedPlayerAddition`. `verified-addition-audit.json` is the current independent audit; the earlier `audit.json` and `independent-audit.json` remain historical evidence of the original 100-player addition, not assertions about current totals.

Reproduce against v26 commit c289ed77c345b6f691d4c1e69eb16d591a6df1bd:

    python scripts/append-verified-players.py RAW_SOURCE V26_BASELINE data/nflverse
    python scripts/qa/verify-player-addition.py V26_BASELINE data/nflverse data/historical-catalog.json data/verified-player-addition.json RAW_SOURCE
    node scripts/summarize-archive.mjs

No production game state, roster, scoring rule, bye schedule, trade, bench consumption or reveal behavior is changed by this addition.

Validation for this addition: independent source audit of all 45,558 skill-player rows; literal-byte preservation of all v26 rows and athlete objects; all 151 regression tests (full seasons, computer drafting, privacy, scoring, trades, byes and bench consumption); TypeScript check; production build; and local-only HTTP/D1 smoke all passed. The smoke uses the synthetic local test identity and never production state. No rendered desktop/mobile browser QA was available in this portable delegated task.

## Read-only historical source-profile preview (v32)

The separate `/historical-preview` route projects only source ID, trimmed name,
profile-level position, original position label, and sorted source-season years
from Zack Thoutt / zynicide's 2017 snapshot:
https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats

The audited original ZIP SHA-256 is
`d75baf50cf201d4efe4eb67af8963927f1f5b8a5877c9c9807eca5233ff84835`.
Its 1960–1998 candidate population contains 3,925 source IDs. Twelve conflicted IDs
are excluded entirely: 1860, 2600, 3588, 6251, 7743, 11322, 11346, 13509, 15039,
16234, 20554 and 22006. The remaining 3,913 source profiles comprise 521 QB,
1,486 RB, 1,125 WR, 572 TE and 209 K. FB/HB source labels map explicitly to RB.
Same-name source IDs remain separate; these counts are not identity-certified
unique athletes. Source seasons are not verified complete-career dates.

The uploader reports CC0, but the snapshot is PFR-derived and upstream rights have
not been established. No license clearance is asserted. This narrow preview does
not republish game logs or statistical rows. Missing lost fumbles, two-point
conversions and fumble-recovery touchdowns have not been imputed as zero. Every
entry remains outside the scoring/draft pools; K remains unsupported by game scoring.

`lib/historical-preview.ts` and `data/historical-preview.json` are used only by the
preview UI. No game model, scorer, API, roster catalog or draft engine imports them.
`build-historical-preview.py` reproduces the identity-only projection from the
audited JSONL and identity-conflict inputs, both kept outside the Site source.
Search/filter tests, explicit field-whitelist/count checks, 36-card pagination,
read-only DOM interactions and unchanged game regression tests enforce this boundary.

## Verified kicker extension and versioned scoring (v33)

Forty reviewed GSIS identities add 8,353 actual nflverse games (7,953 REG, 400 POST)
within the identical 7,304-game boundary and 20 game exclusions used by the base
archive. Loaded years span 1999–2026 through the existing 2026 Week 3 cutoff. Combined
playable totals are 435 entities (363 skill players, 40 K, 32 DEF) and 68,519 performances.
The base `athletes.json` and `records.json` are unchanged; separate kicker files and
`kicker-source.json` retain the extension's schema, source hashes and field provenance.
The public kicker ledger is `/kicker-coverage.json`; the original archive-coverage
ledger remains the base archive snapshot.

Every K row has complete finite FG/XP totals and all distance buckets. FG/PAT attempts
reconcile to made + missed + blocked; blocked counts are separate, not a subset of
misses. The approved rule penalizes both once. Buckets 0–19, 20–29 and 30–39 form
under-40; 40–49 is separate; 50–59 plus 60+ form the final tier. Existing offensive
scoring inputs are retained, including real fake-kick passing yards/TDs. Source-zero
values are retained; no missing kicking/offensive values or absent appearances are
imputed. Non-applicable team-DEF categories in K's common Stats shape are neutral and
are not used by the player scorer. All 120 observed zero-attempt appearances remain.

Adam Vinatieri and Morten Andersen link to their existing stable Classic profile IDs
using reviewed GSIS/name/position/season-team evidence from official Hall profiles.
No duplicate Classic identities or new recognition claims are introduced. Other
historical preview K profiles remain metadata-only and never feed scoring.

Source: nflverse weekly stats_player release, CC BY 4.0, with the same underlying-owner
terms caveat and 1999–2000 maintenance warning as the base archive. No PFR/Kaggle
quarantine rows were used. Existing source license and attribution are retained.

## Current individual lost-fumble scoring contracts

New quick matchups, solo seasons and online leagues save version-4 scoring. Standard,
Half PPR and Full PPR all disable individual lost-fumble scoring (`lostFumble: 0`).
New season lineups keep the version-3 kicker-enabled shape: 11 players, seven
starters and four bench. D/ST fumble recoveries still earn 2 points; offensive
fumble-recovery touchdowns still earn 6 points. Other gameplay rates are unchanged.

Existing version-1/2/3 games and seasons retain their saved scoring, normally −2
per individual lost fumble, for unplayed rounds as well as completed records. A
missing scoring snapshot continues to mean the original version-1 Full PPR rules.
Reception-scoring edits preserve the rest of the saved contract. Saved round scores
and replay calculations continue to use each round’s own snapshot.

No source record, archive profile, game pool or source audit is changed by this
scoring update. Known historical lost-fumble stats remain recorded. Unavailable
stats remain unknown and are never filled as zero. This change neither imports
earlier game logs nor resolves their remaining verification or reuse requirements.

## Read-only historical QB game review

A separate review contains 24 actual source games for seven QB profiles, selected because each team was shut out. The low-scoring sample is not representative of those careers and is excluded from normal drafts, draws and seasons. No playable records are added; the 435-entity/68,519-performance archive and existing scoring contracts remain unchanged. The review uses current version 4 arithmetic and preserves raw unknown lost fumbles.

The original version1 Kaggle raw archive matches the previously audited SHA d75baf50cf201d4efe4eb67af8963927f1f5b8a5877c9c9807eca5233ff84835. All 24 source rows have explicit nonblank numeric values for the nine supplied active offense categories; they match the workbook. Verified official completed zero final scores separately prove conversion and offensive recovery-TD scoring zeros. This resolves producer blank-to-zero transformation risk for these 24 selected source rows only. The uploader declares CC0; no upstream PFR or Stathead clearance is asserted. [Detailed evidence and rebuild scope](docs/historical-shutout-import.md) retain raw values, identities and verification limits.
