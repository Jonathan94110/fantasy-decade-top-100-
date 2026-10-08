import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import type {Season} from '../lib/season-model';
import type {DemoDraft} from '../lib/demo-draft-model';

const root=new URL('../',import.meta.url);
type NextDatabase=ReturnType<typeof memoryDatabase>;
const audit=globalThis as typeof globalThis&{__nextDatabase?:NextDatabase};
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){
  if(id==='@/db')return {url:'data:text/javascript,export function database(){return globalThis.__nextDatabase}',shortCircuit:true};
  if(id.startsWith('@/'))id=new URL(id.slice(2),root).href;
  try{return next(id,context);}catch(error){if(!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}
 }
});
const {newSeason,joinSeason,seasonAction,publicSeason,currentPairs,standings}=await import('../lib/season-engine');
const {demoDraftAction,demoReply}=await import('../lib/demo-draft-engine');
const {seasonPhase}=await import('../lib/season-view');
const {inviteHash}=await import('../lib/season-store');
const {withBatch}=await import('./helpers/memory-d1-batch');
const {savedLeague,savedDemo}=await import('./helpers/saved-state');
const onlineApi=await import('../app/api/leagues/[id]/route');
const soloApi=await import('../app/api/demo/route');
const modes=['strict','historical'] as const;

