import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import type {DemoDraft} from '../lib/demo-draft-model';
import type {Season} from '../lib/season-model';
import type {League} from '../lib/game-engine';
import type {DashboardOverview} from '../lib/dashboard-model';
const root=new URL('../',import.meta.url);
const shared=globalThis as typeof globalThis&{__dashboardDB?:ReturnType<typeof memoryDatabase>};
registerHooks({load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},resolve(id,context,next){if(id==='@/db')return {url:`data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__dashboardDB;}')}`,shortCircuit:true};if(id.startsWith('@/'))return next(new URL(`${id.slice(2)}.ts`,root).href,context);try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}}});
const api=await import('../app/api/dashboard/route');
const {soloProgress,onlineProgress,quickProgress}=await import('../lib/dashboard-model');
function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('drizzle/',root)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 return {sql,queries:[] as string[],prepare(query:string){assert.match(query,/^SELECT\b/,'Dashboard may only read');this.queries.push(query);let args:SQLInputValue[]=[];return {bind(...values:unknown[]){args=values as SQLInputValue[];return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}};}};
}
const stamp='2026-10-08T12:00:00.000Z';
const solo={id:'solo-1',revision:9,status:'draft',createdAt:stamp,rosterSize:11,teams:[{id:'home',name:'My Throwbacks',control:'human',strategy:null,roster:[]}],humanTeamId:'home',order:['home'],pick:3,picks:[{number:1}],used:['prime-rushmore:qb:1989:game']} as unknown as DemoDraft;
const season={id:'online-1',name:'Sunday Legends',ownerId:'owner',inviteCode:'PRIVATE-CODE',revision:7,createdAt:stamp,capacity:2,status:'active',round:4,teams:[{id:'home',userId:'owner',name:'My Team',roster:[],lineup:{},locked:false},{id:'away',userId:'friend',name:'Friends',roster:[],lineup:{},locked:false}],pick:22,history:[],used:['prime-rushmore:qb:1989:game']} as unknown as Season;
const quick={id:'quick-1',revision:5,createdAt:stamp,round:3,status:'draft',turn:1,lineups:[{},{}],history:[],used:['prime-rushmore:qb:1989:game']} as unknown as League;
function request(user='owner'){return new Request('https://site.test/api/dashboard',{headers:user?{'oai-authenticated-user-id':user}:{}});}
function dump(sql:DatabaseSync){return ['leagues','season_leagues','demo_drafts','demo_archives','demo_scoring_backups','user_profiles','draft_preferences','season_join_attempts'].map(table=>[table,sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]);}
test('dashboard requires identity, isolates owners and league members, and never writes or leaks private state',async()=>{
 const db=memoryDatabase();shared.__dashboardDB=db;
 db.sql.prepare('INSERT INTO demo_drafts(owner_id,id,state,revision,updated_at) VALUES(?,?,?,?,?)').run('owner',solo.id,JSON.stringify(solo),solo.revision,stamp);
 db.sql.prepare('INSERT INTO leagues(owner_id,state,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(quick),quick.revision,stamp);
 db.sql.prepare('INSERT INTO season_leagues(id,owner_id,invite_hash,state,revision,updated_at) VALUES(?,?,?,?,?,?)').run(season.id,'owner','hash',JSON.stringify(season),season.revision,stamp);
 db.sql.prepare('INSERT INTO demo_archives(id,owner_id,state,revision,archived_at) VALUES(?,?,?,?,?)').run('archive-1','owner',JSON.stringify({...solo,id:'archive-1'}),solo.revision,stamp);
 const before=dump(db.sql);
 assert.equal((await api.GET(request(''))).status,401);assert.equal(db.queries.length,0);
 const response=await api.GET(request());assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 const {overview}=await response.json() as {overview:DashboardOverview};
 assert.equal(overview.solo?.name,'My Throwbacks');assert.equal(overview.quick?.stage,'Round 3 · Home locked');assert.equal(overview.leagues[0].name,'Sunday Legends');assert.equal(overview.archivedSoloCount,1);
 const publicText=JSON.stringify(overview);for(const hidden of ['PRIVATE-CODE','prime-rushmore:','revision','userId','inviteHash','stats','scoring','draws'])assert.ok(!publicText.includes(hidden),`summary excludes ${hidden}`);
 const stranger=(await(await api.GET(request('stranger'))).json() as {overview:DashboardOverview}).overview;
 assert.deepEqual(stranger,{solo:null,leagues:[],quick:null,archivedSoloCount:0});
 const friend=(await(await api.GET(request('friend'))).json() as {overview:DashboardOverview}).overview;
 assert.equal(friend.leagues.length,1);assert.equal(friend.solo,null);assert.equal(friend.quick,null);assert.equal(friend.archivedSoloCount,0);
 assert.deepEqual(dump(db.sql),before,'every row, source ID, revision, raw state and consumed ledger stays exact');
});
test('dashboard describes saved stages without starting, scoring or revealing a game',()=>{
 assert.equal(soloProgress(solo,stamp).href,'/demo?desk=draft');
 const withSeason={...solo,season:{...season,teams:season.teams.map((t,i)=>({...t,id:i?'away':'home',userId:i?'cpu':'owner'}))}};
 assert.equal(soloProgress(withSeason,stamp).href,'/demo?view=roster');
 assert.equal(soloProgress({...withSeason,season:{...withSeason.season,status:'review'}},stamp).href,'/demo?view=results&replay=4');
 assert.equal(soloProgress({...withSeason,season:{...withSeason.season,status:'complete'}},stamp).action,'View final results');
 assert.equal(onlineProgress({...season,status:'lobby'},'friend',stamp).href,'/league?league=online-1');
 assert.equal(onlineProgress({...season,id:'slash/a?&',status:'review'},'owner',stamp).href,'/league?league=slash%2Fa%3F%26&view=results&replay=4');
 assert.equal(quickProgress({...quick,status:'reveal'},stamp).href,'/matchup?view=matchup');
 assert.equal(soloProgress({...solo,status:'complete'},stamp).action,'Review my team');
});
