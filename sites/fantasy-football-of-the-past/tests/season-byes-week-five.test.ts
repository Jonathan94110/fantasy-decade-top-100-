import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import type {Season} from '../lib/season-model';
import type {DemoDraft} from '../lib/demo-draft-model';

const root=new URL('../',import.meta.url);
const audit=globalThis as typeof globalThis&{__weekFiveDatabase?:ReturnType<typeof memoryDatabase>};
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){
  if(id==='@/db')return {url:`data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__weekFiveDatabase;}')}`,shortCircuit:true};
  if(id.startsWith('@/'))return next(new URL(`${id.slice(2)}.ts`,root).href,context);
  try{return next(id,context);}catch(error){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw error;}
 }
});
const {FIRST_BYE_WEEK,assignByes,normalizeByes,onBye,byeStatus,byeLabel}=await import('../lib/season-byes');
const {athletesFor}=await import('../lib/game-model');
const {newScoring,scoringFor}=await import('../lib/scoring-rules');
const {newSeason,joinSeason,seasonAction}=await import('../lib/season-engine');
const {newDemoDraft}=await import('../lib/demo-draft-engine');
const {inviteHash}=await import('../lib/season-store');
const soloApi=await import('../app/api/demo/route');
const onlineApi=await import('../app/api/leagues/[id]/route');
const modes=['strict','historical'] as const;
function active(mode:typeof modes[number]){
 let s=joinSeason(newSeason('owner',{name:'Week five',teamName:'Owner',capacity:2,format:'seventeen',kickers:true,scoringMode:mode},'FIFTH'),'manager','Manager');
 s=seasonAction(s,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:[0,1]});
 while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});
 return s;
}
const seeds=new Map(modes.map(mode=>[mode,active(mode)]));
function freshSeason(mode:typeof modes[number]){return structuredClone(seeds.get(mode)!);}
const {withBatch}=await import('./helpers/memory-d1-batch');
function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('drizzle/',root)).filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 return {sql,prepare(query:string){let args:SQLInputValue[]=[];return {bind(...values:unknown[]){args=values as SQLInputValue[];return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};
}
function request(path:string,body?:Record<string,unknown>,user='owner'){return new Request(`https://bye.test/api/${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://bye.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}

function pendingEarly(s:Season,version:1|2,week:number){
 s.round=week;s.byes!.version=version;s.byes!.firstWeek=1;
 const moved=new Set([...s.teams.flatMap(team=>team.roster),...athletesFor(scoringFor(s)).filter(a=>a.position==='DEF').map(a=>a.id)]);
 for(const id of moved)s.byes!.weeks[id]=week;
 return moved;
}

test('Strict and Historical modern seasons assign exactly one regular-season bye from Week 5 to every player and defense',()=>{
 assert.equal(FIRST_BYE_WEEK,5);
 for(const mode of modes)for(const regular of [14,15,16]){
  const rules=newScoring(1,true,mode),actors=athletesFor(rules),byes=assignByes(`week-five-${mode}-${regular}`,regular,1,rules);
  assert.equal(byes.version,3);assert.equal(byes.firstWeek,5);assert.equal(byes.lastWeek,regular-1);assert.equal(Object.keys(byes.weeks).length,actors.length);
  assert.deepEqual(byes,assignByes(`week-five-${mode}-${regular}`,regular,-5,rules));
  for(const actor of actors){
   const week=byes.weeks[actor.id];assert.ok(week>=5&&week<regular,`${mode} ${actor.name}`);
   assert.equal(Array.from({length:regular+3},(_,i)=>i+1).filter(round=>onBye({byes,round,regularRounds:regular},actor.id)).length,1);
   for(const round of [1,2,3,4,regular+1,regular+2,regular+3])assert.equal(onBye({byes,round,regularRounds:regular},actor.id),false);
  }
 }
});

test('v1 and v2 unplayed early dates migrate deterministically in both modes while locked selections and other dates stay exact',()=>{
 for(const mode of modes)for(const version of [1,2] as const)for(const week of [1,2,3,4])for(const locked of [false,true]){
  const s=freshSeason(mode),moved=pendingEarly(s,version,week);s.teams[0].locked=locked;const before=structuredClone(s),fixed=normalizeByes(s);
  assert.equal(fixed.byes!.version,3);assert.equal(fixed.byes!.repairedEarlyWeeks,true);
  for(const id of moved)assert.ok(fixed.byes!.weeks[id]>=5&&fixed.byes!.weeks[id]<s.regularRounds);
  for(const [id,date] of Object.entries(before.byes!.weeks))if(!moved.has(id))assert.equal(fixed.byes!.weeks[id],date);
  for(const team of fixed.teams)for(let date=5;date<s.regularRounds;date++)assert.ok(team.roster.filter(id=>fixed.byes!.weeks[id]===date).length<=2);
  assert.deepEqual(fixed.teams,before.teams);assert.deepEqual(fixed.history,before.history);assert.deepEqual(fixed.used,before.used);assert.deepEqual(s,before);
  assert.deepEqual(normalizeByes(fixed),fixed);assert.deepEqual(normalizeByes(JSON.parse(JSON.stringify(s))),fixed);
 }
});

test('completed starter and bench rests, elapsed dates, and completed season records never receive a second bye',()=>{
 for(const mode of modes)for(const version of [1,2] as const){
  const s=freshSeason(mode);s.round=3;s.byes!.version=version;const team=s.teams[0],starter=team.lineup.QB,bench=team.roster.find(id=>!Object.values(team.lineup).includes(id))!,elapsed=team.lineup.RB,future=team.lineup.WR;
  s.byes!.weeks[starter]=2;s.byes!.weeks[bench]=2;s.byes!.weeks[elapsed]=1;s.byes!.weeks[future]=4;
  s.history=[{number:2,phase:'regular',resolvedAt:'already saved',matches:[],draws:{[team.id]:[{athleteId:starter,points:0,simulatedBye:true,performance:{}}]},benchDraws:{[team.id]:[{athleteId:bench,points:0,simulatedBye:true,performance:{}}]}}];
  const before=structuredClone(s),fixed=normalizeByes(s);
  for(const id of [starter,bench,elapsed])assert.equal(fixed.byes!.weeks[id],before.byes!.weeks[id]);
  assert.ok(fixed.byes!.weeks[future]>=5);assert.deepEqual(fixed.history,before.history);assert.deepEqual(fixed.used,before.used);
  for(let round=5;round<=s.regularRounds;round++)for(const id of [starter,bench,elapsed])assert.equal(onBye({...fixed,round},id),false);
  const completed={...before,status:'complete' as const,round:17};assert.deepEqual(normalizeByes(completed),completed);
 }
});

test('early migration still runs the old v1 future-roster collision repair and preserves frozen Week 5 dates',()=>{
 const s=freshSeason('strict'),team=s.teams[0];s.round=3;s.byes!.version=1;
 for(const id of team.roster)s.byes!.weeks[id]=6;
 const unowned=athletesFor(scoringFor(s)).find(a=>!s.teams.some(t=>t.roster.includes(a.id)))!;s.byes!.weeks[unowned.id]=4;
 const fixed=normalizeByes(s);assert.equal(fixed.byes!.repairedEarlyWeeks,true);assert.equal(fixed.byes!.repairedRosterCollision,true);
 for(let week=5;week<s.regularRounds;week++)assert.ok(team.roster.filter(id=>fixed.byes!.weeks[id]===week).length<=2);
 const frozen=freshSeason('strict');frozen.round=5;frozen.teams[0].locked=true;frozen.byes!.version=1;frozen.byes!.firstWeek=5;frozen.byes!.lastWeek=5;
 for(const id of frozen.teams[0].roster)frozen.byes!.weeks[id]=5;
 const normalized=normalizeByes(frozen);for(const id of frozen.teams[0].roster)assert.equal(normalized.byes!.weeks[id],5);assert.deepEqual(normalized.teams,frozen.teams);assert.deepEqual(normalized.history,frozen.history);
});

test('short and late old formats defer rather than crowding rests, and early badge logic never reports Weeks 1–4 absent',()=>{
 for(const mode of modes){
  const rules=newScoring(1,true,mode),short=assignByes('short-'+mode,6,1,rules);assert.equal(short.legacyDeferred,true);assert.deepEqual(short.weeks,{});
  const s=freshSeason(mode);s.regularRounds=6;s.round=3;s.byes!.version=2;const [elapsed,current,future]=s.teams[0].roster;s.byes!.weeks[elapsed]=1;s.byes!.weeks[current]=3;s.byes!.weeks[future]=4;
  const fixed=normalizeByes(s);assert.equal(fixed.byes!.legacyDeferred,true);assert.equal(fixed.byes!.repairedEarlyWeeks,true);assert.equal(fixed.byes!.weeks[elapsed],1);assert.equal(fixed.byes!.weeks[current],undefined);assert.equal(fixed.byes!.weeks[future],undefined);
  const late=freshSeason(mode);delete late.byes;late.round=13;assert.equal(normalizeByes(late).byes!.legacyDeferred,true);
  for(const week of [1,2,3,4]){const fixture={byes:{version:2 as const,weeks:{actor:week},firstWeek:1,lastWeek:15},round:week,status:'active' as const,regularRounds:16};assert.equal(onBye(fixture,'actor'),false);assert.equal(byeStatus(fixture,'actor'),'ready');assert.equal(byeStatus({...fixture,round:week-1},'actor'),'ready');assert.equal(byeLabel(fixture,'actor'),'');assert.match(byeLabel({...fixture,status:'review'},'actor'),/^Rest week completed/);}
 }
});

test('online GET previews and POST persists v1/v2 migration without losing locked lineup IDs or completed state',async()=>{
 for(const mode of modes)for(const version of [1,2] as const){
  const db=withBatch(memoryDatabase());audit.__weekFiveDatabase=db;const s=freshSeason(mode);pendingEarly(s,version,4);s.teams[0].locked=true;const raw=JSON.stringify(s);
  db.sql.prepare('INSERT INTO season_leagues (id,owner_id,invite_hash,state,revision,updated_at) VALUES (?,?,?,?,?,?)').run(s.id,s.ownerId,await inviteHash(s.inviteCode),raw,s.revision,s.createdAt);
  const context={params:Promise.resolve({id:s.id})},get=await onlineApi.GET(request('leagues/'+s.id),context);assert.equal(get.status,200);
  const preview=(await get.json() as {league:Season}).league;assert.equal(preview.byes!.version,3);assert.ok(Object.values(preview.byes!.weeks).every(week=>week>=5));assert.equal(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(s.id)!.state,raw);
  const post=await onlineApi.POST(request('leagues/'+s.id,{action:'lineup',revision:s.revision,lineup:s.teams[1].lineup},'manager'),context);assert.equal(post.status,200);
  const persisted=JSON.parse(String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(s.id)!.state)) as Season;
  assert.deepEqual(persisted.byes,preview.byes);assert.deepEqual(persisted.teams,s.teams);assert.deepEqual(persisted.history,s.history);assert.deepEqual(persisted.used,s.used);assert.equal(persisted.revision,s.revision+1);
  db.sql.close();
 }
});

test('staged solo GET keeps picks private and POST normalizes v1/v2 maps through the saved draft reveal',async()=>{
 for(const mode of modes)for(const version of [1,2] as const){
  const db=withBatch(memoryDatabase());audit.__weekFiveDatabase=db;
  const draft=newDemoDraft('Saved staged draft',1,{modern:true,capacity:2,opening:true,kickers:true,scoringMode:mode,orderMode:'manual',orderIndexes:[0,1]});
  draft.byes!.version=version;draft.byes!.firstWeek=1;draft.byes!.lastWeek=4;Object.keys(draft.byes!.weeks).forEach((id,index)=>{draft.byes!.weeks[id]=index%4+1;});const raw=JSON.stringify(draft);
  db.sql.prepare('INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) VALUES (?,?,?,?,?)').run('owner',draft.id,raw,draft.revision,draft.createdAt);
  const get=await soloApi.GET(request('demo'));assert.equal(get.status,200);const preview=(await get.json() as {demo:DemoDraft}).demo;
  assert.equal(preview.byes!.version,3);assert.equal(preview.orderRevealPending,true);assert.equal(preview.picks.length,0);assert.ok(Object.values(preview.byes!.weeks).every(week=>week>=5&&week<16));assert.equal(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state,raw);
  const post=await soloApi.POST(request('demo',{action:'beginDraft',revision:0,seasonId:draft.id}));assert.equal(post.status,200);
  const persisted=JSON.parse(String(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state)) as DemoDraft;
  assert.deepEqual(persisted.byes,preview.byes);assert.deepEqual(persisted.scoring,draft.scoring);assert.deepEqual(persisted.teams,draft.teams);assert.equal(persisted.picks.length,0);assert.equal(persisted.orderRevealPending,false);assert.equal(persisted.revision,1);db.sql.close();
 }
});
