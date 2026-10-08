#!/usr/bin/env python3
"""Independently verify a 400-profile playable expansion against baseline data."""
import argparse, collections, hashlib, json, math, pathlib, re
p=argparse.ArgumentParser();p.add_argument('baseline',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('catalog',type=pathlib.Path);args=p.parse_args()
load=lambda path:json.loads(path.read_bytes())
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
assert {x['id'] for x in a if x['position']!='DEF'}==playable|{x['id'] for x in old if x['position']!='DEF'},'Unapproved selection was added'
for x in links:
 if x['playableId']:
  y=aids[x['playableId']];assert x['position']==y['position'] and x['gameCount']==y['gameCount'] and x['archiveSeasons']==y['seasons']
 else:assert x['gameCount']==0 and x['archiveSeasons']==[]
assert all(m['checks'].values())
result={'passed':True,'checks':['literal prior performance row bytes identical','all prior athlete metadata objects identical','all 32 D/ST metadata objects and all D/ST row bytes identical','exactly 100 catalog profiles in each current fantasy position','no unapproved player additions','all coverage counts and per-athlete loaded seasons reconcile','no games before 1999 or excluded games','completed source date cutoff remains September 28, 2026','unique entity-game IDs and finite scoring inputs','exactly two D/ST rows per included game','all mappings point to verified archived identities'],'counts':{'priorAthletes':len(old),'athletes':len(a),'priorPerformances':len(older),'performances':len(rr),'addedPerformances':len(rr)-len(older),'playablePlayers':c['playerCount'],'catalogProfiles':400,'linkedCatalogProfiles':len(playable),'profileOnlyCatalogProfiles':400-len(playable),'defenseRows':m['teamRows'],'games':c['gameCount'],'excludedGames':len(excluded)},'baselineSha256':{name:hashlib.sha256((args.baseline/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json']},'outputSha256':{name:hashlib.sha256((args.output/name).read_bytes()).hexdigest() for name in ['athletes.json','records.json','coverage.json','manifest.json','catalog-playable-map.json']}}
(args.output/'independent-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
