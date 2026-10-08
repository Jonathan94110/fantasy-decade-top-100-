/** Independent expansion audit. Run with node --experimental-strip-types --test tests/*.test.ts. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
type RawRow = [string, number, number, string, string, string, string, string, ...number[]];
const records = JSON.parse(readFileSync(path.join(root, 'data/nflverse/records.json'), 'utf8')) as RawRow[];

test('all 6,109 previously published records retain exact identifiers and statistics', () => {
  // Snapshot from commit d46f7c0. Keep this anchor independent of the moving HEAD.
  const originalPlayers = new Set([
    '00-0019596', '00-0020531', '00-0022921', '00-0023459', '00-0027656', '00-0030506',
    '00-0031381', '00-0032764', '00-0033040', '00-0033280', '00-0033288', '00-0033873',
    '00-0033881', '00-0033906', '00-0033908', '00-0034753', '00-0034791', '00-0034796',
    '00-0034844', '00-0034857', '00-0035229', '00-0035676', '00-0035700', '00-0036223',
    '00-0036322', '00-0036358', '00-0036389', '00-0036442', '00-0036900', '00-0038542',
    '00-0039065', '00-0039338',
  ]);
  const preserved = records.filter(r => r[1] >= 2020 && r[4] <= '2026-09-28'
    && (originalPlayers.has(r[0]) || r[0].startsWith('franchise-')));
  preserved.sort((left, right) => {
    for (let i = 0; i < left.length; i++) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  });
  assert.equal(preserved.length, 6109);
  assert.equal(createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),
    '76518b2c76b7e0bc2b10dc00aab9b80303d4e639eb6be5d14e3c8f524aa87c22');
});

test('expanded counts and exclusions agree with the public coverage ledger', () => {
  const ledger = JSON.parse(readFileSync(path.join(root, 'public/archive-coverage.json'), 'utf8')) as {
    coverage: { performanceCount: number; playerCount: number; defenseCount: number; gameCount: number; seasons: number[] };
    quality: { excludedGameIds: string[]; excludedGameCount: number };
    countsBySeason: Record<string, number>;
  };
  assert.ok(records.length >= 42826);
  assert.equal(ledger.coverage.performanceCount, records.length);
  assert.ok(ledger.coverage.playerCount >= 185 && ledger.coverage.playerCount <= 400);
  assert.equal(ledger.coverage.defenseCount, 32);
  assert.equal(new Set(records.map(r => r[3])).size, ledger.coverage.gameCount);
  assert.deepEqual([...new Set(records.map(r => r[1]))].sort((a, b) => a - b), ledger.coverage.seasons);
  assert.deepEqual([...new Set(records.filter(r => r[1] === 2026).map(r => r[2]))].sort(), [1, 2, 3]);
  const excluded = new Set(ledger.quality.excludedGameIds);
  assert.equal(excluded.size, 20);
  assert.equal(excluded.size, ledger.quality.excludedGameCount);
  for (const row of records) assert.ok(!excluded.has(row[3]), `Excluded game re-entered pool: ${row[3]}`);
  for (const [season, count] of Object.entries(ledger.countsBySeason)) {
    assert.equal(records.filter(r => r[1] === Number(season)).length, count, season);
  }
});

test('the transitive client runtime dependency graph excludes raw games and the server engine', () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(!/(?:records\.json|historical-data\.ts|game-engine\.ts)$/.test(file), `Client runtime reaches ${file}`);
    if (!/\.[cm]?[jt]sx?$/.test(file)) return;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function follow(specifier: string) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return;
      const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
        .find(candidate => existsSync(candidate) && /\.[cm]?[jt]sx?$|\.json$|\.css$/.test(candidate));
      assert.ok(resolved, `Unresolved client dependency ${specifier} in ${file}`);
      visit(resolved);
    }
    for (const node of source.statements) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) continue;
        if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
        follow(node.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        follow(node.moduleSpecifier.text);
      }
    }
  }
  visit(path.join(root, 'app/page.tsx'));
  visit(path.join(root, 'app/matchup/page.tsx'));
  visit(path.join(root, 'components/profile-settings.tsx'));
  assert.ok(visited.has(path.join(root, 'components/era-library.tsx')));
  assert.ok(visited.has(path.join(root, 'lib/game-model.ts')));
  assert.ok(visited.has(path.join(root, 'lib/era-catalog.ts')));
});


test('all 42,826 prior performances and every existing athlete remain identical', () => {
  const anchor = JSON.parse(readFileSync(path.join(root, 'tests/previous-archive-anchor.json'), 'utf8'));
  const previousIds = new Set(anchor.originalAthleteIds);
  const previousRecords = records.filter(row => previousIds.has(row[0]));
  assert.equal(previousRecords.length, anchor.originalPerformanceCount);
  assert.equal(createHash('sha256').update(JSON.stringify(previousRecords)).digest('hex'), anchor.recordsSha256);
  const currentAthletes = JSON.parse(readFileSync(path.join(root, 'data/nflverse/athletes.json'), 'utf8'));
  const previousAthletes = anchor.originalAthleteIds.map((id: string) => currentAthletes.find((a: {id: string}) => a.id === id));
  assert.equal(createHash('sha256').update(JSON.stringify(previousAthletes)).digest('hex'), anchor.athletesSha256);
});

test('frozen catalog, import manifest and public selection ledger describe the same 400 players', () => {
  const catalogBytes = readFileSync(path.join(root, 'data/historical-catalog.json'));
  const catalog = JSON.parse(catalogBytes.toString());
  const manifest = JSON.parse(readFileSync(path.join(root, 'data/nflverse/manifest.json'), 'utf8'));
  const selection = JSON.parse(readFileSync(path.join(root, 'public/roster-selection.json'), 'utf8'));
  assert.equal(createHash('sha256').update(catalogBytes).digest('hex'), manifest.catalogSelection.sha256);
  assert.equal(selection.catalogSize, 400);
  assert.equal(selection.orderedRanking, false);
  assert.deepEqual(selection.positions, {QB: 100, RB: 100, WR: 100, TE: 100});
  assert.equal(selection.coverage.linkedPlayableProfiles, manifest.coverage.catalogLinkedPlayerCount);
  assert.equal(selection.coverage.profileOnly, 400 - manifest.coverage.catalogLinkedPlayerCount);
  assert.equal(selection.coverage.officialCareerVerified, catalog.filter((p: {careerVerified: boolean}) => p.careerVerified).length);
  assert.equal(selection.coverage.providerMetadataWindow, catalog.filter((p: {careerVerified: boolean}) => !p.careerVerified).length);
  assert.ok(selection.methodology.length >= 4);
});

test('100-player addition preserves every v11 performance and athlete byte-for-byte',()=>{
 const anchor=JSON.parse(readFileSync(path.join(root,'tests/pre-expansion-anchor.json'),'utf8'));
 const ids=new Set(anchor.athleteIds);
 const oldRows=records.filter(r=>ids.has(r[0]));
 assert.equal(oldRows.length,47009);
 assert.equal(createHash('sha256').update(JSON.stringify(oldRows)).digest('hex'),anchor.recordsSha256);
 const athletes=JSON.parse(readFileSync(path.join(root,'data/nflverse/athletes.json'),'utf8'));
 const oldAthletes=anchor.athleteIds.map((id:string)=>athletes.find((a:{id:string})=>a.id===id));
 assert.equal(createHash('sha256').update(JSON.stringify(oldAthletes)).digest('hex'),anchor.athletesSha256);
 const selection=JSON.parse(readFileSync(path.join(root,'data/playable-expansion.json'),'utf8'));
 assert.equal(selection.length,100);assert.equal(athletes.length,395);assert.equal(records.length,60166);
 const newIds=new Set(selection.map((a:{id:string})=>a.id));
 assert.ok(selection.every((a:{id:string})=>!ids.has(a.id)));
 assert.equal(records.filter(r=>newIds.has(r[0])).length,9872);
 assert.ok(athletes.filter((a:{id:string})=>newIds.has(a.id)).every((a:{legend:boolean})=>!a.legend));
});


test('30-player addition preserves all v26 bytes and contains only the explicit verified selection', () => {
 const anchor=JSON.parse(readFileSync(path.join(root,'tests/v26-archive-anchor.json'),'utf8'));
 const ids=new Set(anchor.athleteIds);
 const oldRows=records.filter(r=>ids.has(r[0]));
 assert.equal(oldRows.length,56881);
 assert.equal(createHash('sha256').update(JSON.stringify(oldRows)+'\n').digest('hex'),anchor.recordsSha256);
 const athletes=JSON.parse(readFileSync(path.join(root,'data/nflverse/athletes.json'),'utf8'));
 assert.equal(createHash('sha256').update(JSON.stringify(athletes.filter((a:{id:string})=>ids.has(a.id)))+'\n').digest('hex'),anchor.athletesSha256);
 const selection=JSON.parse(readFileSync(path.join(root,'data/verified-player-addition.json'),'utf8'));
 const newIds=new Set(selection.map((a:{id:string})=>a.id));
 assert.equal(newIds.size,30);assert.equal(records.filter(r=>newIds.has(r[0])).length,3285);
 assert.deepEqual(new Set(athletes.filter((a:{id:string})=>!ids.has(a.id)).map((a:{id:string})=>a.id)),newIds);
 assert.ok(selection.every((a:{careerVerified:boolean,legend:boolean})=>!a.careerVerified&&!a.legend));
});
