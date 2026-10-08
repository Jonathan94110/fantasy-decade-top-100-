import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {League,Lineup} from '../lib/game-engine';
import type {Season} from '../lib/season-model';
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}
});
const {ATHLETES,PERFORMANCES,POSITIONS,LINEUP_SLOTS,eligibleForSlot,score,scoringBreakdown}=await import('../lib/historical-data');
const {newLeague,lockLineup,nextRound,publicLeague,validateLineup,normalizeLeague}=await import('../lib/game-engine');
const {newSeason,joinSeason,seasonAction,publicSeason,normalizeSeason}=await import('../lib/season-engine');
const {scoringFor}=await import('../lib/scoring-rules');
function lineup():Lineup{const picks:Lineup={};for(const p of LINEUP_SLOTS)picks[p]=ATHLETES.find(a=>eligibleForSlot(a,p)&&!a.legend&&!Object.values(picks).includes(a.id)&&a.gameCount>25)!.id;return picks;}
function noRng(run:()=>void){const original=crypto.getRandomValues;crypto.getRandomValues=()=>{throw new Error('Unexpected RNG before complete validation');};try{run();}finally{crypto.getRandomValues=original;}}
// Existing Strict roster fixtures keep their original CPU selections.
function drafted(capacity=2,hallCap=2):Season{let s=newSeason('owner',{name:'Flex QA',teamName:'Owner',capacity,hallCap,scoringMode:'strict'},'CODE');for(let i=1;i<capacity;i++)s=joinSeason(s,`u${i}`,`Team ${i}`);s=seasonAction(s,'owner',{action:'startDraft'});while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});return s;}
const seed=drafted();
function rawLegacy(s:Season){const old=structuredClone(s);delete old.lineupVersion;for(const t of old.teams)delete t.lineup.FLEX;return old;}

