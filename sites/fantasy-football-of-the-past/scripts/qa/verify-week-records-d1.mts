/**
 * Local-only check of bounded week records against Miniflare's D1 (workerd
 * SQLite), not a test double. Plays a 16-team season and a solo season
 * through the real API routes. Never touches the deployed Site or any account.
 *
 *   node scripts/qa/verify-week-records-d1.mts
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {Miniflare} from 'miniflare';
import type {Season} from '../../lib/season-model.ts';
import type {DemoDraft} from '../../lib/demo-draft-model.ts';
const root=new URL('../../',import.meta.url);
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){if(id==='@/db')return {url:`data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__weekRecordsD1;}')}`,shortCircuit:true};if(id.startsWith('@/'))return next(new URL(`${id.slice(2)}.ts`,root).href,context);try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}
});
const ROW_LIMIT=2_000_000;
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'week-records-check'}});
const report:Record<string,unknown>={};
try{
 const db=await mf.getD1Database('DB');(globalThis as {__weekRecordsD1?:unknown}).__weekRecordsD1=db;
 const statements=(sql:string,separator:RegExp)=>sql.split(separator).map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
 for(const file of readdirSync(new URL('drizzle/',root)).filter(name=>name.endsWith('.sql')).sort())await db.batch(statements(readFileSync(new URL(`drizzle/${file}`,root),'utf8'),/--> statement-breakpoint/));
 // D1 does not expose sqlite_version(); probe the aggregate ORDER BY the rollback statements use.
 report.jsonGroupArrayOrderBy=(await db.prepare("SELECT json_group_array(value ORDER BY value DESC) AS v FROM json_each('[1,3,2]')").first<{v:string}>())!.v;
 const leagueApi=await import('../../app/api/leagues/[id]/route.ts');
 const demoApi=await import('../../app/api/demo/route.ts');
 const {newSeason,joinSeason,seasonAction,publicSeason}=await import('../../lib/season-engine.ts');
 const {currentPairs}=await import('../../lib/season-view.ts');
 const {inviteHash,seasonRow,commitSeason,demoRow}=await import('../../lib/season-store.ts');
 const request=(path:string,body?:unknown,user='owner')=>new Request(`https://local.check${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://local.check','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const plain=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
 const active=(capacity:number)=>{let s=newSeason('owner',{name:'D1 check',teamName:'Owner',capacity,format:'seventeen',playoffTeams:capacity>=6?6:4,kickers:true,scoringMode:'historical'},`D1CK-${capacity}${Math.random().toString(36).slice(2,6).toUpperCase()}`);for(let i=1;i<capacity;i++)s=joinSeason(s,`manager-${i}`,`Team ${i}`);s=seasonAction(s,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:Array.from({length:capacity},(_,i)=>i)});while(s.status==='draft')s=seasonAction(s,'owner',{action:'autopick'});return s;};
 const insert=async(s:Season)=>{await db.prepare('INSERT INTO season_leagues (id,owner_id,invite_hash,state,revision,updated_at) VALUES (?,?,?,?,?,?)').bind(s.id,s.ownerId,await inviteHash(s.inviteCode),JSON.stringify(s),s.revision,s.createdAt).run();};
 const post=async(id:string,body:Record<string,unknown>,user='owner')=>{const r=await leagueApi.POST(request(`/api/leagues/${id}`,body,user),{params:Promise.resolve({id})});return {status:r.status,body:await r.json() as {league:unknown;error?:string}};};
 const weekRows=async(id:string)=>(await db.prepare('SELECT number, state, length(CAST(state AS BLOB)) AS size FROM season_league_rounds WHERE league_id = ? ORDER BY number').bind(id).all<{number:number;state:string;size:number}>()).results;
 const rowSize=async(id:string)=>(await db.prepare('SELECT length(CAST(state AS BLOB)) AS size FROM season_leagues WHERE id = ?').bind(id).first<{size:number}>())!.size;

 // 1. A full 16-team season through the real league route.
 const big=active(16);await insert(big);
 const first=new Map<number,string>();let largestRow=0,largestWeek=0,crossedAfter:number|undefined;
 for(let step=0;step<40;step++){
  const saved=(await seasonRow(big.id))!.season;if(saved.status==='complete')break;
  const result=await post(big.id,{action:saved.status==='review'?'next':'closeRound',revision:saved.revision});assert.equal(result.status,200,result.body.error);
  largestRow=Math.max(largestRow,await rowSize(big.id));
  for(const week of await weekRows(big.id)){largestWeek=Math.max(largestWeek,week.size);if(first.has(week.number))assert.equal(week.state,first.get(week.number));else first.set(week.number,week.state);}
  const reloaded=(await seasonRow(big.id))!.season;assert.deepEqual(result.body.league,plain(publicSeason(reloaded,'owner')));
  if(crossedAfter===undefined&&Buffer.byteLength(JSON.stringify(reloaded))>ROW_LIMIT)crossedAfter=reloaded.history.length;
 }
 const final=(await seasonRow(big.id))!.season;
 assert.equal(final.status,'complete');assert.equal(final.history.length,17);assert.ok(crossedAfter!==undefined);
 assert.equal(JSON.stringify(final.history),`[${(await weekRows(big.id)).map(w=>w.state).join(',')}]`);
 assert.ok(largestRow<ROW_LIMIT/4&&largestWeek<ROW_LIMIT/4);
 report.sixteenTeam={weeks:final.history.length,champion:!!final.champion,largestSeasonRowBytes:largestRow,largestWeekRowBytes:largestWeek,singleRowFormatBytes:Buffer.byteLength(JSON.stringify(final)),singleRowFormatCrossesLimitAfterWeek:crossedAfter};

 // 2. Does this local D1 enforce the row limit? (Hosted D1 documents 2,000,000 bytes.)
 try{await db.prepare('CREATE TABLE limit_probe (v TEXT)').run();await db.prepare('INSERT INTO limit_probe VALUES (?)').bind(JSON.stringify(final)).run();report.localD1AcceptsSingleRowFormat=true;await db.prepare('DROP TABLE limit_probe').run();}
 catch(error){report.localD1AcceptsSingleRowFormat=false;report.localD1RowLimitError=String(error).slice(0,200);}

 // 3. Atomic batch: a failed season save leaves no week row; a stale save adds none.
 const small=active(4);await insert(small);
 await db.prepare("CREATE TRIGGER fail_league_save BEFORE UPDATE ON season_leagues BEGIN SELECT RAISE(ABORT, 'forced failure'); END").run();
 assert.equal((await post(small.id,{action:'closeRound',revision:0})).status,503);assert.equal((await weekRows(small.id)).length,0);
 await db.prepare('DROP TRIGGER fail_league_save').run();
 const races=await Promise.all([post(small.id,{action:'closeRound',revision:0}),post(small.id,{action:'closeRound',revision:0})]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);assert.deepEqual((await weekRows(small.id)).map(w=>w.number),[1]);
 assert.equal((await post(small.id,{action:'next',revision:1})).status,200);
 const stale=(await seasonRow(small.id))!,manager=stale.season.teams.find(t=>t.userId==='manager-1')!;
 assert.equal((await post(small.id,{action:'lineup',lineup:manager.lineup,revision:stale.season.revision},'manager-1')).status,200);
 assert.equal((await commitSeason(stale.season,seasonAction(stale.season,'owner',{action:'closeRound'}),'owner',stale.records)).status,409);
 assert.deepEqual((await weekRows(small.id)).map(w=>w.number),[1]);
 report.atomicAndGuarded=true;

 // 4. Solo season: weeks survive reset (archive) and restore exactly.
 const online=active(4),season=structuredClone(online),human=season.teams[0].id;season.ownerId=human;season.teams.forEach(t=>{t.userId=t.id;});
 const demo:DemoDraft={id:crypto.randomUUID(),revision:0,createdAt:season.createdAt,status:'complete',rosterSize:11,playoffTeams:4,scoring:structuredClone(season.scoring),byes:season.byes,order:[...season.draftOrder],pick:season.pick,humanTeamId:human,teams:season.teams.map(t=>({id:t.id,name:t.name,roster:[...t.roster],control:t.id===human?'human':'computer',strategy:t.id===human?null:0})),picks:[],season};
 await db.prepare('INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) VALUES (?,?,?,?,?)').bind('owner',demo.id,JSON.stringify(demo),0,demo.createdAt).run();
 for(let n=0;n<5;n++){const current=(await demoRow('owner'))!.demo,s=current.season!,me=s.teams.find(t=>t.id===human)!;const body=s.status==='review'?{action:'next'}:currentPairs(s).flat().includes(human)?{action:'lock',lineup:me.lineup,acceptBye:true}:{action:'simulate'};assert.equal((await demoApi.POST(request('/api/demo',{...body,seasonId:current.id,revision:current.revision}))).status,200);}
 const before=(await demoRow('owner'))!.demo;
 assert.equal((await demoApi.POST(request('/api/demo',{action:'reset',confirm:true,seasonId:demo.id,revision:before.revision}))).status,200);
 assert.equal((await demoApi.POST(request('/api/demo',{action:'restore',archiveId:demo.id}))).status,200);
 const restored=(await demoRow('owner'))!.demo;
 assert.equal(JSON.stringify({...restored,revision:0}),JSON.stringify({...before,revision:0}));
 report.solo={weeks:before.season!.history.length,weekRows:(await db.prepare('SELECT COUNT(*) AS n FROM demo_draft_rounds WHERE draft_id = ?').bind(demo.id).first<{n:number}>())!.n,restoredExactly:true};

 // 5. The rollback statements run on D1 and rebuild the single-row format.
 const smallBefore=JSON.stringify((await seasonRow(small.id))!.season);
 await db.batch(statements(readFileSync(new URL('scripts/rollback-bounded-week-records.sql',root),'utf8').replace(/^--.*$/gm,''),/;\s*$/m));
 const rebuilt=(await db.prepare('SELECT state FROM season_leagues WHERE id = ?').bind(small.id).first<{state:string}>())!.state;
 assert.ok(!rebuilt.includes('historyRecords'));assert.equal(rebuilt,smallBefore);
 const bigStillSplit=(await db.prepare('SELECT json_type(state, \'$.historyRecords\') AS t FROM season_leagues WHERE id = ?').bind(big.id).first<{t:string}>())!.t==='array';
 assert.ok(bigStillSplit);assert.equal((await weekRows(big.id)).length,17);assert.equal((await weekRows(small.id)).length,0);
 // Returning to the new code re-splits the rebuilt league without colliding with old week rows.
 const resumed=JSON.parse(smallBefore) as Season;
 assert.equal((await post(small.id,{action:'closeRound',revision:resumed.revision})).status,200);
 assert.deepEqual((await weekRows(small.id)).map(w=>w.number),[1,2]);
 assert.equal(JSON.stringify((await seasonRow(small.id))!.season.history[0]),JSON.stringify(resumed.history[0]));
 report.rollback={smallLeagueRebuiltExactly:true,sixteenTeamLeagueLeftSplit:bigStillSplit,newCodeResumesAfterRollback:true};
 console.log(JSON.stringify(report,null,1));
}finally{await mf.dispose();}
