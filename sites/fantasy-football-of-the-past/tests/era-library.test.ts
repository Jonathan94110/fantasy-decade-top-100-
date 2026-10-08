import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) return {format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}`};
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    try {return nextResolve(specifier, context);}
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const {ATHLETES, PERFORMANCES} = await import(new URL('../lib/historical-data.ts', import.meta.url).href) as typeof import('../lib/historical-data');
const {DRAFT_ERAS, filterDraftAthletes, ERAS, EARLY_ERA, LIBRARY_PAGE_SIZE, PLAYER_PROFILES, PROFILES, filterProfiles, normalizeSearch, poolAvailability, inEra} = await import(new URL('../lib/era-catalog.ts', import.meta.url).href) as typeof import('../lib/era-catalog');

test('compact client availability equals the actual game pool, including exhausted seasons', () => {
  for (const athlete of ATHLETES) {
    const rows = PERFORMANCES.filter(p => p.athleteId === athlete.id);
    const counts = Object.fromEntries(athlete.seasons.map(year => [year, rows.filter(p => p.season === year).length]));
    assert.deepEqual(athlete.gamesBySeason, counts, athlete.name);
    const consumed = rows.filter(p => p.season === athlete.seasons[0]).map(p => p.id);
    const remaining = poolAvailability(athlete, consumed);
    assert.equal(remaining.count, rows.length - consumed.length);
    assert.deepEqual(remaining.seasons, athlete.seasons.slice(1));
    assert.deepEqual(poolAvailability(athlete, rows.map(p => p.id)), {count: 0, seasons: []});
  }
});

test('era discovery spans all requested decades and never adds fabricated gameplay', () => {
  for (const era of ERAS) assert.ok(PROFILES.some(p => inEra(p, era)), `No profiles in ${era}s`);
  const oldest = PROFILES.filter(p => inEra(p, 1950));
  assert.ok(oldest.length > 0);
  assert.ok(oldest.every(p => !p.athlete));
  assert.ok(PERFORMANCES.every(p => p.season >= 1999));
  assert.equal(PROFILES.filter(p => !p.athlete).length, 572 - ATHLETES.filter(a => a.position !== 'DEF').length);
});

test('similarly named Kellen Winslow profiles never merge across generations', () => {
  const father = PROFILES.find(p => p.id === 'kellen-winslow');
  const son = PROFILES.find(p => p.athlete?.id === '00-0022922');
  assert.ok(father && son);
  assert.equal(father.athlete, undefined);
  assert.equal(father.lastYear, 1987);
  assert.equal(son.name, 'Kellen Winslow II');
  assert.equal(son.athlete?.legend, false);
});

test('the page and client model never import the raw performance archive', () => {
  for (const file of ['app/page.tsx', 'components/era-library.tsx', 'lib/game-model.ts', 'lib/era-catalog.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('records.json'), `${file} imports full records`);
    assert.ok(!/from ['"][^'"]*historical-data/.test(source), `${file} imports server record expansion`);
  }
});


test('the original catalog keeps 100 per position, with 130 additional playable players, four kicker profiles and 32 franchises', () => {
  assert.equal(PLAYER_PROFILES.length, 572);
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    assert.equal(PLAYER_PROFILES.filter(p => p.position === position && p.collection==='editorial').length, 100, position);
  }
  assert.equal(PROFILES.length, 604);
  assert.equal(new Set(PROFILES.map(p => p.id)).size, 604);
  const linked = PROFILES.flatMap(p => p.athlete ? [p.athlete.id] : []);
  assert.equal(new Set(linked).size, linked.length);
  assert.deepEqual(new Set(linked), new Set(ATHLETES.map(a => a.id)));
  for (const profile of PROFILES) {
    assert.ok(profile.sourceUrl.startsWith('https://'));
    assert.ok(profile.firstYear <= profile.lastYear);
    if (profile.athlete) assert.equal(profile.position, profile.athlete.position);
  }
});

test('earlier-era discovery has broad coverage and keeps unavailable games out of draft', () => {
  const early = filterProfiles({era: EARLY_ERA});
  assert.ok(early.length >= 80, `Only ${early.length} early-era profiles`);
  assert.ok(early.every(p => p.firstYear <= 1980 && p.lastYear >= 1950));
  assert.equal(filterProfiles({era: EARLY_ERA, status: 'playable'}).length, 0);
  assert.equal(filterProfiles({era: EARLY_ERA, position: 'DEF'}).length, 0);
  for (const era of [1950, 1960, 1970]) assert.ok(filterProfiles({era}).length >= 20, String(era));
});

test('search, position and availability filters work together within the paginated catalog', () => {
  assert.equal(LIBRARY_PAGE_SIZE, 48);
  assert.equal(filterProfiles({position: 'QB',collection:'editorial'}).length, 100);
  assert.equal(filterProfiles({position: 'DEF'}).length, 32);
  assert.ok(filterProfiles({search: 'kellen winslow'}).length >= 2);
  assert.ok(filterProfiles({search: 'JERRY RICE', position: 'WR', status: 'playable'}).some(p => p.name === 'Jerry Rice'));
  assert.equal(filterProfiles({search: 'Otto Graham', status: 'playable'}).length, 0);
  assert.equal(filterProfiles({search: 'definitely-no-such-player'}).length, 0);
  assert.equal(normalizeSearch('D’Andre  Swift'), 'd andre swift');
  const start = performance.now();
  for (let i = 0; i < 1000; i++) filterProfiles({era: ERAS[i % ERAS.length], search: i % 2 ? 'a' : '', status: i % 3 ? 'all' : 'playable'});
  assert.ok(performance.now() - start < 2000, '1,000 search/filter operations must complete in under 2 seconds');
});

test('historical Mark Clayton and Stanley Morgan cannot inherit modern namesake games', () => {
  for (const name of ['Mark Clayton', 'Stanley Morgan']) {
    const historical = PROFILES.find(p => p.name === name && p.lastYear < 1999);
    assert.ok(historical, `${name} historical profile is present`);
    assert.equal(historical.athlete, undefined, `${name} must not link to a later namesake`);
  }
});


test('draft era options keep every decade visible and count verified playable seasons', () => {
  assert.deepEqual(DRAFT_ERAS.map(option => option.era), ERAS);
  for (const option of DRAFT_ERAS) {
    const expected = new Set(PERFORMANCES.filter(game => game.season >= option.era && game.season <= option.era + 9).map(game => game.athleteId));
    assert.equal(option.playableCount, expected.size);
    assert.ok(option.loadedSeasons.every(year => year >= option.era && year <= option.era + 9 && year >= 1999));
  }
  assert.ok(DRAFT_ERAS.filter(option => option.era < 1990).every(option => !option.loadedSeasons.length));
  assert.ok(DRAFT_ERAS.filter(option => option.era < 1990).every(option => !option.playableCount));
});

test('draft era matches verified game years without changing athlete identities or source records', () => {
  const before = JSON.stringify(ATHLETES);
  for (const era of [0, ...ERAS]) for (const position of ['QB', 'RB', 'WR', 'TE', 'DEF', 'FLEX'] as const) {
    const rows = filterDraftAthletes({position, era});
    const positions = position === 'FLEX' ? ['RB', 'WR', 'TE'] : [position];
    const eligibleIds = new Set(PERFORMANCES.filter(game => !era || game.season >= era && game.season <= era + 9).map(game => game.athleteId));
    const expected = ATHLETES.filter(athlete => positions.includes(athlete.position) && eligibleIds.has(athlete.id));
    assert.deepEqual(new Set(rows.map(row => row.id)), new Set(expected.map(athlete => athlete.id)), `${era} ${position}`);
    assert.ok(rows.every(row => row.seasons.every(year => year >= 1999)));
    assert.equal(filterDraftAthletes({position, era, search: 'no-such-player-zzzz'}).length, 0);
  }
  const eighties = (['QB', 'RB', 'WR', 'TE'] as const).flatMap(position => filterDraftAthletes({position, era: 1980}));
  assert.equal(eighties.length, 0);
  const marino = filterDraftAthletes({position: 'QB', era: 1980, search: 'DAN MARINO'});
  assert.equal(marino.length, 0);
  const ninetiesMarino = filterDraftAthletes({position: 'QB', era: 1990, search: 'DAN MARINO'});
  assert.equal(ninetiesMarino.length, 1);assert.deepEqual(ninetiesMarino[0].seasons, [1999]);
  assert.equal(filterDraftAthletes({position: 'FLEX', era: 1980, search: 'Jerry Rice'}).length, 0);
  assert.ok(filterDraftAthletes({position: 'FLEX', era: 1990, search: 'Jerry Rice'}).some(a => a.name === 'Jerry Rice'));
  for (const era of [1950, 1960, 1970, 1980]) assert.equal(filterDraftAthletes({position: 'QB', era}).length, 0);
  assert.equal(JSON.stringify(ATHLETES), before);
});

test('draft UI labels verified game era, shows draw scope and opens the matching collection', () => {
  const source = readFileSync(new URL('../app/matchup/page.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('aria-label="Verified game era"'));
  assert.ok(source.includes('DRAFT_ERAS.map'));
  assert.ok(!source.includes('ERAS.filter'));
  assert.ok(source.includes('draws still use each player’s full eligible game pool'));
  assert.ok(source.includes('no playable games'));
  assert.ok(source.includes('Read-only player profiles'));
  assert.ok(source.includes('Draft eligible players directly from the main board'));
  assert.ok(source.includes('initialEra={libraryBrowse.era}'));
  assert.ok(source.includes('initialPosition={libraryBrowse.position}'));
  assert.ok(source.includes('key={libraryBrowse.visit}'));
  assert.ok(source.includes('Loaded years'));
});
