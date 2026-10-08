import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
import type {Season} from '../lib/season-model';
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}
});
const {newSeason,joinSeason,seasonAction,publicSeason,remainingGames,draftTeam,currentPairs,requiredGames,seasonLength,standings}=await import('../lib/season-engine');
const {ATHLETES,PERFORMANCES}=await import('../lib/historical-data');
// This suite checks saved Strict rosters and receipts against the original archive.
function draft(capacity=2,hallCap=2){let s=newSeason('owner',{name:'QA Season',teamName:'Owner',capacity,hallCap,scoringMode:'strict'},'QA-CODE');for(let i=1;i<capacity;i++)s=joinSeason(s,`manager-${i}`,`Team ${i}`);return seasonAction(s,'owner',{action:'startDraft'});}
function finish(s:Season){while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});return s;}
const base=finish(draft());
const active=()=>structuredClone(base);
const position=(id:string)=>ATHLETES.find(a=>a.id===id)!.position;
const pick=(s:Season,id:string)=>seasonAction(s,s.teams.find(t=>t.id===draftTeam(s))!.userId,{action:'draft',athleteId:id});

test('snake order, unique ownership, balanced full schedule, and ten-position-complete rosters',()=>{
 const s=finish(draft(8));assert.equal(s.status,'active');assert.equal(s.pick,80);
 assert.equal(new Set(s.teams.flatMap(t=>t.roster)).size,80);
 for(const t of s.teams){assert.equal(t.roster.length,10);assert.equal(new Set(t.roster.map(position)).size,5);const opponents=s.schedule.flatMap(p=>p.filter(m=>m.includes(t.id)).map(m=>m.find(id=>id!==t.id)!));for(const other of s.teams.filter(other=>other.id!==t.id))assert.equal(opponents.filter(id=>id===other.id).length,2);}
 const q=draft(4);assert.deepEqual(Array.from({length:8},(_,pick)=>draftTeam({...q,pick})),[...q.draftOrder,...q.draftOrder.toReversed()]);
});
test('only current manager or explicit commissioner autopick may draft',()=>{
 const s=draft();const other=s.teams.find(t=>t.id!==draftTeam(s))!;
 assert.throws(()=>seasonAction(s,other.userId,{action:'draft',athleteId:ATHLETES[0].id}),/turn/);
 assert.throws(()=>seasonAction(s,'manager-1',{action:'autopick'}),/commissioner/);
 const next=seasonAction(s,'owner',{action:'autopick'});assert.equal(next.pick,1);assert.match(next.activity.map(a=>a.text).join(' '),/automatic pick/);assert.equal(s.pick,0);
});
test('draft can exceed legacy HOF capacity and valid remaining picks can finish',()=>{
 let s=draft(2,1);s.draftOrder=s.teams.map(t=>t.id);
 const hofQbs=ATHLETES.filter(a=>a.position==='QB'&&a.legend&&remainingGames(s,a.id)>=seasonLength(s)).slice(0,3);
 const hofRbs=ATHLETES.filter(a=>a.position==='RB'&&a.legend&&remainingGames(s,a.id)>=seasonLength(s)).slice(0,3);
 assert.equal(hofQbs.length,3);assert.equal(hofRbs.length,3);
 for(const a of [...hofQbs,...hofRbs.slice(0,2)]){while(draftTeam(s)!==s.teams[0].id)s=seasonAction(s,'owner',{action:'autopick'});s=pick(s,a.id);}
 while(draftTeam(s)!==s.teams[0].id)s=seasonAction(s,'owner',{action:'autopick'});
 s.hallCap=1;s=pick(s,hofRbs[2].id);assert.equal(finish(s).status,'active');
});
test('bench-only trade preserves every starter and requires recipient acceptance',()=>{
 let s=active();const [a,b]=s.teams;const give=a.roster.find(id=>position(id)==='QB'&&id!==a.lineup.QB)!,receive=b.roster.find(id=>position(id)==='QB'&&id!==b.lineup.QB)!;
 const saved=s.teams.map(t=>({...t.lineup}));s=seasonAction(s,a.userId,{action:'offer',to:b.id,give,receive});const offer=s.trades[0];
 assert.throws(()=>seasonAction(s,a.userId,{action:'accept',tradeId:offer.id}),/receiving manager/);
 s=seasonAction(s,b.userId,{action:'accept',tradeId:offer.id});assert.deepEqual(s.teams.map(t=>t.lineup),saved);assert.equal(s.trades[0].status,'accepted');assert.ok(s.teams[0].roster.includes(receive));assert.ok(!s.teams[1].roster.includes(receive));
});
test('lock permissions, round persistence, and used-game ledger survive trade and drop',()=>{
 let s=active();const [a,b]=s.teams;s=seasonAction(s,a.userId,{action:'lock',lineup:a.lineup});assert.equal(s.history.length,0);assert.equal(s.teams[0].locked,true);
 assert.throws(()=>seasonAction(s,a.userId,{action:'swap',drop:a.roster[0],add:'bogus'}),/locked/);
 s=seasonAction(s,b.userId,{action:'lock',lineup:b.lineup});assert.equal(s.status,'review');assert.equal(s.history.length,1);assert.equal(s.used.length,20);assert.equal(requiredGames(s),seasonLength(s)-1);
 const ledger=[...s.used],give=s.teams[0].lineup.QB,receive=s.teams[1].lineup.QB;
 assert.throws(()=>seasonAction(s,a.userId,{action:'offer',to:b.id,give,receive}),/next week/);s=seasonAction(s,'owner',{action:'next'});s=seasonAction(s,a.userId,{action:'offer',to:b.id,give,receive});s=seasonAction(s,b.userId,{action:'accept',tradeId:s.trades[0].id});assert.deepEqual(s.used,ledger);
 s=seasonAction(s,'owner',{action:'closeRound'});assert.equal(s.used.length,s.history.flatMap(r=>[...Object.values(r.draws).flat(),...Object.values(r.benchDraws||{}).flat()]).filter(d=>!d.simulatedBye).length);assert.equal(new Set(s.used).size,s.used.length);assert.ok(ledger.every(id=>s.used.includes(id)));
 const drop=s.teams[0].roster.find(id=>position(id)==='QB')!;const add=ATHLETES.find(p=>p.position==='QB'&&!s.teams.some(t=>t.roster.includes(p.id))&&!p.legend)!;const before=[...s.used];s=seasonAction(s,a.userId,{action:'swap',drop,add:add.id});assert.deepEqual(s.used,before);assert.ok(!s.teams.some(t=>t.roster.includes(drop)));assert.equal(s.teams[0].roster.length,10);
});
test('invalid trade acceptance and stale ownership do not change any canonical state',()=>{
 let s=active();const [a,b]=s.teams;const give=a.roster[0],receive=b.roster[0];s=seasonAction(s,a.userId,{action:'offer',to:b.id,give,receive});const id=s.trades[0].id;
 const free=ATHLETES.find(p=>p.position===position(give)&&!s.teams.some(t=>t.roster.includes(p.id))&&!p.legend)!;s=seasonAction(s,a.userId,{action:'swap',drop:give,add:free.id});assert.equal(s.trades[0].status,'expired');const frozen=JSON.stringify(s);assert.throws(()=>seasonAction(s,b.userId,{action:'accept',tradeId:id}),/no longer pending/);assert.equal(JSON.stringify(s),frozen);
});
test('private views omit identities, opponent starters, other pending offers and join code',()=>{
 const s=finish(draft(4));const [a,b,c]=s.teams;const offer=seasonAction(s,a.userId,{action:'offer',to:b.id,give:a.roster[0],receive:b.roster[0]});const view=publicSeason(offer,c.userId);
 assert.ok(!('ownerId' in view));assert.ok(!('inviteCode' in view));assert.ok(view.teams.every(t=>!('userId' in t)));assert.equal(view.trades.length,0);assert.deepEqual(view.teams.find(t=>t.id===a.id)!.lineup,{});assert.deepEqual(view.teams.find(t=>t.id===c.id)!.lineup,c.lineup);assert.throws(()=>publicSeason(s,'outsider'),/not a manager/);
});
test('complete season freezes rosters and results, only playoff teams draw, and champion stays saved',()=>{
 let s=finish(draft(6));const rosters=s.teams.map(t=>[...t.roster]);while(s.status!=='complete'){if(s.status==='review')s=seasonAction(s,'owner',{action:'next'});else s=seasonAction(s,'owner',{action:'closeRound'});}
 assert.equal(s.history.length,12);assert.deepEqual(s.teams.map(t=>t.roster),rosters);assert.equal(s.history.at(-2)!.matches.length,2);assert.equal(Object.keys(s.history.at(-2)!.draws).length,4);assert.equal(Object.keys(s.history.at(-1)!.draws).length,2);assert.equal(currentPairs(s)[0].length,2);assert.equal(s.champion,s.history.at(-1)!.matches[0].winner);assert.equal(standings(s).reduce((n,t)=>n+t.wins+t.losses+t.ties,0),60);assert.equal(s.used.length,new Set(s.used).size);assert.throws(()=>seasonAction(s,'owner',{action:'next'}),/Finish/);assert.throws(()=>seasonAction(s,'owner',{action:'closeRound'}),/closed/);
 for(const r of s.history)for(const draws of Object.values(r.draws))for(const d of draws)assert.ok(d.simulatedBye?d.points===0&&Object.keys(d.performance).length===0:PERFORMANCES.some(p=>p.id===d.performance.id&&p.athleteId===d.athleteId));
});

