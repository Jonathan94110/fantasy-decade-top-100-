/** Local-only CSV review: node --experimental-strip-types --test tests/prime-rushmore-csv.test.ts */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return {format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}`};
    }
    return nextLoad(url, context);
  },
});

const {parseCsv, numericCell, validateCsvGame, selectGameLogFiles, auditDuplicateKeys, OFFENSE_COLUMNS} = await import('../lib/prime-rushmore-csv');

type Fixture = {
  sourceCommit: string;
  sourceFile: string;
  sourceSHA256: string;
  physicalLine: number;
  headers: string[];
  row: Record<string, string>;
  csv: string;
};

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/prime-rushmore-csv/${name}.json`, import.meta.url), 'utf8'));
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvForRow(row: Record<string, string>, headers = Object.keys(row)) {
  return `${headers.map(csvCell).join(',')}\n${headers.map(header => csvCell(row[header] ?? '')).join(',')}\n`;
}

test('the Montana regression fixture preserves the exact pinned opener, not an asserted strict pass', () => {
  const source = fixture('montana-1989-opener');
  assert.equal(source.sourceCommit, '53cf0b14b896f3aa9d5e5e2069b20acb75e74728');
  assert.equal(source.sourceFile, 'qb_gamelogs_1980s.csv');
  assert.equal(source.physicalLine, 422);
  assert.equal(source.row.game_id, '19890910-SFO-IND');
  assert.equal(source.row.date, '1989-09-10');
  assert.equal(source.row.playoff, 'False');
  assert.equal(source.row.pass_yds, '233');
  assert.equal(source.row.pass_td, '1');
  assert.equal(source.row.pass_int, '0');
  assert.equal(source.row.rush_yds, '21');
  assert.equal(source.row.rush_td, '0');
  assert.equal(source.row.two_pt, '0');
  assert.equal(source.row.fum_rec_td, '');
  assert.equal(source.row.scoring_complete, 'False');
  assert.equal(source.row.scoring_missing, 'fum_rec_td');
  assert.equal(source.row.fpts_std, '15.42');
  for (const field of ['rec', 'rec_yds', 'rec_td', 'ret_td']) {
    assert.equal(source.headers.includes(field), false);
  }
});

test('actual fixture CSV cells map by headers and preserve raw strings and blanks', () => {
  for (const name of ['montana-1989-opener', 'rb-complete-1999', 'wr-complete-1999', 'te-complete-1999', 'k-missed-xp', 'def-disputed', 'def-disputed-generic-complete', 'def-match-complete']) {
    const source = fixture(name);
    const table = parseCsv(source.csv);
    assert.deepEqual(table.headers, source.headers, name);
    assert.deepEqual(table.rows, [source.row], name);
  }
});

test('header order, quoted commas, escaped quotes, multiline cells, BOM and CRLF do not change field identity', () => {
  const source = fixture('wr-complete-1999');
  const row = {...source.row, name: 'Rice, "Jerry"\nSr'};
  const headers = [...source.headers].reverse();
  const table = parseCsv(`\uFEFF${csvForRow(row, headers).replaceAll('\n', '\r\n')}`);
  assert.deepEqual(table.headers, headers);
  assert.equal(table.rows[0].name, 'Rice, "Jerry"\r\nSr');
  const result = validateCsvGame('WR', table.rows[0]);
  assert.equal(result.date, '1999-09-12');
  assert.equal(result.gameId, '19990912-SFO-JAX');
  assert.equal(result.offenseStats?.receivingYards, 17);
  assert.equal(result.offenseStats?.passingYards, 0);
  assert.equal(result.strictScoringComplete, true);
  assert.equal(result.calculatedPoints, 3.7);
});

test('malformed CSV is rejected instead of shifting or silently replacing fields', () => {
  for (const csv of ['name,name\nA,B\n', 'name,\nA,B\n', 'name,date\nA\n', 'name\n"unclosed\n', 'name\n"closed"tail\n', 'name\nstray"quote\n']) {
    assert.throws(() => parseCsv(csv), /CSV/);
  }
});

