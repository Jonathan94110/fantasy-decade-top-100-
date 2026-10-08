// Regenerates tests/fixtures/pre-0008-saved-rows.json: rows saved by the PREVIOUS app version (commit
// 63d6379, before the historical ID rename) through its own API routes, for tests/migration-0008.test.ts.
// No production saves are copied into this repository, so these rows stand in for them.
//
// Run from sites/fantasy-football-of-the-past/:  node scripts/qa/generate-pre-0008-fixture.mts
//
// It extracts the old lib/, data/, app/api/, db/ and drizzle/ with `git archive 63d6379` into a temporary
// directory (reusing this checkout's node_modules), creates the tables with the old migrations, and plays:
//  * a quick game (leagues): two resolved rounds and a third partly locked;
//  * an online historical season (season_leagues): two scored weeks;
//  * an online strict season (nflverse games only, nothing to rename) and an unplayed lobby;
//  * a solo season that is played, reset (copied into demo_archives) and started again (demo_drafts);
//  * a strict unplayed draft unified to all-era scoring, which writes demo_scoring_backups from a
//    pretty-printed row.
// League and team names are valid (<= 50 characters) but chosen so that a blanket text replacement of
// "prime-rushmore:" or ".csv#L" would alter them. Revisions come from the API, so each revision column
// matches state.revision exactly as production saves do.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD_COMMIT = '63d6379';
const APP_PATH = 'sites/fantasy-football-of-the-past';
const app = fileURLToPath(new URL('../../', import.meta.url));
const out = join(app, 'tests/fixtures/pre-0008-saved-rows.json');
const temp = mkdtempSync(join(tmpdir(), 'pre-0008-'));
try {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: app, encoding: 'utf8' }).trim();
  const archive = execFileSync('git', ['archive', '--format=tar', OLD_COMMIT, '--', ...['lib', 'data', 'app/api', 'db', 'drizzle'].map(p => `${APP_PATH}/${p}`)], { cwd: top, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', temp], { input: archive });
  symlinkSync(join(app, 'node_modules'), join(temp, APP_PATH, 'node_modules'));
  await generate(new URL(`file://${join(temp, APP_PATH)}/`));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

async function generate(root: URL) {
  registerHooks({
    load(url, context, next) { if (url.startsWith('file:') && url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` }; return next(url, context); },
    resolve(id, context, next) { if (id === '@/db') return { url: `data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__pre0008Database;}')}`, shortCircuit: true }; if (id.startsWith('@/')) return next(new URL(`${id.slice(2)}.ts`, root).href, context); try { return next(id, context); } catch (e) { if (id.startsWith('.') && !/\.[a-z]+$/i.test(id)) return next(`${id}.ts`, context); throw e; } },
  });
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('drizzle/', root)).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`drizzle/${f}`, root), 'utf8'));
  (globalThis as Record<string, unknown>).__pre0008Database = { prepare(q: string) { let a: SQLInputValue[] = []; return { bind(...v: unknown[]) { a = v as SQLInputValue[]; return this; }, async first() { return sql.prepare(q).get(...a) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; }, async run() { return { meta: { changes: Number(sql.prepare(q).run(...a).changes) } }; } }; } };
  const L = (p: string) => new URL(p, root).href;
  const quick = await import(L('app/api/game/route.ts'));
  const demo = await import(L('app/api/demo/route.ts'));
  const leagues = await import(L('app/api/leagues/route.ts'));
  const league = await import(L('app/api/leagues/[id]/route.ts'));
  const { athletesFor, eligibleForSlot, lineupSlots } = await import(L('lib/historical-data.ts'));
  const { scoringFor } = await import(L('lib/scoring-rules.ts'));
  const { demoPickReason } = await import(L('lib/demo-draft-model.ts'));
  const { newDemoDraft } = await import(L('lib/demo-draft-engine.ts'));
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const req = (path: string, user: string, body?: unknown) => new Request(`https://fixture.test/api/${path}`, { method: body ? 'POST' : 'GET', headers: { 'oai-authenticated-user-id': user, origin: 'https://fixture.test', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  async function ok(r: Response): Promise<Json> { const j = await r.json() as Json; if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const NAMES = {
    league: 'prime-rushmore: My "prime-rushmore: x.csv#L1', owner: 'prime-rushmore:Owner', manager: 'Box.csv#L42 crew',
    strict: 'prime-rushmore: strict.csv#L9', lobby: '"prime-rushmore: lobby', solo: 'prime-rushmore: solo.csv#L7',
    cpu: '"prime-rushmore:cpu', unify: 'prime-rushmore: unify.csv#L3',
  };

  // Quick game (leagues): no user text; two resolved rounds, then a partly locked third.
  { let l = (await ok(await quick.GET(req('game', 'quick-owner')))).league; const hist = athletesFor(scoringFor(l)); const lineup: Record<string, string> = {};
    for (const slot of lineupSlots(l)) lineup[slot] = hist.find((a: Json) => eligibleForSlot(a, slot) && a.gameCount > 30 && !Object.values(lineup).includes(a.id))!.id;
    for (let round = 0; round < 2; round++) { for (const turn of [0, 1]) l = (await ok(await quick.POST(req('game', 'quick-owner', { action: 'lock', revision: l.revision, turn, lineup })))).league; l = (await ok(await quick.POST(req('game', 'quick-owner', { action: 'next', revision: l.revision })))).league; }
    await ok(await quick.POST(req('game', 'quick-owner', { action: 'lock', revision: l.revision, turn: 0, lineup }))); }

  // Online seasons (season_leagues).
  async function online(owner: string, manager: string, name: string, teamName: string, managerName: string, weeks: number, extra: Json = {}) {
    let s = (await ok(await leagues.POST(req('leagues', owner, { action: 'create', name, teamName, capacity: 2, kickers: true, ...extra })))).league;
    s = (await ok(await leagues.POST(req('leagues', manager, { action: 'join', code: s.inviteCode, teamName: managerName })))).league;
    if (weeks < 0) return;
    s = (await ok(await league.POST(req('leagues', owner, { action: 'startDraft', revision: s.revision, orderMode: 'manual', orderIndexes: [0, 1] }), ctx(s.id)))).league;
    while (s.status === 'draft') s = (await ok(await league.POST(req('leagues', owner, { action: 'autopick', revision: s.revision }), ctx(s.id)))).league;
    for (let week = 0; week < weeks; week++) { s = (await ok(await league.POST(req('leagues', owner, { action: 'closeRound', revision: s.revision }), ctx(s.id)))).league; s = (await ok(await league.POST(req('leagues', owner, { action: 'next', revision: s.revision }), ctx(s.id)))).league; }
  }
  await online('owner', 'manager', NAMES.league, NAMES.owner, NAMES.manager, 2);
  await online('strict-owner', 'strict-manager', NAMES.strict, NAMES.owner, NAMES.manager, 1, { scoringMode: 'strict' });
  await online('lobby-owner', 'lobby-manager', NAMES.lobby, NAMES.owner, NAMES.manager, -1);

  // Solo (demo_drafts + demo_archives): play a week, reset (archives it), start again and play a week.
  async function solo(user: string) {
    let d = (await ok(await demo.POST(req('demo', user, { action: 'create', teamName: NAMES.solo, capacity: 2, names: [NAMES.cpu], kickers: true, orderMode: 'manual', orderIndexes: [0, 1] })))).demo;
    if (d.orderRevealPending) d = (await ok(await demo.POST(req('demo', user, { action: 'beginDraft', seasonId: d.id, revision: d.revision })))).demo;
    while (d.status === 'draft') { const athleteId = athletesFor(scoringFor(d)).find((a: Json) => !demoPickReason(d, d.humanTeamId, a.id))!.id; d = (await ok(await demo.POST(req('demo', user, { action: 'draft', seasonId: d.id, revision: d.revision, athleteId })))).demo; }
    let r = await ok(await demo.POST(req('demo', user, { action: 'startSeason', seasonId: d.id, revision: d.revision }))); d = r.demo;
    const me = r.league.teams.find((t: Json) => t.id === r.league.myTeamId);
    r = await ok(await demo.POST(req('demo', user, { action: 'lock', seasonId: d.id, revision: d.revision, lineup: me.lineup, acceptBye: true }))); d = r.demo;
    return (await ok(await demo.POST(req('demo', user, { action: 'next', seasonId: d.id, revision: d.revision })))).demo;
  }
  { const first = await solo('solo-owner'); await ok(await demo.POST(req('demo', 'solo-owner', { action: 'reset', confirm: true, seasonId: first.id, revision: first.revision }))); await solo('solo-owner'); }

  // demo_scoring_backups: a v5 strict unplayed draft, stored pretty-printed, unified to all-era scoring.
  { const draft = newDemoDraft(NAMES.unify, .5, { modern: true, capacity: 2, kickers: true, opening: true, orderMode: 'manual', orderIndexes: [1, 0], scoringMode: 'strict', names: [NAMES.cpu] }); draft.revision = 19;
    sql.prepare('INSERT INTO demo_drafts(owner_id,id,state,revision,updated_at) VALUES(?,?,?,?,?)').run('unify-owner', draft.id, JSON.stringify(draft, null, 2), 19, '2026-10-01T00:00:00.000Z');
    await ok(await demo.POST(req('demo', 'unify-owner', { action: 'unifyDraft', seasonId: draft.id, revision: 19 }))); }

  const tables: Record<string, unknown[]> = {};
  for (const t of ['leagues', 'season_leagues', 'demo_drafts', 'demo_archives', 'demo_scoring_backups']) tables[t] = sql.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
  const meta = { generatedBy: 'scripts/qa/generate-pre-0008-fixture.mts', appCommit: OLD_COMMIT, migrationsApplied: readdirSync(new URL('drizzle/', root)).filter(f => f.endsWith('.sql')).sort(), names: NAMES };
  writeFileSync(out, JSON.stringify({ meta, tables }) + '\n');
  for (const [t, rows] of Object.entries(tables)) console.log(t, (rows as Json[]).map(r => `rev=${r.revision ?? r.source_revision} bytes=${String(r.state).length} prime-rushmore=${(String(r.state).match(/prime-rushmore/g) || []).length}`).join(' | '));
}
