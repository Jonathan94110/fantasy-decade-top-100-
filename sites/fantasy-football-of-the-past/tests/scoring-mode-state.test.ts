import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import type {League} from '../lib/game-engine';
import type {DemoDraft} from '../lib/demo-draft-model';
import type {Season} from '../lib/season-model';
import type {ScoringRules} from '../lib/scoring-rules';

const root=new URL('../',import.meta.url);
type AuditGlobal=typeof globalThis&{__scoringModeDatabase?:ReturnType<typeof memoryDatabase>};
const audit=globalThis as AuditGlobal;
registerHooks({
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return next(url,context);},
 resolve(id,context,next){
  if(id==='@/db')return {url:`data:text/javascript,${encodeURIComponent('export function database(){return globalThis.__scoringModeDatabase;}')}`,shortCircuit:true};
  if(id.startsWith('@/'))return next(new URL(`${id.slice(2)}.ts`,root).href,context);
  try{return next(id,context);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return next(`${id}.ts`,context);throw e;}
 }
});
const {newScoring,HISTORICAL_SCORING_READY,LEGACY_SCORING,scoringFor}=await import('../lib/scoring-rules');
const {ATHLETES,athletesFor,athleteFor,LINEUP_SLOTS,eligibleForSlot,score}=await import('../lib/historical-data');
const {newLeague,updateLeagueRules,lockLineup,nextRound}=await import('../lib/game-engine');
const {newSeason,joinSeason,seasonAction}=await import('../lib/season-engine');
const {newDemoDraft,demoDraftAction}=await import('../lib/demo-draft-engine');
const {demoPickReason}=await import('../lib/demo-draft-model');
const quickApi=await import('../app/api/game/route');
const soloApi=await import('../app/api/demo/route');
const leaguesApi=await import('../app/api/leagues/route');
const leagueApi=await import('../app/api/leagues/[id]/route');
const {inviteHash}=await import('../lib/season-store');

