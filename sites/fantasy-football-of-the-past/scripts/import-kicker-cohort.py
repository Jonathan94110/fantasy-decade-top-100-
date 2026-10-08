"""Integrate the reviewed, finite kicker asset; never change prior archive rows."""
import json,pathlib,sys,hashlib
source=pathlib.Path(sys.argv[1]);root=pathlib.Path(__file__).resolve().parent.parent
players=json.loads((source/'players.json').read_text());records=json.loads((source/'records.json').read_text())
assert len(players)==40 and len(records)>4563
keys=['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','fumblesLost','twoPoint','returnTD','sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed','fumbleRecoveryTD']
rows=[]
for p in records:
 k=p['kicking'];s=p['stats'];assert all(isinstance(v,(int,float)) for v in s.values());assert k['fg_att']==k['fg_made']+k['fg_missed']+k['fg_blocked'];assert k['pat_att']==k['pat_made']+k['pat_missed']+k['pat_blocked']
 values=[s.get(key,0) for key in keys] # Only non-applicable team-defense categories lack an offensive field.
 assert all(key in s for key in keys if key not in ['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed'])
 kick=[sum(k[x] for x in ['fg_made_0_19','fg_made_20_29','fg_made_30_39']),k['fg_made_40_49'],k['fg_made_50_59']+k['fg_made_60_'],k['fg_missed'],k['fg_blocked'],k['pat_made'],k['pat_missed'],k['pat_blocked']]
 rows.append([p['athleteId'],p['season'],p['week'],p['gameId'],p['date'],p['teamAtTime'],p['opponent'],p['seasonType'],*values,*kick])
athletes=[]
for p in players:
 teams=list(dict.fromkeys(t for year in p['teamsBySeason'].values() for t in year))
 a={'id':p['id'],'name':p['name'],'position':'K','club':' · '.join(teams),'number':'K','style':'Verified kicker','color':'#e3c783','seasons':p['seasons'],'gameCount':p['gameCount'],'gamesBySeason':p['gamesBySeason']}
 if p['id'] in ['00-0016919','00-0000282']:
  a.update({'legend':True,'hallOfFameYear':2026 if p['id']=='00-0016919' else 2017,'hallOfFameSource':'https://www.profootballhof.com/players/'+('adam-vinatieri' if p['id']=='00-0016919' else 'morten-andersen')})
 athletes.append(a)
for name,data in [('kicker-athletes.json',athletes),('kicker-records.json',rows)]:
 (root/'data/nflverse'/name).write_text(json.dumps(data,separators=(',',':'))+'\n')
manifest=json.loads((source/'manifest.json').read_text());manifest['researchAssetStatus']=manifest.pop('status');manifest['status']='verified-kicker-extension';manifest.pop('noSiteEditsOrProductionImport',None);
for asset in manifest['sourceFiles'].values():asset.pop('absolutePath',None)
manifest['integration']={'playerCount':len(athletes),'performanceCount':len(rows),'recordFields':keys+['fieldGoalsShort','fieldGoals40','fieldGoals50','fieldGoalsMissed','fieldGoalsBlocked','extraPointsMade','extraPointsMissed','extraPointsBlocked'],'kickerRecordsSha256':hashlib.sha256((root/'data/nflverse/kicker-records.json').read_bytes()).hexdigest(),'originalArchiveUnchanged':True}
(root/'data/nflverse/kicker-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Integrated {len(athletes)} verified kickers and {len(rows)} performances into separate files; prior source files unchanged.')
