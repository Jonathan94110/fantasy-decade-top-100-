# One mixed draft pool

Normal new quick games, solo drafts and online leagues save the same uniform all-era scoring contract (internal mode `historical`). My season opens with all positions and all eras. The pool contains 1,308 eligible actors and 178,786 regular-season games, including 967 actors with games before 1999 and all 40 existing kickers. The 1960s–2020s filters browse verified game years. Selecting a player still draws from their full saved eligible pool, not the selected browsing decade.

The 1950s filter explains its missing return-touchdown data. Unknown active stats cannot count as zero. No newly sourced older kicker is enabled without all active scoring fields. Source attribution and nullable raw values remain unchanged.

## Current unscored draft correction

Only a compatible canonical v4 or v5 Strict solo draft with a 10/11-player roster, no season, no scored history/used games and a consistent pick/roster ledger qualifies. The signed-in UI requests `unifyDraft` with the exact draft ID and revision. The server preserves identity, teams, order/reveal state, picks, rosters, settings and existing bye assignments; new actors receive deterministic bye dates. It increments revision and applies the unified contract.

Migration `0006` adds `demo_scoring_backups` and a BEFORE UPDATE trigger. The trigger captures the exact raw original DB state, revision and updated timestamp in the same SQLite statement as the compare-and-swap update. A missing trigger blocks correction; backup failure aborts the update. Reset archives cannot overwrite this separate snapshot. Migration `0007` adds a separate required backup trigger for canonical v4 drafts; the v5 trigger alone cannot authorize a v4 correction. Concurrent picks return the latest state without resetting or repeatedly migrating.

The recovery action `undoUnifiedDraft` requires the exact unchanged post-migration revision and state. It restores the original scoring/data before any later gameplay, increments revision and marks the draft to prevent automatic reapplication. Later picks/season actions reject recovery. Backup rows are retained.

Completed drafts, all existing seasons, v1–3 contracts, custom/incompatible v5 rules and saved results keep their recorded scoring contract and source ledger. Old quick games and online leagues are not reset or automatically converted. Reception preset changes retain the remaining saved coefficients.

## Verification

Regression tests cover preserved partially picked drafts, exact raw backup/CAS, missing migration, failed backup atomicity, bounded recovery, malformed ledgers, immutable scored/legacy states and later reset isolation. Mounted DOM checks cover unified creation and automatic correction conflicts. Actual Chrome checks cover the full mixed pool, eras, cleared filters, quick pagination, 40 kickers and mobile layout. Evidence lives outside the published source under `../research/unified-flow-browser/`.

During local hot reload, the first correction ran before the backup migration was installed. The audit caught it before publication. The unchanged unscored state was recovered from the pre-correction snapshot with a revision bump and no reset; reapplying the supported action produced an exact DB backup, independently verified by SHA256. The server now requires the backup trigger before correction. Hosted schema migrations run before the updated Worker is uploaded.
