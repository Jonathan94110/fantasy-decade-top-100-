#!/usr/bin/env python3
"""Proposed batch: 1999 regular-season games for 1990s stars already in the game.

Proposal only. Nothing here is imported by the app and data/ is never modified. The game's all-era pool
skips its audit-only 1999 rows (lib/historical-data.ts) and these players are not in the modern
nflverse catalog, so their 1999 games are absent. This builds those games from the same pinned nflverse
snapshot the game already uses (data/nflverse/manifest.json), with the same column mapping, exclusions
and checks as scripts/import-nflverse.py:

* source: nflverse stats_player_week_1999.csv, byte-identical to the pinned snapshot (checked);
  licence CC BY 4.0 (data/nflverse/LICENSE-nflverse.md);
* identity: the game's athlete is matched to an nflverse gsis_id by normalized name AND birth date
  (nflverse players.csv vs the game-log profile behind the athlete's historical:player:N id), and then
  confirmed game by game against the game's own audit-only 1999 rows (same dates and teams);
* every stat must be present (blank/NA is never read as 0): a row with a missing value is flagged and
  left out; each row's total is reconciled against nflverse's own PPR points exactly as the importer does;
* the importer's verified exclusion set applies (1999_01_BAL_STL), and only QB/RB/FB/WR/TE rows count;
* rows keep the game's existing athlete ID, so saved games and rosters are untouched; performance IDs
  would be nflverse:<athleteId>:<gameId>, the format the app already uses for nflverse records.

Usage (from sites/fantasy-football-of-the-past/):
  python3 proposals/1999-games/build_1999_batch.py --nflverse /path/to/nflverse-cache --profiles /path/to/profiles.json
"""
import argparse
import collections
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
YEAR = 1999
STAT_KEYS = ['passingYards', 'passingTD', 'interceptions', 'rushingYards', 'rushingTD', 'receptions', 'receivingYards', 'receivingTD',
             'fumblesLost', 'twoPoint', 'returnTD', 'sacks', 'defensiveInterceptions', 'fumbleRecoveries', 'defensiveTD', 'safeties',
             'blockedKicks', 'pointsAllowed', 'fumbleRecoveryTD']
FIELD_MAP = [('passingYards', 'passing_yards'), ('passingTD', 'passing_tds'), ('interceptions', 'passing_interceptions'),
             ('rushingYards', 'rushing_yards'), ('rushingTD', 'rushing_tds'), ('receptions', 'receptions'),
             ('receivingYards', 'receiving_yards'), ('receivingTD', 'receiving_tds'), ('fumblesLost', 'fumbles_lost_total'),
             ('returnTD', 'special_teams_tds'), ('fumbleRecoveryTD', 'fumble_recovery_tds')]
TWO_POINT = ['passing_2pt_conversions', 'rushing_2pt_conversions', 'receiving_2pt_conversions']
ALIASES = {'OAK': 'LV', 'SD': 'LAC', 'STL': 'LA'}  # importer's team aliases
GAME_TEAM = {'GNB': 'GB', 'KAN': 'KC', 'NOR': 'NO', 'NWE': 'NE', 'SDG': 'LAC', 'SFO': 'SF', 'TAM': 'TB', 'RAM': 'LA', 'STL': 'LA',
             'RAI': 'LV', 'OAK': 'LV', 'SD': 'LAC', 'CLT': 'IND', 'RAV': 'BAL', 'OTI': 'TEN', 'CRD': 'ARI', 'PHO': 'ARI', 'JAX': 'JAX'}


POSITION_GROUPS = {'QB': ('QB',), 'RB': ('RB', 'FB'), 'WR': ('WR',), 'TE': ('TE',)}


def date_of(text):
    import datetime
    return datetime.date.fromisoformat(text[:10])


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def norm_name(n):
    n = re.sub(r'\s+', ' ', str(n or '').replace('.', ' ').replace("'", '').strip().lower())
    n = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', n)
    parts = [p for p in n.split() if len(p) > 1]
    return ' '.join(parts)


