import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {ScoringStats} from '../lib/game-model';
import type {ScoringRules} from '../lib/scoring-rules';

registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(error){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}}
});
const {score,scoreDefense,scoringBreakdown}=await import('../lib/game-model');
const {LEGACY_SCORING,newScoring}=await import('../lib/scoring-rules');
const zero:ScoringStats={passingYards:0,passingTD:0,interceptions:0,rushingYards:0,rushingTD:0,receptions:0,receivingYards:0,receivingTD:0,fumblesLost:0,twoPoint:0,returnTD:0,sacks:0,defensiveInterceptions:0,fumbleRecoveries:0,defensiveTD:0,safeties:0,blockedKicks:0,pointsAllowed:0,fumbleRecoveryTD:0};
const offenseKeys=['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','twoPoint','returnTD','fumbleRecoveryTD'] as const;
const defenseKeys=['sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','returnTD','pointsAllowed'] as const;

test('Strict rejects an unknown or nonfinite active source value in scoring and receipts',()=>{
 const rules=newScoring(1,true);
 for(const missing of [null,undefined,NaN,Infinity]){
  for(const key of offenseKeys){const stats={...zero,[key]:missing} as ScoringStats;assert.throws(()=>score(stats,'WR',rules),/Complete/);assert.throws(()=>scoringBreakdown(stats,'WR',rules),/Complete/);}
  for(const key of defenseKeys){const stats={...zero,[key]:missing} as ScoringStats;assert.throws(()=>scoreDefense(stats,rules),/Complete/);assert.throws(()=>scoringBreakdown(stats,'DEF',rules),/Complete/);}
 }
});

test('zero-rate offense groups skip unknown raw statistics without substituting zero',()=>{
 const rules:ScoringRules={...newScoring(0),passingYard:0,passingTD:0,interception:0,scrimmageYard:0,touchdown:0,offensiveRecoveryTD:0,twoPoint:0};
 const stats={...zero,...Object.fromEntries(offenseKeys.map(key=>[key,null])),fumblesLost:null} as ScoringStats;
 const before=structuredClone(stats);
 assert.equal(score(stats,'WR',rules),0);
 assert.deepEqual(scoringBreakdown(stats,'WR',rules),[]);
 assert.deepEqual(stats,before);
 assert.ok(offenseKeys.every(key=>stats[key]===null));
});

test('disabled defense components remain unknown while verified points allowed still score',()=>{
 const rules:ScoringRules={...newScoring(1),sack:0,takeaway:0,touchdown:0,defenseFumbleRecovery:0,blockedKick:0,safety:0,defensiveTouchdown:0};
 const stats={...zero,...Object.fromEntries(defenseKeys.filter(key=>key!=='pointsAllowed').map(key=>[key,null])),pointsAllowed:0} as ScoringStats;
 const before=structuredClone(stats);
 assert.equal(scoreDefense(stats,rules),10);
 assert.deepEqual(scoringBreakdown(stats,'DEF',rules),[{label:'Points allowed',calculation:'0 opponent points',points:10}]);
 assert.deepEqual(stats,before);
 assert.throws(()=>scoreDefense({...stats,pointsAllowed:null},rules),/points allowed/);
});

// These explicit arithmetic inputs exercise aggregate support without choosing a Historical preset.
function aggregateKicking(overrides:Partial<NonNullable<ScoringRules['kicking']>>={}):ScoringRules {
 const strict=newScoring(1,true);
 return {...strict,kicking:{...strict.kicking!,fieldGoalFlat:3,...overrides}};
}
test('verified kicking aggregates score once while unrecorded distance and failure splits remain null',()=>{
 const stats:ScoringStats={...zero,passingYards:4,passingTD:1,fieldGoalsMade:2,fieldGoalsUnsuccessful:1,extraPointsMade:3,extraPointsUnsuccessful:1,fieldGoalsShort:null,fieldGoals40:null,fieldGoals50:null,fieldGoalsMissed:null,fieldGoalsBlocked:null,extraPointsMissed:null,extraPointsBlocked:null};
 const before=structuredClone(stats),rules=aggregateKicking();
 assert.equal(score(stats,'K',rules),11.16);
 assert.equal(Math.round(scoringBreakdown(stats,'K',rules).reduce((sum,item)=>sum+item.points,0)*100)/100,11.16);
 assert.deepEqual(stats,before);
 for(const key of ['fieldGoalsMade','fieldGoalsUnsuccessful','extraPointsMade','extraPointsUnsuccessful'] as const){assert.throws(()=>score({...stats,[key]:null},'K',rules),/Complete/);}
});

test('disabled aggregate kicking terms do not require unknown made or unsuccessful counts',()=>{
 const stats:ScoringStats={...zero,fieldGoalsMade:null,fieldGoalsUnsuccessful:null,extraPointsMade:null,extraPointsUnsuccessful:null,fieldGoalsShort:null,fieldGoals40:null,fieldGoals50:null,fieldGoalsMissed:null,fieldGoalsBlocked:null,extraPointsMissed:null,extraPointsBlocked:null};
 const before=structuredClone(stats),rules=aggregateKicking({fieldGoalFlat:0,extraPoint:0,unsuccessful:0});
 assert.equal(score(stats,'K',rules),0);
 assert.deepEqual(scoringBreakdown(stats,'K',rules),[]);
 assert.deepEqual(stats,before);
 const onlyMade={...stats,fieldGoalsMade:2},madeRules=aggregateKicking({extraPoint:0,unsuccessful:0});
 assert.equal(score(onlyMade,'K',madeRules),6);
 assert.deepEqual(scoringBreakdown(onlyMade,'K',madeRules),[{label:'Made field goals at any distance',calculation:'2 FG × 3',points:6}]);
});

