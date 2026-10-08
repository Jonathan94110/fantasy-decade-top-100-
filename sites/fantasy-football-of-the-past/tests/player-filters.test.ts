import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';

registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(error){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}}
});
const {ATHLETES,PERFORMANCES,athletesFor,performancePool}=await import('../lib/historical-data');
const {PLAYER_ERAS,matchesPlayableEra,historicalPreviewHref,consumedPerformanceYears}=await import('../lib/player-filters');
const {PROFILES,filterDraftAthletes,poolAvailability}=await import('../lib/era-catalog');
const {newLeague}=await import('../lib/game-engine');
const {newScoring}=await import('../lib/scoring-rules');
const byId=new Map(ATHLETES.map(athlete=>[athlete.id,athlete]));
const expectedIds=(era:number,used:string[]=[])=>{
 const consumed=new Set(used);
 return new Set(PERFORMANCES.filter(game=>!consumed.has(game.id)&&(!era||game.season>=era&&game.season<=era+9)).map(game=>game.athleteId));
};

test('era options include the unavailable fifties; Strict matches exact games including 1999-only nineties',()=>{
 assert.deepEqual(PLAYER_ERAS,[1950,1960,1970,1980,1990,2000,2010,2020]);
 for(const era of [0,...PLAYER_ERAS]){
  const rows=ATHLETES.filter(athlete=>matchesPlayableEra(athlete,era));
  assert.deepEqual(new Set(rows.map(athlete=>athlete.id)),expectedIds(era),`${era} verified games`);
  if(era&&era<1990)assert.equal(rows.length,0);
  if(era===1990)assert.ok(rows.every(athlete=>PERFORMANCES.some(game=>game.athleteId===athlete.id&&game.season===1999)));
 }
});

test('old profile career years never make an athlete playable in an unloaded decade',()=>{
 for(const name of ['Steve Young','Dan Marino']){
  const athlete=ATHLETES.find(row=>row.name===name)!;
  const profile=PROFILES.find(row=>row.athlete?.id===athlete.id)!;
  assert.ok(profile.firstYear<1990);assert.deepEqual(athlete.seasons,[1999]);
  assert.equal(matchesPlayableEra(athlete,1980),false);
  assert.equal(matchesPlayableEra(athlete,1990),true);
  assert.equal(filterDraftAthletes({position:'QB',era:1980,search:name}).length,0);
  assert.deepEqual(filterDraftAthletes({position:'QB',era:1990,search:name}).map(row=>row.id),[athlete.id]);
 }
 for(const era of [1960,1970,1980])assert.equal(ATHLETES.filter(athlete=>matchesPlayableEra(athlete,era)).length,0);
});

test('players spanning eras keep one stable identity and exhausted years drop out of the available filter',()=>{
 const brady=ATHLETES.find(athlete=>athlete.name==='Tom Brady')!;
 for(const era of [2000,2010,2020])assert.equal(matchesPlayableEra(brady,era),true);
 const used=PERFORMANCES.filter(game=>game.athleteId===brady.id&&game.season>=2010&&game.season<=2019).map(game=>game.id);
 const before=structuredClone(brady),consumed=[...used];
 assert.equal(matchesPlayableEra(brady,2010,used),false);
 assert.equal(matchesPlayableEra(brady,2000,used),true);assert.equal(matchesPlayableEra(brady,2020,used),true);
 assert.deepEqual(brady,before);assert.deepEqual(used,consumed);
 const exhausted=PERFORMANCES.filter(game=>game.athleteId===brady.id).map(game=>game.id);
 for(const era of [0,...PLAYER_ERAS])assert.equal(matchesPlayableEra(brady,era,exhausted),false,`${era} exhausted`);
 assert.equal(ATHLETES.filter(athlete=>athlete.id===brady.id&&matchesPlayableEra(athlete,2010)).length,1);
});

test('remaining-game era matches agree with the independent archive for every athlete',()=>{
 const used=PERFORMANCES.filter(game=>game.season===1999||game.season>=2010&&game.season<=2019).map(game=>game.id);
 for(const era of [0,...PLAYER_ERAS]){
  const actual=new Set(ATHLETES.filter(athlete=>matchesPlayableEra(athlete,era,used)).map(athlete=>athlete.id));
  assert.deepEqual(actual,expectedIds(era,used),`${era} remaining verified games`);
 }
});

