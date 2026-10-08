// Validates the proposed 1999 batch against the app's own data and code. Run from sites/fantasy-football-of-the-past/:
//   NFLVERSE_DIR=/path/to/nflverse-cache node proposals/1999-games/validate.mts
// NFLVERSE_DIR must hold stats_player_week_1999.csv so its hash is recomputed; BATCH_BASE (default 63d6379, the commit this
// branch is based on) is the base for the "app files unchanged" check.
// Writes proposals/1999-games/validation.json and exits non-zero if any check fails. Nothing in data/ or lib/ changes.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
registerHooks({load(url,c,n){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return n(url,c);},resolve(id,c,n){try{return n(id,c);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return n(`${id}.ts`,c);throw e;}}});

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const hd = await import(`${APP}/lib/historical-data.ts`);
const { newScoring, LEGACY_SCORING } = await import(`${APP}/lib/scoring-rules.ts`);
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
type Row = [string, number, number, string, string, string, string, string, ...number[]];
const STAT_KEYS = ['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','fumblesLost','twoPoint','returnTD','sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed','fumbleRecoveryTD'];
const YARDS = new Set(['passingYards', 'rushingYards', 'receivingYards']);
const DEFENSE = ['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed'];
const HISTORICAL = { ...LEGACY_SCORING, mode: 'historical' as const };
const batch: Row[] = read(`${HERE}/batch-records.json`);
const review: Row[] = read(`${HERE}/review-records.json`);
const summary = read(`${HERE}/summary.json`);
const manifest = read(`${APP}/data/nflverse/manifest.json`);
const nfl: Row[] = read(`${APP}/data/nflverse/records.json`);
const checks: { name: string; pass: boolean; detail: unknown }[] = [];
const check = (name: string, failures: string[], detail: Record<string, unknown> = {}) => checks.push({ name, pass: failures.length === 0, detail: { ...detail, failures: failures.length, examples: failures.slice(0, 5) } });

// Accepted 1999 games, from the game's own nflverse records (teams and date per game).
const accepted = new Map<string, { teams: Set<string>; date: string }>();
for (const r of nfl) if (r[1] === 1999) { const g = accepted.get(r[3]) ?? { teams: new Set<string>(), date: r[4] }; g.teams.add(r[5]); g.teams.add(r[6]); accepted.set(r[3], g); }
const excluded = new Set<string>(manifest.excludedGameIds);
const athletes = new Map(hd.HISTORICAL_ATHLETES.map((a: { id: string }) => [a.id, a]));
const existingIds = new Set<string>();
for (const a of hd.HISTORICAL_ATHLETES as { id: string }[]) for (const p of hd.performancePool(a.id, HISTORICAL) as { id: string }[]) existingIds.add(p.id);
for (const p of hd.PERFORMANCES as { id: string }[]) existingIds.add(p.id);

