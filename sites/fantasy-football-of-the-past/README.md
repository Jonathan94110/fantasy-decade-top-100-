# Fantasy Football of the Past

Source snapshot of the v43 app, from commit `9ac9711fdf01bba9368e267fd523cd904052fae6`. It includes solo seasons, online leagues, quick matchups, the depth chart, historical previews, replay calculations and the live v43 account/dashboard experience.

Work inside this directory. The repository's existing rankings bot and root website remain independent.

## Run locally

Use Node 24 and npm. Dependencies are pinned in `package-lock.json`.

```sh
cd sites/fantasy-football-of-the-past
npm run install:ci
npm run build
```

The copied `.openai/hosting.json` supplies a generic local `DB` binding. It contains no hosted Site project ID or private deployment configuration. Building creates local Worker configuration under ignored `dist/` and does not deploy anything.

For a fresh local database, apply the nine migration SQL files in filename order. From this directory on macOS/Linux:

```sh
for migration in drizzle/[0-9]*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
npm run dev -- --hostname 127.0.0.1
```

On other shells, run the same local Wrangler command once per migration, replacing `$migration` with its filename. Apply only pending migrations to an existing local database. All database files stay in ignored `.wrangler/`; no saved games were copied into this repository.

Open the localhost URL printed by the dev server, normally `http://127.0.0.1:5173/`. For development sign-in, open `/signin-with-chatgpt?return_to=/` on that local URL. The portable dev profile simulates a local test identity. Hosted authentication is a separate platform integration.

## Player data and current rules

Read [PLAYER_DATA_CONTRIBUTING.md](PLAYER_DATA_CONTRIBUTING.md) before adding records. New games use the uniform v5 all-era scoring contract. Saved games retain their own scoring contracts and completed records. Required unknown stats remain unknown; the 1950s gameplay pool is deferred.

Current behavior is described in [scoring-mode-scaffold.md](docs/scoring-mode-scaffold.md) and [unified-draft.md](docs/unified-draft.md), and implemented in `lib/scoring-rules.ts` and `lib/historical-data.ts`. Older milestone documents, including `game-data-schema-for-deck.md` and [the original source README](docs/README_AT_V43.md), describe earlier phases and may contain superseded counts or defaults.

## Validate changes

Run from this app directory:

```sh
node --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm run build
```

Mounted UI harnesses live in `scripts/qa/*-dom.mjs`. They require a separately installed `happy-dom` module; set `DOM_HARNESS_MODULE` to its absolute module path when running a harness. Keep test-only dependencies and runtime state out of commits. `scripts/qa/local-smoke.mjs` deliberately creates disposable local fixture games and should be used only against an isolated local database.

## Export boundaries and provenance

`SOURCE_EXPORT.json` records the original v43 commit and hashes of all 362 copied source files. The original README is retained byte for byte under `docs/README_AT_V43.md`. All 32 runtime football data files are unchanged from the prior authorized v42 export. The unpublished computer-draft fairness change, Claude app changes, migration 0008 and the separate 1999 proposal are excluded. The live hosting manifest was replaced with generic local configuration. Application code, runtime football assets, schema, migrations, tests, required build source, source attribution and license notices are retained.

The owner explicitly authorized this public repository export on October 8, 2026. Existing data manifests record the earlier private publication decisions as historical provenance. This export does not assert an additional upstream license grant. Preserve the source-use disclosures in [DATA_SOURCES.md](DATA_SOURCES.md), the nflverse CC BY 4.0 notice and the MIT notices for bundled build/vendor source.

Credentials, `.env` files, Git remotes/history from the Site checkout, live Site identity, saved games/profiles, runtime databases, caches, research folders, screenshots and generated artifacts were excluded. Separately staged Stathead records and upstream raw snapshots are not included.

Changes in this repository do not automatically update the hosted Site or its sharing settings. Site deployment requires a separate requested publishing step.
