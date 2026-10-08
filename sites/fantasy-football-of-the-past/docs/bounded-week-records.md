# Bounded week records

Saved online and solo seasons used to keep every completed week inside one D1 row, and a 16-team season passes D1's documented 2,000,000-byte row limit at Week 9.

In local D1 (Miniflare), the unchanged v43 code:
1. saved Week 9 at about 2.07 MB (local D1 accepts slightly more than the documented limit);
2. then failed every attempt to save Week 10 with "The action could not be saved."

That league was stuck.

Migration `0008_bounded_week_records` stores each completed week in its own row:

| Table | Key | Holds |
| --- | --- | --- |
| `season_league_rounds` | `league_id`, `number` | one completed week of an online league |
| `demo_draft_rounds` | `draft_id`, `number` | one completed week of a solo season |

## Format

- **Season row:** keeps `history: null` and adds `historyRecords`, the recorded week numbers in history order. For solo seasons these are `season.history` and `season.historyRecords`.
- **Week row:** holds that week's exact JSON (`JSON.stringify(round)`).
- **No weeks yet:** a season with no completed weeks keeps its previous format byte for byte.
- **Not covered:** quick matchups (`leagues`) are unchanged.

`history: null` is deliberate. Code that predates week rows fails on a split season (HTTP 503) instead of reading an empty history. This matters during a rollback, or while old and new code overlap in a deployment.
- The unchanged v43 league route returns 503 on GET and on a replay reveal for a split league, and leaves the row untouched (checked on Miniflare D1).
- Older code can still save actions that never read past weeks, such as a lineup edit or opening a regular-season week. Those actions leave the week list in place.

## Guarantees

**Exact history.**
- `lib/saved-rounds.ts` rebuilds the season with `history` in its original key position.
- The rebuilt season serializes byte for byte as the single-row format would have.

**Immutable weeks.**
- Week rows are insert-only, under a primary key, so a second insert of a week fails the whole save.
- Saving compares every recorded week's JSON with its stored row. It refuses to rewrite, reorder or drop one.
- Loading refuses a season whose listed week row is missing, or holds a different week.

**Atomic, revision-guarded saves.**
- New week rows and the season row go in one D1 batch, which is one transaction.
- Each week insert carries the same revision condition as the season `UPDATE`.
- A failed save leaves no week row. A stale save (another action saved first) adds none and returns the usual 409.

**Existing saves.**
- Single-row saves load unchanged and are split on their next save. Reads never write.
- A league already stuck at the limit recovers on its next action: on Miniflare D1 it saved Week 10, finished, and kept its first 9 weeks identical.

**Archives.**
- Solo weeks are keyed by draft ID. A reset archives the slim row through the existing trigger, and the week rows stay.
- Restore brings back the exact season.
- An archive lists only its own weeks, even if the restored season later adds more.

**No content checksums.** Week rows are protected by the guarded, insert-only writes above. A SQL migration can still update week rows and season rows together, which SQLite could not do if each week carried a SHA-256.

## Size and CPU, measured on a full 16-team, 17-week season

| | v43 | With week rows |
| --- | --- | --- |
| Largest saved row | 3,267,261–3,309,523 B in one row; over the limit after Week 9 | about 172 KB season row; about 227–234 KB largest week row |
| CPU to load (parse) | 10.4 ms | 9.7 ms |
| CPU to save | 7.9 ms | 8.5 ms |

Sizes vary slightly between runs because draws are random.

**Bandwidth is unchanged.** Every league refresh still sends the full public season. Late in a 16-team season that is about 250–434 KB while replays are hidden. It reaches about 3.3 MB once a manager has revealed every week, because revealed receipts are sent in full. That is bandwidth, not storage, and it is a follow-up.

## Checks

**Tests:** `tests/saved-rounds.test.ts` covers:
- the 16-team season;
- exact split and rebuild;
- legacy online and solo saves;
- atomic and stale saves;
- missing weeks;
- older code refusing split rows;
- joins, dashboard and depth chart;
- solo reset and restore;
- rollback, then a return to the new code.

**Real D1:** `node scripts/qa/verify-week-records-d1.mts` runs the real routes against Miniflare's D1. It also confirms that local D1 rejects the old 3.27 MB single-row save with `SQLITE_TOOBIG`.

**Test databases:** `tests/helpers/memory-d1-batch.ts` gives the in-memory test databases D1's transactional `batch`.

## Release

**Deploy:**
1. Apply migration 0008 before the new code serves traffic. It only creates two tables, so older code is unaffected by it.
2. No data migration is needed. Saves split on their next write.

If the new code runs without the tables, any save on a season with at least one completed week fails with a 503. That includes legacy single-row seasons, and even a lineup edit. Nothing is lost.

**Rollback to older code:**
1. Pause saves and take a D1 Time Travel bookmark.
2. Run `scripts/rollback-bounded-week-records.sql`. It:
   - copies each row's listed weeks back into that row;
   - skips rows with a missing week, and rows that would exceed the row limit;
   - deletes the week rows that no split row still lists.
3. Deploy the older code. Seasons it skipped stay split, and older code returns errors for them.

Redeploying the new code later works: rebuilt rows split again on their next save. The rollback uses `json_group_array(… ORDER BY …)`, which needs SQLite 3.44 or later. Miniflare's D1 supports it; hosted D1 was not checked, and the statement fails without changes if unsupported.

**Held migration `0008_rename_historical_performance_ids`** (`site-source/v42` at `9b93701`):
- It would collide with this number and must become 0009.
- Its `REPLACE` statements cover four tables: `leagues`, `season_leagues`, `demo_drafts` and `demo_archives`. It must also cover `season_league_rounds` and `demo_draft_rounds`; otherwise renamed IDs in `used` would stop matching the IDs inside week rows.
- Because week rows carry no checksum, that can stay a SQL migration.
