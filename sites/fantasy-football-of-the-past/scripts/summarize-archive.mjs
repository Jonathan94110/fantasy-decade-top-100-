import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('../data/nflverse/manifest.json', import.meta.url), 'utf8'));
const quality = {
  excludedGameCount: manifest.excludedGameIds.length,
  excludedGameIds: manifest.excludedGameIds,
  earlySeasonWarning: manifest.coverage.earlySeasonWarning,
  maintenanceSource: manifest.maintenanceSource,
  knownSourceIssues: manifest.knownSourceIssues,
  rosterSelection: manifest.rosterSelection,
  franchiseAliasMap: manifest.franchiseAliasMap,
};
fs.writeFileSync(new URL('../data/archive-quality.json', import.meta.url), JSON.stringify(quality, null, 2) + '\n');
fs.writeFileSync(new URL('../public/archive-coverage.json', import.meta.url), JSON.stringify({
  coverage: manifest.coverage, historicalSourceStatus: JSON.parse(fs.readFileSync(new URL('../data/historical-source-status.json', import.meta.url), 'utf8')), quality, verifiedPlayerAddition: manifest.verifiedPlayerAddition, checks: manifest.checks, countsBySeason: manifest.countsBySeason,
}, null, 2) + '\n');

fs.copyFileSync(new URL("../data/verified-player-addition.json", import.meta.url), new URL("../public/verified-player-addition.json", import.meta.url));