def team(code):
    return ALIASES.get(code, code)


class Missing(Exception):
    pass


def number(row, key):
    value = row.get(key)
    if value in ('', 'NA', None):
        raise Missing(key)
    n = float(value)
    assert n == n and abs(n) != float('inf')
    return int(n) if n.is_integer() else n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--nflverse', type=Path, required=True)
    ap.add_argument('--profiles', type=Path, required=True, help='game-log profiles JSON behind historical:player:N ids')
    args = ap.parse_args()
    data = APP / 'data'
    manifest = json.loads((data / 'nflverse/manifest.json').read_text())
    pinned = {e['file']: e for e in manifest['sourceFiles']}
    stats_file = args.nflverse / f'stats_player_week_{YEAR}.csv'
    assert sha256(stats_file) == pinned[stats_file.name]['sha256'], 'stats_player_week_1999.csv is not the pinned snapshot'
    excluded_games = set(manifest['excludedGameIds'])

    scope = json.loads((HERE / 'batch-scope.json').read_text())['players']
    catalog = json.loads((data / 'historical-mode/catalog.json').read_text())
    catalog = catalog if isinstance(catalog, list) else catalog['athletes']
    cat_by_id = {a['id']: a for a in catalog}
    hist_rows = json.loads((data / 'historical-mode/records.json').read_text())
    audit_1999 = collections.defaultdict(dict)  # athleteId -> date -> (team, opponent)
    for r in hist_rows:
        if r[1] == YEAR:
            audit_1999[r[0]][r[4]] = (GAME_TEAM.get(r[5], r[5]), GAME_TEAM.get(r[6], r[6]))
    nfl_rows = json.loads((data / 'nflverse/records.json').read_text())
    existing_ids = {(r[0], r[3]) for r in nfl_rows}
    games_1999 = {}
    for r in nfl_rows:
        if r[1] == YEAR:
            games_1999.setdefault(r[3], set()).update({r[5], r[6]})
            games_1999.setdefault(r[3] + '#date', set()).add(r[4])

    with open(args.nflverse / 'games.csv') as f:
        sched = [g for g in csv.DictReader(f) if g['season'] == str(YEAR) and g['game_type'] == 'REG']
    game_by_date_team = {}
    for g in sched:
        for t in (team(g['home_team']), team(g['away_team'])):
            game_by_date_team[(g['gameday'], t)] = g['game_id']

    # nflverse identities: name + birth date, against the game-log profile behind historical:player:N
    with open(args.nflverse / 'players.csv') as f:
        nfl_players = list(csv.DictReader(f))
    by_name = collections.defaultdict(list)
    for p in nfl_players:
        by_name[norm_name(p['display_name'])].append(p)
    profiles = {p['player_id']: p for p in json.loads(args.profiles.read_text())}
    with open(stats_file) as f:
        week_rows = [r for r in csv.DictReader(f) if r['season_type'] == 'REG']
    rows_by_player = collections.defaultdict(list)
    for r in week_rows:
        rows_by_player[r['player_id']].append(r)

    records, review_records, players, flags = [], [], [], []
    audit_row_stats = {(r[0], r[4]): r[10:21] for r in hist_rows if r[1] == YEAR}
    for s in scope:
        aid, name = s['athleteId'], s['name']
        a = cat_by_id.get(aid)
        entry = {'athleteId': aid, 'name': name, 'gamePosition': s['gamePosition'], 'rank1990s': f"{s['rankingPosition']} #{s['rank1990s']}",
                 'gameGames1999Before': int((a or {}).get('gamesBySeason', {}).get(str(YEAR), 0)), 'missing1999GamesInCoverage': s['missing1999Games']}
        # identity
        gsis, evidence, needs_review = None, [], False
        if re.fullmatch(r'00-\d{7}', aid):
            gsis = aid
            evidence.append('game athlete id is the nflverse gsis_id')
        else:
            prof = profiles.get(int(aid.split(':')[-1])) if aid.startswith('historical:player:') else None
            cands = by_name.get(norm_name(name), [])
            if prof and prof.get('birth_date'):
                same_birth = [p for p in cands if p['birth_date'] == prof['birth_date']]
                if len(same_birth) == 1:
                    gsis = same_birth[0]['gsis_id']
                    evidence.append(f"name and birth date {prof['birth_date']} match nflverse {gsis}")
                else:
                    evidence.append(f'{len(same_birth)} nflverse players share name and birth date')
                    near = [p for p in cands if p['birth_date'] and abs((date_of(p['birth_date']) - date_of(prof['birth_date'])).days) == 1
                            and p['position'] in POSITION_GROUPS.get(s['gamePosition'], ())]
                    if len(near) == 1:  # held for reviewer confirmation; requires every game to match the audit rows
                        gsis, needs_review = near[0]['gsis_id'], True
                        evidence.append(f"REVIEW: nflverse {gsis} has the same name and position but birth date {near[0]['birth_date']} "
                                        f"vs {prof['birth_date']} (one day apart)")
            else:
                evidence.append('no birth date on the game-log profile')
        entry['gsisId'] = gsis
        if not gsis:
            entry.update(status='identity not established', identityEvidence=evidence, batchGames=0)
            players.append(entry)
            continue
        src = rows_by_player.get(gsis, [])
        audit = audit_1999.get(aid, {})
        agree = disagree = 0
        added = []
        for r in sorted(src, key=lambda r: int(r['week'])):
            gid = r['game_id']
            why = None
            if r['position'] not in ('QB', 'RB', 'FB', 'WR', 'TE'):
                why = f"nflverse position {r['position']} is outside the importer's skill positions"
            elif gid in excluded_games:
                why = 'game is in the verified exclusion set (data/nflverse/manifest.json excludedGameIds)'
            elif gid not in games_1999:
                why = 'game is not among the accepted 1999 games in data/nflverse/records.json'
            elif not r['team'] or not r['opponent_team']:
                why = 'missing team/opponent in source'
            if why:
                flags.append({'athleteId': aid, 'name': name, 'gameId': gid, 'week': int(r['week']), 'left out': why})
                continue
            tm, opp = team(r['team']), team(r['opponent_team'])
            date = sorted(games_1999[gid + '#date'])[0]
            assert {tm, opp} <= games_1999[gid] | {tm, opp}
            if not {tm, opp} == games_1999[gid]:
                flags.append({'athleteId': aid, 'name': name, 'gameId': gid, 'left out': f'teams {tm}/{opp} differ from the accepted game {sorted(games_1999[gid])}'})
                continue
            try:
                st = dict.fromkeys(STAT_KEYS, 0)
                for k, col in FIELD_MAP:
                    st[k] = number(r, col)
                st['twoPoint'] = sum(number(r, c) for c in TWO_POINT)
                expected = (st['passingYards'] / 25 + st['passingTD'] * 4 - st['interceptions'] * 2 + (st['rushingYards'] + st['receivingYards']) / 10
                            + (st['rushingTD'] + st['receivingTD'] + st['returnTD'] + st['fumbleRecoveryTD']) * 6 + st['receptions']
                            - st['fumblesLost'] * 2 + st['twoPoint'] * 2)
                delta = round(expected - number(r, 'fantasy_points_ppr'), 2)
                fumble_delta = number(r, 'fumbles_lost_total') - sum(number(r, c) for c in ('sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost'))
            except Missing as m:
                flags.append({'athleteId': aid, 'name': name, 'gameId': gid, 'left out': f'missing value in source column {m}; unknown values are never read as 0'})
                continue
            if delta != st['fumbleRecoveryTD'] * 6 - fumble_delta * 2:
                flags.append({'athleteId': aid, 'name': name, 'gameId': gid, 'left out': f'PPR reconciliation failed (delta {delta})'})
                continue
            if (aid, gid) in existing_ids:
                flags.append({'athleteId': aid, 'name': name, 'gameId': gid, 'left out': 'already in data/nflverse/records.json'})
                continue
            a_team = audit.get(date)
            if a_team and {a_team[0], a_team[1]} == {tm, opp}:
                agree += 1
            else:
                disagree += 1
            (review_records if needs_review else records).append([aid, YEAR, int(r['week']), gid, date, tm, opp, 'REG'] + [st[k] for k in STAT_KEYS])
            added.append(gid)
        if needs_review and disagree:  # the fallback only holds if every game matches the game's own 1999 rows
            review_records[:] = [x for x in review_records if x[0] != aid]
            evidence.append('REVIEW REJECTED: not every game matches the audit rows')
            added = []
        # reconcile the coverage gap: games built, games already present, games nflverse doesn't have
        already = sum(1 for f_ in flags if f_['athleteId'] == aid and f_['left out'].startswith('already'))
        nfl_dates = {sorted(games_1999[x['game_id'] + '#date'])[0] for x in src if x['game_id'] + '#date' in games_1999}
        audit_only = sorted(d for d in audit if d not in nfl_dates)
        not_available = s['missing1999Games'] - len(added)
        candidates = []
        for d in audit_only:
            tm_, opp_ = audit.get(d, (None, None))
            has_stats = any(v not in (0, None) for v in audit_row_stats.get((aid, d), []))
            gid = game_by_date_team.get((d, tm_)) or game_by_date_team.get((d, opp_))
            withheld = gid in excluded_games
            candidates.append({'date': d, 'team': tm_, 'opponent': opp_, 'gameId': gid, 'olderSourceHasStats': has_stats,
                               'reason': ('nflverse has this game on its schedule but no player stats for it; the game is withheld by the verified exclusion list'
                                          if withheld else 'no nflverse stat row: the older source records an appearance with no offensive stats')})
        # Games with recorded stats first, then the rest by date; the official count decides how many are missing.
        candidates.sort(key=lambda c: (not c['olderSourceHasStats'], c['date']))
        missing_list, extra = candidates[:max(not_available, 0)], candidates[max(not_available, 0):]
        entry['gapReconciliation'] = {
            'coverageGap': s['missing1999Games'], 'built': len(added), 'alreadyInGame': already,
            'notAvailableFromNflverse': max(not_available, 0), 'missingGames': missing_list,
            'olderSourceAppearancesBeyondOfficialCount': extra,
            'unidentifiedMissing': max(not_available - len(candidates), 0)}
        built_status = 'batch built' if added else 'no new games: its 1999 nflverse games are already in the game'
        entry.update(status='needs reviewer identity confirmation' if needs_review and added else (built_status if not needs_review else 'identity not established'), identityEvidence=evidence, nflversePosition=collections.Counter(r['position'] for r in src).most_common(1)[0][0] if src else None,
                     nflverseRows1999=len(src), batchGames=len(added),
                     gameGames1999After=entry['gameGames1999Before'] + len(added),
                     auditRows1999=len(audit), auditAgreement={'sameDateAndTeams': agree, 'notInAuditRows': disagree})
        if disagree:
            evidence.append(f'{disagree} nflverse games have no matching audit row (date/teams)')
        players.append(entry)

    in_scope = {p['athleteId'] for p in players}
    audit_counts = collections.Counter(r[0] for r in hist_rows if r[1] == YEAR)
    rest = [a for a in catalog if audit_counts.get(a['id']) and not a.get('gamesBySeason', {}).get(str(YEAR)) and a['id'] not in in_scope]
    follow_on = {'players': len(rest), 'olderSource1999Rows': sum(audit_counts[a['id']] for a in rest),
                 'byPosition': dict(collections.Counter(a['position'] for a in rest)),
                 'note': 'catalog athletes outside this batch with 1999 rows in the older source but no 1999 games in the game'}

    keys = [(r[0], r[3]) for r in records]
    assert len(keys) == len(set(keys)), 'duplicate athlete/game in batch'
    per_team_week = collections.Counter((r[0], r[2]) for r in records)
    assert max(per_team_week.values(), default=1) == 1, 'a player has two games in one week'
    (HERE / 'batch-records.json').write_text(json.dumps(records, separators=(',', ':')) + '\n')
    (HERE / 'review-records.json').write_text(json.dumps(review_records, separators=(',', ':')) + '\n')
    (HERE / 'batch-players.json').write_text(json.dumps(players, indent=1) + '\n')
    (HERE / 'batch-flags.json').write_text(json.dumps(flags, indent=1) + '\n')
    summary = {
        'players': len(players), 'playersBuilt': sum(p['status'] == 'batch built' for p in players),
        'playersAlreadyComplete': [p['name'] for p in players if p['status'].startswith('no new games')],
        'identityNotEstablished': [p['name'] for p in players if p['status'] == 'identity not established'],
        'needsReviewerIdentityConfirmation': {p['name']: p['batchGames'] for p in players if p['status'].startswith('needs reviewer')},
        'games': len(records), 'reviewGames': len(review_records),
        'playersWithNewGames': len({r[0] for r in records}),
        'reconciliation': {
            'coverageGap': sum(p['missing1999GamesInCoverage'] for p in players),
            'builtForReview': len(records), 'heldForIdentitySignOff': len(review_records),
            'notAvailableFromNflverse': sum(p.get('gapReconciliation', {}).get('notAvailableFromNflverse', 0) for p in players),
            'missingGamesListed': sum(len(p.get('gapReconciliation', {}).get('missingGames', [])) for p in players),
            'unidentifiedMissing': sum(p.get('gapReconciliation', {}).get('unidentifiedMissing', 0) for p in players),
            'olderSourceAppearancesBeyondOfficialCount': sum(len(p.get('gapReconciliation', {}).get('olderSourceAppearancesBeyondOfficialCount', [])) for p in players)},
        'followOn': follow_on,
        'leftOut': collections.Counter(f['left out'].split(' (')[0].split(';')[0] for f in flags),
        'auditAgreement': {'sameDateAndTeams': sum(p.get('auditAgreement', {}).get('sameDateAndTeams', 0) for p in players),
                           'notInAuditRows': sum(p.get('auditAgreement', {}).get('notInAuditRows', 0) for p in players)},
        'source': {'file': stats_file.name, 'url': pinned[stats_file.name]['url'], 'sha256': pinned[stats_file.name]['sha256'],
                   'pinnedIn': 'data/nflverse/manifest.json', 'licence': 'CC BY 4.0 (data/nflverse/LICENSE-nflverse.md)',
                   'attribution': 'Data from nflverse (https://github.com/nflverse/nflverse-data), CC BY 4.0.',
                   'warning': manifest['coverage']['earlySeasonWarning'],
                   'identityFile': {'file': 'players.csv', 'url': 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv',
                                    'sha256': sha256(args.nflverse / 'players.csv'), 'use': 'gsis_id, name and birth date only'}},
        'recordColumns': ['athleteId', 'season', 'week', 'gameId', 'date', 'teamAtTime', 'opponent', 'seasonType'] + STAT_KEYS,
        'performanceIdFormat': 'nflverse:<athleteId>:<gameId>',
    }
    (HERE / 'summary.json').write_text(json.dumps(summary, indent=1, default=dict) + '\n')
    print(json.dumps({k: summary[k] for k in ('players', 'playersBuilt', 'playersAlreadyComplete', 'playersWithNewGames', 'identityNotEstablished', 'needsReviewerIdentityConfirmation', 'games', 'reviewGames', 'reconciliation', 'followOn', 'leftOut', 'auditAgreement')}, indent=1, default=dict))


if __name__ == '__main__':
    sys.exit(main())