test('saved Standard receipts retain recorded zero-rate receptions without inventing missing receptions',()=>{
 for(const version of [1,2,3,4] as const){
  const rules:ScoringRules={...LEGACY_SCORING,version,receptionPoints:0};
  const stats={...zero,receptions:2,receivingYards:30};
  assert.equal(score(stats,'WR',rules),3);
  assert.deepEqual(scoringBreakdown(stats,'WR',rules),[{label:'Receptions',calculation:'2 catches × 0',points:0},{label:'Receiving yards',calculation:'30 yds × 0.1',points:3}]);
  const unknown={...stats,receptions:null};
  assert.equal(score(unknown,'WR',rules),3);
  assert.deepEqual(scoringBreakdown(unknown,'WR',rules),[{label:'Receiving yards',calculation:'30 yds × 0.1',points:3}]);
  assert.equal(unknown.receptions,null);
 }
 assert.deepEqual(scoringBreakdown({...zero,receptions:2,receivingYards:30},'WR',newScoring(0)),[{label:'Receptions',calculation:'2 catches × 0',points:0},{label:'Receiving yards',calculation:'30 yds × 0.1',points:3}]);
});

test('approved Historical offense preserves normal offense and applies uniform exclusions in every PPR preset',()=>{
 const raw={...zero,passingYards:250,passingTD:2,interceptions:1,rushingYards:40,rushingTD:1,receptions:3,receivingYards:50,receivingTD:1,returnTD:1,fumblesLost:null,twoPoint:null,fumbleRecoveryTD:null};
 const before=structuredClone(raw);
 for(const ppr of [0,.5,1] as const){
  const rules=newScoring(ppr,false,'historical');
  assert.equal(score(raw,'WR',rules),43+3*ppr);
  assert.equal(Math.round(scoringBreakdown(raw,'WR',rules).reduce((sum,item)=>sum+item.points,0)*100)/100,43+3*ppr);
  assert.equal(score({...raw,fumblesLost:7,twoPoint:3,fumbleRecoveryTD:2},'WR',rules),43+3*ppr);
  assert.ok(scoringBreakdown(raw,'WR',rules).every(item=>!['Lost fumbles','Two-point conversions','Fumble-recovery touchdowns'].includes(item.label)));
  assert.throws(()=>score({...raw,returnTD:null},'WR',rules),/return touchdown/);
  assert.throws(()=>score({...raw,receivingYards:null},'WR',rules),/receiving yard/);
 }
 assert.deepEqual(raw,before);
 const strict=newScoring(1);assert.equal(score({...raw,fumblesLost:7,twoPoint:3,fumbleRecoveryTD:2},'WR',strict),64);
});

test('approved Historical defense scores only points allowed and verified return touchdowns, across every tier',()=>{
 const raw={...zero,sacks:null,defensiveInterceptions:null,fumbleRecoveries:null,defensiveTD:null,safeties:null,blockedKicks:null,returnTD:1};
 const tiers=[[0,10],[1,7],[6,7],[7,4],[13,4],[14,1],[20,1],[21,0],[27,0],[28,-1],[34,-1],[35,-4],[60,-4]];
 for(const ppr of [0,.5,1] as const){const rules=newScoring(ppr,false,'historical');
  for(const [pointsAllowed,tier] of tiers){const stats={...raw,pointsAllowed},before=structuredClone(stats);assert.equal(scoreDefense(stats,rules),tier+6);assert.deepEqual(stats,before);assert.ok(scoringBreakdown(stats,'DEF',rules).every(item=>['Special-teams touchdowns','Points allowed'].includes(item.label)));}
  assert.equal(scoreDefense({...raw,pointsAllowed:0,sacks:20,defensiveInterceptions:10,fumbleRecoveries:10,defensiveTD:4,safeties:3,blockedKicks:3},rules),16);
  assert.throws(()=>scoreDefense({...raw,returnTD:null},rules),/return touchdown/);
  assert.throws(()=>scoreDefense({...raw,pointsAllowed:null},rules),/points allowed/);
 }
});

test('approved Historical kicking penalizes missed field goals, ignores missed XP and keeps real offense',()=>{
 const raw:ScoringStats={...zero,passingYards:4,passingTD:1,fieldGoalsShort:1,fieldGoals40:1,fieldGoals50:1,fieldGoalsMissed:1,fieldGoalsBlocked:1,extraPointsMade:2,extraPointsMissed:1,extraPointsBlocked:1};
 const before=structuredClone(raw);
 for(const ppr of [0,.5,1] as const){const historical=newScoring(ppr,true,'historical'),strict=newScoring(ppr,true);
  assert.equal(score(raw,'K',historical),13.16);assert.equal(score(raw,'K',strict),14.16);
  assert.equal(score({...raw,extraPointsMissed:9,extraPointsBlocked:9},'K',historical),13.16);
  assert.equal(score({...raw,fieldGoalsMissed:2},'K',historical),12.16);
  assert.equal(score({...raw,extraPointsMissed:null,extraPointsBlocked:null},'K',historical),13.16);
  assert.throws(()=>score({...raw,extraPointsMissed:null},'K',strict),/Complete verified/);
  assert.equal(Math.round(scoringBreakdown(raw,'K',historical).reduce((sum,item)=>sum+item.points,0)*100)/100,13.16);
  assert.ok(scoringBreakdown(raw,'K',historical).every(item=>item.label!=='Unsuccessful extra points, including blocks'));
 }
 assert.deepEqual(raw,before);
});