function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('drizzle/',root)).filter(name=>name.endsWith('.sql')))sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 let gate:Promise<void>|undefined,release:(()=>void)|undefined,arrivals=0;
 const arrive=async()=>{if(gate){const pending=gate;if(++arrivals===2){release!();gate=undefined;}await pending;}};
 return withBatch({sql,raceUpdates(){arrivals=0;gate=new Promise<void>(resolve=>{release=resolve;});},prepare(query:string){
  let values:SQLInputValue[]=[];
  return {bind(...args:unknown[]){values=args as SQLInputValue[];return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){
   if(query.startsWith('UPDATE '))await arrive();
   return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};
  }};
 }},{beforeWrite:statements=>statements.some(statement=>statement.query?.startsWith('UPDATE '))?arrive():undefined});
}
function request(path:string,body:Record<string,unknown>,user='owner',origin='https://next.test'){
 return new Request(`https://next.test${path}`,{method:'POST',headers:{...(user?{'oai-authenticated-user-id':user}:{}),origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
async function noPerformanceDraws<T>(run:()=>T|Promise<T>){
 const previous=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');let calls=0;
 Object.defineProperty(crypto,'getRandomValues',{configurable:true,value(){calls++;throw new Error('Navigation must not draw a historical year or game.');}});
 try{const result=await run();assert.equal(calls,0);return result;}
 finally{if(previous)Object.defineProperty(crypto,'getRandomValues',previous);else delete (crypto as unknown as {getRandomValues?:unknown}).getRandomValues;}
}
function active(mode:typeof modes[number],capacity=6):Season{
 let s=newSeason('owner',{name:'Next transition',teamName:'Owner',capacity,format:'seventeen',playoffTeams:6,kickers:true,scoringMode:mode},'NEXT-CODE');
 for(let index=1;index<capacity;index++)s=joinSeason(s,`manager-${index}`,`Team ${index}`);
 s=seasonAction(s,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:Array.from({length:capacity},(_,index)=>index)});
 while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});
 return s;
}
function review(mode:typeof modes[number]){return seasonAction(active(mode),'owner',{action:'closeRound'});}
function stableRecords(s:Season){return JSON.stringify({history:s.history,used:s.used,scoring:s.scoring,replayReveals:s.replayReveals,rosters:s.teams.map(team=>team.roster),lineups:s.teams.map(team=>team.lineup),draftOrder:s.draftOrder,draftPicks:s.draftPicks,schedule:s.schedule});}
function soloFrom(input:Season,humanTeamId=input.teams[0].id):DemoDraft{
 const season=structuredClone(input);season.ownerId=humanTeamId;season.teams.forEach(team=>{team.userId=team.id;});
 return {id:season.id,revision:0,createdAt:season.createdAt,status:'complete',rosterSize:11,playoffTeams:6,scoring:structuredClone(season.scoring),byes:season.byes,order:[...season.draftOrder],pick:season.pick,humanTeamId,
  teams:season.teams.map(team=>({id:team.id,name:team.name,roster:[...team.roster],control:team.id===humanTeamId?'human':'computer',strategy:team.id===humanTeamId?null:0})),
  picks:(season.draftPicks||[]).map(pick=>({...pick,control:pick.teamId===humanTeamId?'human':'computer',at:season.createdAt,reason:pick.teamId===humanTeamId?'Your selection':'Saved fixture automatic pick'})),season};
}

test('next opens an editable week without draws, history changes, scoring changes or new receipt disclosure',async()=>{
 for(const mode of modes){
  const saved=review(mode),owner=saved.teams[0],visitor=saved.teams[1];
  saved.replayReveals={[owner.id]:[1]};saved.teams[0].locked=true;
  const input=JSON.stringify(saved),records=stableRecords(saved);
  const next=await noPerformanceDraws(()=>seasonAction(saved,'owner',{action:'next'}));
  assert.equal(next.round,2);assert.equal(next.status,'active');assert.ok(next.teams.every(team=>!team.locked));
  assert.equal(stableRecords(next),records);assert.equal(JSON.stringify(saved),input);
  assert.equal(publicSeason(next,'owner').history[0].receiptsHidden,false);
  const hidden=publicSeason(next,visitor.userId);assert.equal(hidden.history[0].receiptsHidden,true);assert.equal(hidden.history[0].benchDraws,undefined);
  for(const draw of Object.values(saved.history[0].draws).flat())assert.ok(!JSON.stringify(hidden).includes(draw.performance.id!));
 }
});

test('next rejects unplayed or pending-lock weeks, noncommissioners and outsiders without changing state',async()=>{
 for(const mode of modes){
  const open=active(mode),pending=seasonAction(open,'owner',{action:'lock',lineup:open.teams[0].lineup});
  assert.equal(pending.history.length,0);assert.equal(pending.used.length,0);assert.equal(pending.teams[0].locked,true);
  for(const s of [open,pending]){const before=JSON.stringify(s);await noPerformanceDraws(()=>assert.throws(()=>seasonAction(s,'owner',{action:'next'}),/Finish the current round/));assert.equal(JSON.stringify(s),before);}
  const saved=review(mode),before=JSON.stringify(saved);
  await noPerformanceDraws(()=>{assert.throws(()=>seasonAction(saved,'manager-1',{action:'next'}),/commissioner/);assert.throws(()=>seasonAction(saved,'outsider',{action:'next'}),/not a manager/);});
  assert.equal(JSON.stringify(saved),before);
 }
});

test('next seeds and advances fixed playoffs without consuming future games, then rejects completed seasons',async()=>{
 for(const mode of modes){
  let s=active(mode);
  while(s.round<=s.regularRounds){s=seasonAction(s,'owner',{action:'closeRound'});if(s.round===s.regularRounds)break;s=seasonAction(s,'owner',{action:'next'});}
  const expectedSeeds=standings(s).slice(0,6).map(team=>team.teamId);
  for(const phase of ['quarterfinal','semifinal','final'] as const){
   const previous=s,records=stableRecords(s),before=JSON.stringify(s);
   s=await noPerformanceDraws(()=>seasonAction(previous,'owner',{action:'next'}));
   assert.equal(stableRecords(s),records);assert.equal(JSON.stringify(previous),before);assert.deepEqual(s.playoffSeeds,expectedSeeds);
   assert.equal(seasonPhase(s),phase);assert.ok(s.teams.every(team=>!team.locked));
   if(phase==='quarterfinal')assert.deepEqual(currentPairs(s),[[expectedSeeds[2],expectedSeeds[5]],[expectedSeeds[3],expectedSeeds[4]]]);
   s=seasonAction(s,'owner',{action:'closeRound'});
  }
  const completed=JSON.stringify(s);assert.equal(s.status,'complete');assert.equal(s.history.length,17);assert.ok(s.champion);
  await noPerformanceDraws(()=>assert.throws(()=>seasonAction(s,'owner',{action:'next'}),/Finish the current round/));
  assert.equal(JSON.stringify(s),completed);
  const demo=soloFrom(s),soloBefore=JSON.stringify(demo);
  await noPerformanceDraws(()=>assert.throws(()=>demoDraftAction(demo,{action:'next'}),/Finish the current round/));
  assert.equal(JSON.stringify(demo),soloBefore);
 }
});

test('solo next preserves prior replay reveals and keeps the following saved game hidden until its own reveal',async()=>{
 for(const mode of modes){
  let demo=soloFrom(review(mode));demo=demoDraftAction(demo,{action:'revealReplay',round:1});
  const saved=demo,before=JSON.stringify(demo),records=stableRecords(demo.season!);
  demo=await noPerformanceDraws(()=>demoDraftAction(demo,{action:'next'}));
  assert.equal(stableRecords(demo.season!),records);assert.equal(demo.season!.round,2);
  assert.equal(JSON.stringify(saved),before);assert.equal(saved.season!.round,1);
  const oldHistory=JSON.stringify(demo.season!.history[0]),human=demo.season!.teams.find(team=>team.id===demo.humanTeamId)!;
  demo=demoDraftAction(demo,{action:'lock',lineup:human.lineup,acceptBye:true});
  const reply=demoReply(demo);assert.ok('league' in reply);
  assert.equal(reply.league!.history[0].receiptsHidden,false);assert.equal(reply.league!.history[1].receiptsHidden,true);
  assert.equal(reply.league!.history[1].benchDraws,undefined);assert.equal(JSON.stringify(demo.season!.history[0]),oldHistory);
  assert.deepEqual(demo.season!.replayReveals?.[demo.humanTeamId],[1]);
 }
});

test('solo simulation resolves only other playoff teams and cannot bypass a participating human lineup',async()=>{
 for(const mode of modes){
  let s=active(mode);while(s.round<s.regularRounds){s=seasonAction(s,'owner',{action:'closeRound'});s=seasonAction(s,'owner',{action:'next'});}
  s=seasonAction(s,'owner',{action:'closeRound'});s=seasonAction(s,'owner',{action:'next'});
  const byeHuman=s.playoffSeeds[0],playingHuman=s.playoffSeeds[2],demo=soloFrom(s,byeHuman),before=JSON.stringify(demo),used=[...s.used];
  const resolved=demoDraftAction(demo,{action:'simulate'}),round=resolved.season!.history.at(-1)!;
  assert.equal(round.phase,'quarterfinal');assert.equal(Object.keys(round.draws).length,4);assert.equal(round.draws[byeHuman],undefined);assert.equal(round.benchDraws![byeHuman],undefined);
  assert.equal(resolved.season!.used.length-used.length,44);assert.ok(used.every(id=>resolved.season!.used.includes(id)));assert.equal(JSON.stringify(demo),before);
  const participating=soloFrom(s,playingHuman),pending=JSON.stringify(participating);
  await noPerformanceDraws(()=>assert.throws(()=>demoDraftAction(participating,{action:'simulate'}),/lock your own starters/));
  assert.equal(JSON.stringify(participating),pending);
 }
});

test('online racing next commits once; stale, active, unauthorized and cross-origin retries never advance again',async()=>{
 for(const mode of modes){
  const db=memoryDatabase();audit.__nextDatabase=db;
  const saved=review(mode),path=`/api/leagues/${saved.id}`,context={params:Promise.resolve({id:saved.id})},body={action:'next',revision:saved.revision};
  db.sql.prepare('INSERT INTO season_leagues VALUES (?,?,?,?,?,?)').run(saved.id,saved.ownerId,await inviteHash(saved.inviteCode),JSON.stringify(saved),saved.revision,saved.createdAt);
  const original=String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(saved.id)!.state);
  for(const [user,status] of [['',401],['outsider',404],['manager-1',400]] as const)assert.equal((await onlineApi.POST(request(path,body,user),context)).status,status);
  assert.equal((await onlineApi.POST(request(path,body,'owner','https://other.test'),context)).status,403);
  assert.equal(String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(saved.id)!.state),original);
  db.raceUpdates();const responses=await noPerformanceDraws(()=>Promise.all([onlineApi.POST(request(path,body),context),onlineApi.POST(request(path,body),context)]));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  const row=db.sql.prepare('SELECT state,revision FROM season_leagues WHERE id=?').get(saved.id)!,current=(await savedLeague(db.sql,saved.id))!;
  assert.equal(row.revision,saved.revision+1);assert.equal(current.round,2);assert.equal(current.status,'active');assert.equal(stableRecords(current),stableRecords(saved));
  await noPerformanceDraws(async()=>{assert.equal((await onlineApi.POST(request(path,body),context)).status,409);assert.equal((await onlineApi.POST(request(path,{...body,revision:current.revision}),context)).status,400);});
  assert.equal(String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(saved.id)!.state),String(row.state));
 }
});

