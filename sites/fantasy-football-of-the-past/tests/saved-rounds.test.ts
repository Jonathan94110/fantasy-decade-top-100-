import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import type {PublicSeason,Season} from '../lib/season-model';
import type {DemoDraft} from '../lib/demo-draft-model';
import type {StoredSeason} from '../lib/saved-rounds';
const root=new URL('../',import.meta.url);
type Shared=typeof globalThis&{__roundsDatabase?:ReturnType<typeof fresh>};
const shared=globalThis as Shared;
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){if(id==='@/db')return {url:`data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__roundsDatabase;}')}`,shortCircuit:true};if(id.startsWith('@/'))return next(new URL(`${id.slice(2)}.ts`,root).href,context);try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}
});
const leagueApi=await import('../app/api/leagues/[id]/route');
const leaguesApi=await import('../app/api/leagues/route');
const demoApi=await import('../app/api/demo/route');
const dashboardApi=await import('../app/api/dashboard/route');
const depthChartApi=await import('../app/api/depth-chart/route');
const {newSeason,joinSeason,seasonAction,publicSeason}=await import('../lib/season-engine');
const {currentPairs}=await import('../lib/season-view');
const {demoReply}=await import('../lib/demo-draft-engine');
const {assembleSeason,splitSeason,SavedRoundError}=await import('../lib/saved-rounds');
const {commitSeason,inviteHash,seasonRow}=await import('../lib/season-store');
const {withBatch}=await import('./helpers/memory-d1-batch');
const {savedLeague,savedDemo}=await import('./helpers/saved-state');

