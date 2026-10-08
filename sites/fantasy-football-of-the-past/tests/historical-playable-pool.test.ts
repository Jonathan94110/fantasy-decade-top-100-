import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {DemoDraft} from '../lib/demo-draft-model';
import type {Season} from '../lib/season-model';

registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(error){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}}
});
const {ATHLETES,ALL_ATHLETES,PERFORMANCES,athletesFor,athleteFor,performancePool,lineupSlots,eligibleForSlot,score}=await import('../lib/historical-data');
const {LEGACY_SCORING,newScoring,scoringFor}=await import('../lib/scoring-rules');
const {drawPerformance,newLeague,lockLineup}=await import('../lib/game-engine');
const {newSeason,joinSeason,seasonAction,remainingGames,publicSeason,repairLineup}=await import('../lib/season-engine');
const {newDemoDraft,demoDraftAction}=await import('../lib/demo-draft-engine');
const {demoPickReason}=await import('../lib/demo-draft-model');
const {fantasyReplay,replayScore,historicalDrawLabel,fullReceipt}=await import('../lib/fantasy-replay');
const historical=newScoring(1,true,'historical'),strict=newScoring(1,true,'strict');
const catalog=athletesFor(historical),modernIds=new Set(ATHLETES.map(a=>a.id));
const older=catalog.filter(a=>!modernIds.has(a.id));
const sourcePin='bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356';
const publishedCoverage=JSON.parse(readFileSync(new URL('../public/historical-coverage.json',import.meta.url),'utf8')) as {sourceRevision:string;files:{file:string}[]};
const publishedSourceFiles=new Set(publishedCoverage.files.map(file=>file.file));
const offenseKeys=['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','returnTD'] as const;

function oldQuarterback(decade=1960){
 const result=older.find(a=>a.position==='QB'&&a.seasons.some(year=>year>=decade&&year<decade+10)&&performancePool(a.id,historical).filter(p=>p.season>=decade&&p.season<decade+10).length>=17);
 assert.ok(result,`Historical pool has a real ${decade}s QB with 17 eligible games`);return result;
}
function finishSolo(draft:DemoDraft){let saved=draft;while(saved.status==='draft'){const candidate=athletesFor(scoringFor(saved)).find(a=>!demoPickReason(saved,saved.humanTeamId,a.id));assert.ok(candidate,'A legal human pick remains');saved=demoDraftAction(saved,{action:'draft',athleteId:candidate.id});}return saved;}
function draftSixteen(){
 let season=newSeason('owner',{name:'Historical full field',teamName:'Owner',capacity:16,format:'seventeen',playoffTeams:6,kickers:true,scoringMode:'historical'},'HISTORICAL-SIXTEEN');
 for(let index=1;index<16;index++)season=joinSeason(season,`manager-${index}`,`Team ${index}`);
 season=seasonAction(season,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:Array.from({length:16},(_,index)=>index)});
 season=seasonAction(season,'owner',{action:'draft',athleteId:oldQuarterback().id});
 while(season.status==='draft')season=seasonAction(season,'owner',{action:'autopick'});
 return season;
}

test('Historical catalog adds eligible older identities without changing or admitting them to saved/Strict archives',()=>{
 assert.equal(ATHLETES.length,435);assert.equal(ATHLETES.filter(a=>a.position==='K').length,40);assert.equal(PERFORMANCES.length,68519);
 assert.ok(older.length>0);assert.equal(new Set(ALL_ATHLETES.map(a=>a.id)).size,ALL_ATHLETES.length);assert.equal(new Set(catalog.map(a=>a.id)).size,catalog.length);
 for(const ppr of [0,.5,1] as const)assert.deepEqual(athletesFor(newScoring(ppr,true,'historical')).map(a=>a.id),catalog.map(a=>a.id),'PPR changes do not selectively admit incomplete rows or careers');
 for(const rules of [LEGACY_SCORING,{...LEGACY_SCORING,version:2 as const},{...strict,version:3 as const,mode:undefined},{...strict,version:4 as const,mode:undefined},strict])assert.deepEqual(athletesFor(rules).map(a=>a.id),ATHLETES.map(a=>a.id));
 assert.ok(catalog.every(a=>a.gameCount>=17));assert.equal(catalog.filter(a=>a.position==='K').length,40);assert.ok(catalog.filter(a=>a.position==='K').every(a=>modernIds.has(a.id)));
 const originalPools=new Map<string,typeof PERFORMANCES>();for(const performance of PERFORMANCES){const pool=originalPools.get(performance.athleteId)||[];pool.push(performance);originalPools.set(performance.athleteId,pool);}
 for(const athlete of ATHLETES)assert.deepEqual(performancePool(athlete.id,strict),originalPools.get(athlete.id));
 for(const athlete of older){assert.equal(athleteFor(athlete.id,strict),undefined);assert.deepEqual(performancePool(athlete.id,strict),[]);assert.ok(!PERFORMANCES.some(p=>p.athleteId===athlete.id));}
 for(const decade of [1960,1970,1980,1990])oldQuarterback(decade);
});

