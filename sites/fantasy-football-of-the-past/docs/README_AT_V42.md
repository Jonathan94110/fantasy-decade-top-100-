# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Fictional player byes and spoiler-safe scouting

Each new league season stores one fictional bye per athlete identity (including franchise defenses), balanced within positions over regular-season weeks 2 through the penultimate regular week. The assignment is tied to the league ID, persisted with season state, and survives trades and add/drop; new league IDs create a fresh schedule. No actual NFL bye information is used. Existing active saves adopt byes only after their current round, preserving all saved draws and current locks; seasons without an untouched bye window keep compatibility and explain that byes start next season.

Human starters are never automatically changed just because they are on bye. The lineup warns and links to free agents, and a lock with bye starters needs an explicit zero-point acknowledgement. Commissioners closing a round are warned that bye starters receive zero. Bots first seek a legal non-bye bench lineup, then eligible free agents, and accept zero only if no replacement is possible. Bye entries contain no historical performance and consume no used-game ID. Playoff player byes are impossible (bracket byes remain separate).

Scouting statistics and displayed rankings use the fixed full loaded archive under the selected scoring rules. The card distinguishes equal-game averages and equal-season averages, explains partial career coverage, and reports best/worst/range and games below five points. Consumption cannot change these aggregates to reveal a hidden draw. Actual draw probabilities and scoring formulas are unchanged.

The final replay reveals the saved version's season, NFL week, team, opponent, statistics and source. Weekly recaps use only revealed saved scores: highest individual scorer, greatest win from a lower preweek standings rank (excluding tied scores and identical standings records/points), and lowest-scoring Hall of Fame starter. Byes are excluded. All final cards share the existing per-manager final/Skip disclosure gate.

### Bye-schedule correction
Legacy migration requires four untouched regular-season weeks; fewer weeks defer new byes. Version-1 schedules squeezed into fewer than four weeks have only editable assignments removed. A one-time version-1 whole-roster collision repair distributes affected editable assignments across a sufficiently large window, leaving other players and all completed/locked rounds unchanged. Good maps are retained; trades and add/drop never trigger reassignment. Current absences, scheduled future byes and completed byes have distinct labels, with a weekly available-count summary and concentrated-pick draft warnings. Forecasts remain fixed, not provisional.

Free-agent cards and add/drop confirmations show prominent current-week fictional bye status, a scheduled/completed bye detail, and explicit zero-point warnings. Free agency summarizes the non-bye count in the current filtered pool; the confirmation compares the outgoing player too. This display-only change uses existing saved assignments in both solo and online seasons.

Availability labels now reserve amber BYE exclusively for current fictional absences. Other players say Available in neutral text; future/completed rest-week dates are smaller secondary text. Starter choices, roster cards, free agents, details, and add/drop confirmations use the same distinction. This is display-only; no assignments, draws, or scoring changed.

Availability color refinement: light green Available, light red BYE THIS WEEK, and light orange Available · Bye next week. Text labels carry the same meaning independently of color. Coming-week status is bounded to regular-season weeks and does not mark a player unavailable now. This remains presentation-only.

### Postgame bench scores (forward-only)
Newly resolved solo and online season weeks freeze each playing team's full roster, then draw one unused historical game for every non-bye bench player using the same year-uniform/game-uniform engine as starters. Bench receipts and consumption share the starter resolution's revision-checked atomic write. Team scores, wins and playoff seeding remain starter-only. A simulated bench bye is zero with no draw; an exhausted pool is explicitly unavailable (null points), not a fabricated zero. Free agents, eliminated teams and playoff-bye teams do not draw.

Bench scores and exact receipts are omitted from server responses until that manager finishes or skips the saved replay; hidden bench ledger entries reveal no chosen year/week/game. Final replay and saved results show separate Bench points / Points left on bench with full scoring receipts. Replay, repeat reveal, reload and stale concurrent resolution cannot consume a second game. Existing historical weeks are never backfilled and display unavailable bench scores. Roster snapshots and receipts remain immutable across trades and add/drop; consumed IDs stay used.

