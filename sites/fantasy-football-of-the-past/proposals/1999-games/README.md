# Proposed batch: 1999 games for 1990s stars already in the game

This is a proposal for review. **Nothing here is live.** The app does not import it, and no app or data file changes. Integration, the catalog rebuild and saved-game testing happen against the live v43 site, which is Darius's.

The batch is **independent of migration 0008** and of every `site-source/v42` change. Its branch is based on the original v42 export (`63d6379`) and adds only this folder.

## Counts (48 players in scope)

| Group | Players | 1999 regular-season games |
| --- | --- | --- |
| Ready for review (`batch-records.json`) | **42** | **514** |
| Held until identity is resolved (`review-records.json`) | 1 (Derrick Walker) | 8 |
| Already complete: their nflverse 1999 games are already in the game | 5 (Marshall Faulk, Isaac Bruce, Ben Coates, Eric Green, Jackie Harris) | 0 new |
| **Total** | **48** | **522** |

Identities are confirmed for all 48 players: 42 + 1 + 5 = 48. Only the 42 receive games in this batch.

**Reconciliation with the coverage table.** The table counted **547** missing 1999 games for these 48 players:

    547 = 514 built for review + 8 held (Walker) + 25 not available from nflverse

All 25 games that nflverse can't supply are listed below and **stay missing**; none is unidentified.

The older source also records 17 extra zero-stat appearances that go beyond the official games-played counts. They are flagged in `batch-players.json` (`olderSourceAppearancesBeyondOfficialCount`) and are not counted as missing.

### The 25 games not available from nflverse (still missing)

| Player | Date | Teams | Game | Older source shows stats? | Why nflverse can't supply it |
| --- | --- | --- | --- | --- | --- |
| Scott Mitchell | 1999-09-12 | BAL vs LA | `1999_01_BAL_STL` | yes | nflverse has this game on its schedule but no player stats for it; the game is withheld by the verified exclusion list |
| Marshall Faulk | 1999-09-12 | LA vs BAL | `1999_01_BAL_STL` | yes | nflverse has this game on its schedule but no player stats for it; the game is withheld by the verified exclusion list |
| Ricky Proehl | 1999-09-12 | LA vs BAL | `1999_01_BAL_STL` | yes | nflverse has this game on its schedule but no player stats for it; the game is withheld by the verified exclusion list |
| Isaac Bruce | 1999-09-12 | LA vs BAL | `1999_01_BAL_STL` | yes | nflverse has this game on its schedule but no player stats for it; the game is withheld by the verified exclusion list |
| Ben Coates | 1999-12-05 | NE vs DAL | `1999_13_DAL_NE` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Eric Green | 1999-11-07 | NYJ vs ARI | `1999_09_ARI_NYJ` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Eric Green | 1999-11-28 | NYJ vs IND | `1999_12_NYJ_IND` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Jackie Harris | 1999-09-26 | TEN vs JAX | `1999_03_TEN_JAX` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Jackie Harris | 1999-12-19 | TEN vs ATL | `1999_15_ATL_TEN` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Jackie Harris | 2000-01-02 | TEN vs PIT | `1999_17_TEN_PIT` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Troy Drayton | 1999-11-07 | MIA vs TEN | `1999_09_TEN_MIA` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Troy Drayton | 1999-11-14 | MIA vs BUF | `1999_10_MIA_BUF` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Andrew Glover | 1999-12-12 | MIN vs KC | `1999_14_MIN_KC` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Howard Cross | 1999-10-18 | NYG vs DAL | `1999_06_DAL_NYG` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Howard Cross | 1999-11-14 | NYG vs IND | `1999_10_IND_NYG` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Howard Cross | 1999-11-28 | NYG vs ARI | `1999_12_ARI_NYG` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Irv Smith | 1999-10-31 | CLE vs NO | `1999_08_CLE_NO` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Derrick Walker | 1999-09-12 | LV vs GB | `1999_01_OAK_GB` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Derrick Walker | 1999-09-26 | LV vs CHI | `1999_03_CHI_OAK` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Derrick Walker | 1999-12-05 | LV vs SEA | `1999_13_SEA_OAK` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Brian Kinchen | 1999-09-19 | CAR vs JAX | `1999_02_JAX_CAR` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Brian Kinchen | 1999-10-03 | CAR vs WAS | `1999_04_CAR_WAS` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Brian Kinchen | 1999-10-31 | CAR vs ATL | `1999_08_CAR_ATL` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Brian Kinchen | 1999-12-18 | CAR vs SF | `1999_15_SF_CAR` | no | no nflverse stat row: the older source records an appearance with no offensive stats |
| Brian Kinchen | 2000-01-02 | CAR vs NO | `1999_17_NO_CAR` | no | no nflverse stat row: the older source records an appearance with no offensive stats |

## Why these games are missing

The all-era pool reads the older historical rows only for seasons before 1999 (`lib/historical-data.ts` skips `season >= 1999`). It takes 1999 onward from nflverse, but only for players in the game's modern nflverse catalog.

- **The 42:** not in that catalog, so they have no 1999 games in the game.
- **The other 5:** are in it, so their nflverse 1999 games are already present. Only the games nflverse lacks are missing.

