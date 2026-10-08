"""Build only reviewed source games; no network, guessed zeros, or gameplay writes."""
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'historical-import'
source = json.loads((DATA / 'reviewed-source.json').read_text())
identities = json.loads((DATA / 'identity-map.json').read_text())
by_id = {identity['sourcePlayerId']: identity for identity in identities}
catalog = {profile['id']: profile for profile in json.loads((ROOT / 'data' / 'historical-catalog.json').read_text())}
mapping = {
    'passingYards': ['passing_yards'], 'passingTD': ['passing_touchdowns'],
    'interceptions': ['passing_interceptions'], 'rushingYards': ['rushing_yards'],
    'rushingTD': ['rushing_touchdowns'], 'receptions': ['receiving_receptions'],
    'receivingYards': ['receiving_yards'], 'receivingTD': ['receiving_touchdowns'],
    'returnTD': ['kick_return_touchdowns', 'punt_return_touchdowns'],
}
performances = []
seen = set()
for row in source['records']:
    raw = row['rawSourceRow']
    identity = by_id[str(raw['player_id'])]
    assert identity['position'] == 'QB'
    assert identity['rawProfile']['player_id'] == raw['player_id']
    assert identity['rawProfile']['name'].strip() == identity['name']
    assert row['completedFinalZeroEvidence']['completed'] is True
    assert row['completedFinalZeroEvidence']['finalScore'] == [0, int(raw['opponent_score'])]
    assert row['completedFinalZeroEvidence']['date'] == raw['date']
    assert row['completedFinalZeroEvidence']['team'] == raw['team']
    assert row['completedFinalZeroEvidence']['opponent'] == raw['opponent']
    assert int(raw['player_team_score']) == 0
    # The source swaps completions/attempts. Preserve its originals separately.
    assert int(raw['passing_completions']) > 0
    stats = {}
    for key, raw_keys in mapping.items():
        values = [raw.get(field) for field in raw_keys]
        assert all(value is not None and value != '' for value in values), (row['id'], key)
        assert all(math.isfinite(float(value)) for value in values)
        value = sum(float(value) for value in values)
        stats[key] = int(value) if value.is_integer() else value
    for key in ['passingTD', 'rushingTD', 'receivingTD', 'returnTD']:
        assert stats[key] == 0
    # A credited conversion or recovery TD adds positive points. FINAL 0 proves
    # these two scoring values only; raw unavailable source fields stay null.
    stats.update(twoPoint=0, fumbleRecoveryTD=0, fumblesLost=None)
    assert row['id'] not in seen
    seen.add(row['id'])
    performance = {
        'reviewOnly': True, 'id': row['id'], 'athleteId': identity['athleteId'], 'season': int(raw['year']),
        'week': row['week'], 'sourceWeek': int(raw['game_number']),
        'gameId': row['gameId'], 'date': raw['date'], 'teamAtTime': raw['team'],
        'opponent': raw['opponent'], 'seasonType': row['seasonType'], 'stats': stats,
        'fictional': False, 'completed': True, 'entityType': 'player',
        'sourceUrl': source['provider']['datasetUrl'],
        'sourceUrls': [source['provider']['datasetUrl'], row['completedFinalZeroEvidence']['url']],
        'licenseReference': source['provider']['declaredLicenseUrl'],
        'importedAt': source['reviewedAt'], 'minimumScoringVersion': 4,
        'provenance': {
            'sourcePlayerId': str(raw['player_id']), 'originalArchiveSHA256': source['provider']['archiveSHA256'],
            'rawMissingScoringStats': {'fumblesLost': None, 'twoPoint': None, 'fumbleRecoveryTD': None},
            'derivations': {'twoPoint': row['completedFinalZeroEvidence'], 'fumbleRecoveryTD': row['completedFinalZeroEvidence']},
            'quality': 'Provider-sourced numeric fields, checked against the pinned raw snapshot; selected independent corroboration, not all-field independent verification.',
            'historicalFranchiseId': row.get('historicalFranchiseId'),
        },
    }
    if row['seasonType'] == 'POST':
        performance['roundLabel'] = 'Postseason'
    performances.append(performance)

athletes = []
for identity in identities:
    games = [game for game in performances if game['athleteId'] == identity['athleteId']]
    assert games
    profile = catalog[identity['profileId']]
    by_year = collections.defaultdict(list)
    for game in games:
        by_year[str(game['season'])].append(game['id'])
    athletes.append({
        'id': identity['athleteId'], 'name': identity['name'], 'position': 'QB',
        'club': ' · '.join(profile['clubs']), 'number': '', 'style': 'Historical quarterback',
        'legend': True, 'color': '#c5a15e', 'seasons': sorted(map(int, by_year)),
        'gameCount': len(games), 'gamesBySeason': {year: len(ids) for year, ids in by_year.items()},
        'hallOfFameYear': profile['hallOfFameYear'], 'hallOfFameSource': profile['sourceUrl'],
        'minimumScoringVersion': 4, 'performanceIdsBySeason': dict(by_year),
    })
assert len(performances) == 24 and len(athletes) == 7
for filename, value in [('athletes.json', athletes), ('records.json', performances)]:
    (DATA / filename).write_text(json.dumps(value, indent=2) + '\n')
print(json.dumps({'athletes': len(athletes), 'performances': len(performances),
                  'recordsSHA256': hashlib.sha256((DATA / 'records.json').read_bytes()).hexdigest()}))
