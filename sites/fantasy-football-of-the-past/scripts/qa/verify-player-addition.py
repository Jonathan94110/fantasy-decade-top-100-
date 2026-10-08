#!/usr/bin/env python3
"""Independently verify a 400-profile playable expansion against baseline data."""
import argparse, collections, csv, hashlib, json, math, pathlib, re
p=argparse.ArgumentParser();p.add_argument('baseline',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('catalog',type=pathlib.Path);p.add_argument('selection',type=pathlib.Path);p.add_argument('source',type=pathlib.Path);args=p.parse_args()
load=lambda path:json.loads(path.read_bytes())
selection=load(args.selection); approved={p['id']:p for p in selection}
assert len(selection)==len(approved)==30
a=load(args.output/'athletes.json');old=load(args.baseline/'athletes.json');rr=load(args.output/'records.json');older=load(args.baseline/'records.json');m=load(args.output/'manifest.json');c=load(args.output/'coverage.json');links=load(args.output/'catalog-playable-map.json');cat=load(args.catalog)
if isinstance(cat,dict):cat=cat.get('profiles',cat.get('players',cat.get('catalog')))
assert len(cat)==400 and collections.Counter(x['position'] for x in cat)=={'QB':100,'RB':100,'WR':100,'TE':100}
aids={x['id']:x for x in a};oldids={x['id']:x for x in old}
assert len(aids)==len(a) and set(oldids)<=set(aids)
assert all(aids[k]==v for k,v in oldids.items()),'All baseline athlete metadata must remain exactly unchanged for this fixed snapshot'
bykey={(r[0],r[3]):r for r in rr};oldkey={(r[0],r[3]):r for r in older}
assert len(bykey)==len(rr) and set(oldkey)<=set(bykey) and all(bykey[k]==v for k,v in oldkey.items())
# Records are flat arrays: compare the literal on-disk JSON bytes for each old row.
def row_bytes(path):
 result={}
 for row in re.findall(rb'\[[^\[\]]*\]',path.read_bytes()):
  values=json.loads(row);result[(values[0],values[3])]=row
 return result
b_old=row_bytes(args.baseline/'records.json');b_new=row_bytes(args.output/'records.json')
assert len(b_old)==len(older) and len(b_new)==len(rr)
assert all(b_new[key]==value for key,value in b_old.items()),'Prior row bytes changed'
assert {k:v for k,v in b_old.items() if k[0].startswith('franchise-')}=={k:v for k,v in b_new.items() if k[0].startswith('franchise-')}
assert len([x for x in a if x['position']=='DEF'])==32
assert set(r[0] for r in rr)==set(aids)
assert all(len(r)==len(m['recordColumns']) and all(isinstance(v,(int,float)) and math.isfinite(v) for v in r[8:]) for r in rr)
assert min(r[1] for r in rr)==1999 and max(r[1] for r in rr)==2026
assert min(r[4] for r in rr)>='1999-01-01' and max(r[4] for r in rr)==c['coveredThrough']=='2026-09-28'
assert {r[7] for r in rr}=={'REG','POST'}
excluded=set(m['excludedGameIds']);assert not excluded&{r[3] for r in rr}
assert excluded==set(load(args.baseline/'manifest.json')['excludedGameIds'])
for id,meta in aids.items():
 rows=[r for r in rr if r[0]==id];assert len(rows)==meta['gameCount'];assert sorted({r[1] for r in rows})==meta['seasons'];assert dict(collections.Counter(str(r[1]) for r in rows))==meta['gamesBySeason']
assert c['playerCount']==sum(x['position']!='DEF' for x in a)
assert c['performanceCount']==len(rr) and c['gameCount']==len({r[3] for r in rr})
assert m['playerRows']==sum(not r[0].startswith('franchise-') for r in rr)
assert m['teamRows']==sum(r[0].startswith('franchise-') for r in rr)
assert dict(collections.Counter(str(r[1]) for r in rr))==m['countsBySeason']
assert dict(collections.Counter(r[7] for r in rr))==m['countsBySeasonType']
assert collections.Counter(r[3] for r in rr if r[0].startswith('franchise-'))==collections.Counter({r[3]:2 for r in rr})
assert len(links)==400 and len({x['profileId'] for x in links})==400
assert {x['profileId'] for x in links}=={x['id'] for x in cat}
playable={x['playableId'] for x in links if x['playableId']};assert playable<=set(aids)
assert {x['id'] for x in a if x['position']!='DEF'}==playable|{x['id'] for x in old if x['position']!='DEF'}|set(approved),'Unapproved selection was added'
for x in links:
 if x['playableId']:
  y=aids[x['playableId']];assert x['position']==y['position'] and x['gameCount']==y['gameCount'] and x['archiveSeasons']==y['seasons']
 else:assert x['gameCount']==0 and x['archiveSeasons']==[]
assert all(m['checks'].values())
result={'passed':True,'checks':['literal prior performance row bytes identical','all prior athlete metadata objects identical','all 32 D/ST metadata objects and all D/ST row bytes identical','exactly 100 catalog profiles in each current fantasy position','no unapproved player additions','all coverage counts and per-athlete loaded seasons reconcile','no games before 1999 or excluded games','completed source date cutoff remains September 28, 2026','unique entity-game IDs and finite scoring inputs','exactly two D/ST rows per included game','all mappings point to verified archived identities'],'counts':{'priorAthletes':len(old),'athletes':len(a),'priorPerformances':len(older),'performances':len(rr),'addedPerformances':len(rr)-len(older),'playablePlayers':c['playerCount'],'catalogProfiles':400,'linkedCatalogProfiles':len(playable),'profileOnlyCatalogProfiles':400-len(playable),'defenseRows':m['teamRows'],'games':c['gameCount'],'excludedGames':len(excluded)},'baselineSha256':{name:hashlib.sha256((args.baseline/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json']},'outputSha256':{name:hashlib.sha256((args.output/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json','catalog-playable-map.json']}}

# Compare literal metadata object bytes independently, including nested seasons/maps.
def object_bytes(path):
 raw=path.read_text(); decoder=json.JSONDecoder(); index=raw.index('[')+1; out={}
 while index<len(raw):
  while raw[index].isspace() or raw[index]==',':index+=1
  if raw[index]==']':break
  value,end=decoder.raw_decode(raw,index);out[value['id']]=raw[index:end].encode('utf-8');index=end
 return out
old_metadata_bytes=object_bytes(args.baseline/'athletes.json');new_metadata_bytes=object_bytes(args.output/'athletes.json')
assert all(new_metadata_bytes[id]==value for id,value in old_metadata_bytes.items()),'Literal retained athlete metadata bytes changed'
result['checks'].append('literal bytes of all 365 retained athlete metadata objects identical')
result['oldAthleteMetadataObjectBytesIdentical']=True

# Independent extension-specific source and identity checks.
assert set(aids)-set(oldids)==set(approved), 'Added IDs differ from the explicit selection'
assert len(rr)-len(older)==sum(p['gameCount'] for p in selection) and len(a)==395 and c['playerCount']==363
assert (args.output/'catalog-playable-map.json').read_bytes()==(args.baseline/'catalog-playable-map.json').read_bytes(), 'Original catalog mapping bytes changed'
assert hashlib.sha256(args.catalog.read_bytes()).hexdigest()==load(args.baseline/'manifest.json')['catalogSelection']['sha256']
assert (args.output.parent/'verified-player-addition.json').read_bytes()==args.selection.read_bytes()
assert m['sourceFiles']==load(args.baseline/'manifest.json')['sourceFiles']
assert m['pbpRowsBySeason']==load(args.baseline/'manifest.json')['pbpRowsBySeason']
assert m['offensiveOpponentRecoveriesExcluded']==load(args.baseline/'manifest.json')['offensiveOpponentRecoveriesExcluded']
assert all(not aids[id]['legend'] and 'hallOfFameYear' not in aids[id] and 'hallOfFameSource' not in aids[id] for id in approved)
assert (args.output/'hof-map.json').read_bytes()==(args.baseline/'hof-map.json').read_bytes()
for file in m['sourceFiles']:
 path=args.source/file['file'];assert path.stat().st_size==file['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest()==file['sha256']
normalize=lambda x: {'OAK':'LV','SD':'LAC','STL':'LA'}.get(x,x)
schedule={r['game_id']:r for r in csv.DictReader((args.source/'games.csv').open())}
columns=m['recordColumns']; field_positions={name:columns.index(name) for name in columns}
source_map={'passingYards':'passing_yards','passingTD':'passing_tds','interceptions':'passing_interceptions','rushingYards':'rushing_yards','rushingTD':'rushing_tds','receptions':'receptions','receivingYards':'receiving_yards','receivingTD':'receiving_tds','fumblesLost':'fumbles_lost_total','returnTD':'special_teams_tds','fumbleRecoveryTD':'fumble_recovery_tds'}
skill_rows={key:value for key,value in bykey.items() if not key[0].startswith('franchise-')};matched=set();differences=[];new_count=collections.Counter(); source_missing=0
for year in range(1999,2027):
 for source in csv.DictReader((args.source/f'stats_player_week_{year}.csv').open()):
  key=(source['player_id'],source['game_id'])
  if key not in skill_rows:continue
  assert key not in matched;matched.add(key); row=skill_rows[key];game=schedule[source['game_id']]
  assert row[1]==int(source['season']) and row[2]==int(source['week']) and row[4]==game['gameday'] and row[5]==normalize(source['team']) and row[6]==normalize(source['opponent_team']) and row[7]==source['season_type']
  assert game['gameday']<='2026-10-01' and game['home_score'] and game['away_score']
  assert {row[5],row[6]}=={normalize(game['home_team']),normalize(game['away_team'])}
  for target,raw in source_map.items():
   assert source[raw] not in ('','NA',None);value=float(source[raw]);assert math.isfinite(value);assert row[field_positions[target]]==value,(key,target)
  two_point=sum(float(source[k]) for k in ['passing_2pt_conversions','rushing_2pt_conversions','receiving_2pt_conversions']);assert row[field_positions['twoPoint']]==two_point
  for target in ['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed']:assert row[field_positions[target]]==0
  values=dict(zip(columns,row));score=values['passingYards']*.04+values['passingTD']*4-values['interceptions']*2+(values['rushingYards']+values['receivingYards'])*.1+6*(values['rushingTD']+values['receivingTD']+values['returnTD']+values['fumbleRecoveryTD'])+values['receptions']-2*values['fumblesLost']+2*values['twoPoint']
  fumble_difference=float(source['fumbles_lost_total'])-sum(float(source[k]) for k in ['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost'])
  delta=round(score-float(source['fantasy_points_ppr']),2);assert delta==6*float(source['fumble_recovery_tds'])-2*fumble_difference,(key,delta)
  if delta:differences.append((source['game_id'],aids[source['player_id']]['name'],delta))
  if source['player_id'] in approved:
   new_count[source['player_id']]+=1
   assert source['player_display_name']==approved[source['player_id']]['name'] and source['position']==approved[source['player_id']]['sourcePosition']
assert matched==set(skill_rows)
assert dict(new_count)=={id:p['gameCount'] for id,p in approved.items()}
assert sorted(differences)==sorted((x['gameId'],x['player'],x['delta']) for x in m['pprDifferencesFromSourceDefaults'])
assert {id:aids[id]['seasons'] for id in approved}=={id:p['archiveSeasons'] for id,p in approved.items()}
result['checks']+=['exactly approved 30 new GSIS IDs; no additional selections','unchanged literal original catalog mapping and original catalog checksum','all source files exactly match prior frozen snapshot','all exported skill-player rows independently match raw source scoring fields','all app PPR totals reconcile with documented source differences','no new Hall of Fame badges or modifications to the badge map','all selected source names, positions, row counts and archive windows match']
result['counts'].update(addedPlayers=len(approved),playerPerformances=len(skill_rows),independentlyReconciledPlayerRows=len(matched),scoringAdjustments=len(differences))
result['catalogSha256']=hashlib.sha256(args.catalog.read_bytes()).hexdigest()
result['selectionSha256']=hashlib.sha256(args.selection.read_bytes()).hexdigest()
result['outputSha256']['verified-player-addition.json']=hashlib.sha256((args.output.parent/'verified-player-addition.json').read_bytes()).hexdigest()
(args.output/'verified-addition-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