test('zero-count years and shared names cannot inherit another stable player identity’s seasons',()=>{
 const first={...ATHLETES.find(athlete=>athlete.position==='QB')!,name:'Shared name',id:'filter-one',seasons:[1980,1999],gamesBySeason:{1980:0,1999:1},gameCount:1};
 const second={...first,id:'filter-two',seasons:[2010],gamesBySeason:{2010:1}};
 assert.equal(matchesPlayableEra(first,1980),false);assert.equal(matchesPlayableEra(first,1990),true);
 assert.equal(matchesPlayableEra(second,1990),false);assert.equal(matchesPlayableEra(second,2010),true);
 const used=['nflverse:filter-one:1999_01_A_B'];
 assert.equal(matchesPlayableEra(first,1990,used),false);
 assert.equal(matchesPlayableEra(second,2010,used),true);
});

test('position, era and name filters intersect without changing game scoring or source data',()=>{
 const league=newLeague('filter-state'),before=structuredClone(league),athletes=JSON.stringify(ATHLETES);
 const rows=filterDraftAthletes({position:'QB',era:2000,search:'  TOM BRADY  '});
 assert.equal(rows.length,1);assert.equal(rows[0].id,ATHLETES.find(athlete=>athlete.name==='Tom Brady')!.id);
 assert.equal(filterDraftAthletes({position:'WR',era:2000,search:'Tom Brady'}).length,0);
 assert.equal(filterDraftAthletes({position:'QB',era:1980,search:'Tom Brady'}).length,0);
 for(const row of filterDraftAthletes({position:'QB',era:0,search:''}))assert.equal(byId.get(row.id)?.position,'QB');
 assert.deepEqual(new Set(filterDraftAthletes({position:'QB',era:0,search:''}).map(row=>row.id)),new Set(ATHLETES.filter(row=>row.position==='QB').map(row=>row.id)));
 for(const era of PLAYER_ERAS)ATHLETES.filter(athlete=>matchesPlayableEra(athlete,era,league.used));
 assert.deepEqual(league,before);assert.equal(JSON.stringify(ATHLETES),athletes);
});

test('historical preview handoff retains position/era/search and exposes no draft instruction',()=>{
 const href=historicalPreviewHref('QB',1960,'Joe Montana & Joe Namath');
 const url=new URL(href,'https://fixture.local');
 assert.equal(url.pathname,'/historical-preview');assert.equal(url.searchParams.get('position'),'QB');
 assert.equal(url.searchParams.get('era'),'1960');assert.equal(url.searchParams.get('search'),'Joe Montana & Joe Namath');
 for(const key of url.searchParams.keys())assert.ok(['position','era','search'].includes(key),key);
 assert.equal(url.searchParams.has('draft'),false);
 assert.equal(historicalPreviewHref('QB',1960,'Joe Montana & Joe Namath'),href);
 for(const position of ['DEF','FLEX','ALL'] as const)assert.equal(new URL(historicalPreviewHref(position,1970),'https://fixture.local').searchParams.has('position'),false);
 assert.equal(historicalPreviewHref('ALL',2020,''),'/historical-preview');
 const bounded=new URL(historicalPreviewHref('K',1990,`  ${'x'.repeat(120)}  `),'https://fixture.local');
 assert.equal(bounded.searchParams.get('search')!.length,100);
 assert.equal(bounded.searchParams.get('position'),'K');assert.equal(bounded.searchParams.get('era'),'1990');
});


test('actual January 1994 source game exhausts its recorded 1993 season without changing dates or raw stats',()=>{
 const rules=newScoring(1,false,'historical');
 const athlete=athletesFor(rules).find(row=>row.name==='Troy Aikman');assert.ok(athlete);
 const pool=performancePool(athlete.id,rules);
 const january=pool.find(game=>game.gameId==='19940102-DAL-NYG');assert.ok(january);
 assert.equal(january.season,1993);assert.equal(january.date,'1994-01-02');
 assert.equal(january.id,`historical:${athlete.id}:1993:19940102-DAL-NYG`);
 assert.deepEqual(consumedPerformanceYears(athlete.id,[january.id]),[{year:1993}]);
 // Complete prefixes also preserve source identities containing colons.
 assert.deepEqual(consumedPerformanceYears('historical:player:fixture',['historical:historical:player:fixture:1993:19940102-DAL-NYG']),[{year:1993}]);
 const before=JSON.stringify({athlete,pool});
 const used=pool.filter(game=>game.id!==january.id).map(game=>game.id);
 assert.deepEqual(poolAvailability(athlete,used,rules),{count:1,seasons:[1993]});
 assert.equal(matchesPlayableEra(athlete,1990,used,rules),true);
 used.push(january.id);
 assert.deepEqual(poolAvailability(athlete,used,rules),{count:0,seasons:[]});
 assert.equal(matchesPlayableEra(athlete,1990,used,rules),false);
 assert.equal(matchesPlayableEra(athlete,0,used,rules),false);
 assert.equal(JSON.stringify({athlete,pool}),before);
});