test('solo racing next commits once and matching-revision or unauthorized retries preserve the saved week',async()=>{
 for(const mode of modes){
  const db=memoryDatabase();audit.__nextDatabase=db;
  const saved=soloFrom(review(mode)),path='/api/demo',body={action:'next',seasonId:saved.id,revision:saved.revision};
  db.sql.prepare('INSERT INTO demo_drafts VALUES (?,?,?,?,?)').run('owner',saved.id,JSON.stringify(saved),saved.revision,saved.createdAt);
  for(const [user,status] of [['',401],['outsider',404]] as const)assert.equal((await soloApi.POST(request(path,body,user))).status,status);
  assert.equal((await soloApi.POST(request(path,body,'owner','https://other.test'))).status,403);
  db.raceUpdates();const responses=await noPerformanceDraws(()=>Promise.all([soloApi.POST(request(path,body)),soloApi.POST(request(path,body))]));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  const row=db.sql.prepare('SELECT state,revision FROM demo_drafts WHERE owner_id=?').get('owner')!,current=(await savedDemo(db.sql,'owner'))!;
  assert.equal(row.revision,saved.revision+1);assert.equal(current.season!.round,2);assert.equal(current.season!.status,'active');assert.equal(stableRecords(current.season!),stableRecords(saved.season!));
  await noPerformanceDraws(async()=>{assert.equal((await soloApi.POST(request(path,body))).status,409);assert.equal((await soloApi.POST(request(path,{...body,revision:current.revision}))).status,400);});
  assert.equal(String(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state),String(row.state));
 }
});
