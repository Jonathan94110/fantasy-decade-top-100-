# Contributing player game logs

Work on a branch and submit a reviewed data PR. Run commands from `sites/fantasy-football-of-the-past/`. This app source copy has no automatic source-import schedule; the repository's existing rankings bot maintains a separate pipeline. Its output must pass the app's independent gates before use.

## Current gameplay

New quick games, solo drafts and online leagues use one unified regular-season pool and the same saved v5 all-era scoring contract. The v42 baseline contains 1,308 eligible actors, 178,786 regular-season performances and 40 kickers.

An actor needs at least 17 eligible career games. Adding a profile or source row alone does not make them draftable. Decade filters browse verified game years; they do not restrict a player's performance draw to that decade.

1950s gameplay remains deferred because required return-touchdown data is unavailable. Newly sourced older kickers remain excluded until every active input is verified.

Read [scoring-mode-scaffold.md](docs/scoring-mode-scaffold.md) and [unified-draft.md](docs/unified-draft.md) for current behavior. The older deck schema document describes a previous Strict phase.

## Files to understand

- `lib/game-model.ts`: Athlete, Performance, ScoringStats and score calculations.
- `lib/historical-data.ts`: compact record decoding, stable performance IDs and mode-specific pools.
- `lib/scoring-rules.ts`: immutable saved scoring contracts.
- `data/nflverse/`: modern athlete/record assets, kicker extension, licenses and source manifests.
- `data/historical-mode/`: reviewed older athlete/record assets, source coverage and generated unified catalog. Their performance IDs use the `historical:` prefix; `scripts/summarize-historical-coverage.mjs` publishes their source provenance as `public/historical-coverage.json`.
- `scripts/build-historical-mode-catalog.py`: rebuilds the unified catalog from accepted assets.

The separate historical-import review collection and historical-preview profiles stay outside normal gameplay. Review samples are selected for a specific purpose and do not establish representative career coverage. `lib/historical-import.ts` has its own restricted schema and is not a general older-era adapter.

## Identity and provenance

Reuse an existing stable athlete ID only after confirming the exact person or franchise. Name matching alone is insufficient. Preserve historical team/opponent identities and year-specific franchise mappings. FLEX is a roster slot, not a player position.

Each performance needs a stable unique ID, athlete ID, recorded season, game ID, date, team at the time, opponent, REG/POST classification, verified completion, entity type and source attribution.

Retain exact source URLs, snapshot revision, file/physical line, retrieval/import timestamp, hashes and the recorded source-use decision. Historical game ordinals are not verified NFL weeks: retain the ordinal separately and leave `week` null when unknown. January dates may belong to the preceding recorded season.

Keep existing IDs, records, no-repeat ledgers and completed scores intact. Source availability and a public repository do not establish permission to reuse every underlying dataset; preserve the existing attribution and source-use disclosures when proposing an addition.

## Statistics and position requirements

Unknown, absent or disputed values remain `null`. A player's usual role does not prove a missing statistic is zero. Preserve verified negative yardage. Provider fantasy totals and completeness flags do not replace independent input checks.

| Position | Required verified all-era inputs |
| --- | --- |
| QB | All nine offense inputs below, including receiving and return statistics. |
| RB | All nine offense inputs, including passing statistics. |
| WR | All nine offense inputs, including passing and rushing statistics. |
| TE | All nine offense inputs. |
| K | All nine offense inputs, made FG, made XP and unsuccessful FG. Count blocked attempts once. |
| DEF | Opponent's complete final points allowed and special-teams return TDs. Existing disputed interception controls remain quarantined. |

The nine offense inputs are `passingYards`, `passingTD`, `interceptions`, `rushingYards`, `rushingTD`, `receptions`, `receivingYards`, `receivingTD` and `returnTD`. Eligibility remains consistent across Standard, Half PPR and Full PPR.

Preserve additional known raw statistics even when the all-era contract excludes them. New v5 contracts disable individual lost-fumble penalties. Current all-era scoring also excludes offensive recovery TDs and defense fumble recoveries; saved Strict/legacy contracts retain their own recovery coefficients and any active lost-fumble penalty. The earlier lost-fumble change did not remove raw recovery statistics or rewrite saved recovery-scoring contracts. Strict eligibility still requires every category active in its saved contract, including conversion, recovery, defense, kicking-distance and unsuccessful-XP inputs.

## Import workflow

1. Propose the exact player/franchise, source, coverage and identity evidence.
2. Review source-use permission, participation, duplicate keys, missing fields, career coverage and discrepancies.
3. Build candidate assets offline from a verified snapshot. Inspect record and coverage differences before replacing accepted assets.
4. Rebuild the unified catalog after accepted data changes.
5. Add regression coverage and submit a PR with source evidence, exact count changes and validation results.

Existing import helpers implement fixed reviewed migrations. `import-kicker-cohort.py` expects its 40-player cohort; `append-verified-players.py` expects its historical baseline. A new source or player may require a reviewed adapter rather than invoking those helpers unchanged.

The builder that originally generated `data/historical-mode/` has been retired. Those assets are kept exactly as accepted; changing or extending them needs a new reviewed adapter. Review any proposed network fetch explicitly; this source adds no historical import or on-demand research bot.

## Validation

Use the commands in [README.md](README.md). Cover stable identity, duplicate rejection, null preservation, active-field completeness, all PPR presets, the 17-game floor, source/game-ordinal provenance and relevant QB/RB/WR/TE/K/DEF scoring.

Preserve existing archive anchors, saved contracts, completed scores, replay receipts and no-repeat behavior. Update expected counts only for the reviewed addition; keep preservation assertions intact.

A data PR in this repository does not itself deploy the hosted Site or change its sharing settings.
