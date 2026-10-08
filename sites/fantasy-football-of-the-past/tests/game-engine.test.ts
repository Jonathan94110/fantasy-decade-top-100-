/**
 * Independent gameplay regression suite. Run with Node >= 22.15:
 *   node --experimental-strip-types --test tests/game-engine.test.ts
 * Uses the engine's current data module, including the historical-data migration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { League, Lineup } from '../lib/game-engine';

registerHooks({
  load(url, context, nextLoad) {
    // Bundler-style JSON imports omit attributes; expose them as ESM for Node QA.
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const engineUrl = new URL('../lib/game-engine.ts', import.meta.url);
const engineSource = readFileSync(engineUrl, 'utf8');
const sourceModule = engineSource.match(/from\s+['"]\.\/(historical-data|demo-data)['"]/u)?.[1];
assert.ok(sourceModule, 'Engine must import a known data module');
const engine = await import(engineUrl.href) as typeof import('../lib/game-engine');
const data = await import(new URL(`../lib/${sourceModule}.ts`, import.meta.url).href) as typeof import('../lib/historical-data');
const { ATHLETES, PERFORMANCES, POSITIONS, LINEUP_SLOTS } = data;
const { newLeague, lockLineup, nextRound, publicLeague, drawPerformance, validateLineup } = engine;

type Performance = (typeof PERFORMANCES)[number];
function lineup(): Lineup {
  const result=Object.fromEntries(POSITIONS.map(position => {
    const athlete = ATHLETES.find(a => a.position === position && !a.legend);
    assert.ok(athlete, `Need an unmarked ${position} fixture`);
    return [position, athlete.id];
  }));
  result.FLEX=ATHLETES.find(a=>a.position==='WR'&&!a.legend&&a.id!==result.WR)!.id;
  return result;
}
function rng<T>(values: number[], run: (calls: () => number) => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'getRandomValues');
  let calls = 0;
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    configurable: true,
    value(array: Uint32Array) { array[0] = values[calls++ % values.length]; return array; },
  });
  try { return run(() => calls); }
  finally {
    if (original) Object.defineProperty(globalThis.crypto, 'getRandomValues', original);
    else delete (globalThis.crypto as unknown as { getRandomValues?: unknown }).getRandomValues;
  }
}
function performances<T>(fixtures: Performance[], run: () => T): T {
  const original = PERFORMANCES.slice();
  PERFORMANCES.splice(0, PERFORMANCES.length, ...fixtures);
  try { return run(); }
  finally { PERFORMANCES.splice(0, PERFORMANCES.length, ...original); }
}
function fixture(id: string, athleteId: string, season = 2020, week = 1): Performance {
  const original = PERFORMANCES.find(p => p.athleteId === athleteId);
  assert.ok(original, `Missing performance fixture for ${athleteId}`);
  return { ...original, id, athleteId, season, week };
}
// Mutable original-archive fixtures model existing Strict games.
function unlimitedLeague(): League { return { ...newLeague('audit',1,'strict'), hallCap: 0 }; }

// Top-level node:test cases run sequentially; test-local dataset/RNG mutation is restored.
test('all lineups must lock before RNG; first lock contains no outcomes', () => {
  const initial = unlimitedLeague();
  const before = structuredClone(initial);
  rng([0], calls => {
    const first = lockLineup(initial, lineup(), 0);
    assert.equal(calls(), 0);
    assert.equal(first.status, 'draft');
    assert.equal(first.turn, 1);
    assert.equal(first.history.length, 0);
    assert.equal(first.used.length, 0);
    assert.deepEqual(publicLeague(first).lineups, [{}, {}]);
    assert.deepEqual(initial, before, 'Locking must not mutate persisted input');
    const resolved = lockLineup(first, lineup(), 1);
    assert.equal(calls(), LINEUP_SLOTS.length * 2 * 2, 'Two RNG draws per slot: year, then game');
    assert.equal(resolved.status, 'reveal');
    assert.equal(resolved.history.length, 1);
    assert.equal(resolved.used.length, LINEUP_SLOTS.length * 2);
    assert.deepEqual(first.history, [], 'Second lock must not mutate first saved state');
  });
});

test('year is selected uniformly before a game within that year', () => {
  const id = lineup().QB;
  const records = [fixture('year-a', id, 2020), fixture('year-b1', id, 2021, 1), fixture('year-b2', id, 2021, 2), fixture('year-b3', id, 2021, 3)];
  performances(records, () => rng([1, 2], calls => {
    const used = new Set<string>();
    const selected = drawPerformance(id, used);
    assert.equal(selected.id, 'year-b3');
    assert.equal(calls(), 2);
    assert.deepEqual([...used], ['year-b3']);
  }));
});

test('an exhausted year is removed while other years remain eligible', () => {
  const id = lineup().QB;
  const records = [fixture('old', id, 2020), fixture('new-a', id, 2021, 1), fixture('new-b', id, 2021, 2)];
  performances(records, () => rng([0, 1], () => {
    const selected = drawPerformance(id, new Set(['old']));
    assert.equal(selected.id, 'new-b');
    assert.equal(selected.season, 2021);
  }));
});

test('the same player on both sides gets two distinct performances', () => {
  rng([0], () => {
    const chosen = lineup();
    const resolved = lockLineup(lockLineup(unlimitedLeague(), chosen, 0), chosen, 1);
    for (let i = 0; i < LINEUP_SLOTS.length; i++) {
      const left = resolved.history[0].draws[0][i];
      const right = resolved.history[0].draws[1][i];
      assert.equal(left.athleteId, right.athleteId);
      assert.notEqual(left.performance.id, right.performance.id);
      assert.ok(resolved.used.includes(left.performance.id));
      assert.ok(resolved.used.includes(right.performance.id));
    }
    assert.equal(new Set(resolved.used).size, resolved.used.length);
  });
});

test('franchise defense uses the identical year-then-game draw', () => {
  const id = lineup().DEF;
  const records = [fixture('defense-a', id, 2020), fixture('defense-b1', id, 2021, 1), fixture('defense-b2', id, 2021, 2)];
  performances(records, () => rng([1, 1], calls => {
    assert.equal(drawPerformance(id, new Set()).id, 'defense-b2');
    assert.equal(calls(), 2);
  }));
});

test('next round permits the same players and never reuses a consumed performance', () => {
  rng([0], () => {
    const chosen = lineup();
    const first = lockLineup(lockLineup(unlimitedLeague(), chosen, 0), chosen, 1);
    const originalHistory = structuredClone(first.history);
    const secondDraft = nextRound(first);
    assert.equal(secondDraft.round, 2);
    assert.equal(secondDraft.turn, 0);
    assert.deepEqual(secondDraft.used, first.used);
    assert.doesNotThrow(() => validateLineup(chosen, secondDraft));
    const second = lockLineup(lockLineup(secondDraft, chosen, 0), chosen, 1);
    const allIds = second.history.flatMap(round => round.draws.flatMap(team => team.map(draw => draw.performance.id)));
    assert.equal(new Set(allIds).size, allIds.length);
    assert.deepEqual(second.history[0], originalHistory[0]);
    assert.deepEqual(first.history, originalHistory);
  });
});

test('reloading serialized state preserves every draw and blocks replaying a lock', () => {
  const resolved = rng([0], () => lockLineup(lockLineup(unlimitedLeague(), lineup(), 0), lineup(), 1));
  const restored = JSON.parse(JSON.stringify(resolved)) as League;
  rng([1], calls => {
    assert.deepEqual(publicLeague(restored), publicLeague(resolved));
    assert.equal(calls(), 0, 'Reading/reloading saved state must not run RNG');
    assert.throws(() => lockLineup(restored, lineup(), 1), /already locked/i);
    assert.throws(() => lockLineup(restored, lineup(), 0), /already locked/i);
    assert.equal(calls(), 0, 'Rejected retries must not run RNG');
    assert.deepEqual(restored, resolved);
  });
});

test('stale/out-of-order locks and incomplete lineups are rejected without RNG', () => {
  rng([0], calls => {
    const initial = unlimitedLeague();
    assert.throws(() => lockLineup(initial, lineup(), 1), /already locked/i);
    assert.throws(() => lockLineup(initial, {}, 0), /all 6/i);
    const invalid = lineup(); invalid.QB = invalid.RB;
    assert.throws(() => lockLineup(initial, invalid, 0), /valid QB/i);
    assert.throws(() => nextRound(initial), /current round/i);
    assert.equal(calls(), 0);
  });
});

test('last available shared performance cannot satisfy both lineups', () => {
  const chosen = lineup();
  const target = chosen.QB;
  const remaining = PERFORMANCES.find(p => p.athleteId === target)!;
  const league = unlimitedLeague();
  league.used = PERFORMANCES.filter(p => p.athleteId === target && p.id !== remaining.id).map(p => p.id);
  rng([0], calls => {
    const first = lockLineup(league, chosen, 0);
    assert.throws(() => lockLineup(first, chosen, 1), /no available performance/i);
    assert.equal(first.status, 'draft');
    assert.equal(first.history.length, 0);
    assert.equal(calls(), 0);
  });
});

test('fully exhausted player is ineligible and direct draw fails', () => {
  const chosen = lineup();
  const league = unlimitedLeague();
  league.used = PERFORMANCES.filter(p => p.athleteId === chosen.QB).map(p => p.id);
  assert.throws(() => validateLineup(chosen, league), /no available performance/i);
  assert.throws(() => drawPerformance(chosen.QB, new Set(league.used)), /no unused performances/i);
});

test('legacy legend caps are ignored without changing the saved league', () => {
  const original = ATHLETES.slice();
  const chosen = lineup();
  const marked = new Set([chosen.QB, chosen.RB, chosen.WR]);
  ATHLETES.splice(0, ATHLETES.length, ...original.map(a => ({ ...a, legend: marked.has(a.id) })));
  try {
    const league = unlimitedLeague();
    assert.doesNotThrow(() => validateLineup(chosen, league));
    assert.doesNotThrow(() => validateLineup(chosen, { ...league, hallCap: 1 }));
    assert.doesNotThrow(() => validateLineup(chosen, { ...league, hallCap: 2 }));
    for (const cap of [1, 2]) {
      const adjusted = { ...chosen };
      for (const position of ['RB', 'WR'] as const) {
        if (position === 'RB' && cap === 2) continue;
        const alternative = ATHLETES.find(a => a.position === position && !a.legend && a.id !== adjusted.FLEX);
        assert.ok(alternative, `Need alternate ${position}`);
        adjusted[position] = alternative.id;
      }
      assert.doesNotThrow(() => validateLineup(adjusted, { ...league, hallCap: cap }));
    }
  } finally { ATHLETES.splice(0, ATHLETES.length, ...original); }
});

test('scores, totals, ties, and winners are retained in the round result', () => {
  rng([0], () => {
    const resolved = lockLineup(lockLineup(unlimitedLeague(), lineup(), 0), lineup(), 1);
    const round = resolved.history[0];
    const totals = round.draws.map(team => Math.round(team.reduce((sum, d) => sum + d.points, 0) * 100) / 100);
    assert.deepEqual(round.totals, totals);
    const expectedWinner = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
    assert.equal(round.winner, expectedWinner);
    assert.deepEqual(resolved.wins, expectedWinner === null ? [0, 0] : expectedWinner === 0 ? [1, 0] : [0, 1]);
    assert.ok(Number.isFinite(Date.parse(round.lockedAt)));
  });
});
