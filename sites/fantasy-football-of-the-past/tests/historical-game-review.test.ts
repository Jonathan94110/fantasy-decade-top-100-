/** Read-only review checks: node --experimental-strip-types --test tests/historical-game-review.test.ts */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {CompletedFinalZeroEvidence} from '../lib/historical-game-review';
import type {ReceptionPoints} from '../lib/scoring-rules';
registerHooks({
 resolve(specifier,context,nextResolve){
  try{return nextResolve(specifier,context);}
  catch(error){
   if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(`${specifier}.ts`,context);
   throw error;
  }
 },
 load(url,context,nextLoad){
  if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};
  return nextLoad(url,context);
 },
});
const {REVIEW_PERFORMANCES,REVIEW_PLAYERS,REVIEW_SELECTION_NOTE,REVIEW_SOURCE,reviewScore,reviewReceipt}=await import('../lib/historical-game-review');
const {ATHLETES,PERFORMANCES,DATA_COVERAGE,scoreOffense}=await import('../lib/historical-data');
const {LEGACY_SCORING,newScoring}=await import('../lib/scoring-rules');
type SourceEvidence={id:string;rawSourceRow:Record<string,unknown>;completedFinalZeroEvidence:CompletedFinalZeroEvidence};
const source=JSON.parse(readFileSync(new URL('../data/historical-import/reviewed-source.json',import.meta.url),'utf8')) as {records:SourceEvidence[]};
const sourceById=new Map(source.records.map(row=>[row.id,row]));
function rawNumber(row:Record<string,unknown>,key:string){
 const value=row[key];
 assert.ok(typeof value==='number'&&Number.isFinite(value),key);
 return value;
}

test('review is explicitly biased, with seven stable profile identities and 24 unique player-games',()=>{
 assert.match(REVIEW_SELECTION_NOTE,/selected.*0 points/);
 assert.match(REVIEW_SELECTION_NOTE,/not representative/);
 assert.match(REVIEW_SELECTION_NOTE,/excluded.*drafts.*random draws.*seasons/);
 assert.equal(REVIEW_SOURCE.reviewOnly,true);
 assert.equal(REVIEW_SOURCE.normalGameplayImports,0);
 assert.equal(REVIEW_PERFORMANCES.length,24);
 assert.equal(new Set(REVIEW_PERFORMANCES.map(row=>row.id)).size,24);
 assert.equal(new Set(REVIEW_PERFORMANCES.map(row=>row.gameId)).size,23);
 assert.deepEqual(REVIEW_PLAYERS.map(player=>[player.name,player.profileId,player.gameCount]),[
  ['Otto Graham','otto-graham',1],['Bobby Layne','bobby-layne',2],['Norm Van Brocklin','norm-van-brocklin',2],
  ['Y.A. Tittle','hof-ya-tittle',4],['Johnny Unitas','johnny-unitas',8],['Bart Starr','bart-starr',3],['Sonny Jurgensen','hof-sonny-jurgensen',4],
 ]);
 for(const player of REVIEW_PLAYERS){
  assert.equal(player.athleteId,player.id);
  assert.equal(player.count,player.gameCount);
  const games=REVIEW_PERFORMANCES.filter(row=>row.athleteId===player.id);
  assert.equal(games.length,player.gameCount);
  assert.deepEqual([...new Set(games.map(row=>row.season))].sort((a,b)=>a-b),player.seasons);
  for(const season of player.seasons)assert.equal(games.filter(row=>row.season===season).length,player.gamesBySeason[season]);
 }
});

test('all 72 current-contract scores and receipts retain the actual source arithmetic',()=>{
 const expected=[1.68,1.92,1.66,-2.68,1.94,-1.2,2.12,-2.28,-5.8,3.44,2.8,.96,3.46,3.18,-1.88,-3.8,.28,1.52,-.6,-1.12,-1.72,.1,9.04,-.6];
 const before=structuredClone(REVIEW_PERFORMANCES);
 let calculations=0;
 for(const ppr of [0,.5,1] as const){
  let cents=0;
  REVIEW_PERFORMANCES.forEach((record,index)=>{
   const value=reviewScore(record,ppr);
   assert.equal(value,expected[index],record.id);
   assert.equal(value,scoreOffense(record.stats,newScoring(ppr)));
   const receipt=reviewReceipt(record,ppr);
   assert.equal(Math.round(receipt.reduce((sum,item)=>sum+item.points,0)*100),Math.round(value*100),record.id);
   assert.ok(receipt.every(item=>!item.label.includes('Lost fumbles')));
   cents+=Math.round(value*100);calculations++;
  });
  assert.equal(cents,1242);
 }
 assert.equal(calculations,72);
 assert.deepEqual(REVIEW_PERFORMANCES,before);
});

