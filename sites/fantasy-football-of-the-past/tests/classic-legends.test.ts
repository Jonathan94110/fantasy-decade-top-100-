import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
registerHooks({
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.json')) return {format:'module', shortCircuit:true, source:`export default ${readFileSync(new URL(url), 'utf8')}`};
    return next(url, context);
  },
  resolve(id, context, next) {
    try {return next(id, context);} catch (error) {
      if (id.startsWith('.') && !/\.[a-z]+$/i.test(id)) return next(id + '.ts', context);
      throw error;
    }
  },
});
const {CLASSIC_LEGENDS, CLASSIC_SUMMARY, classicCoverage, formatSeasons} = await import('../lib/classic-legends');
const {PROFILES, filterProfiles, poolAvailability} = await import('../lib/era-catalog');
const {ATHLETES, PERFORMANCES} = await import('../lib/historical-data');
const evidence = JSON.parse(readFileSync(new URL('../data/classic-legends-verification.json', import.meta.url), 'utf8'));
const verified = [...evidence.records, ...evidence.supplementalNonHofRecords];

test('105 verified Classic identities merge into 101 existing profiles and four new kicker profiles', () => {
  assert.equal(CLASSIC_LEGENDS.length, 105);
  assert.equal(CLASSIC_SUMMARY.hallOfFame, 103);
  assert.deepEqual(CLASSIC_SUMMARY.byPosition, {QB:27,RB:31,WR:32,TE:11,K:4});
  assert.equal(new Set(CLASSIC_LEGENDS.map(p => p.id)).size, 105);
  assert.equal(new Set(CLASSIC_LEGENDS.map(p => p.name)).size, 105);
  assert.equal(CLASSIC_LEGENDS.filter(p => p.existingProfileId).length, 101);
  assert.deepEqual(CLASSIC_LEGENDS.filter(p => !p.existingProfileId).map(p => p.position), ['K','K','K','K']);
  assert.equal(PROFILES.filter(p => p.classic).length, 105);
  assert.equal(new Set(PROFILES.map(p => p.id)).size, 604);
  for (const legend of CLASSIC_LEGENDS) {
    const profile = PROFILES.find(p => p.classic?.id === legend.id)!;
    assert.ok(profile);
    assert.equal(profile.id, legend.existingProfileId || legend.id);
    assert.equal(profile.athlete?.id, legend.playableId);
    assert.equal(profile.position, legend.position);
  }
});