test('FLEX is a lineup slot, never a source player position',()=>{
 assert.equal(POSITIONS.length,5);assert.equal(LINEUP_SLOTS.length,6);assert.ok(ATHLETES.every(a=>a.position!=='FLEX' as string));
 for(const p of ['RB','WR','TE'] as const){const picks=lineup();picks.FLEX=ATHLETES.find(a=>a.position===p&&!a.legend&&!Object.values(picks).includes(a.id))!.id;assert.doesNotThrow(()=>validateLineup(picks,newLeague('six')));}
});
test('wrong-position, duplicate, missing and extra FLEX picks fail before RNG',()=>{
 const picks=lineup(),s=newLeague('invalid');
 noRng(()=>{for(const bad of [picks.QB,picks.DEF,'unknown',picks.RB,picks.WR,picks.TE])assert.throws(()=>lockLineup(s,{...picks,FLEX:bad},0),/valid FLEX|different athlete/);const missing={...picks};delete missing.FLEX;assert.throws(()=>lockLineup(s,missing,0),/all 6/);assert.throws(()=>lockLineup(s,{...picks,EXTRA:picks.FLEX},0),/all 6/);});
});
test('FLEX Hall selections ignore legacy caps one and two',()=>{
 for(const cap of [1,2]){const picks=lineup();picks.QB=ATHLETES.find(a=>a.position==='QB'&&a.legend)!.id;if(cap===2)picks.WR=ATHLETES.find(a=>a.position==='WR'&&a.legend)!.id;picks.FLEX=ATHLETES.find(a=>a.position==='TE'&&a.legend)!.id;assert.doesNotThrow(()=>validateLineup(picks,{...newLeague('cap'),hallCap:cap}));assert.doesNotThrow(()=>validateLineup(picks,{...newLeague('unlimited'),hallCap:0}));}
});
test('shared athlete in base slot and opponent FLEX needs two distinct remaining games',()=>{
 const home=lineup(),away={...home,RB:home.FLEX,FLEX:home.RB};const first=lockLineup(newLeague('shared'),home,0),saved=lockLineup(first,away,1);
 const a=saved.history[0].draws[0].find(d=>d.athleteId===home.RB)!,b=saved.history[0].draws[1].find(d=>d.slot==='FLEX')!;assert.notEqual(a.performance.id,b.performance.id);assert.equal(saved.used.length,12);
 const last=PERFORMANCES.find(p=>p.athleteId===home.RB)!;const used=PERFORMANCES.filter(p=>p.athleteId===home.RB&&p.id!==last.id).map(p=>p.id);const almost=lockLineup({...newLeague('last'),used},home,0);noRng(()=>assert.throws(()=>lockLineup(almost,away,1),/no available performance/));
});
test('six-slot receipts, saved draws and no-repeat ledger survive new rounds',()=>{
 const picks=lineup(),s=lockLineup(lockLineup(newLeague('receipt'),picks,0),picks,1);assert.equal(s.used.length,12);
 for(const d of s.history[0].draws.flat()){const position=ATHLETES.find(a=>a.id===d.athleteId)!.position,rules=scoringFor(s.history[0]);assert.equal(d.points,score(d.performance.stats,position,rules));assert.equal(Math.round(scoringBreakdown(d.performance.stats,position,rules).reduce((n,i)=>n+i.points,0)*100)/100,d.points);}
 const before=JSON.stringify(s.history);const next=lockLineup(lockLineup(nextRound(s),picks,0),picks,1);assert.equal(new Set(next.used).size,24);assert.equal(JSON.stringify(next.history.slice(0,1)),before);const loaded=JSON.parse(JSON.stringify(next)) as League;noRng(()=>assert.deepEqual(publicLeague(loaded),publicLeague(next)));
});
test('legacy quick locks finish five, retain ten draws, and next round upgrades without history edits',()=>{
 const picks=lineup();delete picks.FLEX;const legacy={...newLeague('legacy'),lineupVersion:1 as const};const first=lockLineup(legacy,picks,0);delete first.lineupVersion;const original=JSON.stringify(first);assert.equal(publicLeague(first).lineupVersion,1);assert.equal(JSON.stringify(first),original);
 const result=lockLineup(first,picks,1);assert.equal(result.used.length,10);assert.equal(result.history[0].draws[0].length,5);const history=JSON.stringify(result.history);delete result.lineupVersion;const restored=publicLeague(result);assert.equal(restored.lineupVersion,1);assert.equal(JSON.stringify(restored.history),history);const next=nextRound(result);assert.equal(next.lineupVersion,2);assert.equal(JSON.stringify(next.history),history);const open=newLeague('unlocked');delete open.lineupVersion;assert.equal(normalizeLeague(open).lineupVersion,2);
});
test('legacy unlocked online rounds upgrade deterministically; locked rounds keep saved starters',()=>{
 const unlocked=rawLegacy(seed),before=JSON.stringify(unlocked);const migrated=normalizeSeason(unlocked);assert.equal(migrated.lineupVersion,2);assert.ok(migrated.teams.every(t=>new Set(Object.values(t.lineup)).size===6));assert.equal(JSON.stringify(unlocked),before);assert.deepEqual(normalizeSeason(unlocked),migrated);
 const locked=rawLegacy(seed);locked.teams[0].locked=true;const unchanged=JSON.stringify(locked.teams);const view=normalizeSeason(locked);assert.equal(view.lineupVersion,1);assert.equal(JSON.stringify(view.teams),unchanged);const result=seasonAction(locked,'owner',{action:'closeRound'});assert.equal(result.used.length,20);const history=JSON.stringify(result.history);const next=seasonAction(result,'owner',{action:'next'});assert.equal(next.lineupVersion,2);assert.equal(JSON.stringify(next.history),history);assert.ok(next.teams.every(t=>Object.keys(t.lineup).length===6));
});
test('legacy completed seasons preserve history, rosters, champion and used pool',()=>{
 let s=rawLegacy(seed);s.lineupVersion=1;while(s.status!=='complete'){s=seasonAction(s,'owner',{action:s.status==='review'?'next':'closeRound'});if(s.status==='active'){s.lineupVersion=1;for(const t of s.teams)delete t.lineup.FLEX;}}
 delete s.lineupVersion;const before=JSON.stringify(s);const view=publicSeason(s,'owner');assert.equal(view.lineupVersion,1);assert.deepEqual(view.history.map(r=>r.matches),s.history.map(r=>r.matches));assert.ok(view.history.every(r=>r.receiptsHidden));assert.equal(view.used.length,s.used.length);assert.equal(view.champion,s.champion);assert.equal(JSON.stringify(s),before);let revealed=s;for(const round of s.history)revealed=seasonAction(revealed,'owner',{action:'revealReplay',round:round.number});const completed=publicSeason(revealed,'owner');assert.deepEqual(completed.history.map(({receiptsHidden,...r})=>r),s.history);assert.deepEqual(completed.used,s.used);assert.equal(JSON.stringify(revealed.history),JSON.stringify(s.history));
});
test('legacy HOF-constrained roster can fill FLEX without changing the source save',()=>{
 const s=rawLegacy(seed);s.hallCap=1;const t=s.teams[0];const players=(p:string,hof:boolean,n:number)=>ATHLETES.filter(a=>a.position===p&&!!a.legend===hof&&a.gameCount>30).slice(0,n).map(a=>a.id);
 t.roster=[...players('QB',true,3),...players('DEF',false,2),...players('RB',true,2),...players('RB',false,1),...players('WR',false,1),...players('TE',false,1)];t.lineup=Object.fromEntries(POSITIONS.map(p=>[p,t.roster.find(id=>ATHLETES.find(a=>a.id===id)!.position===p&&(p==='QB'||!ATHLETES.find(a=>a.id===id)!.legend))!]));
 const migrated=normalizeSeason(s);assert.ok(migrated.teams[0].lineup.FLEX);const before=JSON.stringify(s);assert.doesNotThrow(()=>seasonAction(s,'owner',{action:'closeRound'}));assert.equal(JSON.stringify(s),before);
});
test('online FLEX rejects duplicate or unowned players and prevalidates everyone before draws',()=>{
 const s=structuredClone(seed),t=s.teams[1];noRng(()=>{assert.throws(()=>seasonAction(s,t.userId,{action:'lock',lineup:{...t.lineup,FLEX:t.lineup.RB}}),/different/);assert.throws(()=>seasonAction(s,t.userId,{action:'lineup',lineup:{...t.lineup,FLEX:s.teams[0].lineup.RB}}),/own roster/);t.lineup.FLEX='';assert.throws(()=>seasonAction(s,'owner',{action:'closeRound'}),/FLEX/);});assert.equal(s.used.length,0);
});
test('all supported league sizes and Hall caps finish a draft with six unique owned starters',()=>{
 for(const capacity of [2,4,6,8])for(const cap of [0,1,2]){const s=drafted(capacity,cap);for(const t of s.teams){assert.equal(t.roster.length,10);assert.equal(new Set(Object.values(t.lineup)).size,6);assert.ok(LINEUP_SLOTS.every(p=>t.roster.includes(t.lineup[p])&&eligibleForSlot(ATHLETES.find(a=>a.id===t.lineup[p]),p)));}const scored=seasonAction(s,'owner',{action:'closeRound'});assert.equal(scored.used.length,capacity*10);}
});