/** D1's documented maximum size for one row, string or BLOB. */
const ROW_LIMIT=2_000_000;
const bytes=(text:string)=>Buffer.byteLength(text);
function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('drizzle/',root)).filter(name=>name.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 return {sql,prepare(query:string){let args:SQLInputValue[]=[];return {bind(...values:unknown[]){args=values as SQLInputValue[];return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};
}
function fresh(){const db=withBatch(memoryDatabase());shared.__roundsDatabase=db;return db;}
type Database=ReturnType<typeof fresh>;
function request(path:string,body?:Record<string,unknown>,user='owner'){return new Request(`https://rounds.test${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://rounds.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
const context=(id:string)=>({params:Promise.resolve({id})});
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
type Reply={league:PublicSeason;error?:string;demo:unknown;overview:{leagues:{completedRounds:number}[];solo:{completedRounds:number}}};
function activeSeason(capacity:number):Season{
 let s=newSeason('owner',{name:'Week records',teamName:'Owner',capacity,format:'seventeen',playoffTeams:capacity>=6?6:4,kickers:true,scoringMode:'historical'},'ROUND-CODE-0000');
 for(let i=1;i<capacity;i++)s=joinSeason(s,`manager-${i}`,`Team ${i}`);
 s=seasonAction(s,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:Array.from({length:capacity},(_,i)=>i)});
 while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});
 return s;
}
function playWeeks(input:Season,weeks:number){let s=input;for(let n=0;n<weeks;n++){s=seasonAction(s,'owner',{action:'closeRound'});if(n<weeks-1||s.status==='review')s=seasonAction(s,'owner',{action:'next'});}return s;}
async function insertLeague(db:Database,s:Season){db.sql.prepare('INSERT INTO season_leagues (id,owner_id,invite_hash,state,revision,updated_at) VALUES (?,?,?,?,?,?)').run(s.id,s.ownerId,await inviteHash(s.inviteCode),JSON.stringify(s),s.revision,s.createdAt);}
const leagueRow=(db:Database,id:string)=>String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(id)!.state);
const leagueWeeks=(db:Database,id:string)=>db.sql.prepare('SELECT number, state FROM season_league_rounds WHERE league_id=? ORDER BY number').all(id) as {number:number;state:string}[];
async function leaguePost(id:string,body:Record<string,unknown>,user='owner'){const response=await leagueApi.POST(request(`/api/leagues/${id}`,body,user),context(id));return {status:response.status,body:await response.json() as Reply};}
async function leagueGet(id:string,user='owner'){return (await (await leagueApi.GET(request(`/api/leagues/${id}`,undefined,user),context(id))).json() as Reply).league;}
function soloFrom(input:Season,humanTeamId=input.teams[0].id):DemoDraft{
 const season=structuredClone(input);season.ownerId=humanTeamId;season.teams.forEach(team=>{team.userId=team.id;});
 return {id:crypto.randomUUID(),revision:0,createdAt:season.createdAt,status:'complete',rosterSize:11,playoffTeams:4,scoring:structuredClone(season.scoring),byes:season.byes,order:[...season.draftOrder],pick:season.pick,humanTeamId,
  teams:season.teams.map(team=>({id:team.id,name:team.name,roster:[...team.roster],control:team.id===humanTeamId?'human':'computer',strategy:team.id===humanTeamId?null:0})),
  picks:(season.draftPicks||[]).map(pick=>({...pick,control:pick.teamId===humanTeamId?'human':'computer',at:season.createdAt,reason:pick.teamId===humanTeamId?'Your selection':'Saved fixture automatic pick'})),season};
}
async function soloWeek(demo:DemoDraft){
 const season=demo.season!,human=season.teams.find(team=>team.id===demo.humanTeamId)!;
 if(season.status==='review')return demoApi.POST(request('/api/demo',{action:'next',seasonId:demo.id,revision:demo.revision}));
 const body=currentPairs(season).flat().includes(human.id)?{action:'lock',lineup:human.lineup,acceptBye:true}:{action:'simulate'};
 return demoApi.POST(request('/api/demo',{...body,seasonId:demo.id,revision:demo.revision}));
}

test('a 16-team, 17-week season keeps every saved row far under D1’s limit and reloads exactly',async t=>{
 const db=fresh(),s=activeSeason(16);await insertLeague(db,s);
 const firstSeen=new Map<number,string>();let largestSeasonRow=0,largestWeek=0,singleRowCrossedAt:number|undefined;
 for(let step=0;step<40;step++){
  const before=(await savedLeague(db.sql,s.id))!;if(before.status==='complete')break;
  const saved=await leaguePost(s.id,{action:before.status==='review'?'next':'closeRound',revision:before.revision});
  assert.equal(saved.status,200,saved.body.error);
  largestSeasonRow=Math.max(largestSeasonRow,bytes(leagueRow(db,s.id)));
  for(const week of leagueWeeks(db,s.id)){
   largestWeek=Math.max(largestWeek,bytes(week.state));
   // A week row is written once and never changes afterwards.
   if(firstSeen.has(week.number))assert.equal(week.state,firstSeen.get(week.number));else firstSeen.set(week.number,week.state);
  }
  const reloaded=(await savedLeague(db.sql,s.id))!;
  assert.deepEqual(saved.body.league,plain(publicSeason(reloaded,'owner')));
  assert.deepEqual(await leagueGet(s.id),saved.body.league);
  if(singleRowCrossedAt===undefined&&bytes(JSON.stringify(reloaded))>ROW_LIMIT)singleRowCrossedAt=reloaded.history.length;
 }
 const final=(await savedLeague(db.sql,s.id))!;
 assert.equal(final.status,'complete');assert.ok(final.champion);
 assert.deepEqual(final.history.map(round=>round.number),Array.from({length:17},(_,i)=>i+1));
 assert.equal(JSON.stringify(final.history),`[${leagueWeeks(db,s.id).map(week=>week.state).join(',')}]`);
 assert.ok(singleRowCrossedAt!==undefined,'The former single-row format must exceed the limit in this season, or the test proves nothing.');
 assert.ok(largestSeasonRow<ROW_LIMIT/4&&largestWeek<ROW_LIMIT/4,`season row ${largestSeasonRow} B, largest week ${largestWeek} B`);
 t.diagnostic(`single-row format would cross ${ROW_LIMIT} B after week ${singleRowCrossedAt} (final ${bytes(JSON.stringify(final))} B); largest season row ${largestSeasonRow} B; largest week row ${largestWeek} B`);
});

test('split and assemble are byte-exact and refuse to rewrite, reorder or drop a saved week',()=>{
 const s=playWeeks(activeSeason(4),3),original=JSON.stringify(s);
 const first=splitSeason(s,[]),stored=first.season as StoredSeason;
 assert.equal(first.inserts.length,3);assert.equal(stored.history,null);assert.deepEqual(stored.historyRecords,[1,2,3]);
 assert.equal(JSON.stringify(s),original,'Splitting never changes the season being saved.');
 const loaded=assembleSeason(plain(stored),first.inserts);
 assert.equal(JSON.stringify(loaded.season),original);assert.deepEqual(Object.keys(loaded.season),Object.keys(s));
 assert.deepEqual(loaded.records,first.inserts);
 const next=seasonAction(loaded.season,'owner',{action:'closeRound'}),second=splitSeason(next,loaded.records);
 assert.deepEqual(second.inserts.map(round=>round.number),[4],'Only the new week is written.');
 const fresh=activeSeason(4),untouched=splitSeason(fresh,[]);
 assert.equal(untouched.season,fresh);assert.deepEqual(untouched.inserts,[]);assert.ok(!JSON.stringify(untouched.season).includes('historyRecords'),'A season without weeks keeps its original format.');
 const rewritten=structuredClone(s);rewritten.history[0].matches[0].homeScore+=1;
 assert.throws(()=>splitSeason(rewritten,loaded.records),SavedRoundError);
 const dropped=structuredClone(s);dropped.history.splice(1,1);
 assert.throws(()=>splitSeason(dropped,loaded.records),SavedRoundError);
 const reordered=structuredClone(s);reordered.history.reverse();
 assert.throws(()=>splitSeason(reordered,loaded.records),SavedRoundError);
 assert.throws(()=>splitSeason(stored as unknown as Season,loaded.records),SavedRoundError,'A season row must be assembled before it is saved.');
 assert.throws(()=>assembleSeason(plain(stored),first.inserts.slice(1)),SavedRoundError,'Every listed week must have its row.');
 assert.throws(()=>assembleSeason(plain(stored),first.inserts.map(row=>row.number===2?{...row,state:first.inserts[0].state}:row)),SavedRoundError,'A week row must hold that week.');
 assert.throws(()=>assembleSeason({...plain(stored),history:[]},first.inserts),SavedRoundError,'A split row cannot also hold weeks.');
});

test('code that predates week rows refuses a split season instead of reading it as empty',()=>{
 // lib/season-engine.ts and lib/demo-draft-engine.ts are unchanged from v43, so this is how the live
 // code treats a split row during a rollback or while old and new code overlap in a deployment.
 const s=playWeeks(activeSeason(4),2),split=plain(splitSeason(s,[]).season) as unknown as Season;
 assert.throws(()=>publicSeason(split,'owner'),TypeError);
 assert.throws(()=>seasonAction(split,'owner',{action:'closeRound'}),TypeError);
 assert.throws(()=>seasonAction(split,'owner',{action:'revealReplay',round:1}),TypeError);
 const demo=soloFrom(s),splitDemo={...demo,season:plain(splitSeason(demo.season!,[]).season) as unknown as Season};
 assert.throws(()=>demoReply(splitDemo),TypeError);
});
test('a legacy single-row season loads unchanged and splits on its next save exactly as the former format would store it',async()=>{
 const db=fresh(),s=playWeeks(activeSeason(8),3);await insertLeague(db,s);
 assert.deepEqual(await leagueGet(s.id),plain(publicSeason(s,'owner')));
 assert.equal(leagueRow(db,s.id),JSON.stringify(s),'Reading never rewrites a saved row.');
 const saved=await leaguePost(s.id,{action:'revealReplay',round:1,revision:s.revision});assert.equal(saved.status,200);
 const expected=seasonAction(s,'owner',{action:'revealReplay',round:1});expected.revision=s.revision+1;
 const stored=JSON.parse(leagueRow(db,s.id));
 assert.equal(stored.history,null);assert.deepEqual(stored.historyRecords,[1,2,3]);
 assert.deepEqual(leagueWeeks(db,s.id).map(week=>week.state),s.history.map(round=>JSON.stringify(round)));
 assert.equal(JSON.stringify(await savedLeague(db.sql,s.id)),JSON.stringify(expected));
 assert.deepEqual(saved.body.league,plain(publicSeason(expected,'owner')));
});

test('week rows are saved with the season row or not at all, and a stale save cannot add a week',async()=>{
 const db=fresh(),s=activeSeason(4);await insertLeague(db,s);
 db.sql.exec(`CREATE TRIGGER fail_league_save BEFORE UPDATE ON season_leagues BEGIN SELECT RAISE(ABORT,'forced failure'); END;`);
 assert.equal((await leaguePost(s.id,{action:'closeRound',revision:s.revision})).status,503);
 assert.deepEqual(leagueWeeks(db,s.id),[],'A failed season save leaves no week row behind.');assert.equal(leagueRow(db,s.id),JSON.stringify(s));
 db.sql.exec('DROP TRIGGER fail_league_save');
 const races=await Promise.all([leaguePost(s.id,{action:'closeRound',revision:s.revision}),leaguePost(s.id,{action:'closeRound',revision:s.revision})]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 const afterRace=(await savedLeague(db.sql,s.id))!;
 assert.deepEqual(leagueWeeks(db,s.id).map(week=>[week.number,week.state]),[[1,JSON.stringify(afterRace.history[0])]]);
 assert.deepEqual(races.find(r=>r.status===200)!.body.league,plain(publicSeason(afterRace,'owner')));
 // A request that read the league before another save must not add its own week.
 assert.equal((await leaguePost(s.id,{action:'next',revision:afterRace.revision})).status,200);
 const stale=(await seasonRow(s.id))!;
 const manager=stale.season.teams.find(team=>team.userId==='manager-1')!;
 assert.equal((await leaguePost(s.id,{action:'lineup',lineup:manager.lineup,revision:stale.season.revision},'manager-1')).status,200);
 const staleNext=seasonAction(stale.season,'owner',{action:'closeRound'});
 assert.equal((await commitSeason(stale.season,staleNext,'owner',stale.records)).status,409);
 assert.deepEqual(leagueWeeks(db,s.id).map(week=>week.number),[1],'The stale week was not written.');
 assert.equal((await savedLeague(db.sql,s.id))!.history.length,1);
});

test('a missing week row stops loading and saving instead of serving partial history',async()=>{
 const db=fresh(),s=activeSeason(4);await insertLeague(db,s);
 const saved=await leaguePost(s.id,{action:'closeRound',revision:s.revision});assert.equal(saved.status,200);
 const row=leagueRow(db,s.id);
 db.sql.prepare('DELETE FROM season_league_rounds WHERE league_id=?').run(s.id);
 assert.equal((await leagueApi.GET(request(`/api/leagues/${s.id}`),context(s.id))).status,503);
 assert.equal((await leaguePost(s.id,{action:'next',revision:saved.body.league.revision})).status,503);
 assert.equal(leagueRow(db,s.id),row,'Nothing is saved over missing history.');
});
test('joins, dashboards and depth charts read split leagues in full',async()=>{
 const db=fresh(),s=playWeeks(activeSeason(4),2);await insertLeague(db,s);
 let league=(await leaguePost(s.id,{action:'revealReplay',round:1,revision:s.revision})).body.league;
 const vacated=league.teams.find(team=>team.name==='Team 2')!.id;
 league=(await leaguePost(s.id,{action:'removeManager',teamId:vacated,confirm:true,revision:league.revision})).body.league;
 const join=await leaguesApi.POST(request('/api/leagues',{action:'join',code:league.inviteCode,teamName:'Replacement',teamId:vacated},'replacement'));
 assert.equal(join.status,200);
 const saved=(await savedLeague(db.sql,s.id))!;
 assert.equal(JSON.stringify(saved.history),JSON.stringify(s.history),'Claiming a vacant team keeps every saved week.');
 assert.equal(saved.teams.find(team=>team.id===vacated)!.userId,'replacement');
 const overview=(await (await dashboardApi.GET(request('/api/dashboard'))).json() as Reply).overview;
 assert.equal(overview.leagues[0].completedRounds,2);
 const depth=(await (await depthChartApi.GET(request(`/api/depth-chart?league=${s.id}`))).json() as Reply).league;
 assert.deepEqual(depth,plain(publicSeason(saved,'owner')));
});

test('solo seasons save weeks separately and keep them exactly through reset, archive and restore',async()=>{
 const db=fresh(),demo=soloFrom(activeSeason(4));
 db.sql.prepare('INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) VALUES (?,?,?,?,?)').run('owner',demo.id,JSON.stringify(demo),demo.revision,demo.createdAt);
 for(let n=0;n<5;n++){const current=(await savedDemo(db.sql,'owner'))!;const response=await soloWeek(current);assert.equal(response.status,200,(await response.clone().json() as Reply).error);}
 const before=(await savedDemo(db.sql,'owner'))!,weeks=()=>db.sql.prepare('SELECT number, state FROM demo_draft_rounds WHERE draft_id=? ORDER BY number').all(demo.id) as {number:number;state:string}[];
 assert.equal(before.season!.history.length,3);assert.deepEqual(weeks().map(week=>week.state),before.season!.history.map(round=>JSON.stringify(round)));
 const raw=JSON.parse(String(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state));
 assert.equal(raw.season.history,null);assert.deepEqual(raw.season.historyRecords,[1,2,3]);
 assert.deepEqual((await (await demoApi.GET(request('/api/demo'))).json() as Reply).demo,plain(demoReply(before).demo));
 assert.equal((await (await dashboardApi.GET(request('/api/dashboard'))).json() as Reply).overview.solo.completedRounds,3);
 assert.equal((await demoApi.POST(request('/api/demo',{action:'reset',confirm:true,seasonId:demo.id,revision:before.revision}))).status,200);
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM demo_drafts').get()!.n,0);assert.equal(weeks().length,3,'Archived seasons keep their weeks.');
 assert.equal((await demoApi.POST(request('/api/demo',{action:'restore',archiveId:demo.id}))).status,200);
 const restored=(await savedDemo(db.sql,'owner'))!;
 assert.ok(restored.revision>before.revision);
 assert.equal(JSON.stringify({...restored,revision:0}),JSON.stringify({...before,revision:0}),'Restore returns the exact season.');
 const after=await soloWeek(restored);assert.equal(after.status,200);
 const continued=(await savedDemo(db.sql,'owner'))!;
 assert.equal(JSON.stringify(continued.season!.history.slice(0,3)),JSON.stringify(before.season!.history));
});

test('a legacy single-row solo season loads unchanged and splits on its next save',async()=>{
 const db=fresh();let season=playWeeks(activeSeason(4),2);const demo=soloFrom(season);season=demo.season!;
 db.sql.prepare('INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) VALUES (?,?,?,?,?)').run('owner',demo.id,JSON.stringify(demo),demo.revision,demo.createdAt);
 assert.deepEqual((await (await demoApi.GET(request('/api/demo'))).json() as Reply).demo,plain(demoReply(demo).demo));
 const response=await demoApi.POST(request('/api/demo',{action:'revealReplay',round:1,seasonId:demo.id,revision:demo.revision}));assert.equal(response.status,200);
 const saved=(await savedDemo(db.sql,'owner'))!;
 assert.equal(JSON.stringify(saved.season!.history),JSON.stringify(season.history));assert.deepEqual(saved.season!.used,season.used);
 assert.deepEqual(saved.season!.replayReveals,{[demo.humanTeamId]:[1]});
 assert.equal((db.sql.prepare('SELECT COUNT(*) AS n FROM demo_draft_rounds WHERE draft_id=?').get(demo.id) as {n:number}).n,2);
});

test('the rollback rebuilds single-row saves from the weeks each row lists, and the new code can return afterwards',async()=>{
 const db=fresh(),s=playWeeks(activeSeason(4),2);await insertLeague(db,s);
 assert.equal((await leaguePost(s.id,{action:'revealReplay',round:2,revision:s.revision})).status,200);
 const league=(await savedLeague(db.sql,s.id))!;
 const demo=soloFrom(playWeeks(activeSeason(4),2));
 db.sql.prepare('INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) VALUES (?,?,?,?,?)').run('owner',demo.id,JSON.stringify(demo),demo.revision,demo.createdAt);
 assert.equal((await demoApi.POST(request('/api/demo',{action:'revealReplay',round:1,seasonId:demo.id,revision:demo.revision}))).status,200);
 const archived=(await savedDemo(db.sql,'owner'))!;
 // The archive lists weeks 1-2; the restored season goes on to save week 3 under the same draft ID.
 assert.equal((await demoApi.POST(request('/api/demo',{action:'reset',confirm:true,seasonId:demo.id,revision:archived.revision}))).status,200);
 assert.equal((await demoApi.POST(request('/api/demo',{action:'restore',archiveId:demo.id}))).status,200);
 assert.equal((await soloWeek((await savedDemo(db.sql,'owner'))!)).status,200);
 const live=(await savedDemo(db.sql,'owner'))!;assert.equal(live.season!.history.length,3);
 db.sql.exec(readFileSync(new URL('scripts/rollback-bounded-week-records.sql',root),'utf8'));
 assert.equal(leagueRow(db,s.id),JSON.stringify(league));
 assert.equal(String(db.sql.prepare('SELECT state FROM demo_archives WHERE id=?').get(demo.id)!.state),JSON.stringify(archived));
 assert.equal(String(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state),JSON.stringify(live));
 const count=(table:string)=>(db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
 assert.equal(count('season_league_rounds'),0);assert.equal(count('demo_draft_rounds'),0,'Week rows copied back are removed, so returning to the new code cannot collide with them.');
 const back=await leaguePost(s.id,{action:'closeRound',revision:league.revision});assert.equal(back.status,200,back.body.error);
 const resumed=(await savedLeague(db.sql,s.id))!;
 assert.equal(JSON.stringify(resumed.history.slice(0,2)),JSON.stringify(league.history));assert.deepEqual(leagueWeeks(db,s.id).map(week=>week.number),[1,2,3]);
 assert.equal((await soloWeek(live)).status,200);
 const soloResumed=(await savedDemo(db.sql,'owner'))!;
 assert.equal(JSON.stringify(soloResumed.season!.history),JSON.stringify(live.season!.history));assert.equal(count('demo_draft_rounds'),3);
});