Bench receipt cards explicitly set dark player-name and position colors on their pale surfaces, including inside the navy replay panel. Names wrap, position and Bench are separate from the historical game label, and points have a distinct label. Narrow screens stack identity above points. Missing legacy catalog identities display a readable unavailable label rather than an internal ID. This presentation correction does not alter scoring, receipt disclosure, byes, or game consumption.

### Trading (solo and online)
- The Trades tab is available in both modes. Search roster names/positions, compare full-archive averages and fixed byes, select a one-for-one exchange, then explicitly review and confirm outgoing and incoming players.
- Solo computer teams respond in the same atomic save. Their deterministic rule uses public full-archive, equal-year averages only: the incoming player's average must be at least 90% of the outgoing player's, and the best legal six-starter lineup plus 25% of remaining bench averages must not decrease. Distinct FLEX selections and position coverage apply. This considers positional depth without looking at future draws or remaining-game scores. Accepted/declined decisions and reasons persist in trade history.
- Online offers require the actual receiving manager to accept; only that manager may decline, and only the sender may cancel. Duplicate pending offers are rejected. Both resulting rosters and repaired lineups are validated at offer and acceptance, including minimum remaining archive depth. Atomic revision-guarded saves prevent simultaneous acceptance or stale-client duplicate trades.
- Trades are allowed only during an active, unlocked week, never on the already-resolved results screen. Open the next week first. Modern 17-week seasons permit unlocked playoff trading, matching their existing roster-move policy; legacy leagues close at playoffs. Offers expire on week resolution or changed ownership. Completed seasons are closed.
- A trade never modifies the league's used-performance ledger, identity-based bye map, roster snapshots or past results. Departing starters are legally replaced while unaffected saved starters stay selected. Managers should review their new starters before locking.

## Hall of Fame recognition

Hall of Fame badges are informational. There is no cap on drafting, starting, trading, or adding Hall of Fame players in quick matchups, solo seasons, or online leagues. Legacy `hallCap` fields remain in saved data for compatibility but are never enforced; new games store zero. Historical results, scoring snapshots, consumed games, and completed draft records are not rewritten by this change. Position coverage, distinct starters, ownership, roster size, game availability, and lineup locks still apply.

## Broadcast / vintage visual revision

The shared `app/gridiron.css` theme combines stadium photography, broadcast scoreboards,
field-green surfaces, warm vintage card stock, red/gold accents, and condensed sporting
headlines. Draft and season rules, API payloads, saved-state formats, historical data,
and reveal boundaries are unchanged. Narrow screens stack player cards and keep draft
controls separate; both OS and saved reduced-motion preferences remain supported.

Run `DOM_HARNESS_MODULE=/absolute/path/to/happy-dom/lib/index.js node scripts/qa/gridiron-dom.mjs`
for the isolated, non-production setup/draft/season/replay interaction regression.
This test does not measure rendered layout or substitute for browser visual QA.

## Fresh starts, draft order, and manager turnover

`Reset season` is a confirmed, account-scoped solo action. A SQLite delete trigger
archives the exact old row before its removal; an archive failure aborts the reset.
Setup lists the private backups for restoration. Restore and fresh creation advance
account revisions, and normal writes compare both season ID and revision. The reset
does not touch profiles, quick matchups, online leagues, or historical player data.

The solo setup offers a once-saved random lottery or an explicit commissioner-set
permutation. Its opening reveal cannot reroll, and no player pick occurs until the
manager enters the draft room. The order remains the same across reloads. Manual
online draft order is also configured in the lobby and frozen at draft start.

Online commissioner controls remove a lobby participant or vacate a started team's
manager binding. Vacant teams keep their ID, roster, locks, historical draws, record,
and schedule. A replacement checks the rotated invitation and chooses an existing
vacancy. Removed accounts lose API access; no invitations are automatically sent.
Caretaker lineup preparation is an explicit commissioner action, never changes the
roster, minimizes simulated-bye starters, and may resolve a round only when all teams
are locked. New midseason teams and completed-season manager changes are unsupported.

Additional isolated regression: `scripts/qa/manager-controls-dom.mjs` uses the same
DOM_HARNESS_MODULE environment setting as the draft/replay test. DOM and static review
do not establish rendered desktop/mobile visual quality.

## Bye-free opening week and visible draft picks