test('trade can move current FLEX into base slot and replace FLEX without changing other starters',()=>{
 let s=structuredClone(seed);const [a,b]=s.teams;const give=a.lineup.RB,receive=b.roster.find(id=>ATHLETES.find(p=>p.id===id)!.position==='WR'&&!Object.values(b.lineup).includes(id))!;
 assert.ok(receive);assert.equal(ATHLETES.find(p=>p.id===a.lineup.FLEX)!.position,'RB');const previous={...a.lineup};s=seasonAction(s,a.userId,{action:'offer',to:b.id,give,receive});s=seasonAction(s,b.userId,{action:'accept',tradeId:s.trades[0].id});const next=s.teams[0].lineup;assert.equal(next.RB,previous.FLEX);assert.notEqual(next.FLEX,next.RB);assert.equal(new Set(Object.values(next)).size,6);for(const p of ['QB','WR','TE','DEF'])assert.equal(next[p],previous[p]);assert.deepEqual(s.used,[]);
});

function constrainToLegacyCap(s:Season,index:number){
 s.hallCap=1;const t=s.teams[index],players=(p:string,hof:boolean,n:number)=>ATHLETES.filter(a=>a.position===p&&!!a.legend===hof&&a.gameCount>30&&!s.teams.filter(other=>other.id!==t.id).some(other=>other.roster.includes(a.id))).slice(0,n).map(a=>a.id);
 t.roster=[...players('QB',true,3),...players('DEF',false,2),...players('RB',true,2),...players('RB',false,1),...players('WR',false,1),...players('TE',false,1)];t.lineup=Object.fromEntries(POSITIONS.map(p=>[p,t.roster.find(id=>ATHLETES.find(a=>a.id===id)!.position===p&&(p==='QB'||!ATHLETES.find(a=>a.id===id)!.legend))!]));
}
test('legacy playoff can add legal FLEX after the Hall cap is removed',()=>{
 const s=rawLegacy(seed);constrainToLegacyCap(s,0);s.round=s.regularRounds+1;s.playoffSeeds=s.teams.map(t=>t.id);const before=JSON.stringify(s);const migrated=normalizeSeason(s);assert.equal(migrated.lineupVersion,2);assert.ok(migrated.teams.every(t=>t.lineup.FLEX));const final=seasonAction(s,'owner',{action:'closeRound'});assert.equal(final.status,'complete');assert.equal(final.used.length,20);assert.equal(JSON.stringify(s),before);
});
test('legacy draft already constrained to five can finish and opens FLEX with editable rosters',()=>{
 const s=rawLegacy(seed);constrainToLegacyCap(s,1);s.status='draft';s.draftOrder=s.teams.map(t=>t.id);s.pick=19;s.teams[0].roster.pop();s.teams[0].lineup={};assert.equal(normalizeSeason(s).lineupVersion,2);
 const active=seasonAction(s,'owner',{action:'autopick'});assert.equal(active.status,'active');assert.equal(active.lineupVersion,2);assert.ok(active.teams[1].lineup.FLEX);assert.ok(active.teams.every(t=>!t.locked&&t.roster.length===10));
});