function validateRows(label: string, rows: Row[]) {
  const shape: string[] = [], ids: string[] = [], games: string[] = [], stats: string[] = [], scoring: string[] = [];
  const seen = new Set<string>(), weeks = new Set<string>();
  const existingWeeks = new Set<string>();
  for (const a of new Set(rows.map(r => r[0]))) for (const p of hd.performancePool(a, HISTORICAL) as { season: number; week: number | null; sourceWeek?: number; date: string }[]) if (p.season === 1999) existingWeeks.add(`${a}|${p.date}`);
  for (const r of rows) {
    const [athleteId, season, week, gameId, date, team, opp, type, ...values] = r;
    const id = `nflverse:${athleteId}:${gameId}`;
    if (r.length !== 8 + STAT_KEYS.length || season !== 1999 || type !== 'REG' || !Number.isInteger(week) || week < 1 || week > 17) shape.push(`${id}: shape/season/week/type`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1999-09-01' || date > '2000-01-31') shape.push(`${id}: date ${date}`);
    if (seen.has(id)) ids.push(`${id}: duplicate`); seen.add(id);
    if (existingIds.has(id)) ids.push(`${id}: collides with an existing performance`);
    const a = athletes.get(athleteId) as { position: string } | undefined;
    if (!a || a.position === 'DEF') ids.push(`${id}: athlete not in the all-era catalog`);
    const wk = `${athleteId}|${week}`; if (weeks.has(wk)) ids.push(`${id}: two games in week ${week}`); weeks.add(wk);
    if (existingWeeks.has(`${athleteId}|${date}`)) ids.push(`${id}: athlete already has a 1999 game on ${date}`);
    const g = accepted.get(gameId);
    if (!g) games.push(`${id}: not an accepted 1999 game`);
    else { if (g.date !== date) games.push(`${id}: date ${date} vs accepted ${g.date}`); if (!g.teams.has(team) || !g.teams.has(opp) || team === opp) games.push(`${id}: teams ${team}/${opp} vs ${[...g.teams]}`); }
    if (excluded.has(gameId)) games.push(`${id}: excluded game`);
    const st = Object.fromEntries(STAT_KEYS.map((k, i) => [k, values[i]]));
    for (const k of STAT_KEYS) { const v = st[k]; if (typeof v !== 'number' || !Number.isFinite(v)) stats.push(`${id} ${k}: not a number`); else if (v < 0 && !YARDS.has(k)) stats.push(`${id} ${k}: negative`); }
    for (const k of DEFENSE) if (st[k] !== 0) stats.push(`${id} ${k}: defense field on a player row`);
    if (a) for (const ppr of [0, .5, 1]) { try { hd.score(st, a.position, newScoring(ppr, true, 'historical')); } catch (e) { scoring.push(`${id} ${ppr}: ${(e as Error).message}`); } }
  }
  check(`${label}: row shape, season, week, date`, shape, { rows: rows.length });
  check(`${label}: IDs unique, no collision with ${existingIds.size} existing performances, athlete in catalog, one game per week`, ids);
  check(`${label}: every game is an accepted 1999 game with matching date and teams, none excluded`, games, { acceptedGames1999: accepted.size, excluded: [...excluded].filter(g => g.startsWith('1999')) });
  check(`${label}: all 19 stats present and numeric (no nulls), counts nonnegative, defense fields zero`, stats);
  check(`${label}: scores under Standard, Half PPR and Full PPR with the current all-era rules`, scoring);
}
validateRows('batch', batch);
validateRows('review (Derrick Walker, identity sign-off needed)', review);

// Identity: no batch player may already exist in the game under their nflverse gsis_id (that would split one person).
const players = read(`${HERE}/batch-players.json`) as { name: string; athleteId: string; gsisId: string | null }[];
const allIds = new Set<string>([...(hd.HISTORICAL_ATHLETES as { id: string }[]).map(a => a.id), ...(hd.ATHLETES as { id: string }[]).map(a => a.id),
  ...nfl.map(r => r[0]), ...(read(`${APP}/data/historical-mode/records.json`) as Row[]).map(r => r[0])]);
check('no batch player already exists in the game under a second (nflverse) ID', players.filter(p => p.gsisId && p.gsisId !== p.athleteId && allIds.has(p.gsisId)).map(p => `${p.name}: ${p.gsisId}`), { players: players.length });

// Reconciliation: every game in the coverage gap is built, held, or listed as missing; missing games never overlap the batch.
const recon: string[] = [];
const batchKeys = new Set([...batch, ...review].map(r => `${r[0]}|${r[4]}`));
let gap = 0, built = 0, listed = 0;
for (const p of read(`${HERE}/batch-players.json`) as { name: string; athleteId: string; missing1999GamesInCoverage: number; batchGames: number; gapReconciliation?: { missingGames: { date: string; gameId: string | null; team: string | null }[]; unidentifiedMissing: number } }[]) {
  const g = p.gapReconciliation; gap += p.missing1999GamesInCoverage; built += p.batchGames;
  const missing = g?.missingGames ?? []; listed += missing.length;
  if (p.batchGames + missing.length + (g?.unidentifiedMissing ?? 0) !== p.missing1999GamesInCoverage) recon.push(`${p.name}: ${p.batchGames} built + ${missing.length} listed != gap ${p.missing1999GamesInCoverage}`);
  for (const m of missing) { if (!m.date || !m.gameId || !m.team) recon.push(`${p.name}: missing game without date/team/gameId`); if (batchKeys.has(`${p.athleteId}|${m.date}`)) recon.push(`${p.name}: ${m.date} is both missing and in the batch`); }
}
if (built !== batch.length + review.length) recon.push(`players report ${built} games, files hold ${batch.length + review.length}`);
check('reconciliation: coverage gap = built + held + listed missing games, and no listed missing game is in the batch', recon, { coverageGap: gap, built: batch.length, held: review.length, listedMissing: listed });

// Baseline counts (the reviewed figures) and a dry-run report (information only, not a check).
const athletesAll = hd.HISTORICAL_ATHLETES as { id: string }[];
let before = 0; for (const a of athletesAll) before += hd.performancePool(a.id, HISTORICAL).length;
const byAthlete = new Map<string, number>(); for (const r of batch) byAthlete.set(r[0], (byAthlete.get(r[0]) ?? 0) + 1);
const dry: string[] = [];
if (athletesAll.length !== 1308) dry.push(`catalog has ${athletesAll.length} athletes, expected 1,308`);
if (before !== 178786) dry.push(`pool has ${before} performances, expected 178,786`);
check('baseline on this commit matches the reviewed counts (1,308 athletes, 178,786 performances)', dry, { athletes: athletesAll.length, performances: before });
const report = { dryRun: { performancesBefore: before, performancesIfAdded: before + batch.length, added: batch.length, athletesGainingGames: byAthlete.size, newAthletes: 0,
  note: "Information only. Rows keep each athlete's existing ID; no data file changes here. Integration and saved-game testing happen against v43." } };

// Source: recompute the hash of the actual file and compare with the pinned manifest.
const pinned = manifest.sourceFiles.find((f: { file: string }) => f.file === 'stats_player_week_1999.csv');
const dir = process.env.NFLVERSE_DIR;
let actual = '';
try { actual = dir ? createHash('sha256').update(readFileSync(`${dir}/stats_player_week_1999.csv`)).digest('hex') : ''; } catch { actual = ''; }
check('source file re-hashed: it is the pinned nflverse snapshot (CC BY 4.0)', !dir ? ['NFLVERSE_DIR not set, so the source file was not re-hashed'] : actual !== pinned?.sha256 ? [`hash ${actual || '(unreadable)'} does not match the manifest`] : actual !== summary.source.sha256 ? ['summary.json records a different hash'] : [], { sha256: actual, url: summary.source.url });
const base = process.env.BATCH_BASE ?? '63d6379';
const changed = execFileSync('git', ['diff', '--name-only', base, '--', 'data', 'lib', 'app', 'components', 'drizzle', 'public', 'scripts', 'tests'], { cwd: APP, encoding: 'utf8' }).split('\n').filter(Boolean);
check(`app files unchanged against ${base} (data, lib, app, components, drizzle, public, scripts, tests)`, changed.map(f => `changed: ${f}`));

const fileHash = (f: string) => createHash('sha256').update(readFileSync(`${HERE}/${f}`)).digest('hex');
const result = { pass: checks.every(c => c.pass), base, validatedFiles: Object.fromEntries(['batch-records.json', 'review-records.json', 'batch-players.json', 'summary.json'].map(f => [f, fileHash(f)])), checks, report };
writeFileSync(`${HERE}/validation.json`, JSON.stringify(result, null, 1) + '\n');
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);
console.log(result.pass ? `All ${checks.length} checks passed.` : 'Some checks failed; see validation.json.');
process.exit(result.pass ? 0 : 1);
