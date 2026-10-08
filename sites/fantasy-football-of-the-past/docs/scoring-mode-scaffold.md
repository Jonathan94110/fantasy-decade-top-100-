# Unified all-era gameplay and saved scoring contracts

The subsequent bye correction makes Fantasy Weeks 1–4 available and starts
fictional player/defense rests in Week 5. See [bye-week-five.md](bye-week-five.md)
for migration preservation and short legacy season constraints.

New quick games, solo drafts and online leagues use one all-era pool with the approved uniform reduced scoring contract. The normal interface has no scoring-mode choice. Internal `historical`/`strict` identifiers preserve saved contracts and regression fixtures. Jonathan explicitly authorized publishing the finished demo to the same existing owner-private Site; this records publication authorization, not an upstream license grant. The source README and pinned snapshot do not establish a categorical release prohibition or a license grant.

## Fixed scoring contracts

All new games disable individual lost-fumble scoring. Previously saved Strict contracts retain their original coefficients, including offensive recovery touchdowns, defense fumble recoveries, distance-based field goals and unsuccessful FG/XP penalties.

Historical retains normal passing, rushing, receiving, return-TD and selected PPR points. It excludes lost fumbles, two-point credits and offensive recovery TDs. Kicking uses made FG +3, made XP +1 and unsuccessful FG −1, including blocks once; unsuccessful XP score zero. Verified real offensive stats still count for kickers. Defense scores only return TD +6 and existing points-allowed tiers based on the opponent's full final score. Sacks, interceptions, fumble recoveries, safeties, blocked kicks and defensive touchdowns score zero.

Every team and era uses the same complete saved contract. Provider era flags and row-dependent omissions do not select rules. Unknown excluded fields stay null; unknown active fields block eligibility. Available raw source values remain unchanged.

| Flow | New setup | Lock boundary |
| --- | --- | --- |
| Quick matchup | Unified contract; PPR selection in a fresh v5 game | First saved lineup |
| Solo season | Unified contract/PPR saved with draft creation/order | Draft creation |
| Online league | Unified contract; commissioner can edit reception scoring in the lobby | Draft start |

Existing seasons, scored v1–4 contracts, missing-contract v1 fallbacks, completed totals and saved round scoring remain unchanged. The approved current-draft correction also covers canonical unscored v4 solo drafts with an exact backup. Supported old pre-start PPR edits preserve every other coefficient. Legacy contracts cannot acquire a new mode.

Quick matchups resume one game per owner without an archive/new-game action. Owners with an existing v1–4 quick game therefore retain Saved rules; their game is not deleted to expose v5. New solo seasons and online leagues have existing creation flows.

## Playable mixed pool

The source is pinned to `bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356`. All 49 snapshot files passed Git blob size/SHA-1 checks; SHA-256 is retained too. Runtime combines approved CSV REG rows before 1999 with existing modern REG games. Source 1999 rows are audit-only to avoid overlap. Each draftable identity needs at least 17 eligible career games; each selectable season needs at least one eligible game.

Historical has 1,308 identities and 178,786 games: 65,132 modern REG games and 113,654 pre-1999 games. It adds 873 identities and retains all 435 Strict identities. 967 identities have pre-1999 games. Strict remains 435 identities, 40 kickers and 68,519 REG/POST games; all 27 original data files are byte-identical.

| Position | Historical identities | Eligible games | Pre-1999 games |
| --- | ---: | ---: | ---: |
| QB | 236 | 28,066 | 18,130 |
| RB | 388 | 40,395 | 30,467 |
| WR | 409 | 48,345 | 35,089 |
| TE | 203 | 24,719 | 14,650 |
| K | 40 | 7,953 | 0 |
| DEF | 32 | 29,308 | 15,318 |

| Decade | Eligible identities | Eligible games |
| --- | ---: | ---: |
| 1950s | 0 | 0 |
| 1960s | 327 | 20,573 |
| 1970s | 434 | 28,925 |
| 1980s | 484 | 33,086 |
| 1990s | 450 | 32,872 |
| 2000s | 267 | 24,206 |
| 2010s | 302 | 24,675 |
| 2020s | 212 | 14,449 |

Decade identity counts overlap. The 1990s include existing 1999 games; their 13 kickers come from the modern archive. No 1950s games meet the active-field gate. All nine active offensive columns are absent from source K CSVs. Lossy base JSON blank-to-zero conversion cannot establish known values, so no newly sourced older kicker is activated. The existing 40 kickers remain playable.

Player merges require unique name/position plus actual 1999 date/team/opponent participation evidence. Defense franchise aliases use explicit year timelines. Disputed defense rows stay quarantined even though Historical excludes INT. Matching reciprocal final-score controls are required for points allowed. These checks do not independently prove complete career coverage or source reuse rights.

Source week numbers are game ordinals, not verified NFL weeks. Receipts save `week: null` and label the source ordinal/date. Performance IDs (`historical:<athlete>:<season>:<game>`) include the recorded season separately from the calendar date, so January games exhaust the correct season. Migration `0008` renamed the prefix in saved games; statistics and source URLs were not changed. Existing no-repeat ledgers remain authoritative. The biased 24-game review sample and profile-only preview data remain excluded from gameplay.

## Verification and publication

Regressions cover actual Historical quick/solo/online creation, all PPR presets, old-player drafting, full 16-team seasons, byes, benches, free agents, saved receipts and mode/legacy locks. Mounted DOM checks cover controls, queues, scouting and catalog isolation.

Actual Chrome QA used localhost Sites mock sign-in and real local D1-backed application APIs. Ten checks passed with seven screenshots and no uncaught JS errors: 1960s–90s QB rows, Joe Montana selection/draw/reveal, Strict pruning, scoring locks, solo drafting/byes, reload persistence and mobile overflow. This does not claim live hosted-site QA. Browser evidence is outside the checkout at `../research/historical-playable-browser/browser-report.json`.

Independent v36 comparisons passed 977,667 exact scores, 977,667 receipt arrays and 977,667 replay calculations with zero mismatches. All 27 original archive files remain byte-identical. Final full checks and local production-build results are in the outside-checkout verification report. The final unified release passes 284 unit tests, 17 mounted suites, default TypeScript and full lint (five existing warnings). The no-emit TypeScript configuration explicitly permits the existing `.ts` test imports.

Generated coverage records owner-authorized private publication. Source quality and missing fields remain documented; unknown active stats block eligibility. The existing Site identity and owner-private audience stay unchanged. See [unified-draft.md](unified-draft.md) for the narrow unscored-draft correction and exact backups.