test('one game-log representation is selected without concatenating full, decades or season totals', () => {
  const decades = [1950, 1960, 1970, 1980, 1990].map(year => `data/sheets/wr_gamelogs_${year}s.csv`);
  const full = 'data/sheets/wr_gamelogs.csv';
  const files = [...decades, full, 'data/sheets/wr_season_totals.csv', 'data/sheets/qb_gamelogs.csv'];
  assert.deepEqual(selectGameLogFiles(files, 'WR'), decades);
  assert.deepEqual(selectGameLogFiles(files, 'WR', 'full'), [full]);
  assert.throws(() => selectGameLogFiles(decades.slice(1), 'WR'), /five/);
  assert.throws(() => selectGameLogFiles([...files, 'other/wr_gamelogs_1990s.csv'], 'WR'), /five|Duplicate/);
  assert.throws(() => selectGameLogFiles([full, 'other/wr_gamelogs.csv'], 'WR', 'full'), /Duplicate/);
});

test('identity uses ISO date, source game ID and player/team identity, not name or row order', () => {
  const source = fixture('wr-complete-1999');
  const result = validateCsvGame('WR', source.row);
  assert.equal(result.identityValid, true);
  assert.equal(result.identityKey, 'player:18564:19990912-SFO-JAX');
  assert.equal(validateCsvGame('WR', {...source.row, name: 'Different label'}).identityKey, result.identityKey);
  assert.notEqual(validateCsvGame('WR', {...source.row, player_id: 'other-player'}).identityKey, result.identityKey);
  for (const row of [
    {...source.row, date: '09/12/1999'},
    {...source.row, date: '1999-02-29'},
    {...source.row, game_id: '19990912-JAX-SFO'},
    {...source.row, player_id: ''},
  ]) {
    const invalid = validateCsvGame('WR', row);
    assert.equal(invalid.identityValid, false);
    assert.equal(invalid.strictScoringComplete, false);
    assert.equal(invalid.calculatedPoints, null);
  }
  const defense = validateCsvGame('DEF', fixture('def-match-complete').row);
  assert.equal(defense.identityKey, 'team:ARI:19990912-ARI-PHI');
});

test('regular-season filtering accepts only explicit False and retains excluded raw rows', () => {
  const source = fixture('wr-complete-1999');
  assert.equal(validateCsvGame('WR', source.row).regularSeason, true);
  for (const playoff of ['True', '', 'false', 'unknown']) {
    const row = {...source.row, playoff};
    const result = validateCsvGame('WR', row);
    assert.equal(result.regularSeason, false);
    assert.equal(result.strictScoringComplete, false);
    assert.equal(result.calculatedPoints, null);
    assert.deepEqual(result.raw, row);
  }
});

test('Montana opener remains incomplete despite an available partial source score', () => {
  const source = fixture('montana-1989-opener');
  const result = validateCsvGame('QB', source.row);
  assert.equal(result.identityValid, true);
  assert.equal(result.sourceScoringComplete, false);
  assert.deepEqual(result.sourceScoringMissing, ['fum_rec_td']);
  assert.equal(result.sourceFantasyPoints.standard, 15.42);
  assert.equal(result.sourceFantasyPoints.ppr, 15.42);
  assert.equal(result.offenseStats?.fumbleRecoveryTD, null);
  assert.deepEqual(result.missingScoringFields.sort(), ['receptions', 'receivingYards', 'receivingTD', 'returnTD', 'fumbleRecoveryTD'].sort());
  assert.equal(result.appNumericComplete, false);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
});

test('the source scoring flag is necessary and cannot certify omitted QB offense columns', () => {
  const source = fixture('montana-1989-opener');
  // Explicit synthetic repair of one source gap does not invent omitted columns.
  const row = {...source.row, fum_rec_td: '0', scoring_complete: 'True', scoring_missing: ''};
  const result = validateCsvGame('QB', row);
  assert.equal(result.sourceScoringComplete, true);
  assert.deepEqual(result.missingScoringFields.sort(), ['receptions', 'receivingYards', 'receivingTD', 'returnTD'].sort());
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
  assert.equal(result.offenseStats?.receptions, null);
});

test('a zero team score does not trigger unknown-field zero shortcuts', () => {
  const source = fixture('montana-1989-opener');
  // Synthetic shutout illustrates that this adapter performs no proof derivation.
  const result = validateCsvGame('QB', {...source.row, team_score: '0'});
  assert.equal(result.offenseStats?.fumbleRecoveryTD, null);
  assert.equal(result.offenseStats?.receptions, null);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
});

