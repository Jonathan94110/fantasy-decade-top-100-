# Refreshed source — Strict review only

This records the earlier Strict-only phase. The subsequent approved local Historical integration and final scoring decision are documented in [scoring-mode-scaffold.md](scoring-mode-scaffold.md). Statements below about unsettled rules and held local builds describe that earlier phase; the later owner-authorized private release supersedes the earlier publication hold. Historical audit statements below describe that phase.

The latest reviewed public-source pin is
`bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356`. Its separate research snapshot contains
49 files, 55,458,850 bytes. Every file passed pinned Git blob size/SHA-1 validation;
the manifest also retains SHA-256. No source files were added to gameplay.

The unchanged local validator produces these counts from one representation:
the five decade files per position, with full files and season totals excluded
from game-count aggregation.

| Position | Regular rows | Source scoring-complete | App Strict complete |
| --- | ---: | ---: | ---: |
| QB | 20,128 | 440 | 440 |
| RB | 32,736 | 534 | 534 |
| WR | 38,435 | 866 | 866 |
| TE | 14,936 | 286 | 286 |
| K | 14,240 | 404 | 0 |
| DEF | 17,450 | 491 | 491 |

There are no invalid regular identities or duplicate keys in this representation.
These are completeness checks, not participation, quality, eligibility or reuse
approval. Every validator result remains `eligibleForGameplay: false`.

## Changes and remaining gaps

QB now includes all eleven active offensive inputs. The producer checks all those
fields for `scoring_missing`. Joe Montana's 1989-09-10 opener still has a blank
`fum_rec_td`; it now fails Strict on that field alone. Receiving and return inputs
are explicit zeros, and the provider's 15.42 remains a partial score. Its
`era_scored_eligible=True` with an excluded recovery-TD field is a provider policy
claim, not approval for a uniform Historical league contract.

Previously unrecorded DEF safety and interception-return-TD values, and 1950s
return TDs, are now blank. Unknown values remain unknown. The source separates
partial `fpts_known` from purported complete `fpts`; the app still independently
checks all active inputs and interception evidence.

DEF has 494 numerically complete regular rows, but only 491 pass Strict. Buffalo
on 1999-10-04, 1999-10-31 and 1999-11-07 retains source `fpts` of 15, 13 and 7
with generic `complete=True` despite scoring and strict flags being false for
disputed interceptions. These rows stay quarantined. Overall, 1,424 source defense
rows are disputed, including 1,384 regular rows. Source totals never override that
quarantine.

K CSVs still omit all eleven offensive inputs, so none supports a complete app
Strict score. Seven regular kicking-component comparisons still disagree because
the provider's contract omits unsuccessful XP penalties. Carney's source 5 becomes
4 under current Strict kicking rules; John Hall's 10 becomes 8. Final Historical
kicker rules, including whether unsuccessful XP count, remain unsettled.

The refreshed source correctly classifies 1952 Dallas Texans as NFL for the
two-point-rule derivation. The source's era exclusions still vary across rows and
years. They cannot be used directly as this app's fixed game-wide rules. Source
coverage and reuse statements remain claims to review; this audit grants no new
reuse permission.

## Reproducible evidence

The snapshot and `strict-app-validator-audit.json` are retained outside the Site
checkout under `research/prime-rushmore-bbfc22cc`. Source-backed regression fixtures
retain both the old and refreshed pins. The local validator has no gameplay caller.

Historical creation, production builds and publication remain held. No source
sync, push, Site save, access change or deployment occurred in this phase. Existing
v36 remains live with its normal archive and saved scoring contracts intact.
