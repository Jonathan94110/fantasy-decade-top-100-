/** Import reviewed identity metadata only. This cannot add games or alter saved leagues. */
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(input.status, 'VERIFIED_READY_FOR_METADATA_IMPORT');
const records = [...input.records, ...input.supplementalNonHofRecords];
const historical = JSON.parse(readFileSync('data/historical-catalog.json', 'utf8'));
const athletes = JSON.parse(readFileSync('data/nflverse/athletes.json', 'utf8'));
const existing = new Map([...historical.map(p => [p.id, p]), ...athletes.map(p => [p.id, p])]);
const seen = new Set(), matches = new Set();
const rows = records.map(record => {
  assert.equal(record.identityVerified, true, record.displayName);
  assert.ok(!seen.has(record.catalogId)); seen.add(record.catalogId);
  if (record.existingProfileId) {
    assert.ok(existing.has(record.existingProfileId), `Missing existing profile ${record.existingProfileId}`);
    assert.equal(existing.get(record.existingProfileId).position, record.primaryFantasyPosition);
    assert.ok(!matches.has(record.existingProfileId)); matches.add(record.existingProfileId);
  }
  const athlete = athletes.find(a => a.id === record.playableId);
  if (record.playableId) {
    assert.ok(athlete);
    assert.equal(athlete.position, record.primaryFantasyPosition);
    const years = athlete.seasons.filter(year => record.classicSeasons.includes(year));
    assert.deepEqual(years, record.loadedClassicSeasons);
    assert.equal(years.reduce((n, year) => n + athlete.gamesBySeason[year], 0), record.loadedClassicGameCount);
  }
  assert.ok(record.classicSeasons.length && record.classicSeasons.every(year => year >= 1960 && year <= 2010 && record.careerSeasons.includes(year)));
  const sources = [...new Set(record.sourceUrls)].map(url => {
    assert.ok(url.startsWith('https://') && ['www.profootballhof.com', 'www.nfl.com', 'amp.nfl.com', 'static.www.nfl.com', 'static.clubs.nfl.com', 'www.buccaneers.com', 'www.denverbroncos.com'].includes(new URL(url).hostname), url);
    return {url, label: url === record.hallOfFameSource ? 'Official Hall of Fame profile' : url === record.nfl100SelectionSource ? `NFL 100 All-Time Team${record.nfl100SelectionPosition === 'RS' ? ' · return specialist' : ''}` : url.includes('profootballhof.com') ? 'Pro Football Hall of Fame evidence' : 'Official NFL career evidence'};
  });
  const scopeNotes = {
    'George Blanda': 'One quarterback identity with a verified kicking role. The K filter is for discovery; kicking statistics and scoring are not supported.',
    'Lou Groza': 'Included solely as a placekicker for 1961–1967. His offensive-tackle role is outside this catalog.',
    'Devin Hester': 'Included for wide-receiver and return history. NFL 100 recognition is as a return specialist. Individual defense is outside this catalog.',
  };
  return {
    id: record.catalogId, name: record.displayName, aliases: record.aliases,
    position: record.primaryFantasyPosition, eligiblePositions: record.eligibleFantasyPositions,
    officialPositions: [...new Set(record.officialPositions.split('|').map(value => value.split(';')[0].replace(/^Modern Era: /, '').replace(/ \(\d+\)$/, '')))],
    careerSeasons: record.careerSeasons, classicSeasons: record.classicSeasons,
    ...(record.existingProfileId ? {existingProfileId: record.existingProfileId} : {}),
    ...(record.playableId ? {playableId: record.playableId} : {}),
    ...(record.hallOfFameYear ? {hallOfFameYear: record.hallOfFameYear, hallOfFameSource: record.hallOfFameSource} : {}),
    ...(record.nfl100Selection ? {nfl100Source: record.nfl100SelectionSource, nfl100Position: record.nfl100SelectionPosition || record.primaryFantasyPosition} : {}),
    sources, ...(scopeNotes[record.displayName] ? {scopeNote: scopeNotes[record.displayName]} : {}),
    providerIds: Object.fromEntries(Object.entries(record.providerIds).filter(([,value]) => value !== null)),
  };
});
writeFileSync('data/classic-legends.json', JSON.stringify(rows, null, 2) + '\n');
writeFileSync('data/classic-legends-verification.json', JSON.stringify(input, null, 2) + '\n');
writeFileSync('public/classic-legends-sources.json', JSON.stringify({
  verifiedAt: input.verifiedAt, classicWindow: input.classicSeasonWindow, source: input.sourceMaster,
  classicCompetitionEnabled: false, newGamesImported: 0,
  explanation: 'Verified identities, roles and career eligibility. Existing game coverage is separate from eligibility; this catalog does not enable a Classic league or new kicker scoring.',
  totalProfiles: rows.length, hallOfFameProfiles: input.counts.hofTotalUnique,
  hallOfFameByPrimaryPosition: input.counts.hofTotalByPrimaryPosition,
  existingProfileMatches: matches.size, newProfiles: rows.length - matches.size,
  existingClassicGameRecords: input.counts.allLoadedClassicGames,
  records: rows.map((row, index) => ({...row, loadedClassicSeasons: records[index].loadedClassicSeasons, loadedClassicGameCount: records[index].loadedClassicGameCount, missingClassicSeasons: records[index].missingClassicSeasons})),
}, null, 2) + '\n');
console.log(JSON.stringify({profiles: rows.length, existingMatches: matches.size, newProfiles: rows.length-matches.size, existingClassicGames: input.counts.allLoadedClassicGames}));
