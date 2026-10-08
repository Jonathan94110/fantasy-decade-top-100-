import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {Stats} from '../lib/game-model';
import type {ScoringRules} from '../lib/scoring-rules';
import type {DemoDraft} from '../lib/demo-draft-model';
import type {SeasonRound} from '../lib/season-model';

registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(error){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}}
});
const {ATHLETES,PERFORMANCES,LINEUP_SLOTS,eligibleForSlot,score,scoringBreakdown,statLine}=await import('../lib/historical-data');
const {newScoring,LEGACY_SCORING,scoringFor}=await import('../lib/scoring-rules');
const {newLeague,lockLineup,nextRound}=await import('../lib/game-engine');
const {newDemoDraft,demoDraftAction}=await import('../lib/demo-draft-engine');
const {demoPickReason}=await import('../lib/demo-draft-model');
const {newSeason,joinSeason,seasonAction}=await import('../lib/season-engine');
const {fantasyReplay,replayScore}=await import('../lib/fantasy-replay');
const wr=ATHLETES.find(a=>a.position==='WR')!;
const receipt=PERFORMANCES.find(p=>p.athleteId===wr.id)!;
const emptyStats=Object.fromEntries(Object.keys(receipt.stats).map(key=>[key,0])) as Stats;
const legacyV2:ScoringRules={...LEGACY_SCORING,version:2,receptionPoints:.5};
const legacyV3:ScoringRules={...newScoring(.5,true),version:3,lostFumble:-2};
const lineup:Record<string,string>={};
for(const slot of LINEUP_SLOTS)lineup[slot]=ATHLETES.find(a=>eligibleForSlot(a,slot)&&a.gameCount>50&&!Object.values(lineup).includes(a.id))!.id;
function finishDraft(draft:DemoDraft){
 let saved=draft;
 while(saved.status==='draft')saved=demoDraftAction(saved,{action:'draft',athleteId:ATHLETES.find(a=>!demoPickReason(saved,saved.humanTeamId,a.id))!.id});
 return saved;
}

test('explicit Strict presets disable individual lost fumbles while preserving kicking and recovery credits',()=>{
 const offense={...emptyStats,receptions:2,receivingYards:30,fumblesLost:2,fumbleRecoveryTD:1};
 const defense={...emptyStats,fumbleRecoveries:1};
 const before=structuredClone(offense);
 for(const receptions of [0,.5,1] as const)for(const kickers of [false,true]){
  const rules=newScoring(receptions,kickers);
  assert.equal(rules.version,5);assert.equal(rules.mode,'strict');assert.equal(rules.lostFumble,0);
  assert.equal(Boolean(rules.kicking),kickers);
  assert.deepEqual(newSeason('owner',{name:'New online',teamName:'Owner',capacity:2,receptionPoints:receptions,kickers,scoringMode:'strict'},'NEW').scoring,rules);
  assert.deepEqual(newDemoDraft('New solo',receptions,{modern:true,capacity:2,kickers,opening:true,scoringMode:'strict'}).scoring,rules);
  if(!kickers)assert.deepEqual(newLeague('new-quick',receptions,'strict').scoring,rules);
  assert.equal(score(offense,'WR',rules),9+2*receptions);
  assert.equal(score(offense,'WR',rules),score({...offense,fumblesLost:0},'WR',rules));
  assert.equal(score(offense,'WR',rules)-score({...offense,fumbleRecoveryTD:0},'WR',rules),6);
  assert.equal(score(defense,'DEF',rules)-score({...defense,fumbleRecoveries:0},'DEF',rules),2);
  const breakdown=scoringBreakdown(offense,'WR',rules);
  assert.ok(!breakdown.some(item=>item.label==='Lost fumbles'));
  assert.equal(breakdown.reduce((sum,item)=>sum+item.points,0),score(offense,'WR',rules));
 }
 assert.deepEqual(offense,before,'Scoring must never rewrite real lost-fumble statistics');
 assert.equal(score(offense,'WR',LEGACY_SCORING),7);
 assert.ok(scoringBreakdown(offense,'WR',LEGACY_SCORING).some(item=>item.label==='Lost fumbles'&&item.points===-4));
});

test('disabled lost-fumble scoring tolerates unknown data without replacing it with a zero',()=>{
 for(const unavailable of [undefined,null]){
  const stats={...emptyStats,receptions:2,receivingYards:30,fumblesLost:unavailable} as unknown as Stats;
  const before=structuredClone(stats),rules=newScoring(.5);
  assert.equal(score(stats,'WR',rules),4);
  assert.equal(scoringBreakdown(stats,'WR',rules).reduce((sum,item)=>sum+item.points,0),4);
  assert.match(statLine({...receipt,stats}),/Lost fumbles unavailable/);
  assert.deepEqual(stats,before);assert.equal(stats.fumblesLost,unavailable);
 }
 const missing={...emptyStats,receptions:2,receivingYards:30};
 delete (missing as Partial<Stats>).fumblesLost;
 assert.equal(score(missing as Stats,'WR',newScoring(0)),3);
 assert.equal(Object.hasOwn(missing,'fumblesLost'),false);
});

