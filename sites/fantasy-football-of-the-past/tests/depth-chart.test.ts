import assert from 'node:assert/strict';
import test from 'node:test';
import type {DepthContext} from '../lib/depth-chart';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({load(url,c,n){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return n(url,c);},resolve(id,c,n){try{return n(id,c);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return n(`${id}.ts`,c);throw e;}}});
const {depthRows}=await import('../lib/depth-chart');const {ATHLETES,ALL_POSITIONS:POSITIONS}=await import('../lib/game-model');const {draftRankings}=await import('../lib/draft-insights');const {newScoring}=await import('../lib/scoring-rules');
const qb=ATHLETES.filter(a=>a.position==='QB'),averages=new Map(qb.map((a,i)=>[a.id,100-i]));
const context:DepthContext={name:'Private test league',status:'active',round:5,regularRounds:15,myTeamId:'me',used:[`nflverse:${qb[0].id}:hidden_1`],byes:{version:2 as const,firstWeek:5,lastWeek:14,weeks:{[qb[0].id]:5,[qb[1].id]:6}},teams:[{id:'me',name:'My team',roster:[qb[0].id,qb[1].id],lineup:{QB:qb[0].id}},{id:'other',name:'Opponent',roster:[qb[2].id],lineup:{}}]};
test('depth chart keeps drafted players ranked globally and reveals only own roster roles',()=>{const rows=depthRows('QB',averages,context);assert.equal(rows.length,qb.length);const starter=rows.find(r=>r.athlete.id===qb[0].id)!,bench=rows.find(r=>r.athlete.id===qb[1].id)!,opponent=rows.find(r=>r.athlete.id===qb[2].id)!;assert.equal(starter.rank,1);assert.equal(starter.role,'Starter · QB');assert.equal(bench.role,'Bench');assert.equal(opponent.role,'Rostered · lineup private');assert.equal(starter.availability,'current');assert.equal(bench.availability,'next');assert.equal(starter.remaining,qb[0].gameCount-1);assert.equal(rows.find(r=>r.athlete.id===qb[3].id)!.owner,'Free agent');assert.deepEqual(rows.map(r=>r.rank),depthRows('QB',averages).map(r=>r.rank));});
test('drafts do not invent starter/bench roles; previews are absent and every real position is covered',()=>{assert.ok(depthRows('QB',averages,{...context,status:'draft'}).filter(r=>r.ownerId).every(r=>r.role==='Drafted'));assert.equal(POSITIONS.flatMap(p=>depthRows(p,new Map())).length,ATHLETES.length);assert.ok(POSITIONS.flatMap(p=>depthRows(p,new Map())).every(r=>r.athlete.gameCount>0));});
test('both scoring modes keep Weeks 1–4 available and first show a current bye in Week 5',()=>{
 for(const mode of ['strict','historical'] as const){
  const rules=newScoring(1,true,mode);
  for(let round=1;round<=4;round++){
   const rows=depthRows('QB',averages,{...context,round},rules);
   assert.ok(rows.every(row=>row.availability!=='current'),`${mode} Week ${round} has no current bye`);
   const first=rows.find(row=>row.athlete.id===qb[0].id)!;
   assert.equal(first.availability,round===4?'next':'ready');
   assert.equal(first.availabilityLabel,round===4?'Available · Bye next week':'Available');
  }
  const weekFive=depthRows('QB',averages,context,rules);
  assert.equal(weekFive.find(row=>row.athlete.id===qb[0].id)!.availability,'current');
  assert.equal(weekFive.find(row=>row.athlete.id===qb[0].id)!.availabilityLabel,'BYE THIS WEEK');
  assert.equal(weekFive.find(row=>row.athlete.id===qb[1].id)!.availability,'next');
  assert.equal(weekFive.find(row=>row.athlete.id===qb[1].id)!.availabilityLabel,'Available · Bye next week');
  const playoffs=depthRows('QB',averages,{...context,round:context.regularRounds+1},rules);
  assert.ok(playoffs.every(row=>row.availability==='ready'&&row.availabilityLabel==='Available'));
 }
});
test('rankings follow league scoring and remain independent of hidden consumed game values',()=>{for(const reception of [0,.5,1]){const rules=newScoring(reception),ranks=draftRankings([],rules),map=new Map(ranks.filter(r=>r.average!==null).map(r=>[r.athleteId,r.average!]));for(const position of POSITIONS){const rows=depthRows(position,map);assert.ok(rows.every((r,i)=>!i||rows[i-1].average!>=r.average!));}assert.deepEqual(draftRankings(['not-a-real-draw'],rules),ranks);}});