test('nine provider-supplied offense fields match explicit original numeric cells, without defense placeholders',()=>{
 const mapping={passingYards:'passing_yards',passingTD:'passing_touchdowns',interceptions:'passing_interceptions',rushingYards:'rushing_yards',rushingTD:'rushing_touchdowns',receptions:'receiving_receptions',receivingYards:'receiving_yards',receivingTD:'receiving_touchdowns'} as const;
 for(const record of REVIEW_PERFORMANCES){
  const raw=sourceById.get(record.id)!.rawSourceRow;
  for(const [field,key] of Object.entries(mapping)){
   assert.equal(record.stats[field as keyof typeof record.stats],rawNumber(raw,key));
  }
  for(const key of ['kick_return_touchdowns','punt_return_touchdowns']){
   rawNumber(raw,key);
  }
  assert.equal(record.stats.returnTD,rawNumber(raw,'kick_return_touchdowns')+rawNumber(raw,'punt_return_touchdowns'));
  assert.deepEqual(Object.keys(record.stats).sort(),[...Object.keys(mapping),'returnTD','twoPoint','fumbleRecoveryTD','fumblesLost'].sort());
  assert.match(record.provenance.quality,/not all-field independent verification/);
  assert.equal(record.provenance.originalArchiveSHA256,'d75baf50cf201d4efe4eb67af8963927f1f5b8a5877c9c9807eca5233ff84835');
  assert.equal(record.id,`kaggle:${record.provenance.sourcePlayerId}:${record.gameId}`);
  assert.equal(record.athleteId,`kaggle-${raw.player_id}`);
  assert.equal(record.date,raw.date);
  assert.equal(record.teamAtTime,raw.team);
  assert.equal(record.opponent,raw.opponent);
  // Explicit positive attempts establish participation; preserve swapped raw labels.
  const attempts=rawNumber(raw,'passing_completions'),completions=rawNumber(raw,'passing_attempts');
  assert.ok(attempts>0);
  assert.ok(completions>=0&&completions<=attempts);
 }
});

test('only two credits use completed-shutout proofs; raw missing fields remain unknown',()=>{
 for(const record of REVIEW_PERFORMANCES){
  const evidence=sourceById.get(record.id)!.completedFinalZeroEvidence;
  assert.equal(record.stats.fumblesLost,null);
  assert.deepEqual(record.provenance.rawMissingScoringStats,{fumblesLost:null,twoPoint:null,fumbleRecoveryTD:null});
  assert.equal(record.stats.twoPoint,0);
  assert.equal(record.stats.fumbleRecoveryTD,0);
  for(const proof of Object.values(record.provenance.derivations)){
   assert.deepEqual(proof,evidence);
   assert.equal(proof.completed,true);
   assert.equal(proof.finalScore[0],0);
   assert.equal(proof.date,record.date);
   assert.equal(proof.team,record.teamAtTime);
   assert.equal(proof.opponent,record.opponent);
   assert.ok(record.sourceUrls.includes(proof.url));
  }
  assert.throws(()=>scoreOffense(record.stats,LEGACY_SCORING),/lost-fumble statistics/);
 }
 assert.match(REVIEW_SOURCE.qualityDisposition.derivation,/No yard\/count\/lost-fumble zero is inferred/);
 assert.match(REVIEW_SOURCE.provider.sourceUseDisposition,/not a claim of upstream PFR clearance or Stathead permission/);
});