test('complete non-shutout RB, WR and TE rows pass the numeric review without gameplay approval', () => {
  for (const [position, name, standard, ppr] of [
    ['RB', 'rb-complete-1999', 0, 0],
    ['WR', 'wr-complete-1999', 1.7, 3.7],
    ['TE', 'te-complete-1999', 4.7, 11.7],
  ] as const) {
    const source = fixture(name);
    assert.ok(Number(source.row.team_score) > 0);
    const original = structuredClone(source.row);
    assert.equal(validateCsvGame(position, source.row, 0).calculatedPoints, standard);
    assert.equal(validateCsvGame(position, source.row, 1).calculatedPoints, ppr);
    const result = validateCsvGame(position, source.row);
    assert.equal(result.appNumericComplete, true);
    assert.equal(result.strictScoringComplete, true);
    assert.equal(result.eligibleForGameplay, false);
    assert.equal(result.offenseStats?.fumblesLost, null);
    assert.deepEqual(source.row, original);
  }
  assert.equal(validateCsvGame('WR', fixture('wr-complete-1999').row, 0.5).calculatedPoints, 2.7);
});

test('generic complete ignores non-scoring targets; source and app scoring gates control review', () => {
  for (const [position, name] of [['RB', 'rb-complete-1999'], ['WR', 'wr-complete-1999'], ['TE', 'te-complete-1999']] as const) {
    const source = fixture(name);
    // No such row exists at the pinned source. This synthetic mutation checks a future valid distinction.
    const row = {...source.row, targets: '', complete: 'False', missing_fields: 'targets'};
    const result = validateCsvGame(position, row);
    assert.equal(result.sourceComplete, false);
    assert.equal(result.sourceScoringComplete, true);
    assert.equal(result.appNumericComplete, true);
    assert.equal(result.strictScoringComplete, true);
    assert.equal(result.calculatedPoints, Number(source.row.fpts_ppr));
  }
});

test('a fully numeric row cannot bypass an incomplete or unavailable source scoring status', () => {
  const source = fixture('wr-complete-1999');
  for (const row of [
    {...source.row, scoring_complete: 'False'},
    {...source.row, scoring_complete: ''},
    {...source.row, scoring_missing: 'fum_rec_td'},
  ]) {
    const result = validateCsvGame('WR', row);
    assert.equal(result.appNumericComplete, true);
    assert.equal(result.strictScoringComplete, false);
    assert.equal(result.calculatedPoints, null);
  }
  const row = {...source.row};
  delete row.scoring_missing;
  assert.equal(validateCsvGame('WR', row).strictScoringComplete, false);
});

test('every active offense field requires an explicit finite numeric cell; unknown never becomes zero', () => {
  const source = fixture('wr-complete-1999');
  for (const [field, column] of Object.entries(OFFENSE_COLUMNS)) {
    for (const value of ['', ' ', 'NaN', 'Infinity', 'null', '0oops']) {
      const row = {...source.row, [column]: value};
      const result = validateCsvGame('WR', row);
      assert.equal(result.offenseStats?.[field as keyof NonNullable<typeof result.offenseStats>], null, `${field}:${value}`);
      assert.ok(result.missingScoringFields.includes(field));
      assert.equal(result.appNumericComplete, false);
      assert.equal(result.strictScoringComplete, false);
      assert.equal(result.calculatedPoints, null);
      assert.equal(result.raw[column], value);
      if (value.trim()) assert.ok(result.invalidNumericFields.includes(field));
    }
  }
  const negative = validateCsvGame('WR', {...source.row, rush_yds: '-3'});
  assert.equal(negative.offenseStats?.rushingYards, -3);
  assert.equal(negative.calculatedPoints, 3.4);
});

