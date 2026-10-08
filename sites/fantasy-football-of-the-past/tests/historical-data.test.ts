/** Frozen archive integrity checks: node --experimental-strip-types --test tests/historical-data.test.ts */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { Stats } from '../lib/historical-data';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
});
const data = await import(new URL('../lib/historical-data.ts', import.meta.url).href) as typeof import('../lib/historical-data');
const { ATHLETES, PERFORMANCES, DATA_COVERAGE, score } = data;
const {newScoring}=await import('../lib/scoring-rules');

test('archive contains only uniquely identified completed source-covered historical games', () => {
  const now = new Date().toISOString().slice(0, 10);
  const keys = new Set<string>();
  const athletes = new Map(ATHLETES.map(a => [a.id, a]));
  for (const p of PERFORMANCES) {
    assert.equal(p.fictional, false);
    assert.equal(p.completed, true);
    assert.ok(Number.isInteger(p.season) && p.season >= DATA_COVERAGE.seasons[0] && p.season <= Number(now.slice(0, 4)));
    assert.ok(p.date >= `${DATA_COVERAGE.seasons[0]}-01-01` && p.date <= now && p.date <= DATA_COVERAGE.coveredThrough);
    assert.ok(p.seasonType === 'REG' || p.seasonType === 'POST');
    assert.ok(!keys.has(p.id), `Duplicate ${p.id}`);
    keys.add(p.id);
    assert.equal(p.id, `nflverse:${p.athleteId}:${p.gameId}`);
    assert.ok(p.gameId.startsWith(`${p.season}_`));
    const athlete = athletes.get(p.athleteId);
    assert.ok(athlete, `Unknown entity ${p.athleteId}`);
    assert.equal(p.entityType, athlete.position === 'DEF' ? 'franchise-defense' : 'player');
    assert.ok(p.teamAtTime && p.opponent && p.teamAtTime !== p.opponent);
    assert.ok(p.sourceUrl.startsWith('https://github.com/nflverse/nflverse-data/'));
    assert.ok(p.sourceUrls.some(u => u.includes('/nflverse-data/releases/download/schedules/games.csv')));
  }
  assert.equal(PERFORMANCES.length, DATA_COVERAGE.performanceCount);
  assert.equal(new Set(PERFORMANCES.map(p => p.gameId)).size, DATA_COVERAGE.gameCount);
});

test('every scoring statistic and resulting score is finite, never null or fabricated by omission', () => {
  const keys: (keyof Stats)[] = ['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','fumblesLost','twoPoint','returnTD','sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed','fumbleRecoveryTD'];
  const positions = new Map(ATHLETES.map(a => [a.id, a.position]));
  for (const p of PERFORMANCES) {
    for (const key of keys) assert.ok(typeof p.stats[key] === 'number' && Number.isFinite(p.stats[key]), `${p.id}: ${key}`);
    assert.ok(Number.isFinite(score(p.stats, positions.get(p.athleteId)!,positions.get(p.athleteId)==='K'?newScoring(1,true):undefined)), `Nonfinite score ${p.id}`);
  }
});

test('all 32 franchise defenses cover both sides of every included completed game', () => {
  const defenses = ATHLETES.filter(a => a.position === 'DEF');
  assert.equal(defenses.length, 32);
  assert.equal(new Set(defenses.map(a => a.id)).size, 32);
  const perGame = new Map<string, typeof PERFORMANCES>();
  for (const p of PERFORMANCES.filter(p => p.entityType === 'franchise-defense')) {
    const group = perGame.get(p.gameId) ?? [];
    group.push(p); perGame.set(p.gameId, group);
    assert.equal(p.athleteId, `franchise-${p.teamAtTime.toLowerCase()}`);
    assert.ok(p.sourceUrls.some(u => u.includes('/pbp/')));
  }
  assert.equal(perGame.size, DATA_COVERAGE.gameCount);
  for (const [game, records] of perGame) {
    assert.equal(records.length, 2, `${game} must have both defenses`);
    assert.equal(records[0].teamAtTime, records[1].opponent);
    assert.equal(records[1].teamAtTime, records[0].opponent);
  }
});

test('roster availability metadata matches actual entity performances', () => {
  for (const athlete of ATHLETES) {
    const records = PERFORMANCES.filter(p => p.athleteId === athlete.id);
    assert.equal(records.length, athlete.gameCount, athlete.name);
    assert.deepEqual([...new Set(records.map(p => p.season))].sort(), athlete.seasons, athlete.name);
    assert.ok(records.length > 0);
    if (athlete.legend) {
      assert.ok(athlete.hallOfFameYear && athlete.hallOfFameYear <= new Date().getUTCFullYear());
      assert.ok(athlete.hallOfFameSource?.startsWith('https://www.profootballhof.com/'));
    }
  }
});

test('offensive fumble-recovery touchdown and all lost fumbles are explicitly scored', () => {
  const hill = ATHLETES.find(a => a.name === 'Tyreek Hill');
  assert.ok(hill);
  const recovery = PERFORMANCES.find(p => p.athleteId === hill.id && p.gameId === '2022_14_MIA_LAC');
  assert.ok(recovery);
  assert.equal(recovery.stats.fumbleRecoveryTD, 1);
  assert.equal(score(recovery.stats, 'WR') - score({ ...recovery.stats, fumbleRecoveryTD: 0 }, 'WR'), 6);
  const kupp = ATHLETES.find(a => a.name === 'Cooper Kupp');
  const lost = PERFORMANCES.find(p => p.athleteId === kupp?.id && p.gameId === '2020_02_LA_PHI');
  assert.ok(lost);
  assert.equal(lost.stats.fumblesLost, 1);
  assert.equal(score({ ...lost.stats, fumblesLost: 0 }, 'WR') - score(lost.stats, 'WR'), 2);
});
