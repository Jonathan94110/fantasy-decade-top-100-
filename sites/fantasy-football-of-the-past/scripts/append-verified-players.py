#!/usr/bin/env python3
"""Append a fixed 30-ID selection to immutable v26 data; never refresh old rows.
Usage: python scripts/append-verified-players.py RAW_SOURCE BASELINE OUTPUT
D/ST records and exclusions from the audited baseline define the allowed game set.
All original raw hashes are checked, including PBP; defenses are not recalculated.
"""
import collections,csv,datetime,hashlib,json,math,pathlib,sys
source,baseline,out=map(pathlib.Path,sys.argv[1:4]);out.mkdir(exist_ok=True,parents=True)
load=lambda p:json.loads(p.read_bytes())
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n')
old=load(baseline/'athletes.json');rows=load(baseline/'records.json');m=load(baseline/'manifest.json');c=m['coverage'];old_ids={a['id'] for a in old}
assert len(rows)==56881 and len(old)==365,'Requires immutable v26 baseline'
selection=[('00-0006423','Brian Griese','QB'),('00-0029567','Nick Foles','QB'),('00-0027974','Colin Kaepernick','QB'),('00-0021231','David Garrard','QB'),('00-0023460','Jason Campbell','QB'),('00-0023541','Kyle Orton','QB'),('00-0024218','Vince Young','QB'),('00-0001335','Jeff Blake','QB'),('00-0005091','Kevin Faulk','RB'),('00-0026153','Jonathan Stewart','RB'),('00-0022250','Willie Parker','RB'),('00-0023437','Ronnie Brown','RB'),('00-0027325','LeGarrette Blount','RB'),('00-0025637','Ahmad Bradshaw','RB'),('00-0023545','Brandon Jacobs','RB'),('00-0015523','Duce Staley','RB'),('00-0002068','Troy Brown','WR'),('00-0006043','Terry Glenn','WR'),('00-0024240','Santonio Holmes','WR'),('00-0026995','Jeremy Maclin','WR'),('00-0020446','Chris Chambers','WR'),('00-0019663','Darrell Jackson','WR'),('00-0026345','Pierre Garcon','WR'),('00-0025410','Dwayne Bowe','WR'),('00-0022910','Lee Evans','WR'),('00-0009163','Eddie Kennison','WR'),('00-0021154','Daniel Graham','TE'),('00-0022126','L.J. Smith','TE'),('00-0017644','Jermaine Wiggins','TE'),('00-0001661','Kyle Brady','TE')]
ids={p[0] for p in selection};assert len(ids)==30 and not ids&old_ids
for f in m['sourceFiles']:
 p=source/f['file'];assert p.stat().st_size==f['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],f['file']
normalize=lambda team:m['franchiseAliasMap'].get(team,team)
schedule={r['game_id']:r for r in csv.DictReader((source/'games.csv').open())}
allowed={r[3] for r in rows if r[0].startswith('franchise-')};assert len(allowed)==7304
excluded=set(m['excludedGameIds']);assert len(excluded)==20 and not allowed&excluded
columns=m['recordColumns'];groups=collections.defaultdict(list)
for year in range(1999,2027):
 for r in csv.DictReader((source/f'stats_player_week_{year}.csv').open()):
  if r['player_id'] in ids and r['game_id'] in allowed:
   assert r['team'] and r['opponent_team'];groups[r['player_id']].append(r)
fieldmap={'passingYards':'passing_yards','passingTD':'passing_tds','interceptions':'passing_interceptions','rushingYards':'rushing_yards','rushingTD':'rushing_tds','receptions':'receptions','receivingYards':'receiving_yards','receivingTD':'receiving_tds','fumblesLost':'fumbles_lost_total','returnTD':'special_teams_tds','fumbleRecoveryTD':'fumble_recovery_tds'}
def num(r,k):
 assert r[k] not in ('','NA',None),(r['game_id'],k)
 n=float(r[k]);assert math.isfinite(n);return int(n) if n.is_integer() else n
added=[];profiles=[];athletes=list(old);differences=list(m['pprDifferencesFromSourceDefaults'])
for id,name,pos in selection:
 rs=groups[id];assert rs and len({r['game_id'] for r in rs})==len(rs)
 assert all(r['player_display_name']==name and r['position']==pos for r in rs),(id,name)
 years=sorted({int(r['season']) for r in rs});last=max(rs,key=lambda r:(schedule[r['game_id']]['gameday'],r['game_id']))
 athletes.append({'id':id,'name':name,'position':pos,'club':last['team'],'number':''.join(x[0] for x in name.split())[:2],'style':f'{years[0]}–{years[-1]} archive · {len(rs)} games','legend':False,'color':['#b6f34d','#82a9ff','#f0b57c','#bc9eff'][len(athletes)%4],'seasons':years,'gameCount':len(rs),'gamesBySeason':dict(sorted(collections.Counter(r['season'] for r in rs).items()))})
 profiles.append({'id':id,'gsisId':id,'playableId':id,'name':name,'position':pos,'sourcePosition':pos,'archiveFirstSeason':years[0],'archiveLastSeason':years[-1],'archiveSeasons':years,'gameCount':len(rs),'regularSeasonGameCount':sum(r['season_type']=='REG' for r in rs),'clubsAtTime':sorted({r['team'] for r in rs}),'careerVerified':False,'legend':False,'coverageScope':'Every eligible player-week row in the frozen source; excludes known invalid games and snap-only appearances. Loaded years are not a complete career claim.','sourceUrl':c['sourceUrl'],'sourceFiles':[f for f in m['sourceFiles'] if f['file'] in {f'stats_player_week_{y}.csv' for y in years}]})
 for r in rs:
  g=schedule[r['game_id']];season=int(r['season']);week=int(r['week']);assert season==int(g['season']) and week==int(g['week']) and r['season_type']==('REG' if g['game_type']=='REG' else 'POST')
  assert r['season_type'] in ('REG','POST') and g['gameday']<=c['coveredThrough'] and g['home_score'] and g['away_score']
  team,opp=normalize(r['team']),normalize(r['opponent_team']);assert {team,opp}=={normalize(g['home_team']),normalize(g['away_team'])}
  s={k:num(r,v) for k,v in fieldmap.items()};s['twoPoint']=sum(num(r,k) for k in ['passing_2pt_conversions','rushing_2pt_conversions','receiving_2pt_conversions'])
  # D/ST-only dimensions are structurally inapplicable to skill players, not imputed missing statistics.
  s.update({k:0 for k in ['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed']})
  row=[id,season,week,r['game_id'],g['gameday'],team,opp,r['season_type']]+[s[k] for k in columns[8:]];added.append(row)
  points=s['passingYards']*.04+s['passingTD']*4-s['interceptions']*2+(s['rushingYards']+s['receivingYards'])*.1+6*(s['rushingTD']+s['receivingTD']+s['returnTD']+s['fumbleRecoveryTD'])+s['receptions']-2*s['fumblesLost']+2*s['twoPoint']
  delta=round(points-num(r,'fantasy_points_ppr'),2);assert delta==6*s['fumbleRecoveryTD']-2*(s['fumblesLost']-sum(num(r,k) for k in ['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost']))
  if delta:differences.append({'gameId':r['game_id'],'player':name,'delta':delta})
combined=sorted(rows+added,key=lambda r:(r[0],r[4],r[3]));assert len({(r[0],r[3]) for r in combined})==len(combined)
assert [r for r in combined if r[0] in old_ids]==rows
c.update(playerCount=len(athletes)-32,performanceCount=len(combined),additionalPlayablePlayerCount=130,importedAt=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'))
c['note']=c['note'].replace('333 skill','363 skill').replace('100 explicitly selected','130 explicitly selected')
m.update(playerRows=len(combined)-m['teamRows'],selectedPlayerCount=363,countsBySeason=dict(sorted(collections.Counter(str(r[1]) for r in combined).items())),countsBySeasonType=dict(collections.Counter(r[7] for r in combined)),pprDifferencesFromSourceDefaults=differences)
m['rosterSelection']='All previously published athletes, unchanged 400-profile catalog links, original 100-player addition, and a separate fixed 30-GSIS-ID addition. No automatic ranking or name-based identity merges.'
m['verifiedPlayerAddition']={'selectionFile':'verified-player-addition.json','playerCount':30,'addedPerformanceCount':len(added),'positionCounts':dict(collections.Counter(p[2] for p in selection)),'priorPlayerCount':333,'priorPerformanceCount':56881,'sourceSnapshotUnchanged':True,'fullCareerClaims':False,'newHallOfFameAssignments':False,'scoringFieldMap':fieldmap,'twoPointSourceFields':['passing_2pt_conversions','rushing_2pt_conversions','receiving_2pt_conversions'],'structuralZeroFields':['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed'],'baselineCommit':'c289ed77c345b6f691d4c1e69eb16d591a6df1bd'}
for name,value in [('records.json',combined),('athletes.json',athletes),('coverage.json',c),('manifest.json',m)]:write(out/name,value)
write(out.parent/'verified-player-addition.json',profiles)
print(json.dumps({'players':363,'addedPlayers':30,'addedPerformances':len(added),'performances':len(combined),'profiles':[(p['name'],p['gameCount']) for p in profiles]},indent=2))