test('the Carney January game uses season 1999 and counts both FG and XP unsuccessful attempts once', () => {
  const source = fixture('k-missed-xp');
  const result = validateCsvGame('K', source.row);
  assert.equal(result.identityValid, true);
  assert.equal(result.date, '2000-01-02');
  assert.equal(result.raw.season, '1999');
  assert.equal(result.gameId, '20000102-SDG-DEN');
  assert.equal(result.sourceFantasyPoints.kickerContract, 5);
  assert.equal(result.kickingPoints, 4);
  assert.equal(result.kickerContractMatches, false);
  assert.deepEqual(result.kickingAggregates, {unsuccessfulFieldGoals: 1, unsuccessfulExtraPoints: 1, blockedFieldGoals: null, blockedExtraPoints: null});
  assert.ok(result.blocks.includes('source-kicker-contract-mismatch'));
  assert.equal(result.offenseStats?.passingYards, null);
  assert.equal(result.missingScoringFields.length, 11);
  assert.equal(result.strictScoringComplete, false);
});

test('unknown kicker distance bins and inconsistent totals cannot produce exact kicking points', () => {
  const source = fixture('k-missed-xp');
  for (const row of [{...source.row, fgm_0_39: ''}, {...source.row, fgm: '1'}, {...source.row, xpa: '-1'}]) {
    const result = validateCsvGame('K', row);
    assert.equal(result.kickingPoints, null);
    assert.equal(result.strictScoringComplete, false);
    assert.equal(result.calculatedPoints, null);
  }
});

test('disputed DEF preserves both interception counts and stays quarantined even when generic complete', () => {
  const source = fixture('def-disputed-generic-complete');
  assert.equal(source.physicalLine, 4411);
  assert.equal(source.row.complete, 'True');
  const result = validateCsvGame('DEF', source.row);
  assert.equal(result.sourceComplete, true);
  assert.equal(result.sourceScoringComplete, false);
  assert.equal(result.appNumericComplete, true);
  assert.deepEqual(result.defenseInterceptions, {check: 'raised_to_opp_qb_count', defenders: 1, opposingPassers: 2, selected: 2});
  assert.equal(result.defenseDisputed, true);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
  assert.ok(result.blocks.includes('defense-interceptions-quarantined'));
  assert.equal(validateCsvGame('DEF', {...source.row, scoring_complete: 'True', scoring_missing: ''}).strictScoringComplete, false);
  assert.deepEqual(result.raw, source.row);
});

test('a numeric DEF match can pass local strict scoring review while remaining ineligible for gameplay', () => {
  const source = fixture('def-match-complete');
  const result = validateCsvGame('DEF', source.row);
  assert.deepEqual(result.defenseInterceptions, {check: 'match', defenders: 2, opposingPassers: 2, selected: 2});
  assert.equal(result.defenseDisputed, false);
  assert.equal(result.appNumericComplete, true);
  assert.equal(result.strictScoringComplete, true);
  assert.equal(result.calculatedPoints, 12);
  assert.equal(result.eligibleForGameplay, false);
  for (const row of [
    {...source.row, int_check: 'kept_larger_defender_sum'},
    {...source.row, int_check: ''},
    {...source.row, opp_pass_int: '3'},
    {...source.row, def_int_defenders: ''},
  ]) {
    const disputed = validateCsvGame('DEF', row);
    assert.equal(disputed.defenseDisputed, true);
    assert.equal(disputed.strictScoringComplete, false);
    assert.equal(disputed.calculatedPoints, null);
  }
});

test('duplicate audit distinguishes actual identical rows from conflicting same-identity rows and retains every occurrence', () => {
  const source = fixture('wr-complete-1999');
  const original = validateCsvGame('WR', source.row);
  const reordered = Object.fromEntries(Object.entries(source.row).reverse());
  const exactRows = [original, validateCsvGame('WR', reordered)];
  assert.deepEqual(auditDuplicateKeys(exactRows), [{identityKey: original.identityKey, occurrences: 2, kind: 'exact'}]);
  const conflict = validateCsvGame('WR', {...source.row, rec_yds: '18'});
  const allRows = [...exactRows, conflict, validateCsvGame('WR', {...source.row, player_id: 'another-player'})];
  const before = structuredClone(allRows);
  assert.deepEqual(auditDuplicateKeys(allRows), [{identityKey: original.identityKey, occurrences: 3, kind: 'conflicting'}]);
  assert.deepEqual(allRows, before);
  // The same player/game exported under another position still has one identity.
  assert.deepEqual(auditDuplicateKeys([original, validateCsvGame('RB', source.row)]), [{identityKey: original.identityKey, occurrences: 2, kind: 'exact'}]);
});

