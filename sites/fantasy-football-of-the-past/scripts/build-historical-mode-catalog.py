"""Build local Historical metadata from verified source rows and existing REG games.

This does not edit the Strict archive or grant permission to release source data.
"""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'data/historical-mode'


def read(path):
    return json.loads(path.read_text())


def save(name, value):
    (TARGET / name).write_text(json.dumps(value, separators=(',', ':'), ensure_ascii=False) + '\n')


modern = read(ROOT / 'data/nflverse/athletes.json') + read(ROOT / 'data/nflverse/kicker-athletes.json')
source = read(TARGET / 'athletes.json')
source_coverage = read(TARGET / 'coverage.json')
source_rows = read(TARGET / 'records.json')
modern_rows = read(ROOT / 'data/nflverse/records.json') + read(ROOT / 'data/nflverse/kicker-records.json')
metadata = {row['id']: row for row in source}
metadata.update({row['id']: row for row in modern})
counts = collections.defaultdict(collections.Counter)
modern_counts = collections.Counter()
source_counts = collections.Counter()
seen = set()
for row in modern_rows:
    if row[7] == 'REG':
        counts[row[0]][row[1]] += 1
        modern_counts[row[0]] += 1
for row in source_rows:
    if row[1] >= 1999:
        continue  # The existing archive supplies 1999 onwards, avoiding overlap.
    key = (row[0], row[3])
    if key in seen:
        raise ValueError(f'Duplicate historical player/game: {key}')
    seen.add(key)
    counts[row[0]][row[1]] += 1
    source_counts[row[0]] += 1

catalog = []
for athlete_id, years in sorted(counts.items()):
    total = sum(years.values())
    if total < 17:
        continue
    if athlete_id not in metadata:
        raise ValueError(f'Missing verified metadata: {athlete_id}')
    athlete = dict(metadata[athlete_id])
    athlete.update(seasons=sorted(years), gameCount=total,
                   gamesBySeason={str(year): years[year] for year in sorted(years)})
    catalog.append(athlete)

accepted = {athlete['id'] for athlete in catalog}
by_position = {}
for position in ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']:
    actors = [athlete for athlete in catalog if athlete['position'] == position]
    by_position[position] = dict(
        athletes=len(actors),
        performances=sum(athlete['gameCount'] for athlete in actors),
        earlierEraAthletes=sum(source_counts[athlete['id']] > 0 for athlete in actors),
        earlierEraPerformances=sum(source_counts[athlete['id']] for athlete in actors),
    )
by_decade = {}
for decade in range(1950, 2030, 10):
    actors = [athlete for athlete in catalog if any(decade <= year < decade + 10 for year in athlete['seasons'])]
    by_decade[str(decade)] = dict(
        athletes=len(actors),
        performances=sum(count for athlete in actors for year, count in counts[athlete['id']].items()
                         if decade <= year < decade + 10),
        positions={position: sum(athlete['position'] == position for athlete in actors)
                   for position in by_position},
    )

save('catalog.json', catalog)
save('mode-coverage.json', dict(
    sourceRevision=source_coverage['sourceRevision'],
    localOnly=False, releaseApproval=True, publicationScope="existing-owner-private-site", regularSeasonOnly=True, minimumCareerGames=17,
    athleteCount=len(catalog), performanceCount=sum(athlete['gameCount'] for athlete in catalog),
    earlierEraAthleteCount=sum(source_counts[athlete_id] > 0 for athlete_id in accepted),
    earlierEraPerformanceCount=sum(source_counts[athlete_id] for athlete_id in accepted),
    byPosition=by_position, byDecade=by_decade,
    sourceRowsBelowCareerMinimum=sum(count for athlete_id, count in source_counts.items() if athlete_id not in accepted),
    catalogSHA256=hashlib.sha256((TARGET / 'catalog.json').read_bytes()).hexdigest(),
))
print(json.dumps(dict(athletes=len(catalog), performances=sum(athlete['gameCount'] for athlete in catalog),
                     earlierEraPerformances=sum(source_counts[athlete_id] for athlete_id in accepted))))