Week 1 cannot be a simulated bye in new assignments. Existing Week 1 rest dates
move deterministically to later regular-season weeks only while Week 1 is unplayed,
including when a lineup is already locked. Other bye dates, rosters, locks and saved
results remain unchanged. Completed or elapsed Week 1 byes remain historical and do
not create an extra future bye. Both solo and online public/gameplay paths use this
normalization; no season is reset or advanced by the update.

Recent selections are visible above the draft workspace. The complete round selector
shows every team's player, position and pick number without a wide 16-team table.
Online drafts now persist an immutable draft-pick ledger; a still-open legacy draft
can reconstruct its exact prior picks from ordered rosters. Completed older online
drafts lacking that ledger are not reconstructed from potentially changed rosters.
Solo draft records remain the source of truth, including after the season starts.

## Depth chart and kicker-enabled new seasons

The Depth chart page (and league tab) keeps every playable athlete in positional
rank order, including already drafted players. Ownership, own starter/bench role,
fictional byes and remaining-game counts use the selected league. Opponent starter
choices remain private. A read-only endpoint returns rankings and context from the
same saved snapshot and never creates a quick matchup or changes a roster.

New season setup creates a version-3, kicker-enabled lineup contract and a
version-4 scoring contract: 11 players, seven starters (QB/RB/WR/TE/DEF/FLEX/K) and
four bench. K scoring is XP +1; field goals
under 40/40–49/50+ yards +3/+4/+5; each missed or blocked FG/XP −1. Real offensive
contributions by kickers still use the existing offense rules. Rules are snapshotted
in each saved round. Reception-scoring edits preserve the saved K and individual
lost-fumble rules in the lobby.

Existing v1/v2 seasons, drafts and quick matchups retain their slots and scoring.
They cannot draft/add a K, and K scouting under those contracts displays an explicit
unsupported message rather than a zero average. No reset or auto-upgrade is applied.
To use K, explicitly start a new season; the existing reset/backup flow is available.

New quick matchups, solo seasons and online leagues use version-4 scoring with
individual lost-fumble scoring disabled (`lostFumble: 0`) for Standard, Half PPR and
Full PPR. Existing version-1/2/3 contracts retain their saved lost-fumble rule
(normally −2), including all unplayed weeks. A missing scoring snapshot uses the
original version-1 Full PPR contract. Changing reception scoring does not upgrade a
saved contract. Completed scores and their saved round scoring remain unchanged.

D/ST fumble-recovery points and offensive fumble-recovery touchdowns continue to
score. Raw historical statistics remain as recorded; an unavailable lost-fumble
stat remains unknown, not zero. Disabling that scoring field does not import or
unlock any additional historical games.

The first K cohort is a bounded selection of 40 verified kickers with 8,353 actual
nflverse appearances, kept in separate files so the 60,166 previous records and all
395 previous athlete objects remain byte-identical. K has one later regular-season
bye, never Week 1 or playoffs. At the two-K roster limit, 40 kickers leave at least eight unowned and at least four non-bye options in a full 16-team league. Shared-pool reservation also prevents drafts from
consuming backup kickers needed by teams that have not selected their first one.

Solo and online drafts, free agents, and the depth chart have native Position and
Era dropdowns alongside search. The filters intersect, and clearing returns to
QB, all eras, and an empty search without changing saves, scoring, or draft order.
Era membership requires a positive verified game count in that decade; online
availability also excludes consumed games. Multi-decade players retain one stable
identity. The depth chart keeps full-archive ranks and averages fixed.

The playable archive begins in 1999, so the 1960s, 1970s, and 1980s show an explicit
empty state and a filtered historical-preview link. Preview profiles remain
read-only and cannot be drafted. Selecting an era only browses names: a selected
player still draws from their full eligible year/game pool. Existing game records,
scoring contracts, and historical source data are unchanged.

## Historical QB game review

`/historical-game-review` exposes 24 reviewed shutout games for seven quarterbacks. It prominently identifies the low-scoring selection bias; these records are excluded from normal drafts, random draws and seasons. The 435-entity/68,519-performance playable archive, saved scoring contracts, game consumption and17-game opening-season requirement are unchanged. Source values and separately derived conversion/recovery-TD zeros are retained without filling unknown lost fumbles. See [the source review](docs/historical-shutout-import.md).
