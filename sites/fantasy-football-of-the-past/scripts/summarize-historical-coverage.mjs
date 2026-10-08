// Publishes the historical game-log provenance that "View source" links point to:
// public/historical-coverage.json#<revision>/<file>:L<line>. Values come from
// data/historical-mode/coverage.json; external repository URLs are left out.
import fs from 'node:fs';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/historical-mode/${name}`, import.meta.url), 'utf8'));
const coverage = read('coverage.json');
const mode = read('mode-coverage.json');
const files = coverage.sourceFiles.map(({path, position, decade, rows, sizeBytes, gitBlobSHA1, sha256}) =>
  ({file: path.split('/').pop(), path, position, decade, rows, sizeBytes, gitBlobSHA1, sha256}));
fs.writeFileSync(new URL('../public/historical-coverage.json', import.meta.url), JSON.stringify({
  description: 'Historical game logs used for pre-1999 regular-season performances.',
  linkFormat: '#<sourceRevision>/<file>:L<sourceLine>',
  sourceRevision: coverage.sourceRevision,
  importedAt: coverage.importedAt,
  publicationScope: coverage.publicationScope,
  sourceUseDecision: coverage.sourceUseDecision,
  sourceQualityNote: coverage.sourceQualityNote,
  weekSemantics: coverage.weekSemantics,
  playerIdentityPolicy: coverage.playerIdentityPolicy,
  careerEligibility: coverage.careerEligibility,
  statKeys: coverage.statKeys,
  counts: {athletes: mode.earlierEraAthleteCount, performances: mode.earlierEraPerformanceCount},
  files,
}, null, 2) + '\n');