test('every Historical career pool meets the 17-game floor with complete active inputs and regular-season records',()=>{
 let sourceRows=0,unknownExcluded=0;
 for(const athlete of catalog){
  const pool=performancePool(athlete.id,historical);assert.equal(pool.length,athlete.gameCount,athlete.id);assert.ok(pool.length>=17);assert.equal(new Set(pool.map(p=>p.id)).size,pool.length);
  assert.equal(pool.filter(p=>p.seasonType!=='REG').length,0,athlete.id);
  for(const performance of pool){
   assert.equal(performance.athleteId,athlete.id);assert.equal(performance.completed,true);assert.equal(performance.fictional,false);
   const required=athlete.position==='DEF'?['pointsAllowed','returnTD'] as const:offenseKeys;
   for(const field of required)assert.ok(typeof performance.stats[field]==='number'&&Number.isFinite(performance.stats[field]),`${performance.id}: ${field}`);
   for(const ppr of [0,.5,1] as const)assert.ok(Number.isFinite(score(performance.stats,athlete.position,newScoring(ppr,true,'historical'))));
   if(performance.id.startsWith('historical:')){
    sourceRows++;assert.equal(performance.historicalModeOnly,true);assert.equal(performance.sourceRevision,sourcePin);assert.ok(performance.sourceUrl.includes(sourcePin));
    // View-source links stay on the site's own provenance file and name a published source file.
    assert.equal(performance.sourceUrl,`/historical-coverage.json#${sourcePin}/${performance.sourceFile!.split('/').pop()}:L${performance.sourceLine}`);
    assert.ok(publishedSourceFiles.has(performance.sourceFile!.split('/').pop()!),performance.sourceUrl);
    assert.ok(performance.sourceUrls.every(url=>url.startsWith('/historical-coverage.json')),performance.id);assert.equal(performance.week,null);assert.doesNotMatch(historicalDrawLabel(performance),/NFL Week \d/);
    if(performance.sourceGameOrdinal!==undefined)assert.ok(Number.isInteger(performance.sourceGameOrdinal)&&performance.sourceGameOrdinal>0);
    if(performance.sourceWeek!==undefined)assert.ok(Number.isInteger(performance.sourceWeek)&&performance.sourceWeek>0);
    if(performance.stats.fumbleRecoveryTD===null||performance.stats.safeties===null)unknownExcluded++;
    assert.ok(!(performance.teamAtTime==='BUF'&&['1999-10-04','1999-10-31','1999-11-07'].includes(performance.date)&&athlete.position==='DEF'),'Disputed source defense rows remain quarantined');
   }
  }
 }
 assert.ok(sourceRows>0);assert.ok(unknownExcluded>0,'Unrecorded excluded source values remain null');
});

test('each older decade supports 17 deterministic, real and unrepeated draws without changing raw unknowns',t=>{
 t.mock.method(crypto,'getRandomValues',(array:Uint32Array)=>{array.fill(0);return array;});
 for(const decade of [1960,1970,1980,1990]){
  const athlete=oldQuarterback(decade),pool=performancePool(athlete.id,historical),selected=pool.filter(p=>p.season>=decade&&p.season<decade+10).slice(0,17),selectedIds=new Set(selected.map(p=>p.id));
  const alreadyUsed=pool.filter(p=>!selectedIds.has(p.id)).map(p=>p.id),used=new Set(alreadyUsed),repeated=new Set(alreadyUsed),before=JSON.stringify(selected);
  const first=Array.from({length:17},()=>drawPerformance(athlete.id,used,historical));
  const second=Array.from({length:17},()=>drawPerformance(athlete.id,repeated,historical));
  assert.deepEqual(first.map(p=>p.id),second.map(p=>p.id));assert.equal(new Set(first.map(p=>p.id)).size,17);assert.deepEqual(new Set(first.map(p=>p.id)),selectedIds);assert.equal(JSON.stringify(selected),before);
  assert.throws(()=>drawPerformance(athlete.id,used,historical),/No unused|no available/i);
  assert.throws(()=>drawPerformance(athlete.id,new Set(),strict),/No unused|no available/i);
 }
});

