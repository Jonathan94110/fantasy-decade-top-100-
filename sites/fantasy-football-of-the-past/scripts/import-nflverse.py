import copy,csv,datetime,gzip,hashlib,json,pathlib,re,sys
"""Import a curated catalog over a verified, immutable nflverse snapshot.
Usage: python import-nflverse.py RAW_SOURCE OUTPUT CATALOG BASELINE_DATA EXPANSION_SELECTION
CATALOG defaults to data/historical-catalog.json. BASELINE_DATA defaults to data/nflverse.
Only explicitly linked catalog IDs, prior playable IDs, and the fixed additional 100-ID selection are imported.
The complete original importer validations and scoring rules are retained.
"""
from collections import Counter,defaultdict
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT.parent/'data-source/nflverse'
OUT=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'data/nflverse';OUT.mkdir(parents=True,exist_ok=True)
YEARS=list(range(1999,2027)); CUTOFF='2026-10-01'
BASELINE=pathlib.Path(sys.argv[4]) if len(sys.argv)>4 else ROOT/'data/nflverse'
CATALOG=pathlib.Path(sys.argv[3]) if len(sys.argv)>3 else ROOT/'data/historical-catalog.json'
EXPANSION=pathlib.Path(sys.argv[5]) if len(sys.argv)>5 else ROOT/'data/playable-expansion.json'
EXPANSION_RAW=EXPANSION.read_bytes(); expansion=json.loads(EXPANSION_RAW)
assert isinstance(expansion,list) and len(expansion)==100,'Exactly 100 explicitly selected additional players are required'
EXTRA_BY_ID={p['id']:p for p in expansion}; EXTRAIDS=set(EXTRA_BY_ID)
assert len(EXTRAIDS)==100 and all(p['id']==p['gsisId']==p['playableId'] for p in expansion),'Duplicate or inconsistent expansion identity'
assert all(re.fullmatch(r'00-\d{7}',i) for i in EXTRAIDS),'Invalid expansion GSIS identity'
assert Counter(p['position'] for p in expansion)==Counter({'QB':21,'RB':30,'WR':37,'TE':12}),'Explicit selection position counts changed'
assert all(p.get('legend') is False and p.get('careerVerified') is False for p in expansion),'New selections must not make unverified badge or career claims'
CATALOG_RAW=CATALOG.read_bytes(); catalog=json.loads(CATALOG_RAW)
if isinstance(catalog,dict):catalog=catalog.get('profiles',catalog.get('players',catalog.get('catalog')))
assert isinstance(catalog,list) and len(catalog)==400,'A final, explicit 400-player catalog is required'
assert Counter(p['position'] for p in catalog)==Counter({'QB':100,'RB':100,'WR':100,'TE':100}),'Exactly 100 profiles per position are required'
assert len({p['id'] for p in catalog})==400,'Duplicate catalog profile IDs'
OLD=json.loads((BASELINE/'athletes.json').read_text()); OLD_BY_ID={a['id']:a for a in OLD}; OLDIDS={a['id'] for a in OLD if a['position']!='DEF'}
BASELINE_MANIFEST=json.loads((BASELINE/'manifest.json').read_text())
assert not EXTRAIDS & set(OLD_BY_ID),'This bounded expansion must contain only previously absent athletes'
assert hashlib.sha256(CATALOG_RAW).hexdigest()==BASELINE_MANIFEST['catalogSelection']['sha256'],'The original editorial catalog must remain byte-identical'
BASELINE_MAPPING_BYTES=(BASELINE/'catalog-playable-map.json').read_bytes()
BASELINE_MAPPINGS=json.loads(BASELINE_MAPPING_BYTES)
OLD_RECORD_BYTES=(BASELINE/'records.json').read_bytes()
OLD_RECORD_ROWS={ (r[0],r[3]):r for r in json.loads(OLD_RECORD_BYTES) }
BASELINE_HASHES={name:hashlib.sha256((BASELINE/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json']}
# A bounded expansion must use the exact previously verified source snapshot.
for entry in BASELINE_MANIFEST['sourceFiles']:
 path=SOURCE/entry['file']
 assert path.is_file() and path.stat().st_size==entry['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],f'Source snapshot changed: {path.name}'
TEAMS={'ARI':'Arizona','ATL':'Atlanta','BAL':'Baltimore','BUF':'Buffalo','CAR':'Carolina','CHI':'Chicago','CIN':'Cincinnati','CLE':'Cleveland','DAL':'Dallas','DEN':'Denver','DET':'Detroit','GB':'Green Bay','HOU':'Houston','IND':'Indianapolis','JAX':'Jacksonville','KC':'Kansas City','LA':'Los Angeles Rams','LAC':'Los Angeles Chargers','LV':'Las Vegas','MIA':'Miami','MIN':'Minnesota','NE':'New England','NO':'New Orleans','NYG':'New York Giants','NYJ':'New York Jets','PHI':'Philadelphia','PIT':'Pittsburgh','SEA':'Seattle','SF':'San Francisco','TB':'Tampa Bay','TEN':'Tennessee','WAS':'Washington'}
ALIASES={'OAK':'LV','SD':'LAC','STL':'LA'}
def norm(x):return ALIASES.get(x,x)
COLORS=['#b6f34d','#82a9ff','#f0b57c','#bc9eff']
STAT_KEYS=['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','fumblesLost','twoPoint','returnTD','sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed','fumbleRecoveryTD']
HOF=json.loads((BASELINE/'hof-map.json').read_text())
DISPLAY_NAMES={'00-0022922':'Kellen Winslow II'}
assert HOF['Peyton Manning']['year']==2021 and HOF['Drew Brees']['year']==2026
def rows(name):
 with (SOURCE/name).open() as f:return list(csv.DictReader(f))
def number(r,key):
 value=r[key]
 if value in ('','NA',None):raise ValueError(f'Missing {key} in {r.get("game_id")}')
 n=float(value);assert n==n and abs(n)!=float('inf')
 return int(n) if n.is_integer() else n
schedule={r['game_id']:r for r in rows('games.csv') if int(r['season']) in YEARS and r['gameday']<=CUTOFF and r['home_score']!='' and r['away_score']!=''}
for r in schedule.values():
 for k in ['home_team','away_team']:r[k]=norm(r[k])
players=[];teams=[];excluded=[];rawPlayerRows=0
for year in YEARS:
 for r in rows(f'stats_player_week_{year}.csv'):
  rawPlayerRows+=1
  r['player_display_name']=DISPLAY_NAMES.get(r['player_id'],r['player_display_name'])
  if r['position'] not in ('QB','RB','FB','WR','TE'):continue
  if r['game_id'] not in schedule:continue
  if not r['team'] or not r['opponent_team']:
   excluded.append({'type':'player','gameId':r['game_id'],'name':r['player_display_name'],'reason':'Missing team/opponent in source'});continue
  players.append(r)
 for r in rows(f'stats_team_week_{year}.csv'):
  if r['game_id'] not in schedule:continue
  if not r['team'] or not r['opponent_team']:
   excluded.append({'type':'team','gameId':r['game_id'],'reason':'Unassigned extra team aggregate in source; not a franchise record'});continue
  teams.append(r)
assert len({(r['game_id'],r['team']) for r in teams})==len(teams)
assert len({(r['game_id'],r['player_id']) for r in players})==len(players)
teamCounts=Counter(r['game_id'] for r in teams)
badGames={g for g in schedule if teamCounts[g]!=2}
badGames.add('2011_13_DET_NO')
excluded.append({'type':'game','gameId':'2011_13_DET_NO','reason':'Known raw PBP corruption; nflverse-pbp issue99; withheld'})
for g in sorted(badGames):excluded.append({'type':'game','gameId':g,'reason':'Missing or malformed team-game coverage; entire game withheld'})
for r in teams:
 g=schedule[r['game_id']];team=norm(r['team'])
 if team not in (g['home_team'],g['away_team']):badGames.add(r['game_id']);continue
 pts=number(g,'home_score' if team==g['home_team'] else 'away_score')
 lower=6*(number(r,'passing_tds')+number(r,'rushing_tds'))+3*number(r,'fg_made')+number(r,'pat_made')
 if lower>pts:
  badGames.add(r['game_id']);excluded.append({'type':'game','gameId':r['game_id'],'team':team,'reason':'Offensive scoring lower bound exceeds final score; entire game withheld'})
schedule={g:r for g,r in schedule.items() if g not in badGames}
players=[r for r in players if r['game_id'] in schedule]
teams=[r for r in teams if r['game_id'] in schedule]
assert Counter(r['game_id'] for r in teams)==Counter({g:2 for g in schedule})
print('Read source rows',rawPlayerRows,'eligible',len(players),'teams',len(teams),'exclusions',len(excluded),flush=True)
groups=defaultdict(list)
for r in players:groups[r['player_id']].append(r)
latest={i:max(rs,key=lambda r:(schedule[r['game_id']]['gameday'],r['game_id'])) for i,rs in groups.items()}
pos={i:('RB' if r['position']=='FB' else r['position']) for i,r in latest.items()}
points={i:sum(number(r,'fantasy_points_ppr') for r in rs) for i,rs in groups.items()}
catalog_by_playable={}; mappings=[]
for profile in catalog:
 linked=profile.get('playableId')
 # Source IDs supplied as profile IDs are explicit identity links, never fuzzy matches.
 if not linked and profile['id'] in groups:linked=profile['id']
 if linked:
  assert linked in groups,f"Catalog linked ID has no eligible verified records: {profile['id']} -> {linked}"
  assert linked not in catalog_by_playable,f"Two profiles link to the same athlete: {linked}"
  assert profile['position']==OLD_BY_ID.get(linked,{}).get('position',pos[linked]),f"Position mismatch for {profile['id']} -> {linked}"
  catalog_by_playable[linked]=profile
  loaded=sorted({int(r['season']) for r in groups[linked]})
  if profile.get('careerStart') is not None and profile.get('careerEnd') is not None:
   assert int(profile['careerStart'])<=min(loaded) and int(profile['careerEnd'])>=max(loaded),f"Loaded games fall outside declared career range: {profile['id']}"
  mappings.append({'profileId':profile['id'],'name':profile['name'],'position':profile['position'],'playableId':linked,'archiveSeasons':loaded,'archiveFirstSeason':min(loaded),'archiveLastSeason':max(loaded),'gameCount':len(groups[linked]),'previouslyPlayable':linked in OLDIDS})
 else:
  mappings.append({'profileId':profile['id'],'name':profile['name'],'position':profile['position'],'playableId':None,'archiveSeasons':[],'gameCount':0,'previouslyPlayable':False})
assert not EXTRAIDS & set(catalog_by_playable),'Expansion may not replace catalog entries'
for i,profile in EXTRA_BY_ID.items():
 assert i in groups,f'Expansion identity has no eligible source records: {i}'
 selected=groups[i]; last=latest[i]
 assert profile['name']==last['player_display_name'],f'Expansion source name mismatch: {i}'
 assert profile['position']==pos[i] and profile['sourcePosition']==last['position'],f'Expansion position mismatch: {i}'
 loaded=sorted({int(r['season']) for r in selected})
 assert loaded==profile['archiveSeasons'] and min(loaded)==profile['archiveFirstSeason'] and max(loaded)==profile['archiveLastSeason'],f'Expansion loaded window mismatch: {i}'
 assert len(selected)==profile['gameCount'] and sum(r['season_type']=='REG' for r in selected)==profile['regularSeasonGameCount'],f'Expansion record-count mismatch: {i}'
 for source in profile['sourceFiles']:
  assert source in BASELINE_MANIFEST['sourceFiles'],f'Unverified expansion source file: {i}'
# Retain the prior catalog mapping bytes including its historical import provenance.
strip_previous=lambda values:[{k:v for k,v in x.items() if k!='previouslyPlayable'} for x in values]
assert strip_previous(mappings)==strip_previous(BASELINE_MAPPINGS),'Catalog mapping identities or loaded coverage changed'
mappings=BASELINE_MAPPINGS
chosen=set(OLDIDS)|set(catalog_by_playable)|EXTRAIDS
assert OLDIDS<=chosen
print('Chosen',len(chosen),'all eligible',len(groups),Counter(pos[i] for i in chosen),'catalog linked',len(catalog_by_playable),flush=True)
def_tds=Counter();st_tds=Counter();offensive_opponent_recoveries=Counter();pbp_counts={};pbp_seen=set();pbp_final={}
for year in YEARS:
 count=0
 with gzip.open(SOURCE/f'play_by_play_{year}.csv.gz','rt') as f:
  for r in csv.DictReader(f):
   count+=1
   if r['game_id'] not in schedule:continue
   pbp_seen.add(r['game_id'])
   if r.get('total_home_score') not in ('',None) and r.get('total_away_score') not in ('',None):pbp_final[r['game_id']]=(float(r['total_home_score']),float(r['total_away_score']))
   if r['fumble'] in ('1','1.0') and r['special'] not in ('1','1.0'):
    for index in (1,2):
     fumbled=norm(r[f'fumbled_{index}_team']);recovered=norm(r[f'fumble_recovery_{index}_team'])
     if fumbled and recovered and fumbled!=recovered and recovered==norm(r['posteam']):offensive_opponent_recoveries[(r['game_id'],recovered)]+=1
   if r['touchdown'] not in ('1','1.0') or r['two_point_attempt'] in ('1','1.0') or r['extra_point_attempt'] in ('1','1.0'):continue
   tdteam=norm(r['td_team']);assert tdteam in TEAMS,f'Unresolved touchdown team {r["game_id"]}'
   key=(r['game_id'],tdteam)
   if r['special'] in ('1','1.0'):st_tds[key]+=1
   elif tdteam==norm(r['defteam']):def_tds[key]+=1
 pbp_counts[str(year)]=count;print('PBP',year,count,flush=True)
assert pbp_seen==set(schedule),'PBP lacks completed games'
scoreDiscrepancies=[{'gameId':g,'pbp':pbp_final.get(g),'schedule':(number(r,'home_score'),number(r,'away_score'))} for g,r in schedule.items() if pbp_final.get(g)!=(number(r,'home_score'),number(r,'away_score'))]
assert not scoreDiscrepancies,str(scoreDiscrepancies)

athletes=[];records=[];differences=[]
def append_record(r,entity_id,stats):
 game=schedule[r['game_id']];team=norm(r['team']);opp=norm(r['opponent_team'])
 assert team in (game['home_team'],game['away_team'])
 expected=game['away_team'] if team==game['home_team'] else game['home_team']
 assert opp==expected,(r['game_id'],team,opp,expected)
 records.append([entity_id,int(r['season']),int(r['week']),r['game_id'],game['gameday'],team,opp,r['season_type']]+[stats[k] for k in STAT_KEYS])
old_order={a['id']:i for i,a in enumerate(OLD)}
catalog_order={id:index for index,id in enumerate(catalog_by_playable)}
for i in sorted(chosen,key=lambda i:(old_order.get(i,999),catalog_order.get(i,999),i)):
 selected=groups[i];last=latest[i];name=OLD_BY_ID.get(i,{}).get('name',catalog_by_playable.get(i,{}).get('name',last['player_display_name']));years=sorted({int(r['season']) for r in selected});p=OLD_BY_ID.get(i,{}).get('position',pos[i])
 a={'id':i,'name':name,'position':p,'club':last['team'],'number':''.join(x[0] for x in name.split())[:2],'style':f'{years[0]}–{years[-1]} archive · {len(selected)} games','legend':name in HOF and i not in EXTRAIDS,'color':COLORS[len(athletes)%4],'seasons':years,'gameCount':len(selected),'gamesBySeason':dict(sorted(Counter(str(r['season']) for r in selected).items()))}
 if name in HOF and i not in EXTRAIDS:a.update(hallOfFameYear=HOF[name]['year'],hallOfFameSource=HOF[name]['url'])
 if i in OLD_BY_ID:
  preserved=copy.deepcopy(OLD_BY_ID[i])
  for key in ('seasons','gameCount','gamesBySeason'):preserved[key]=a[key]
  if preserved['gameCount']!=OLD_BY_ID[i]['gameCount']:preserved['style']=a['style']
  a=preserved
 athletes.append(a)
 for r in selected:
  s=dict.fromkeys(STAT_KEYS,0)
  for field,source in [('passingYards','passing_yards'),('passingTD','passing_tds'),('interceptions','passing_interceptions'),('rushingYards','rushing_yards'),('rushingTD','rushing_tds'),('receptions','receptions'),('receivingYards','receiving_yards'),('receivingTD','receiving_tds'),('fumblesLost','fumbles_lost_total'),('returnTD','special_teams_tds'),('fumbleRecoveryTD','fumble_recovery_tds')]:s[field]=number(r,source)
  s['twoPoint']=sum(number(r,k) for k in ['passing_2pt_conversions','rushing_2pt_conversions','receiving_2pt_conversions'])
  append_record(r,i,s)
  expected=s['passingYards']/25+s['passingTD']*4-s['interceptions']*2+(s['rushingYards']+s['receivingYards'])/10+(s['rushingTD']+s['receivingTD']+s['returnTD']+s['fumbleRecoveryTD'])*6+s['receptions']-s['fumblesLost']*2+s['twoPoint']*2
  delta=round(expected-number(r,'fantasy_points_ppr'),2)
  fumble_delta=number(r,'fumbles_lost_total')-sum(number(r,k) for k in ['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost'])
  assert delta==s['fumbleRecoveryTD']*6-fumble_delta*2,(name,r['game_id'],delta)
  if delta:differences.append({'gameId':r['game_id'],'player':name,'delta':delta})
for team,name in TEAMS.items():
 selected=[r for r in teams if r['team']==team];i='franchise-'+team.lower();years=sorted({int(r['season']) for r in selected})
 athletes.append({'id':i,'name':name+' Defense','position':'DEF','club':team,'number':team,'style':'Franchise D/ST · '+str(len(selected))+' games','legend':False,'color':COLORS[len(athletes)%4],'seasons':years,'gameCount':len(selected),'gamesBySeason':dict(sorted(Counter(str(r['season']) for r in selected).items()))})
 for r in selected:
  s=dict.fromkeys(STAT_KEYS,0);s['sacks']=number(r,'def_sacks');s['defensiveInterceptions']=number(r,'def_interceptions');s['fumbleRecoveries']=number(r,'fumble_recovery_opp')-offensive_opponent_recoveries[(r['game_id'],team)];assert s['fumbleRecoveries']>=0
  s['safeties']=number(r,'def_safeties');s['blockedKicks']=sum(number(r,k) for k in ['def_punt_blocks','def_pat_blocks','def_fg_blocks']);s['defensiveTD']=def_tds[(r['game_id'],team)];s['returnTD']=st_tds[(r['game_id'],team)];g=schedule[r['game_id']];s['pointsAllowed']=number(g,'away_score' if team==g['home_team'] else 'home_score');append_record(r,i,s)
records.sort(key=lambda r:(r[0],r[4],r[3]));assert len({(r[0],r[3]) for r in records})==len(records)
oldrecords=list(OLD_RECORD_ROWS.values());newmap={(r[0],r[3]):r for r in records};assert all(newmap.get((r[0],r[3]))==r for r in oldrecords),'Existing published records changed'
# Copy retained rows from the baseline to preserve their exact JSON scalar representation.
records=[OLD_RECORD_ROWS.get((r[0],r[3]),r) for r in records]
# Preserve every prior metadata object; only coverage fields may grow.
athletes=[copy.deepcopy(OLD_BY_ID[a['id']]) if a['position']=='DEF' else a for a in athletes]
for a in athletes:
 if a['id'] in OLD_BY_ID:
  old=OLD_BY_ID[a['id']]
  assert all(a[k]==v for k,v in old.items() if k not in ('seasons','gameCount','gamesBySeason','style')),'Existing athlete identity or metadata changed'
  assert a['gameCount']>=old['gameCount'] and set(a['seasons'])>=set(old['seasons'])
  if a['gameCount']==old['gameCount']:assert a==old,'Unchanged coverage requires unchanged metadata'
assert sorted(badGames)==BASELINE_MANIFEST['excludedGameIds'],'Previously verified exclusion set changed'
assert len(teams)==BASELINE_MANIFEST['teamRows'] and [r for r in records if r[0].startswith('franchise-')]==[r for r in oldrecords if r[0].startswith('franchise-')],'Defense records changed'
covered=max(r[4] for r in records)
coverage={'earlySeasonWarning':'1999–2000 source data are no longer maintained by nflfastR; known invalid games are excluded.','provider':'nflverse','seasons':YEARS,'playerSeasons':YEARS,'defenseSeasons':YEARS,'seasonTypes':['REG','POST'],'coveredThrough':covered,'preseasonVerified':False,'sourceUrl':'https://github.com/nflverse/nflverse-data','licenseUrl':'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md','termsUrl':'https://nflverse.nflverse.com/#terms-of-use','note':f'Catalog: 100 profiles at each of QB/RB/WR/TE. Playable roster: {len(chosen)} skill players and all 32 franchise defenses. The preserved catalog plus 100 explicitly selected additional identities provide verified playable game logs. Loaded game records start in 1999; earlier career years are profiles only and must not be read as playable coverage. Not every NFL player or snap-only appearance. Regular season and playoffs; no preseason. 2026 includes weeks 1–3 through September 28. Frozen snapshot; not live-updating.','playerCount':len(chosen),'defenseCount':32,'performanceCount':len(records),'gameCount':len(schedule),'importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'defenseScoringNote':'D/ST points allowed counts the opponent’s entire final score, including points scored by its defense. Touchdowns include defensive fumble returns and special-teams scores.','rightsNote':'nflverse-data publishes under CC BY 4.0. NFL data remain subject to their respective owners’ terms; this is not an upstream-rights guarantee or NFL endorsement.'}
manifest={'coverage':coverage,'recordColumns':['athleteId','season','week','gameId','date','teamAtTime','opponent','seasonType']+STAT_KEYS,'countsBySeason':dict(sorted(Counter(str(r[1]) for r in records).items())),'countsBySeasonType':dict(Counter(r[7] for r in records)),'playerRows':len(records)-len(teams),'teamRows':len(teams),'rawPlayerRows':rawPlayerRows,'allEligiblePlayerCount':len(groups),'selectedPlayerCount':len(chosen),'rosterSelection':'All prior published athletes, unchanged 400-profile editorial catalog links, and a separate fixed 100-GSIS-ID selection of additional playable athletes. No importer ranking, replacement, fuzzy name matching, or career-range inference.','pbpRowsBySeason':pbp_counts,'checks':{'uniqueEntityGame':True,'allGamesCompletedScheduleJoined':True,'noMissingScoringValues':True,'all32Franchises':True,'bothTeamsPerGame':True,'allCompletedGamesHavePbp':True,'playerPprReconcilesWithDocumentedDifferences':True,'preservesEveryPriorPublishedRecord':True,'pbpFinalScoreMatchesSchedule':True},'pprDifferencesFromSourceDefaults':differences,'excludedSourceRows':excluded,'excludedGameIds':sorted(badGames),'franchiseAliasMap':ALIASES,'offensiveOpponentRecoveriesExcluded':[{'gameId':game,'team':team,'count':count} for (game,team),count in sorted(offensive_opponent_recoveries.items())],'sourceFiles':[],'hallOfFameIndex':'https://www.profootballhof.com/hall-of-famers/years','knownSourceIssues':['https://github.com/nflverse/nflverse-pbp/issues/99','https://github.com/nflverse/nflverse-pbp/issues/92','https://github.com/nflverse/nflverse-data/issues/98'],'earlySeasonWarning':'nflfastR6.0 no longer maintains1999–2000 because of inconsistent sources; available data remain in this snapshot with documented exclusions.','maintenanceSource':'https://nflfastr.com/news/index.html'}
manifest['identityCorrections']=copy.deepcopy(BASELINE_MANIFEST.get('identityCorrections',[]))
manifest['hallOfFameVerifiedPlayerCount']=sum(bool(a.get('legend')) for a in athletes if a['position']!='DEF')
manifest['catalogSelection']={'catalogFile':CATALOG.name,'sha256':hashlib.sha256(CATALOG_RAW).hexdigest(),'profileCount':len(catalog),'positionCounts':dict(Counter(p['position'] for p in catalog)),'linkedProfileCount':len(catalog_by_playable),'profileOnlyCount':len(catalog)-len(catalog_by_playable),'newPlayablePlayerCount':len(set(catalog_by_playable)-OLDIDS),'retainedPriorSkillPlayerCount':len(OLDIDS),'existingPlayersNotInCatalog':sorted(OLDIDS-set(catalog_by_playable)),'mappingFile':'catalog-playable-map.json'}
coverage.update(catalogProfileCount=len(catalog),catalogLinkedPlayerCount=len(catalog_by_playable),catalogProfileOnlyCount=len(catalog)-len(catalog_by_playable),additionalPlayablePlayerCount=len(EXTRAIDS))
manifest['additionalPlayableSelection']={'selectionFile':EXPANSION.name,'sha256':hashlib.sha256(EXPANSION_RAW).hexdigest(),'playerCount':len(EXTRAIDS),'positionCounts':dict(Counter(p['position'] for p in expansion)),'ids':sorted(EXTRAIDS),'addedPerformanceCount':sum(len(groups[i]) for i in EXTRAIDS),'sourceSnapshotUnchanged':True,'fullCareerClaims':False,'newHallOfFameAssignments':False,'selectionNotRanking':True,'provenanceFile':'playable-expansion-source.json'}
manifest['baselinePreservation']={'baselineFileSha256':BASELINE_HASHES,'priorAthleteCount':len(OLD),'priorPerformanceCount':len(oldrecords),'priorPlayerCount':len(OLDIDS),'priorDefensePerformanceCount':sum(r[0].startswith('franchise-') for r in oldrecords),'retainedPerformanceCount':len(oldrecords),'retainedAthleteCount':len(OLD),'addedPerformanceCount':len(records)-len(oldrecords),'addedAthleteCount':len(athletes)-len(OLD),'scoringAndExclusionsUnchanged':True,'defenseRowsUnchanged':True,'sourceSnapshotChecksumsMatch':True}
manifest['checks'].update(explicitCatalogAndExpansionIdsOnly=True,preservesEveryPriorAthleteMetadata=True,exactly100CatalogProfilesPerPosition=True,defenseRowsUnchanged=True,sourceSnapshotChecksumsMatch=True)
(OUT/'catalog-playable-map.json').write_bytes(BASELINE_MAPPING_BYTES)
(OUT/'playable-expansion-source.json').write_bytes(EXPANSION_RAW)
assert len(athletes)-len(OLD)==100 and len(records)-len(oldrecords)==9872,'Bounded expansion size changed'
assert all(a==OLD_BY_ID[a['id']] for a in athletes if a['id'] in OLD_BY_ID),'Prior athlete metadata changed'
assert all(not a['legend'] and 'hallOfFameYear' not in a and 'hallOfFameSource' not in a for a in athletes if a['id'] in EXTRAIDS),'New Hall of Fame assignment is forbidden'
for file in sorted(SOURCE.iterdir()):
 if file.name.startswith(('stats_player_week_','stats_team_week_','play_by_play_')) and not file.name.endswith('.part') or file.name=='games.csv':
  tag='pbp' if file.name.startswith('play_by_play') else ('stats_player' if file.name.startswith('stats_player') else 'stats_team');url='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv' if file.name=='games.csv' else f'https://github.com/nflverse/nflverse-data/releases/download/{tag}/{file.name}'
  manifest['sourceFiles'].append({'file':file.name,'url':url,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
for name,data in [('athletes.json',athletes),('records.json',records),('coverage.json',coverage),('manifest.json',manifest)]: (OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'hof-map.json').write_text(json.dumps(HOF,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'LICENSE-nflverse.md').write_bytes((SOURCE/'LICENSE.md').read_bytes());print(json.dumps({'athletes':len(athletes),'performances':len(records),'coveredThrough':covered,'seasonCounts':manifest['countsBySeason'],'pprReconciledDifferences':len(differences)},indent=2))

row_serial=lambda r:json.dumps(r,ensure_ascii=False,separators=(',',':')).encode()
assert b'['+b','.join(row_serial(r) for r in oldrecords)+b']\n'==OLD_RECORD_BYTES,'Baseline row serialization was not byte-equivalent'
newmap={(r[0],r[3]):row_serial(r) for r in records}
assert all(newmap[(r[0],r[3])]==row_serial(r) for r in oldrecords),'A retained row changed bytes'
audit={'passed':True,'baseline':manifest['baselinePreservation'],'counts':{'athletes':len(athletes),'players':len(chosen),'defenses':32,'performances':len(records),'playerPerformances':manifest['playerRows'],'defensePerformances':manifest['teamRows'],'games':len(schedule),'catalogProfiles':len(catalog),'catalogPlayableProfiles':len(catalog_by_playable),'catalogProfileOnly':len(catalog)-len(catalog_by_playable)},'oldRowsByteEquivalent':True,'oldAthleteObjectsUnchanged':all(next(a for a in athletes if a['id']==o['id'])==o for o in OLD),'defenseObjectsUnchanged':all(next(a for a in athletes if a['id']==o['id'])==o for o in OLD if o['position']=='DEF'),'defenseRowsByteEquivalent':True,'allPprRowsReconcile':True,'addedPlayerCount':len(EXTRAIDS),'originalCatalogBytesUnchanged':True,'originalCatalogMappingBytesUnchanged':True,'onlyApproved100IdsAdded':True,'noNewHallOfFameAssignments':True,'pprDifferenceCount':len(differences),'excludedGameCount':len(badGames),'outputSha256':{name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json','catalog-playable-map.json']}}
(OUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
print('AUDIT PASSED: retained rows byte-equivalent; prior metadata and D/ST data unchanged',flush=True)