test('only a new league lobby may change scoring; resolved snapshots and bench stay intact',()=>{
 let s=newSeason('owner',{name:'Half PPR',teamName:'Owner',capacity:2,receptionPoints:.5},'SCORING');
 assert.equal(s.scoring!.receptionPoints,.5);s=joinSeason(s,'manager-1','Guest');
 assert.throws(()=>seasonAction(s,'manager-1',{action:'rules',receptionPoints:0}),/commissioner/);
 s=seasonAction(s,'owner',{action:'rules',receptionPoints:0});assert.equal(s.scoring!.receptionPoints,0);
 s=seasonAction(s,'owner',{action:'startDraft'});assert.throws(()=>seasonAction(s,'owner',{action:'rules',receptionPoints:1}),/fixed/);
 s=finish(s);const bench=s.teams.flatMap(t=>t.roster.filter(id=>!Object.values(t.lineup).includes(id)));s=seasonAction(s,'owner',{action:'closeRound'});
 assert.equal(s.history[0].scoring!.receptionPoints,0);assert.equal(s.used.length,20);assert.ok(s.history[0].draws&&Object.values(s.history[0].draws).flat().every(d=>!bench.includes(d.athleteId)));
 const before=JSON.stringify(s.history);s=seasonAction(s,'owner',{action:'next'});assert.equal(JSON.stringify(s.history),before);assert.equal(s.scoring!.receptionPoints,0);
 const legacy=newSeason('owner',{name:'Legacy',teamName:'Owner',capacity:2},'OLD');delete legacy.scoring;assert.throws(()=>seasonAction(legacy,'owner',{action:'rules',receptionPoints:0}),/legacy/);
});
