import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
registerHooks({load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},resolve(id,context,next){try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}});
const {ATHLETES,ALL_ATHLETES,LINEUP_SLOTS,eligibleForSlot}=await import('../lib/game-model');
const {newLeague,lockLineup,publicLeague}=await import('../lib/game-engine');
const {fillOpenSlots}=await import('../lib/draft-tools');
const {newSeason,joinSeason,seasonAction,repairLineup,publicSeason}=await import('../lib/season-engine');
const {newDemoDraft,demoDraftAction,cpuTradeDecision}=await import('../lib/demo-draft-engine');
const {demoPickReason}=await import('../lib/demo-draft-model');
const hof=(p:string,excluded:string[]=[])=>ATHLETES.find(a=>a.position===p&&a.legend&&a.gameCount>30&&!excluded.includes(a.id))!.id;
test('new games ignore requested caps; old quick saves can fill and lock five HOF starters',()=>{
 assert.equal(newLeague('new').hallCap,0);assert.equal(newSeason('a',{name:'New',teamName:'A',capacity:2,hallCap:2},'code').hallCap,0);
 const legacy={...newLeague('old'),hallCap:2},picks:Record<string,string>={};for(const slot of LINEUP_SLOTS)picks[slot]=slot==='DEF'?ATHLETES.find(a=>a.position==='DEF')!.id:hof(slot==='FLEX'?'RB':slot,Object.values(picks));
 const staged={QB:picks.QB,RB:picks.RB,WR:picks.WR};assert.doesNotThrow(()=>fillOpenSlots(legacy,staged,()=>0));
 const first=lockLineup(legacy,picks,0);assert.equal(first.used.length,0);assert.deepEqual(publicLeague(first).lineups,[{},{}]);
 const result=lockLineup(first,picks,1);assert.equal(result.history[0].draws.flat().length,12);assert.equal(new Set(result.used).size,12);assert.equal(legacy.hallCap,2);assert.deepEqual(legacy.history,[]);
});
test('legacy active season saves, swaps, and locks more than two HOF without mutating history or pools',()=>{
 let s=newSeason('a',{name:'Old cap',teamName:'A',capacity:2,format:'seventeen'},'code');s=joinSeason(s,'b','B');s=seasonAction(s,'a',{action:'startDraft'});while(s.status==='draft')s=seasonAction(s,'a',{action:'autopick'});s.hallCap=2;
 const t=s.teams[0],other=s.teams[1];const blocked=other.roster;const roster:string[]=[];for(const [p,n] of [['QB',2],['RB',3],['WR',2],['TE',1],['DEF',2]] as const){roster.push(...ATHLETES.filter(a=>a.position===p&&(p==='DEF'||a.legend)&&a.gameCount>30&&!blocked.includes(a.id)).slice(0,n).map(a=>a.id));}assert.equal(roster.length,10);t.roster=roster;t.lineup=repairLineup(s,t);assert.equal(Object.values(t.lineup).filter(id=>ATHLETES.find(a=>a.id===id)!.legend).length,5);
 const frozen=JSON.stringify(s),used=[...s.used],history=structuredClone(s.history);s=seasonAction(s,'a',{action:'lineup',lineup:t.lineup});const drop=s.teams[0].lineup.QB,add=hof('QB',s.teams.flatMap(t=>t.roster));s=seasonAction(s,'a',{action:'swap',drop,add});assert.deepEqual(s.used,used);assert.deepEqual(s.history,history);
 const me=s.teams[0];s=seasonAction(s,'a',{action:'lock',lineup:me.lineup,acceptBye:true});assert.equal(s.status,'active');assert.deepEqual(s.used,used);assert.deepEqual(publicSeason(s,'b').teams.find(x=>x.id===me.id)!.lineup,{});assert.notEqual(JSON.stringify(s),frozen);
});
test('CPU draft and trade values are independent of old HOF cap fields',()=>{
 let d=newDemoDraft('Human',1,{scoringMode:'strict'});while(d.status==='draft'){const a=ATHLETES.find(a=>!demoPickReason(d,d.humanTeamId,a.id))!;d=demoDraftAction(d,{action:'draft',athleteId:a.id});}assert.ok(d.teams.filter(t=>t.control==='computer').some(t=>t.roster.filter(id=>ALL_ATHLETES.find(a=>a.id===id)!.legend).length>2));
 let s=newSeason('a',{name:'CPU',teamName:'A',capacity:2},'code');s=joinSeason(s,'b','B');s=seasonAction(s,'a',{action:'startDraft'});while(s.status==='draft')s=seasonAction(s,'a',{action:'autopick'});const [a,b]=s.teams;assert.deepEqual(cpuTradeDecision({...s,hallCap:2},b.id,a.lineup.QB,b.lineup.QB),cpuTradeDecision({...s,hallCap:0},b.id,a.lineup.QB,b.lineup.QB));
});
test('cap controls and blocking language are absent while informational badges remain',()=>{
 for(const f of ['app/matchup/page.tsx','components/season-workspace.tsx','components/demo-draft-room.tsx','components/online-league.tsx','components/game-rules.tsx','components/draft-details.tsx','components/trade-desk.tsx'])assert.doesNotMatch(readFileSync(new URL('../'+f,import.meta.url),'utf8'),/Hall of Fame (?:limit|cap)|Hall of Fame starters|hallCap|overCap|Counts toward your lineup limit/);
 assert.match(readFileSync(new URL('../components/era-library.tsx',import.meta.url),'utf8'),/hof-badge/);
});
