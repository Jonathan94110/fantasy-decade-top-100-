import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { Stats } from '../lib/game-model';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
});

const {ATHLETES,PERFORMANCES,score,scoringBreakdown}=await import(new URL('../lib/historical-data.ts',import.meta.url).href) as typeof import('../lib/historical-data');
const {summarizePool,draftInsights}=await import(new URL('../lib/draft-insights.ts',import.meta.url).href) as typeof import('../lib/draft-insights');

test('draw average weights eligible seasons equally despite unequal game counts',()=>{
 const athlete=ATHLETES.find(a=>a.position==='WR');assert.ok(athlete);
 const base=PERFORMANCES.find(p=>p.athleteId===athlete.id);assert.ok(base);
 const zero=Object.fromEntries(Object.keys(base.stats).map(k=>[k,0])) as Stats;
 const games=[{...base,season:2000,stats:{...zero,receptions:10}},
 ...Array.from({length:3},()=>({...base,season:2001,stats:{...zero,receptions:30}}))];
 const pool=summarizePool(base.athleteId,'WR',games);
 assert.equal(pool.average,20);
 assert.equal(pool.count,4);assert.equal(pool.low,10);assert.equal(pool.high,30);
 assert.deepEqual(pool.seasons.map(s=>s.count),[1,3]);
 const empty=summarizePool(base.athleteId,'WR',[]);
 assert.equal(empty.average,null);assert.equal(empty.low,null);assert.deepEqual(empty.seasons,[]);
});

test('scouting uses fixed full archive without exposing consumption',()=>{
 const athlete=ATHLETES.find(a=>a.name==='Steve Young');assert.ok(athlete);
 const pool=PERFORMANCES.filter(p=>p.athleteId===athlete.id);
 const insights=draftInsights(athlete.id,pool.slice(1).map(p=>p.id));
 assert.ok(insights);assert.equal(insights.count,pool.length);assert.equal(insights.coverage,'full-loaded-archive');
 assert.deepEqual(insights,draftInsights(athlete.id,[]));
 const exhausted=draftInsights(athlete.id,pool.map(p=>p.id));assert.ok(exhausted);assert.deepEqual(exhausted,insights);
 assert.equal(draftInsights('missing-player',[]),null);
});

test('score receipts reconcile with every loaded offensive and defense performance',()=>{
 const positions=new Map(ATHLETES.map(a=>[a.id,a.position]));
 for(const game of PERFORMANCES){
  const position=positions.get(game.athleteId);assert.ok(position);
  const total=Math.round(scoringBreakdown(game.stats,position,position==='K'?newScoring(1,true):undefined).reduce((sum,s)=>sum+s.points,0)*100)/100;
  assert.equal(total,score(game.stats,position,position==='K'?newScoring(1,true):undefined),game.id);
 }
});

const {newScoring,LEGACY_SCORING,scoringFor}=await import('../lib/scoring-rules');
const {newLeague,lockLineup,nextRound}=await import('../lib/game-engine');
const {newDemoDraft,demoDraftAction}=await import('../lib/demo-draft-engine');
const {demoPickReason}=await import('../lib/demo-draft-model');
const {draftRankings}=await import('../lib/draft-insights');
const {LINEUP_SLOTS,eligibleForSlot}=await import('../lib/game-model');

test('Standard, Half and Full PPR receipts reconcile for every real loaded performance',()=>{
 const positions=new Map(ATHLETES.map(a=>[a.id,a.position]));
 for(const points of [0,.5,1] as const){const rules=newScoring(points,true);for(const game of PERFORMANCES){
  const position=positions.get(game.athleteId)!;
  const total=Math.round(scoringBreakdown(game.stats,position,rules).reduce((sum,s)=>sum+s.points,0)*100)/100;
  assert.equal(total,score(game.stats,position,rules),`${points}:${game.id}`);
  if(position!=='DEF')assert.ok(Math.abs(score(game.stats,position,newScoring(1,true))-total-game.stats.receptions*(1-points))<.000001);
  else assert.equal(total,score(game.stats,position));
 }}
 assert.throws(()=>newScoring('0.5'),/Choose/);assert.throws(()=>newScoring(2),/Choose/);
});

test('saved quick-match snapshots score both teams and all later rounds; legacy stays full PPR',()=>{
 const lineup:Record<string,string>={};for(const slot of LINEUP_SLOTS)lineup[slot]=ATHLETES.find(a=>eligibleForSlot(a,slot)&&!a.legend&&!Object.values(lineup).includes(a.id)&&a.gameCount>50)!.id;
 for(const points of [0,.5,1] as const){
  const initial=newLeague('snapshot',points),first=lockLineup(initial,lineup,0);assert.equal(first.used.length,0);assert.equal(first.history.length,0);
  const saved=lockLineup(first,lineup,1),round=saved.history[0];assert.equal(round.scoring!.receptionPoints,points);
  for(const d of round.draws.flat())assert.equal(d.points,score(d.performance.stats,ATHLETES.find(a=>a.id===d.athleteId)!.position,scoringFor(round)));
  const history=JSON.stringify(saved.history),next=nextRound(JSON.parse(JSON.stringify(saved)));assert.equal(JSON.stringify(next.history),history);assert.equal(next.scoring!.receptionPoints,points);
 }
 const legacy=newLeague('legacy');delete legacy.scoring;
 assert.equal(scoringFor(legacy).version,1);assert.equal(scoringFor(legacy).receptionPoints,1);
 const result=lockLineup(lockLineup(legacy,lineup,0),lineup,1);assert.deepEqual(result.history[0].scoring,LEGACY_SCORING);assert.equal(nextRound(result).scoring,undefined);
});

test('draw-average rankings and demo bot first pick use the selected reception scoring',()=>{
 for(const points of [0,.5,1] as const){
  const rules=newScoring(points),ranks=draftRankings([],rules),demo=newDemoDraft('Scoring test',points,{scoringMode:'strict'});
  const top=[...ranks].sort((a,b)=>(b.average??0)-(a.average??0)||a.athleteId.localeCompare(b.athleteId))[0];
  assert.equal(demo.picks[0].athleteId,top.athleteId);assert.equal(demo.scoring!.receptionPoints,points);
  const chosen=ATHLETES.find(a=>!demoPickReason(demo,demo.humanTeamId,a.id))!;
  const next=demoDraftAction(demo,{action:'draft',athleteId:chosen.id,receptionPoints:1-points});
  assert.equal(next.scoring!.receptionPoints,points);assert.deepEqual(next.picks.slice(0,7),demo.picks);
  const athlete=ATHLETES.find(a=>a.position==='WR')!;
  assert.equal(ranks.find(r=>r.athleteId===athlete.id)!.average,draftInsights(athlete.id,[],rules)!.average);
 }
});

test('PPR changes weighted season averages without weighting longer seasons more heavily',()=>{
 const base=PERFORMANCES.find(p=>ATHLETES.find(a=>a.id===p.athleteId)!.position==='WR')!;
 const zero=Object.fromEntries(Object.keys(base.stats).map(k=>[k,0])) as Stats;
 const games=[{...base,season:2000,stats:{...zero,receptions:10}},...Array.from({length:3},()=>({...base,season:2001,stats:{...zero,receptions:30}}))];
 for(const p of [0,.5,1] as const)assert.equal(summarizePool(base.athleteId,'WR',games,newScoring(p)).average,20*p);
});