test('all reviewed fixtures remain local-only until eligibility, quality and source-use decisions are made', () => {
  for (const [position, name] of [
    ['QB', 'montana-1989-opener'], ['RB', 'rb-complete-1999'], ['WR', 'wr-complete-1999'], ['TE', 'te-complete-1999'],
    ['K', 'k-missed-xp'], ['DEF', 'def-disputed'], ['DEF', 'def-disputed-generic-complete'], ['DEF', 'def-match-complete'],
  ] as const) {
    const result = validateCsvGame(position, fixture(name).row);
    assert.equal(result.eligibleForGameplay, false);
    assert.equal(result.disposition, 'local-review-only');
    assert.ok(result.blocks.includes('eligibility-and-source-use-decisions-pending'));
  }
});

test('refreshed source fixtures retain their exact versioned provenance and every raw eligibility flag', () => {
  const cases = [
    ['refreshed-montana-1989-opener', 'qb_gamelogs_1980s.csv', 422, '9fd779f2727a47b7f030687972c5a98a8b108e93e0d1a8375d527077c34d0bfc'],
    ['refreshed-buf-1999-10-04', 'def_gamelogs_1990s.csv', 4411, 'b2522fecbb46c399b57a454c38c1e57bb5b1aeeb8af0f7ec197024f88857b799'],
    ['refreshed-buf-1999-10-31', 'def_gamelogs_1990s.csv', 4415, 'b2522fecbb46c399b57a454c38c1e57bb5b1aeeb8af0f7ec197024f88857b799'],
    ['refreshed-buf-1999-11-07', 'def_gamelogs_1990s.csv', 4416, 'b2522fecbb46c399b57a454c38c1e57bb5b1aeeb8af0f7ec197024f88857b799'],
    ['refreshed-dtx-1952-09-28-def', 'def_gamelogs_1950s.csv', 361, '9c83fec81a5e51262f1ec62c22d47e3f586b60d3baa97207fa12cb6beb1d171c'],
  ] as const;
  for (const [name, file, line, hash] of cases) {
    const source = fixture(name);
    assert.equal(source.sourceCommit, 'bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356');
    assert.equal(source.sourceFile, file);
    assert.equal(source.physicalLine, line);
    assert.equal(source.sourceSHA256, hash);
    assert.deepEqual(parseCsv(source.csv), {headers: source.headers, rows: [source.row]});
    for (const flag of ['strict_eligible', 'era_scored_eligible', 'era_excluded_fields', 'era_blocking_fields']) {
      assert.ok(source.headers.includes(flag), `${name}:${flag}`);
    }
  }
  // The previous provider version stays as a distinct, unchanged regression.
  assert.equal(fixture('montana-1989-opener').sourceCommit, '53cf0b14b896f3aa9d5e5e2069b20acb75e74728');
  assert.equal(fixture('montana-1989-opener').headers.includes('rec'), false);
});

test('refreshed Montana supplies receiving and return cells but Strict still requires the unknown recovery TD', () => {
  const source = fixture('refreshed-montana-1989-opener');
  const result = validateCsvGame('QB', source.row);
  assert.equal(source.row.game_id, '19890910-SFO-IND');
  assert.equal(source.row.two_pt, '0');
  for (const column of ['rec', 'rec_yds', 'rec_td', 'ret_td']) {
    assert.ok(source.headers.includes(column));
    assert.equal(source.row[column], '0');
  }
  assert.equal(result.identityValid, true);
  assert.equal(result.offenseStats?.receptions, 0);
  assert.equal(result.offenseStats?.receivingYards, 0);
  assert.equal(result.offenseStats?.receivingTD, 0);
  assert.equal(result.offenseStats?.returnTD, 0);
  assert.equal(result.offenseStats?.fumbleRecoveryTD, null);
  assert.deepEqual(result.missingScoringFields, ['fumbleRecoveryTD']);
  assert.deepEqual(result.sourceScoringMissing, ['fum_rec_td']);
  assert.equal(result.sourceFantasyPoints.standard, 15.42);
  assert.equal(result.sourceFantasyPoints.ppr, 15.42);
  assert.equal(result.appNumericComplete, false);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
  assert.deepEqual(result.raw, source.row);
});