## Source and licence

- **Game data:** nflverse `stats_player_week_1999.csv`, from https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_1999.csv.
  - It is **byte-identical to the snapshot the game already uses**: SHA-256 `5bf732d1dcb4a8f1927af074c05d5534f4b91abd6434fd4cf6130e8a20a91d20`, pinned in `data/nflverse/manifest.json`.
  - **Licence: CC BY 4.0** (`data/nflverse/LICENSE-nflverse.md`). Attribution: "Data from nflverse (https://github.com/nflverse/nflverse-data), CC BY 4.0." This is the same source and licence as the game's existing 1999–2026 records, so it needs no new permission.
  - nflverse's own warning, already shown by the game: "1999–2000 source data are no longer maintained by nflfastR; known invalid games are excluded."
- **Identity only:** nflverse `players.csv` (`d2ff1249643f165f…`), used solely for each player's ID, name and birth date.
- **Not used as a source:** the game's own older-source 1999 rows. They serve only to cross-check identities and dates.

## How it was built (`build_1999_batch.py`)

The builder follows the rules of `scripts/import-nflverse.py`:

- the same column mapping;
- only QB, RB, FB, WR and TE rows;
- the verified game exclusions (`1999_01_BAL_STL` is on nflverse's schedule, but it has no player stats and the game withholds it);
- only games already accepted among the game's 1999 games, with dates and teams matching;
- each row's points reconciled against nflverse's own fantasy points.

**No silent zeros.** Every stat must be present; a blank or NA is never read as 0. No row needed that.

**Identity.** Each player is matched by normalized name **and** birth date. The match is then confirmed game by game: **all 522 built games match the game's own older-source 1999 rows on date and teams.**

**Derrick Walker.** His two records give birth dates one day apart (1967-06-22 and 1967-06-23); his name, position, career years and every 1999 game agree. An independent check judged him the same person, but his 8 games **stay on hold** until his identity is resolved.

**IDs.** Rows keep each player's existing game athlete ID, so rosters, saved games and no-repeat lists are untouched. Their performance IDs would be `nflverse:<athleteId>:<gameId>`.

## Validation

Run from `sites/fantasy-football-of-the-past/`:

```sh
NFLVERSE_DIR=/path/to/nflverse-cache node proposals/1999-games/validate.mts
```

It writes `validation.json`, recording the commit it ran on. **Use the copy in the commit you review.** Earlier "all checks pass" statements are superseded.

**What the checks cover:**

- row shape;
- IDs and collisions;
- accepted games and exclusions;
- stats present and numeric;
- scoring under Standard, Half PPR and Full PPR with the current all-era rules;
- no second identities;
- the reconciliation above;
- the baseline counts on this commit;
- a re-hash of the actual source file;
- unchanged app files against `63d6379`.

**What the checks can't show:** the collision and same-date checks cannot fire against this commit's data. They are guards for integration, because v43's data may differ. The dry-run figures in `validation.json` → `report` are information only.

## Integration notes (Darius's decisions, against v43)

- **Row format:** the compact schema of `data/nflverse/records.json` (`summary.json` → `recordColumns`).
- **Recommended route: a separate file read only into the all-era pool.**
  - The independent dry run tested this in a scratch copy of the v42 code. The rows went into their own file, only the all-era pool (`modernRegularByAthlete`) read it, and the catalog builder got a one-line change to read it too.
  - The rebuilt catalog had 1,308 athletes and 179,300 performances. Exactly 42 entries changed (games and 1999 seasons added).
  - All 178,786 existing all-era performances were identical by ID and by full-object hash. The Strict archive (68,519 games) was unchanged.
  - Draftability was identical for all 480 combinations of mode, scoring format, era and position.
  - All 514 games drew correctly, with correct remaining counts and receipts.
  - All 272 tests passed, both on `63d6379` and on top of `site-source/v42` at `9b93701`, including the saved-game migration fixture.
- **Not recommended: appending to `data/nflverse/records.json`.**
  - In the same dry run, 10 of 272 tests failed. They guard the Strict archive, for example "normal 435-player, 68,519-game archive and every original data file remain unchanged".
  - So this route would change the Strict archive itself, not just test counts.
- **Against v43:** this evidence comes from v42 code. Re-run the collision and same-date checks, the catalog rebuild and saved-game tests against v43's data.
- **Postseason:** 1999 playoff games are not included.
- **Credit:** the existing nflverse attribution covers these rows.

## Follow-on (not in this batch)

Another **60 catalog players** outside this batch have the same gap: 742 older-source 1999 rows, by position QB 14, WR 31, RB 14, TE 1.

## Reproduce

```sh
python3 -I proposals/1999-games/build_1999_batch.py --nflverse /path/to/nflverse-cache --profiles /path/to/profiles.json
NFLVERSE_DIR=/path/to/nflverse-cache node proposals/1999-games/validate.mts
```

`--nflverse` must hold the pinned `stats_player_week_1999.csv`, nflverse `players.csv` and `games.csv`. `--profiles` is the game-log profile file behind the `historical:player:N` IDs; it is used for birth dates only.