test('new quick matches freeze the common zero-loss contract, while saved contracts survive later rounds',()=>{
 const fresh=newLeague('new');assert.deepEqual(fresh.scoring,newScoring(1,false,'historical'));assert.equal(fresh.scoring!.lostFumble,0);
 for(const rules of [undefined,legacyV2,legacyV3,newScoring(.5),newScoring(.5,false,'historical')]){
  const initial=newLeague('preserved',1,'strict');
  if(rules)initial.scoring=structuredClone(rules);else delete initial.scoring;
  const expected=scoringFor(initial),before=JSON.stringify(initial);
  const first=lockLineup(lockLineup(initial,lineup,0),lineup,1);
  assert.deepEqual(first.history[0].scoring,expected);
  for(const draw of first.history[0].draws.flat())assert.equal(draw.points,score(draw.performance.stats,ATHLETES.find(a=>a.id===draw.athleteId)!.position,expected));
  const history=JSON.stringify(first.history),next=nextRound(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(next.scoring,initial.scoring);
  const second=lockLineup(lockLineup(next,lineup,0),lineup,1);
  assert.deepEqual(second.history[1].scoring,expected);
  assert.equal(JSON.stringify(second.history.slice(0,1)),history);
  assert.equal(JSON.stringify(initial),before);
 }
});

test('existing online lobby reception edits preserve loss/version/kicking contract and subsequent rounds',()=>{
 for(const rules of [legacyV2,legacyV3,newScoring(1),newScoring(1,true)]){
  let season=newSeason('owner',{name:'Saved contract',teamName:'Owner',capacity:2,kickers:!!rules.kicking,scoringMode:'strict'},'RULES');
  season.scoring=structuredClone(rules);
  const edited=seasonAction(season,'owner',{action:'rules',receptionPoints:0,lostFumble:0,scoring:newScoring(0)});
  assert.deepEqual(edited.scoring,{...rules,receptionPoints:0});
  assert.deepEqual(season.scoring,rules,'Lobby editing must not mutate persisted input');
  season=joinSeason(edited,'guest','Guest');season=seasonAction(season,'owner',{action:'startDraft'});
  while(season.status==='draft')season=seasonAction(season,'owner',{action:'autopick'});
  season=seasonAction(season,'owner',{action:'closeRound'});
  const expected=edited.scoring!;
  assert.deepEqual(season.history[0].scoring,expected);
  for(const draw of Object.values(season.history[0].draws).flat())if(!draw.simulatedBye)assert.equal(draw.points,score(draw.performance.stats!,ATHLETES.find(a=>a.id===draw.athleteId)!.position,expected));
  const history=JSON.stringify(season.history);
  season=seasonAction(JSON.parse(JSON.stringify(season)),'owner',{action:'next'});
  season=seasonAction(season,'owner',{action:'closeRound'});
  assert.deepEqual(season.history[1].scoring,expected);
  assert.equal(JSON.stringify(season.history.slice(0,1)),history);
 }
});

test('starting a saved solo draft keeps its complete scoring snapshot, including absent legacy rules',()=>{
 for(const rules of [undefined,legacyV2,legacyV3,newScoring(0),newScoring(1,true)]){
  let draft=newDemoDraft('Saved solo',1,{modern:true,capacity:2,kickers:!!rules?.kicking,opening:true,orderMode:'manual',orderIndexes:[0,1],scoringMode:'strict'});
  if(rules)draft.scoring=structuredClone(rules);else delete draft.scoring;
  draft=demoDraftAction(draft,{action:'beginDraft'});draft=finishDraft(draft);
  const before=JSON.stringify(draft),expected=scoringFor(draft);
  const started=demoDraftAction(JSON.parse(before),{action:'startSeason',lostFumble:0,scoring:newScoring(0)});
  assert.deepEqual(started.season!.scoring,expected);
  const human=started.season!.teams.find(team=>team.id===started.humanTeamId)!;
  const resolved=demoDraftAction(started,{action:'lock',lineup:human.lineup,acceptBye:true});
  assert.deepEqual(resolved.season!.history[0].scoring,expected);
  assert.equal(JSON.stringify(draft),before);
  assert.deepEqual(demoDraftAction(resolved,{action:'startSeason'}),resolved);
 }
});

test('old and new full replay receipts sum to their rules and saved totals remain authoritative',()=>{
 const stats={...emptyStats,receptions:2,receivingYards:30,fumblesLost:2,fumbleRecoveryTD:1};
 for(const rules of [LEGACY_SCORING,legacyV2,legacyV3,newScoring(.5)]){
  const points=score(stats,'WR',rules),performance={...receipt,stats};
  assert.equal(scoringBreakdown(stats,'WR',rules).reduce((sum,item)=>sum+item.points,0),points);
  const match={home:'home',away:'away',homeScore:points,awayScore:points+1,winner:'away'};
  const round:SeasonRound={number:1,phase:'regular',resolvedAt:'saved',scoring:structuredClone(rules),matches:[match],draws:{home:[{athleteId:wr.id,points,slot:'WR',performance}],away:[{athleteId:wr.id,points,slot:'WR',performance}]}};
  const before=JSON.stringify(round),events=fantasyReplay(JSON.parse(before),match);
  assert.equal(replayScore(events,events.length,'home'),points);
  assert.equal(replayScore(events,events.length,'away'),points+1);
  assert.equal(events.at(-1)!.label,'Saved-total reconciliation');
  assert.equal(round.matches[0].winner,'away');assert.equal(JSON.stringify(round),before);
 }
});