test('provider era eligibility does not choose a fixed game contract or authorize historical gameplay', () => {
  const source = fixture('refreshed-montana-1989-opener');
  assert.equal(source.row.strict_eligible, 'False');
  assert.equal(source.row.era_scored_eligible, 'True');
  assert.equal(source.row.era_excluded_fields, 'fum_rec_td');
  assert.equal(source.row.era_blocking_fields, '');
  const result = validateCsvGame('QB', source.row);
  assert.equal(result.sourceScoringComplete, false);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
  assert.equal(result.eligibleForGameplay, false);
  assert.ok(result.blocks.includes('eligibility-and-source-use-decisions-pending'));
  assert.equal(result.raw.era_scored_eligible, 'True');
  assert.equal(result.raw.fum_rec_td, '');
});

test('refreshed Buffalo numeric fantasy totals and generic completeness cannot clear disputed interceptions', () => {
  const cases = [
    ['refreshed-buf-1999-10-04', '19991004-BUF-MIA', 15, 1, 2],
    ['refreshed-buf-1999-10-31', '19991031-BUF-BAL', 13, 0, 1],
    ['refreshed-buf-1999-11-07', '19991107-BUF-WAS', 7, 0, 1],
  ] as const;
  for (const [name, gameId, suppliedPoints, defenders, passers] of cases) {
    const source = fixture(name);
    assert.equal(source.row.game_id, gameId);
    assert.equal(source.row.complete, 'True');
    assert.equal(numericCell(source.row.fpts), suppliedPoints);
    assert.equal(numericCell(source.row.fpts_known), suppliedPoints);
    assert.equal(source.row.strict_eligible, 'False');
    assert.equal(source.row.era_scored_eligible, 'False');
    assert.equal(source.row.scoring_missing, 'def_int');
    const result = validateCsvGame('DEF', source.row);
    assert.equal(result.identityValid, true);
    assert.equal(result.appNumericComplete, true);
    assert.equal(result.sourceComplete, true);
    assert.equal(result.sourceScoringComplete, false);
    assert.equal(result.defenseDisputed, true);
    assert.deepEqual(result.defenseInterceptions, {
      check: 'raised_to_opp_qb_count', defenders, opposingPassers: passers, selected: passers,
    });
    assert.equal(result.strictScoringComplete, false);
    assert.equal(result.calculatedPoints, null);
    assert.equal(result.eligibleForGameplay, false);
    assert.ok(result.blocks.includes('defense-interceptions-quarantined'));
    assert.deepEqual(result.raw, source.row);
  }
});

test('refreshed 1952 Dallas Texans defense blanks remain unknown despite an available partial score and era flag', () => {
  const source = fixture('refreshed-dtx-1952-09-28-def');
  assert.equal(source.row.game_id, '19520928-NYG-DTX');
  assert.equal(source.row.season, '1952');
  assert.equal(source.row.team, 'DTX');
  assert.equal(source.row.fpts, '');
  assert.equal(source.row.fpts_known, '0');
  assert.equal(source.row.era_scored_eligible, 'True');
  for (const column of ['sacks', 'fum_rec', 'safeties', 'blk_punt', 'blk_fg', 'blk_xp', 'def_int_td', 'def_fum_td', 'def_td', 'ret_td']) {
    assert.equal(source.row[column], '');
    assert.equal(numericCell(source.row[column]), null);
  }
  const result = validateCsvGame('DEF', source.row);
  assert.equal(result.identityValid, true);
  assert.equal(result.defenseDisputed, false);
  assert.deepEqual(result.defenseInterceptions, {check: 'match', defenders: 0, opposingPassers: 0, selected: 0});
  assert.deepEqual(result.missingScoringFields, [
    'sacks', 'fumbleRecoveries', 'safeties', 'blockedPunts', 'blockedFieldGoals', 'blockedExtraPoints', 'defensiveTD', 'returnTD',
  ]);
  assert.equal(result.appNumericComplete, false);
  assert.equal(result.strictScoringComplete, false);
  assert.equal(result.calculatedPoints, null);
  assert.equal(result.eligibleForGameplay, false);
  assert.deepEqual(result.raw, source.row);
});