test('official recognition is source-backed and independent of Hall membership', () => {
  assert.equal(CLASSIC_SUMMARY.nfl100, 33); // 32 position selections plus Hester, a return specialist.
  assert.equal(filterProfiles({collection:'classic', recognition:'hof'}).length, 103);
  assert.equal(filterProfiles({collection:'classic', recognition:'nfl100'}).length, 33);
  for (const name of ['Tom Brady', 'Rob Gronkowski']) {
    const profile = PROFILES.find(p => p.name === name)!;
    assert.equal(profile.hallOfFameYear, undefined);
    assert.ok(profile.classic?.nfl100Source?.includes('nfl.com'));
    assert.equal(profile.athlete?.legend, false);
  }
  for (const legend of CLASSIC_LEGENDS) {
    const source = verified.find(p => p.catalogId === legend.id);
    assert.equal(source.identityVerified, true);
    if (legend.hallOfFameYear) {
      assert.equal(legend.hallOfFameYear, source.hallOfFameYear);
      assert.match(legend.hallOfFameSource!, /^https:\/\/www.profootballhof.com\/players\//);
      if (source.providerIds.proFootballHofPlayerId) assert.equal(legend.providerIds.proFootballHofPlayerId, source.providerIds.proFootballHofPlayerId);
      else assert.equal(legend.providerIds.proFootballHofPlayerId, undefined);
    }
    for (const url of legend.sources.map(s => s.url)) assert.ok(source.sourceUrls.includes(url));
    for (const [key, id] of Object.entries(legend.providerIds)) assert.equal(id, source.providerIds[key]);
  }
  for (const name of ['Larry Fitzgerald', 'Roger Craig', 'Adam Vinatieri']) assert.equal(CLASSIC_LEGENDS.find(p => p.name === name)!.hallOfFameYear, 2026);
});

test('Classic eligibility preserves actual seasons, source-confirmed gaps and the inclusive 2010 boundary', () => {
  assert.equal(formatSeasons([1958,1960,1961,1970]), '1958, 1960–1961, 1970');
  for (const legend of CLASSIC_LEGENDS) {
    const source = verified.find(p => p.catalogId === legend.id);
    assert.deepEqual(legend.careerSeasons, source.careerSeasons);
    assert.deepEqual(legend.classicSeasons, source.classicSeasons);
    assert.ok(legend.classicSeasons.every(year => year >= 1960 && year <= 2010 && legend.careerSeasons.includes(year)));
  }
  const blanda = CLASSIC_LEGENDS.find(p => p.name === 'George Blanda')!;
  assert.ok(!blanda.careerSeasons.includes(1959));
  assert.deepEqual(blanda.eligiblePositions, ['QB', 'K']);
  const groza = CLASSIC_LEGENDS.find(p => p.name === 'Lou Groza')!;
  assert.deepEqual(groza.classicSeasons, [1961,1962,1963,1964,1965,1966,1967]);
  assert.equal(filterProfiles({collection:'classic', era:2020}).length, 0);
  assert.ok(filterProfiles({collection:'classic', era:2010}).every(p => p.classic!.classicSeasons.includes(2010)));
  assert.ok(filterProfiles({collection:'classic', search:'John Constantine Unitas'}).some(p => p.name === 'Johnny Unitas'));
  assert.deepEqual(filterProfiles({collection:'classic', search:'The Toe'}).map(p => p.name), ['Lou Groza']);
});

test('Classic coverage is 3406 preserved games plus 322 verified kicker games, with no implicit activation or synthetic rows', () => {
  assert.equal(CLASSIC_SUMMARY.withGameLogs, 36);
  assert.equal(CLASSIC_LEGENDS.reduce((sum, p) => sum + classicCoverage(p).gameCount, 0), 3728);
  assert.equal(filterProfiles({collection:'classic', status:'playable'}).length, 36);
  assert.equal(filterProfiles({collection:'classic', status:'profiles'}).length, 69);
  for (const legend of CLASSIC_LEGENDS) {
    const coverage = classicCoverage(legend);
    const games = PERFORMANCES.filter(p => p.athleteId === legend.playableId && legend.classicSeasons.includes(p.season));
    assert.equal(coverage.gameCount, games.length, legend.name);
    assert.deepEqual(coverage.seasons, [...new Set(games.map(p => p.season))].sort((a,b) => a-b));
    assert.ok(games.every(p => p.season >= 1999 && p.season <= 2010 && p.fictional === false));
  }
  assert.equal(PERFORMANCES.length, 68519);
  const addition = JSON.parse(readFileSync(new URL('../data/verified-player-addition.json', import.meta.url), 'utf8'));
  const newIds = new Set(addition.map((p: {id: string}) => p.id));
  const allRows = JSON.parse(readFileSync(new URL('../data/nflverse/records.json', import.meta.url), 'utf8'));
  const raw = JSON.stringify(allRows.filter((r: unknown[]) => !newIds.has(r[0]))) + '\n';
  assert.equal(createHash('sha256').update(raw).digest('hex'), evidence.archiveSnapshot.recordsSha256);
});

test('only two explicitly verified Classic kickers gain game records; other profiles stay unplayable', () => {
  const kickers = filterProfiles({collection:'classic', position:'K'});
  assert.equal(kickers.length, 5); // Four dedicated kickers plus one Blanda identity.
  assert.deepEqual(kickers.filter(p=>p.athlete).map(p=>p.name).sort(),['Adam Vinatieri','Morten Andersen']);assert.ok(kickers.filter(p=>!p.athlete).every(p=>classicCoverage(p.classic!).gameCount===0));
  assert.equal(filterProfiles({collection:'classic', position:'DEF'}).length, 0);
  assert.equal(filterProfiles({position:'DEF'}).length, 32);
  assert.ok(ATHLETES.every(a => ['QB','RB','WR','TE','DEF','K'].includes(a.position)));
  assert.equal(new Set(ATHLETES.map(a => a.id)).size, 435);
});

test('consuming a single real game leaves the same season other weeks available', () => {
  const athlete = ATHLETES.find(a => a.name === 'Jerry Rice')!;
  const game = PERFORMANCES.find(p => p.athleteId === athlete.id && p.season === 1999)!;
  const availability = poolAvailability(athlete, [game.id]);
  assert.equal(availability.count, athlete.gameCount - 1);
  assert.ok(availability.seasons.includes(1999));
  assert.equal(PERFORMANCES.filter(p => p.athleteId === athlete.id && p.season === 1999 && p.id !== game.id).length, athlete.gamesBySeason[1999] - 1);
});