const lineup:Record<string,string>={};
for(const slot of LINEUP_SLOTS)lineup[slot]=ATHLETES.find(a=>eligibleForSlot(a,slot)&&a.gameCount>50&&!Object.values(lineup).includes(a.id))!.id;
const savedContracts:ScoringRules[]=[1,2,3,4].map(version=>({...LEGACY_SCORING,version:version as ScoringRules['version'],receptionPoints:version===2?.5:1,lostFumble:version===4?0:-2}));
const availableModes=['strict','historical'] as const;
const availableSelection='historical';
function finishDraft(draft:DemoDraft){let saved=draft;while(saved.status==='draft')saved=demoDraftAction(saved,{action:'draft',athleteId:athletesFor(scoringFor(saved)).find(a=>!demoPickReason(saved,saved.humanTeamId,a.id))!.id});return saved;}
function fullLobby(mode:unknown='strict'){return joinSeason(newSeason('owner',{name:'Scoring league',teamName:'Owner',capacity:2,format:'seventeen',scoringMode:mode},'SCORING-CODE'),'manager','Manager');}
function activeSeason(mode:unknown='strict'){let season=seasonAction(fullLobby(mode),'owner',{action:'startDraft',orderMode:'manual',orderIndexes:[0,1]});while(season.status==='draft')season=seasonAction(season,'owner',{action:'autopick'});return season;}
function memoryDatabase(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('drizzle/',root)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`drizzle/${file}`,root),'utf8'));
 return {sql,writes:0,prepare(query:string){let args:SQLInputValue[]=[];return {bind(...values:unknown[]){args=values as SQLInputValue[];return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){audit.__scoringModeDatabase!.writes++;return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};
}
function fresh(){audit.__scoringModeDatabase=memoryDatabase();return audit.__scoringModeDatabase;}
function request(path:string,body?:Record<string,unknown>,user='owner'){return new Request(`https://scoring.test/api/${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://scoring.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
function context(id:string){return {params:Promise.resolve({id})};}
async function seedSeason(season:Season){const db=audit.__scoringModeDatabase!;db.sql.prepare('INSERT INTO season_leagues (id,owner_id,invite_hash,state,revision,updated_at) VALUES (?,?,?,?,?,?)').run(season.id,season.ownerId,await inviteHash(season.inviteCode),JSON.stringify(season),season.revision,season.createdAt);}

test('new quick games, solo drafts and online lobbies persist each available complete contract',()=>{
 for(const mode of availableModes)for(const receptions of [0,.5,1] as const)for(const kickers of [false,true]){
  const rules=newScoring(receptions,kickers,mode);assert.equal(rules.version,5);assert.equal(rules.mode,mode);
  assert.deepEqual(newDemoDraft('Solo',receptions,{modern:true,capacity:2,kickers,opening:true,scoringMode:mode}).scoring,rules);
  assert.deepEqual(newSeason('owner',{name:'Online',teamName:'Owner',capacity:2,receptionPoints:receptions,kickers,scoringMode:mode},'MODE').scoring,rules);
  if(!kickers)assert.deepEqual(newLeague('quick',receptions,mode).scoring,rules);
 }
 for(const receptions of [0,.5,1] as const)for(const kickers of [false,true]){
  const common=newScoring(receptions,kickers,'historical');
  assert.deepEqual(newDemoDraft('Default',receptions,{opening:true,kickers}).scoring,common);
  assert.deepEqual(newSeason('owner',{name:'Default',teamName:'Owner',capacity:2,receptionPoints:receptions,kickers},'DEFAULT').scoring,common);
  if(!kickers)assert.deepEqual(newLeague('default',receptions).scoring,common);
 }
 assert.deepEqual(newScoring(),newScoring(1,false,'strict'),'The scoring helper preserves explicit saved-Strict fixture defaults');
});

test('approved Historical contracts are available, fixed and frozen across all reception presets',()=>{
 assert.equal(HISTORICAL_SCORING_READY,true);
 for(const receptionPoints of [0,.5,1] as const){
  const rules=newScoring(receptionPoints,true,'historical');
  assert.equal(rules.version,5);assert.equal(rules.mode,'historical');assert.equal(rules.receptionPoints,receptionPoints);
  for(const category of ['lostFumble','twoPoint','offensiveRecoveryTD','sack','takeaway','defenseFumbleRecovery','blockedKick','safety','defensiveTouchdown'] as const)assert.equal(rules[category],0,category);
  assert.equal(rules.touchdown,6);assert.equal(rules.passingYard,.04);assert.equal(rules.passingTD,4);assert.equal(rules.interception,-2);assert.equal(rules.scrimmageYard,.1);
  assert.equal(rules.kicking!.fieldGoalFlat,3);assert.equal(rules.kicking!.extraPoint,1);assert.equal(rules.kicking!.unsuccessful,-1);assert.equal(rules.kicking!.unsuccessfulExtraPoint,0);
  assert.deepEqual(rules.pointsAllowed,[10,7,4,1,0,-1,-4]);assert.ok(Object.isFrozen(rules));assert.ok(Object.isFrozen(rules.kicking));assert.ok(Object.isFrozen(rules.pointsAllowed));
 }
});

test('invalid creation modes fail before any IDs, lottery randomness or computer picks',t=>{
 t.mock.method(crypto,'randomUUID',()=>{throw new Error('Unexpected UUID draw');});
 t.mock.method(crypto,'getRandomValues',()=>{throw new Error('Unexpected random draw');});
 for(const mode of [null,'','Historical','unknown',0,{},[]]){
  assert.throws(()=>newLeague('invalid',1,mode),/Strict|Historical|scoring mode/i);
  assert.throws(()=>newDemoDraft('Invalid',1,{modern:true,capacity:2,scoringMode:mode}),/Strict|Historical|scoring mode/i);
  assert.throws(()=>newSeason('owner',{name:'Invalid',teamName:'Owner',capacity:2,scoringMode:mode},'INVALID'),/Strict|Historical|scoring mode/i);
 }
});

test('quick mode and PPR may change only before the first lineup, then every receipt uses the saved contract',()=>{
 const initial=newLeague('quick-mode',1,'strict');const saved=JSON.stringify(initial);
 let league=updateLeagueRules(initial,{scoringMode:availableSelection,receptionPoints:.5});assert.equal(JSON.stringify(initial),saved);assert.deepEqual(league.scoring,newScoring(.5,false,availableSelection));
 league=lockLineup(league,lineup,0);const first=JSON.stringify(league);assert.throws(()=>updateLeagueRules(league,{scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(league),first);
 league=lockLineup(league,lineup,1);const round=structuredClone(league.history[0]);assert.deepEqual(round.scoring,league.scoring);
 for(const team of round.draws)for(const draw of team)assert.equal(draw.points,score(draw.performance.stats,athleteFor(draw.athleteId,round.scoring!)!.position,round.scoring));
 league=nextRound(league);assert.deepEqual(league.history[0],round);assert.deepEqual(league.scoring,round.scoring);assert.throws(()=>updateLeagueRules(league,{scoringMode:'strict'}),/fixed/);
});

test('legacy quick contracts cannot acquire a mode, while supported PPR edits preserve every other rule',()=>{
 for(const rules of [undefined,...savedContracts]){
  const league=newLeague('saved',1,'strict');if(rules)league.scoring=structuredClone(rules);else delete league.scoring;
  const before=JSON.stringify(league);assert.throws(()=>updateLeagueRules(league,{scoringMode:'historical'}));assert.equal(JSON.stringify(league),before);
  if(rules)assert.deepEqual(updateLeagueRules(league,{receptionPoints:0}).scoring,{...rules,receptionPoints:0});else assert.throws(()=>updateLeagueRules(league,{receptionPoints:0}),/original Full PPR/);
  const result=lockLineup(lockLineup(league,lineup,0),lineup,1);assert.deepEqual(result.history[0].scoring,scoringFor(league));assert.deepEqual(nextRound(result).history,result.history);
 }
});

test('online mode is commissioner-controlled in the lobby and fixed at draft start',t=>{
 const lobby=fullLobby();const before=JSON.stringify(lobby);assert.throws(()=>seasonAction(lobby,'manager',{action:'rules',scoringMode:'historical'}),/commissioner/);assert.equal(JSON.stringify(lobby),before);
 const historical=seasonAction(lobby,'owner',{action:'rules',scoringMode:availableSelection,receptionPoints:.5});assert.deepEqual(historical.scoring,newScoring(.5,false,availableSelection));assert.equal(JSON.stringify(lobby),before);
 assert.deepEqual(new Set(Object.keys(historical.byes!.weeks)),new Set(athletesFor(historical.scoring!).map(a=>a.id)));
 const draft=seasonAction(historical,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:[0,1]});const frozen=JSON.stringify(draft);
 t.mock.method(crypto,'getRandomValues',()=>{throw new Error('Unexpected random draw');});
 for(const action of ['rules','startDraft','autopick','draft','rotateInvite'])assert.throws(()=>seasonAction(draft,'owner',{action,scoringMode:'strict'}),/fixed/);
 assert.equal(JSON.stringify(draft),frozen);assert.deepEqual(draft.scoring,historical.scoring);
});

test('legacy online lobby modes remain unchanged and PPR edits do not replace saved contracts',()=>{
 for(const rules of [undefined,...savedContracts]){
  const lobby=fullLobby();if(rules)lobby.scoring=structuredClone(rules);else delete lobby.scoring;
  const before=JSON.stringify(lobby);assert.throws(()=>seasonAction(lobby,'owner',{action:'rules',scoringMode:'historical'}));assert.equal(JSON.stringify(lobby),before);
  if(rules)assert.deepEqual(seasonAction(lobby,'owner',{action:'rules',receptionPoints:0}).scoring,{...rules,receptionPoints:0});
 }
});

test('one approved Historical online contract scores both teams and survives review and completed-state edit rejection',()=>{
 let season=activeSeason('historical');const contract=structuredClone(season.scoring);
 for(const team of [...season.teams])season=seasonAction(season,team.userId,{action:'lock',lineup:team.lineup,acceptBye:true});
 const round=structuredClone(season.history[0]);assert.deepEqual(round.scoring,contract);
 for(const draws of Object.values(round.draws))for(const draw of draws)if(!draw.simulatedBye)assert.equal(draw.points,score(draw.performance.stats!,athleteFor(draw.athleteId,round.scoring!)!.position,round.scoring));
 const before=JSON.stringify(season);assert.throws(()=>seasonAction(season,'owner',{action:'rules',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(season),before);
 season=seasonAction(season,'owner',{action:'next'});assert.deepEqual(season.history[0],round);assert.deepEqual(season.scoring,contract);
 season.status='complete';const completed=JSON.stringify(season);assert.throws(()=>seasonAction(season,'owner',{action:'rules',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(season),completed);
});

test('approved solo mode locks with the draft order and survives season and round receipts',()=>{
 let draft=newDemoDraft('Historical solo',.5,{modern:true,capacity:2,opening:true,orderMode:'manual',orderIndexes:[0,1],scoringMode:availableSelection});const contract=structuredClone(draft.scoring);const opening=JSON.stringify(draft);
 assert.throws(()=>demoDraftAction(draft,{action:'beginDraft',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(draft),opening);
 draft=finishDraft(demoDraftAction(draft,{action:'beginDraft'}));const picks=JSON.stringify(draft.picks);assert.throws(()=>demoDraftAction(draft,{action:'startSeason',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(draft.picks),picks);
 draft=demoDraftAction(draft,{action:'startSeason'});assert.deepEqual(draft.scoring,contract);assert.deepEqual(draft.season!.scoring,contract);
 const human=draft.season!.teams.find(t=>t.id===draft.humanTeamId)!;draft=demoDraftAction(draft,{action:'lock',lineup:human.lineup,acceptBye:true});assert.deepEqual(draft.season!.history[0].scoring,contract);
 const saved=JSON.stringify(draft);assert.throws(()=>demoDraftAction(draft,{action:'rules',scoringMode:'strict'}),/fixed/);assert.equal(JSON.stringify(draft),saved);
});

test('starting pre-existing solo drafts preserves v1–4 or absent contracts without a mode migration',()=>{
 for(const rules of [undefined,...savedContracts]){
  let draft=newDemoDraft('Saved solo',1,{modern:true,capacity:2,opening:true,orderMode:'manual',orderIndexes:[0,1],scoringMode:'strict'});if(rules)draft.scoring=structuredClone(rules);else delete draft.scoring;
  const expected=structuredClone(scoringFor(draft));draft=finishDraft(demoDraftAction(draft,{action:'beginDraft'}));const before=JSON.stringify(draft);
  const started=demoDraftAction(draft,{action:'startSeason'});assert.equal(JSON.stringify(draft),before);assert.deepEqual(started.season!.scoring,expected);assert.equal(started.season!.scoring!.mode,undefined);
 }
});

test('invalid API create modes and mode-bearing join actions never write or use randomness',async t=>{
 const db=fresh();t.mock.method(crypto,'randomUUID',()=>{throw new Error('Unexpected UUID draw');});t.mock.method(crypto,'getRandomValues',()=>{throw new Error('Unexpected random draw');});
 for(const mode of [null,'','invalid']){
  assert.equal((await soloApi.POST(request('demo',{action:'create',teamName:'Solo',capacity:2,scoringMode:mode}))).status,400);
  assert.equal((await leaguesApi.POST(request('leagues',{action:'create',name:'League',teamName:'Owner',capacity:2,scoringMode:mode}))).status,400);
 }
 assert.equal((await leaguesApi.POST(request('leagues',{action:'join',code:'UNKNOWN',teamName:'Joiner',scoringMode:'historical'}))).status,400);
 assert.equal(db.writes,0);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM demo_drafts').get()!.n,0);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM season_leagues').get()!.n,0);
});

test('quick API persists pre-lock selection, rejects post-lock edits atomically and refreshes the same contract',async t=>{
 const db=fresh();t.mock.method(console,'error',()=>{});let league=(await(await quickApi.GET(request('game'))).json() as {league:League}).league;
 let response=await quickApi.POST(request('game',{action:'rules',revision:league.revision,scoringMode:availableSelection}));assert.equal(response.status,200);league=(await response.json() as {league:League}).league;
 const beforeInvalid=String(db.sql.prepare('SELECT state FROM leagues WHERE owner_id=?').get('owner')!.state);const writes=db.writes;
 assert.equal((await quickApi.POST(request('game',{action:'rules',revision:league.revision,scoringMode:'invalid'}))).status,400);assert.equal(db.writes,writes);assert.equal(db.sql.prepare('SELECT state FROM leagues WHERE owner_id=?').get('owner')!.state,beforeInvalid);
 response=await quickApi.POST(request('game',{action:'lock',revision:league.revision,turn:0,lineup}));assert.equal(response.status,200);league=(await response.json() as {league:League}).league;
 const locked=String(db.sql.prepare('SELECT state FROM leagues WHERE owner_id=?').get('owner')!.state);const lockedWrites=db.writes;
 for(const action of ['rules','lock','next'])assert.equal((await quickApi.POST(request('game',{action,revision:league.revision,turn:1,lineup,scoringMode:'strict'}))).status,400);
 assert.equal(db.writes,lockedWrites);assert.equal(db.sql.prepare('SELECT state FROM leagues WHERE owner_id=?').get('owner')!.state,locked);
 assert.deepEqual((await(await quickApi.GET(request('game'))).json() as {league:League}).league.scoring,league.scoring);
});

test('solo API retries resume the original mode and draft-order reveal cannot change it',async()=>{
 const db=fresh();const create={action:'create',teamName:'Saved solo',capacity:2,opening:true,scoringMode:availableSelection};
 let response=await soloApi.POST(request('demo',create));assert.equal(response.status,201);const saved=(await response.json() as {demo:DemoDraft}).demo;const before=String(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state);const writes=db.writes;
 response=await soloApi.POST(request('demo',{...create,scoringMode:'strict'}));assert.equal(response.status,200);assert.deepEqual((await response.json() as {demo:DemoDraft}).demo.scoring,saved.scoring);assert.equal(db.writes,writes);
 response=await soloApi.POST(request('demo',{action:'beginDraft',revision:saved.revision,scoringMode:'strict'}));assert.equal(response.status,400);assert.equal(db.writes,writes);assert.equal(db.sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get('owner')!.state,before);
});

test('online API saves lobby mode once, then rejects mode-bearing draft/invite actions before writes or RNG',async t=>{
 const db=fresh();let lobby=fullLobby();await seedSeason(lobby);let response=await leagueApi.POST(request('leagues',{action:'rules',revision:lobby.revision,scoringMode:availableSelection}),context(lobby.id));assert.equal(response.status,200);
 lobby=JSON.parse(String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(lobby.id)!.state)) as Season;assert.equal(lobby.scoring!.mode,availableSelection);
 response=await leagueApi.POST(request('leagues',{action:'startDraft',revision:lobby.revision,orderMode:'manual',orderIndexes:[0,1]}),context(lobby.id));assert.equal(response.status,200);
 const state=String(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(lobby.id)!.state);const draft=JSON.parse(state) as Season;const writes=db.writes;
 t.mock.method(crypto,'getRandomValues',()=>{throw new Error('Unexpected random draw');});t.mock.method(crypto,'randomUUID',()=>{throw new Error('Unexpected UUID draw');});
 for(const action of ['rules','startDraft','autopick','rotateInvite','removeManager'])assert.equal((await leagueApi.POST(request('leagues',{action,revision:draft.revision,scoringMode:'strict'}),context(draft.id))).status,400);
 assert.equal(db.writes,writes);assert.equal(db.sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(draft.id)!.state,state);
});