test('older receipts accept an unavailable NFL week and label source order without claiming a verified NFL week',()=>{
 const performance=performancePool(oldQuarterback().id,historical)[0],before=JSON.stringify(performance);
 assert.equal(performance.week,null);assert.equal(fullReceipt(performance),true);assert.match(historicalDrawLabel(performance),/NFL week unavailable/);
 assert.match(historicalDrawLabel({...performance,week:null,sourceWeek:3}),/Source game ordinal 3/);assert.doesNotMatch(historicalDrawLabel({...performance,week:null,sourceWeek:3}),/NFL Week 3/);
 assert.equal(historicalDrawLabel({...performance,week:3,sourceWeek:undefined}),`${performance.season} season · NFL Week 3`);
 assert.equal(JSON.stringify(performance),before);
});

test('older identities can be selected and drawn in new quick games, while Strict rejects the same lineup',()=>{
 let league=newLeague('older-quick',.5,'historical');const lineup:Record<string,string>={};
 for(const slot of lineupSlots(league))lineup[slot]=(slot==='QB'?oldQuarterback():catalog.find(a=>eligibleForSlot(a,slot)&&!Object.values(lineup).includes(a.id)))!.id;
 const strictGame=newLeague('strict-quick',.5,'strict');assert.throws(()=>lockLineup(strictGame,lineup,0),/valid QB|playable/i);assert.equal(strictGame.used.length,0);
 const first=lockLineup(league,lineup,0);assert.equal(first.used.length,0);league=lockLineup(first,lineup,1);
 const round=league.history[0];assert.equal(round.scoring!.mode,'historical');assert.equal(new Set(league.used).size,lineupSlots(league).length*2);
 for(const draw of round.draws.flat())assert.equal(draw.points,score(draw.performance.stats,athleteFor(draw.athleteId,round.scoring!)!.position,round.scoring));
 assert.ok(round.draws.flat().some(draw=>draw.athleteId===oldQuarterback().id&&draw.performance.season<1999));
});

test('real older players survive solo drafting, saved season creation and starter/bench receipts',()=>{
 const athlete=oldQuarterback(1980);
 let draft=newDemoDraft('Historical solo pool',.5,{modern:true,capacity:2,kickers:true,opening:true,orderMode:'manual',orderIndexes:[0,1],scoringMode:'historical'});
 draft=demoDraftAction(draft,{action:'beginDraft'});assert.equal(demoPickReason(draft,draft.humanTeamId,athlete.id),null);draft=demoDraftAction(draft,{action:'draft',athleteId:athlete.id});draft=finishSolo(draft);
 assert.ok(draft.teams.find(team=>team.id===draft.humanTeamId)!.roster.includes(athlete.id));draft=demoDraftAction(JSON.parse(JSON.stringify(draft)),{action:'startSeason'});
 const human=draft.season!.teams.find(team=>team.id===draft.humanTeamId)!;draft=demoDraftAction(draft,{action:'lock',lineup:human.lineup,acceptBye:true});
 const round=draft.season!.history[0];assert.equal(round.scoring!.mode,'historical');const draws=[...Object.values(round.draws).flat(),...Object.values(round.benchDraws!).flat()];assert.equal(draws.length,22);
 const olderDraw=draws.find(draw=>draw.athleteId===athlete.id)!;assert.ok(olderDraw.performance.id?.startsWith('historical:'));assert.equal(olderDraw.points,score(olderDraw.performance.stats!,athlete.position,round.scoring));
});