test('unknown active values fail instead of becoming zero, and lost-fumble zero cannot replace raw unknown',()=>{
 for(const key of ['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','returnTD','twoPoint','fumbleRecoveryTD'] as const){
  for(const value of [null,undefined,NaN]){
   const changed=structuredClone(REVIEW_PERFORMANCES[0]);
   (changed.stats as unknown as Record<string,unknown>)[key]=value;
   assert.throws(()=>reviewScore(changed),/unavailable active scoring field/);
   assert.throws(()=>reviewReceipt(changed),/unavailable active scoring field/);
  }
 }
 const changed=structuredClone(REVIEW_PERFORMANCES[0]);
 (changed.stats as unknown as Record<string,unknown>).fumblesLost=0;
 assert.throws(()=>reviewScore(changed),/must remain null/);
 assert.throws(()=>reviewScore(REVIEW_PERFORMANCES[0],2 as unknown as ReceptionPoints),/Choose Standard/);
});

test('postseason ordinal, official round evidence, negative yards and distinct historical franchise survive',()=>{
 const postseason=REVIEW_PERFORMANCES.filter(record=>record.seasonType==='POST');
 assert.equal(postseason.length,3);
 assert.equal(REVIEW_PERFORMANCES.filter(record=>record.seasonType==='REG').length,21);
 for(const record of postseason){
  assert.equal(record.week,null);
  assert.equal(record.roundLabel,'Postseason');
  assert.ok(record.sourceWeek>=15);
  assert.equal(record.provenance.derivations.twoPoint.sourceRoundLabel,'CONFERENCE CHAMPIONSHIP');
 }
 assert.equal(postseason.find(record=>record.date==='1972-01-02')?.season,1971);
 const layne=REVIEW_PERFORMANCES.find(record=>record.date==='1961-12-17')!;
 assert.equal(layne.week,15);assert.equal(layne.sourceWeek,14);
 const jurgensen=REVIEW_PERFORMANCES.find(record=>record.date==='1962-11-11')!;
 assert.equal(jurgensen.week,10);assert.equal(jurgensen.sourceWeek,9);
 const negatives=REVIEW_PERFORMANCES.flatMap(record=>['passingYards','rushingYards','receivingYards'].flatMap(key=>{
  const value=record.stats[key as keyof typeof record.stats];
  return typeof value==='number'&&value<0?[[record.date,key,value]]:[];
 }));
 assert.deepEqual(negatives,[['1960-12-10','passingYards',-7],['1961-12-31','rushingYards',-4],['1957-10-27','rushingYards',-2]]);
 const originalColts=REVIEW_PERFORMANCES.find(record=>record.date==='1950-09-24')!;
 assert.equal(originalColts.teamAtTime,'BAL');
 assert.equal(originalColts.provenance.historicalFranchiseId,'baltimore-colts-1950');
});

test('normal 435-player, 68,519-game archive and every original data file remain unchanged',()=>{
 assert.equal(ATHLETES.length,435);
 assert.equal(PERFORMANCES.length,68519);
 assert.equal(DATA_COVERAGE.performanceCount,68519);
 assert.equal(ATHLETES.filter(player=>player.position==='K').length,40);
 const normalAthletes=new Set(ATHLETES.map(player=>player.id));
 const normalRecords=new Set(PERFORMANCES.map(record=>record.id));
 for(const player of REVIEW_PLAYERS)assert.equal(normalAthletes.has(player.id),false);
 for(const record of REVIEW_PERFORMANCES)assert.equal(normalRecords.has(record.id),false);
 const hashes={
  'athletes.json':'ab510b57d3557a5517193f6aa93f841a93eac38cf89135578259e8cf00206a64',
  'records.json':'becab5c0b092a76925cd2f75244764b2df570365ad3ba9a9d5704cd8ce754419',
  'kicker-athletes.json':'ac3b9f6a963fc6be67a93e6228948726f2a19225fba91fd15b52060d5528be8d',
  'kicker-records.json':'f7363634e49a3a5395eafc1010555afc6888bd89fd98d5b2fa4f0bdb5fc6a99d',
  'coverage.json':'9e89f6e2f716d91f4a3177430fff9a62d64670235ef946912336d29b5680d659',
 };
 for(const [file,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(readFileSync(new URL(`../data/nflverse/${file}`,import.meta.url))).digest('hex'),hash,file);
});
