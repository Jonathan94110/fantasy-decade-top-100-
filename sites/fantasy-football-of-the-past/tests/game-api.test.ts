/**
 * D1 API contract tests using an in-memory compare-and-swap database.
 * Run: node --experimental-strip-types --test tests/game-api.test.ts
 * This verifies route behavior; it does not replace a deployed D1 smoke test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { League } from '../lib/game-engine';

type Row = { state: string; revision: number };
type TestGlobal = typeof globalThis & { __gameAuditDatabase?: ReturnType<typeof memoryDatabase> };
const global = globalThis as TestGlobal;
const root = new URL('../', import.meta.url);
registerHooks({
  load(url, context, nextLoad) {
    // Bundler-style JSON imports omit attributes; expose them as ESM for Node QA.
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db') return {
      url: `data:text/javascript,${encodeURIComponent('export function database() { return globalThis.__gameAuditDatabase; }')}`,
      shortCircuit: true,
    };
    if (specifier.startsWith('@/')) return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const route = await import(new URL('app/api/game/route.ts', root).href) as typeof import('../app/api/game/route');
const engineSource = readFileSync(new URL('lib/game-engine.ts', root), 'utf8');
const sourceModule = engineSource.match(/from\s+['"]\.\/(historical-data|demo-data)['"]/u)?.[1];
assert.ok(sourceModule);
const data = await import(new URL(`lib/${sourceModule}.ts`, root).href) as typeof import('../lib/historical-data');
const chosen = Object.fromEntries(data.POSITIONS.map(position => {
  const athlete = data.ATHLETES.find(a => a.position === position && !a.legend);
  assert.ok(athlete);
  return [position, athlete.id];
}));

chosen.FLEX=data.ATHLETES.find(a=>a.position==='WR'&&!a.legend&&a.id!==chosen.WR)!.id;

function memoryDatabase() {
  const rows = new Map<string, Row>();
  let updateGate: (() => Promise<void>) | undefined;
  return {
    rows,
    gateUpdates(gate: () => Promise<void>) { updateGate = gate; },
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async first() { const row = rows.get(String(args[0])); return row ? { ...row } : null; },
        async run() {
          if (sql.startsWith('INSERT OR IGNORE')) {
            const id = String(args[0]);
            if (!rows.has(id)) rows.set(id, { state: String(args[1]), revision: Number(args[2]) });
            return { meta: { changes: 1 } };
          }
          assert.ok(sql.startsWith('UPDATE leagues'), `Unexpected test SQL: ${sql}`);
          if (updateGate) await updateGate();
          const id = String(args[3]);
          const row = rows.get(id);
          if (!row || row.revision !== Number(args[4])) return { meta: { changes: 0 } };
          rows.set(id, { state: String(args[0]), revision: Number(args[1]) });
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}
function request(body?: object, owner = 'audit-owner', origin = 'https://audit.example') {
  const headers = new Headers();
  if (owner) headers.set('oai-authenticated-user-id', owner);
  if (origin) headers.set('origin', origin);
  if (body) headers.set('content-type', 'application/json');
  return new Request('https://audit.example/api/game', { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
}
async function read(response: Response): Promise<{ league: League; error?: string }> { return response.json(); }
async function fresh() {
  const db = memoryDatabase(); global.__gameAuditDatabase = db;
  const result = await route.GET(request());
  assert.equal(result.status, 200);
  return { db, league: (await read(result)).league };
}
async function firstLock() {
  const { db, league } = await fresh();
  const response = await route.POST(request({ action: 'lock', revision: league.revision, turn: 0, lineup: chosen }));
  assert.equal(response.status, 200);
  return { db, league: (await read(response)).league };
}

test('API requires owner identity and refuses cross-origin writes', async () => {
  await fresh();
  assert.equal((await route.GET(request(undefined, ''))).status, 401);
  assert.equal((await route.POST(request({ action: 'lock' }, ''))).status, 401);
  assert.equal((await route.POST(request({ action: 'lock' }, 'audit-owner', 'https://other.example'))).status, 403);
});

test('first lineup persists hidden with no draws; refresh returns that lock', async () => {
  const { db, league } = await firstLock();
  assert.equal(league.turn, 1);
  assert.equal(league.revision, 1);
  assert.deepEqual(league.lineups, [{}, {}]);
  assert.deepEqual(league.history, []);
  const persisted = JSON.parse(db.rows.get('audit-owner')!.state) as League;
  assert.deepEqual(persisted.lineups[0], chosen);
  assert.deepEqual(persisted.used, []);
  const refreshed = await route.GET(request());
  assert.equal(refreshed.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await read(refreshed)).league, league);
});

test('resolved outcomes survive refresh and stale POST retry unchanged', async () => {
  const { league } = await firstLock();
  const lock = { action: 'lock', revision: league.revision, turn: 1, lineup: chosen };
  const resolved = await route.POST(request(lock));
  assert.equal(resolved.status, 200);
  const saved = (await read(resolved)).league;
  assert.equal(saved.status, 'reveal');
  assert.equal(saved.history.length, 1);
  assert.equal(saved.revision, 2);
  const refresh = await route.GET(request());
  assert.deepEqual((await read(refresh)).league, saved);
  const retry = await route.POST(request(lock));
  assert.equal(retry.status, 409);
  assert.deepEqual((await read(retry)).league, saved);
  const replay = await route.POST(request({ ...lock, revision: saved.revision }));
  assert.equal(replay.status, 400);
  assert.deepEqual((await read(await route.GET(request()))).league, saved);
});

test('concurrent second-lineup locks commit exactly once and return the same saved outcome', async () => {
  const { db, league } = await firstLock();
  let updates = 0;
  let release: () => void = () => {};
  const bothReachedUpdate = new Promise<void>(resolve => { release = resolve; });
  db.gateUpdates(async () => {
    updates++;
    if (updates === 2) release();
    await bothReachedUpdate;
  });
  const action = { action: 'lock', revision: league.revision, turn: 1, lineup: chosen };
  const responses = await Promise.all([route.POST(request(action)), route.POST(request(action))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const results = await Promise.all(responses.map(read));
  assert.deepEqual(results[0].league, results[1].league);
  assert.equal(results[0].league.history.length, 1);
  assert.equal(results[0].league.used.length, data.LINEUP_SLOTS.length * 2);
  assert.equal(results[0].league.revision, 2);
  assert.deepEqual((await read(await route.GET(request()))).league, results[0].league);
});

test('cap rules become immutable after the first lock and rejected writes do not change state', async () => {
  const { league } = await firstLock();
  const rejected = await route.POST(request({ action: 'rules', cap: 0, revision: league.revision }));
  assert.equal(rejected.status, 400);
  assert.match((await read(rejected)).error ?? '', /fixed once/i);
  assert.deepEqual((await read(await route.GET(request()))).league, league);
});

test('each authenticated owner has a separate persisted league and used pool', async () => {
  await firstLock();
  const other = await read(await route.GET(request(undefined, 'other-owner')));
  assert.equal(other.league.turn, 0);
  assert.deepEqual(other.league.used, []);
  const original = await read(await route.GET(request()));
  assert.equal(original.league.turn, 1);
  assert.notEqual(other.league.id, original.league.id);
});


test('player insights are authenticated, exclude consumed games and keep hidden lineups private',async()=>{
 const {db,league}=await firstLock();
 const {scoringFor}=await import('../lib/scoring-rules');
 const pool=data.performancePool(chosen.QB,scoringFor(league));
 const athlete=data.ATHLETES.find(a=>a.id===chosen.QB);assert.ok(athlete);
 const row=db.rows.get('audit-owner');assert.ok(row);
 const state=JSON.parse(row.state);
 const consumed=pool[0];assert.ok(consumed);
 state.used=[consumed.id];row.state=JSON.stringify(state);
 const before=structuredClone(row);
 const url='https://audit.example/api/game?athlete='+encodeURIComponent(athlete.id);
 const response=await route.GET(new Request(url,{headers:request().headers}));
 assert.equal(response.status,200);
 const body=await response.json() as {insights:{count:number};revision:number;league?:unknown;lineups?:unknown};
 assert.equal(body.insights.count,pool.length);
 assert.equal(body.revision,league.revision);
 assert.equal(body.league,undefined);assert.equal(body.lineups,undefined);
 assert.deepEqual(db.rows.get('audit-owner'),before);
 assert.equal((await route.GET(new Request(url))).status,401);
 assert.equal((await route.GET(new Request('https://audit.example/api/game?athlete=missing',{headers:request().headers}))).status,404);
});

test('legacy quick JSON in D1 finishes its locked five-slot round before upgrading',async()=>{
 const {db,league}=await fresh();const {lockLineup}=await import('../lib/game-engine');const five={...chosen};delete five.FLEX;
 const legacy=lockLineup({...league,lineupVersion:1},five,0);delete legacy.lineupVersion;legacy.revision=4;db.rows.set('audit-owner',{state:JSON.stringify(legacy),revision:4});
 const before=db.rows.get('audit-owner')!.state;const loaded=(await read(await route.GET(request()))).league;assert.equal(loaded.lineupVersion,1);assert.equal(db.rows.get('audit-owner')!.state,before);
 const response=await route.POST(request({action:'lock',turn:1,revision:4,lineup:five}));assert.equal(response.status,200);const saved=(await read(response)).league;assert.equal(saved.used.length,10);assert.deepEqual((await read(await route.GET(request()))).league,saved);const history=JSON.stringify(saved.history);
 const opened=await route.POST(request({action:'next',revision:saved.revision}));assert.equal(opened.status,200);const next=(await read(opened)).league;assert.equal(next.lineupVersion,2);assert.equal(JSON.stringify(next.history),history);assert.deepEqual((await read(await route.GET(request()))).league,next);
});
test('legacy unlocked D1 game upgrades on first write without resetting saved data',async()=>{
 const {db,league}=await fresh();delete league.lineupVersion;db.rows.set('audit-owner',{state:JSON.stringify(league),revision:0});const loaded=(await read(await route.GET(request()))).league;assert.equal(loaded.lineupVersion,2);
 const res=await route.POST(request({action:'lock',turn:0,revision:0,lineup:chosen}));assert.equal(res.status,200);const saved=JSON.parse(db.rows.get('audit-owner')!.state) as League;assert.equal(saved.lineupVersion,2);assert.equal(saved.lineups[0].FLEX,chosen.FLEX);assert.equal(saved.id,league.id);assert.deepEqual((await read(await route.GET(request()))).league,(await read(res)).league);
});

test('new quick-match scoring saves before first lock and is immutable afterward',async()=>{
 const {league}=await fresh();const half=await route.POST(request({action:'rules',revision:league.revision,receptionPoints:.5}));assert.equal(half.status,200);const saved=(await read(half)).league;assert.equal(saved.scoring!.receptionPoints,.5);assert.equal(saved.hallCap,0);
 const locked=(await read(await route.POST(request({action:'lock',revision:saved.revision,turn:0,lineup:chosen})))).league;
 const rejected=await route.POST(request({action:'rules',revision:locked.revision,receptionPoints:0}));assert.equal(rejected.status,400);assert.deepEqual((await read(await route.GET(request()))).league,locked);
 const result=(await read(await route.POST(request({action:'lock',revision:locked.revision,turn:1,lineup:chosen,scoring:{receptionPoints:0}})))).league;assert.equal(result.history[0].scoring!.receptionPoints,.5);assert.equal(result.scoring!.receptionPoints,.5);
});

test('legacy quick-match saves reject scoring changes without altering their state',async()=>{
 const {db,league}=await fresh();delete league.scoring;db.rows.get('audit-owner')!.state=JSON.stringify(league);const before=db.rows.get('audit-owner')!.state;
 assert.equal((await route.POST(request({action:'rules',revision:league.revision,receptionPoints:0}))).status,400);assert.equal(db.rows.get('audit-owner')!.state,before);
});

test('saved v2/v3 quick-match reception edits retain the full loss/version/kicking contract',async()=>{
 const {newScoring,LEGACY_SCORING}=await import('../lib/scoring-rules');
 const contracts=[{...LEGACY_SCORING,version:2 as const,receptionPoints:.5 as const},{...newScoring(.5,true),version:3 as const,lostFumble:-2}];
 for(const contract of contracts){
  const {db,league}=await fresh();league.scoring=contract;db.rows.get('audit-owner')!.state=JSON.stringify(league);
  const response=await route.POST(request({action:'rules',revision:league.revision,receptionPoints:0,lostFumble:0,scoring:newScoring(0)}));
  assert.equal(response.status,200);const edited=(await read(response)).league;
  assert.deepEqual(edited.scoring,{...contract,receptionPoints:0});
  const first=(await read(await route.POST(request({action:'lock',revision:edited.revision,turn:0,lineup:chosen})))).league;
  const resolved=(await read(await route.POST(request({action:'lock',revision:first.revision,turn:1,lineup:chosen})))).league;
  assert.deepEqual(resolved.history[0].scoring,{...contract,receptionPoints:0});
  assert.deepEqual((await read(await route.GET(request()))).league,resolved);
 }
});