test('a sixteen-team Historical league fields eleven-player rosters, free agents, byes, bench draws and all seventeen weeks',()=>{
 let season=draftSixteen();assert.equal(season.status,'active');assert.equal(season.pick,176);assert.equal(new Set(season.teams.flatMap(team=>team.roster)).size,176);
 for(const team of season.teams){assert.equal(team.roster.length,11);assert.equal(new Set(Object.values(team.lineup)).size,7);for(const slot of lineupSlots(season))assert.ok(eligibleForSlot(athleteFor(team.lineup[slot],historical),slot));}
 const oldStarter=oldQuarterback().id;assert.equal(season.teams[0].lineup.QB,oldStarter);assert.ok(season.byes!.weeks[oldStarter]>=5);assert.equal(Object.keys(season.byes!.weeks).length,catalog.length);
 assert.ok(catalog.every(a=>season.byes!.weeks[a.id]>=5&&season.byes!.weeks[a.id]<season.regularRounds));
 // Add a real older free agent, then restore the frozen opening roster before play.
 const owner=season.teams[0],owned=new Set(season.teams.flatMap(team=>team.roster));let moved:Season|undefined,added:string|undefined,dropped:string|undefined;
 for(const candidate of older.filter(a=>!owned.has(a.id))){for(const drop of owner.roster.filter(id=>athleteFor(id,historical)!.position===candidate.position)){try{moved=seasonAction(season,'owner',{action:'swap',drop,add:candidate.id});added=candidate.id;dropped=drop;break;}catch{}}if(moved)break;}
 assert.ok(moved,'An eligible older free agent can enter a real roster');assert.ok(moved.teams[0].roster.includes(added!));assert.ok(remainingGames(moved,added!)>=17);const byes=JSON.stringify(season.byes);season=seasonAction(moved,'owner',{action:'swap',drop:added,add:dropped});assert.equal(JSON.stringify(season.byes),byes);
 let simulatedByes=0,olderDraws=0;
 for(let week=1;week<=17;week++){
  if(week<=4)for(const team of season.teams)assert.deepEqual(repairLineup(season,team,true),team.lineup,`Week ${week}: ${team.name} keeps every starter available`);
  const before=season.used.length;season=seasonAction(JSON.parse(JSON.stringify(season)),'owner',{action:'closeRound'});const round=season.history.at(-1)!;
  assert.equal(round.number,week);assert.deepEqual(round.scoring,historical);assert.equal(Object.keys(round.rosterSnapshots!).length,round.matches.length*2);
  const draws=[...Object.values(round.draws).flat(),...Object.values(round.benchDraws!).flat()];assert.equal(draws.length,round.matches.length*22);
  if(week<=4)assert.ok(draws.every(draw=>!draw.simulatedBye),`Week ${week} records real starter and bench games without a simulated bye`);
  for(const draw of draws){
   if(draw.simulatedBye){simulatedByes++;assert.equal(draw.points,0);assert.deepEqual(draw.performance,{});continue;}
   assert.ok(!('unavailable' in draw)||draw.unavailable===undefined);assert.ok(draw.performance.id);assert.equal(draw.points,score(draw.performance.stats!,athleteFor(draw.athleteId,historical)!.position,historical));
   if(draw.performance.id!.startsWith('historical:'))olderDraws++;
  }
  assert.equal(season.used.length-before,draws.filter(draw=>!draw.simulatedBye).length);assert.equal(new Set(season.used).size,season.used.length);
  for(const match of round.matches){const events=fantasyReplay(round,match);assert.equal(replayScore(events,events.length,match.home),match.homeScore);assert.equal(replayScore(events,events.length,match.away),match.awayScore);assert.equal(match.homeScore,Math.round(round.draws[match.home].reduce((sum,draw)=>sum+draw.points,0)*100)/100);}
  const saved=JSON.stringify(round),hidden=publicSeason(season,'owner');assert.equal(hidden.history.at(-1)!.benchDraws,undefined);season=seasonAction(season,'owner',{action:'revealReplay',round:week});assert.equal(JSON.stringify(season.history.at(-1)),saved);assert.ok(publicSeason(season,'owner').history.at(-1)!.benchDraws);
  if(week<17)season=seasonAction(season,'owner',{action:'next'});
 }
 assert.equal(season.status,'complete');assert.ok(season.champion);assert.equal(season.history.length,17);assert.ok(simulatedByes>0);assert.ok(olderDraws>=16);
 const complete=JSON.stringify(season);assert.throws(()=>seasonAction(season,'owner',{action:'rules',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(season),complete);
});

test('the published historical coverage file matches its generator and the pinned source', async()=>{
 const {execFileSync}=await import('node:child_process');
 const before=readFileSync(new URL('../public/historical-coverage.json',import.meta.url),'utf8');
 execFileSync(process.execPath,[new URL('../scripts/summarize-historical-coverage.mjs',import.meta.url).pathname]);
 assert.equal(readFileSync(new URL('../public/historical-coverage.json',import.meta.url),'utf8'),before);
 assert.equal(publishedCoverage.sourceRevision,sourcePin);
 assert.equal(publishedCoverage.files.length,30);
});
