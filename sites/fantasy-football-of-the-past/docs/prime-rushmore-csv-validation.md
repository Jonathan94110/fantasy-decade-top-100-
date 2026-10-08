# Local CSV validator corrections — publication held

This is the original source-audit phase; subsequent approved scoring and private publication are documented in [scoring-mode-scaffold.md](scoring-mode-scaffold.md).

This document retains the original `53cf0b14` audit. The later source refresh is
recorded in [source-refresh-strict.md](source-refresh-strict.md); findings about
missing QB headers below apply only to this older pin.

This audit pins Jonathan's public source to commit
`53cf0b14b896f3aa9d5e5e2069b20acb75e74728`. The source snapshot contains 49 files
(45,683,206 bytes), including the supplied position CSVs, season totals,
`VALIDATION_REPORT.md`, `corrections_log.csv`, and producer code. Every downloaded
file is checked against the pinned Git blob and retained SHA-256. Source snapshots
stay outside this Site repository. No source-use permission is inferred.

These changes are **local only**. No commit has been pushed, no Site version has
been saved, and no deployment has been requested in this phase. Live v36 and its
normal gameplay archive remain unchanged. Strict versus era scoring and reuse
rights remain Jonathan's decisions. Disputed defense records remain quarantined.

## Corrected ingestion and scoring gates

`lib/prime-rushmore-csv.ts` parses quoted CSV cells and maps columns by header name.
It preserves source strings, ISO dates, nullable missing statistics, source flags,
and interception evidence. Canonical IDs use the supplied date, historical team
codes and home/away direction, plus source player or team identity; position and
week are not identity substitutes. Neutral games retain the source's `-N` suffix.
January games can retain the previous year's source season. Only explicit
`playoff=False` records pass the regular-season gate.

The fetch/audit pipeline selects the five decade files per position. Full
`*_gamelogs.csv` files are retained only for an overlap comparison, and season
totals remain a separate grain. The full player files equal the exact multiset
union of their decade files. There are zero duplicate identities within that
representation. Loading both representations would double rows. The earlier
Sheet-tab duplication finding is not evidence of duplication in these CSVs.

Scoring uses `scoring_complete` and `scoring_missing`, while retaining generic
`complete` only as metadata. Unknown targets or times sacked do not prevent
scoring. Source scoring flags are necessary but insufficient: the producer checks
only `two_pt` and `fum_rec_td` for skill positions. The app separately checks every
active scoring input. QB exports omit `rec`, `rec_yds`, `rec_td`, and `ret_td`;
none can be silently set to zero. Source fantasy totals are retained as provider
assertions, never substituted for a complete app calculation.

| Position | Regular rows | Source scoring-complete | App strict scoring-complete |
| --- | ---: | ---: | ---: |
| QB | 20,128 | 440 | 0 |
| RB | 32,736 | 534 | 534 |
| WR | 38,435 | 866 | 866 |
| TE | 14,936 | 286 | 286 |
| K | 14,240 | 404 | 0 |
| DEF | 17,450 | 491 | 491 |

All six regular counts match the supplied claims. These completeness counts do
not certify participation, underlying raw-source zeros, representative career
coverage, or reuse rights. Every local validation result remains
`eligibleForGameplay: false`. No player or team reaches 17 complete games in this
snapshot, and all pre-1999 offensive rows lack recovery-TD inputs.

## Montana and the 24-game review

Joe Montana's opener is physical CSV line 422 in `qb_gamelogs_1980s.csv`, game
`19890910-SFO-IND`. Parsing, ISO date, player/game identity and the regular-season
filter pass. The source has 233 passing yards, one passing TD, zero INT, 21 rushing
yards, zero rushing TD and zero two-point credits. Those supplied terms produce
`233 × .04 + 1 × 4 + 21 × .1 = 15.42`.

Its `fum_rec_td` cell is blank, `scoring_complete=False`, and
`scoring_missing=fum_rec_td`. The four receiving/return headers are also absent.
The app therefore records five unavailable active fields and no complete score.
The claim that this row should pass strict completeness contradicts the pinned
source itself. Era scoring would require an explicit different contract; this
patch does not create or select one.

The earlier 24 games were deliberately selected because their teams were shut
out. `scripts/build-reviewed-shutout-import.py` consumes an explicit reviewed
24-row selection and requires separate official completed-final-zero evidence.
That evidence establishes only zero credited conversions and offensive recovery
TDs; all other scoring fields were checked against the original raw snapshot.
It is a specialized read-only review builder, not a general completeness filter.
The selected fantasy scores include both negative and positive values, so there
is no fantasy-score-zero admission rule. The new general CSV validator does not
filter by team score or manufacture these proofs. Regression fixtures include
complete non-shutout games and Montana's incomplete non-shutout opener.

## Kicker correction

The source's populated `fpts_k_contract` values match its own five-input formula,
but that formula omits unsuccessful XP. The Site kicking component is:

```
3 × fgm_0_39 + 4 × fgm_40_49 + 5 × fgm_50p + xpm
− (fga − fgm) − (xpa − xpm)
```

Unsuccessful FG/XP aggregates include blocks once. Their unavailable blocked/missed
splits remain null; the validator does not invent zero blocks. It checks all
distance bins and count reconciliation. Missing distances produce no kicking
calculation. Seven regular rows disagree with the source contract because of XP
penalties. John Carney's `20000102-SDG-DEN` row at physical line 1654 has two short
FGs, one unsuccessful FG and one unsuccessful XP: source 5, Site kicking component
4. K CSVs also omit all eleven offensive fields, so neither number establishes a
complete Site v4 score for that player/game.

## Defense quarantine

Exactly 1,424 total records, including 1,384 regular-season records, have
`int_check != match`. Generic `complete=True` does not clear them. The validator
retains `def_int_defenders`, `opp_pass_int`, and the selected `def_int` separately;
it never promotes the larger count into a verified value. Even a purported match
must contain equal explicit numeric counts. A matching season total does not
resolve disputed individual games. All eight active defensive aggregates must be
numeric, including every block category. No normal archive record is overwritten.

## Reproduction

From the Site checkout, use a snapshot path outside the repository:

```
python3 scripts/fetch-prime-rushmore-source.py ../research/prime-rushmore-53cf0b14
node --experimental-strip-types scripts/audit-prime-rushmore-csv.mjs ../research/prime-rushmore-53cf0b14 ../research/prime-rushmore-53cf0b14/app-validator-audit.json
node --experimental-strip-types --test tests/prime-rushmore-csv.test.ts
```

The retained snapshot's `source-manifest.json` records every exact URL and hash.
Independent reproducible offense and K/DEF audit scripts and reports sit beside
it. The source validation report and correction log are evidence to inspect, not
approval to import or publish. No paid access, outreach or sharing change occurred.
