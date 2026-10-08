/** Mounted unified draft/scoring regression with in-memory fixtures. No rendered browser QA or production writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../',import.meta.url));
registerHooks({
 resolve(id,context,next){
  if(id==='next/link')return {url:'data:text/javascript,import React from "'+pathToFileURL(root+'node_modules/react/index.js').href+'";export default function Link(p){return React.createElement("a",p)}',shortCircuit:true};
  if(id.startsWith('@/'))id=pathToFileURL(root+id.slice(2)).href;
  try{return next(id,context);}catch(error){for(const ext of ['.ts','.tsx'])try{return next(id+ext,context);}catch{}throw error;}
 },
 load(url,context,next){
  if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};
  if(url.startsWith('file:')&&/\.(ts|tsx)$/.test(url)&&!url.includes('/node_modules/'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};
  return next(url,context);
 }
});
const {Window}=await import(process.env.DOM_HARNESS_MODULE||'happy-dom');
const window=new Window({url:'http://fixture.local'});
for(const name of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','NodeFilter','Element','DocumentFragment','Event','CustomEvent','MutationObserver','ResizeObserver'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {createRoot}=await import('react-dom/client');

const {default:QuickMatchup}=await import(pathToFileURL(root+'app/matchup/page.tsx').href);
const {DemoDraftRoom}=await import(pathToFileURL(root+'components/demo-draft-room.tsx').href);
const {OnlineLeague}=await import(pathToFileURL(root+'components/online-league.tsx').href);
const {SeasonWorkspace}=await import(pathToFileURL(root+'components/season-workspace.tsx').href);
const {FantasyReplay}=await import(pathToFileURL(root+'components/fantasy-replay.tsx').href);
const {Rules}=await import(pathToFileURL(root+'components/game-rules.tsx').href);
const {DraftAssistant}=await import(pathToFileURL(root+'components/draft-assistant.tsx').href);
const {ScoringContractSummary}=await import(pathToFileURL(root+'components/scoring-mode-picker.tsx').href);
const {newScoring,scoringFor,scoringModeLabel,HISTORICAL_SCORING_READY}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const {ATHLETES,athletesFor,athleteFor,HISTORICAL_MODE_COVERAGE}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {draftRankings,draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {historicalDrawLabel}=await import(pathToFileURL(root+'lib/fantasy-replay.ts').href);
const {newLeague,updateLeagueRules,lockLineup,publicLeague}=await import(pathToFileURL(root+'lib/game-engine.ts').href);
const {newDemoDraft,demoDraftAction}=await import(pathToFileURL(root+'lib/demo-draft-engine.ts').href);
const {draftStorageKey}=await import(pathToFileURL(root+'lib/draft-tools.ts').href);
const {unifyUnscoredDraft}=await import(pathToFileURL(root+'lib/unified-draft.ts').href);
const {demoPickReason}=await import(pathToFileURL(root+'lib/demo-draft-model.ts').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
let quick=newLeague('scoring-mode-dom'),demo=null,season=null,unificationBehavior=null,demoReads=0;
const unificationBackups=[];
const writes=[];
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;
 if(body)writes.push({url,body});
 if(url==='/api/profile')return Response.json({profile:{receptionPoints:1,displayName:'Fixture owner',reduceMotion:true,avatar:null}});
 if(url.startsWith('/api/draft-preferences'))return Response.json({preferences:{revision:0,queue:[],timerSeconds:0}});
 if(url.includes('?rankings')){const state=url.startsWith('/api/game')?quick:url.startsWith('/api/demo')?demo:season;return Response.json({rankings:draftRankings(state?.used??[],scoringFor(state))});}
 if(url.includes('?athlete')){const state=url.startsWith('/api/game')?quick:url.startsWith('/api/demo')?demo:season;return Response.json({insights:draftInsights(new URL(url,'http://fixture.local').searchParams.get('athlete'),state?.used??[],scoringFor(state))});}
 if(url==='/api/game'){
  if(body){
   if(body.action==='rules')quick=updateLeagueRules(quick,body);
   if(body.action==='lock')quick=lockLineup(quick,body.lineup,body.turn);
   quick={...quick,revision:quick.revision+1};
  }
  return Response.json({league:publicLeague(quick)});
 }
 if(url==='/api/demo'){
  const reply=()=>({demo,league:demo?.season?publicSeason(demo.season,demo.humanTeamId):null,...(unificationBehavior&&demo?.scoring?.mode==='strict'?{unificationAvailable:true}:{})});
  if(body){
   if(body.action==='unifyDraft'){
    assert.equal(body.seasonId,demo.id);assert.equal(body.revision,demo.revision);assert.equal(options.signal?.aborted,false);
    if(unificationBehavior==='success'){
     unificationBackups.push(structuredClone(demo));const next=unifyUnscoredDraft(demo);assert.ok(next);demo={...next,revision:demo.revision+1};return Response.json(reply());
    }
    assert.ok(unificationBehavior?.startsWith('conflict'));demo={...demo,revision:demo.revision+1};
    return Response.json(unificationBehavior==='conflict-payload'?reply():{error:'Concurrent fixture action'},{status:409});
   }
   if(body.action==='create')demo??=newDemoDraft(body.teamName,body.receptionPoints,{...body,modern:true});
   else demo={...demoDraftAction(demo,body),revision:demo.revision+1};
  }else demoReads++;
  return Response.json(reply());
 }
 if(url==='/api/leagues'){
  if(!body)return Response.json({leagues:[]});
  if(body.action==='create'){season=newSeason('owner',body,'TEST-MODE-CODE');return Response.json({league:publicSeason(season,'owner')});}
 }
 if(url.startsWith('/api/leagues/')){
  if(body){season=seasonAction(season,'owner',body);season={...season,revision:season.revision+1};}
  return Response.json({league:publicSeason(season,'owner')});
 }
 throw Error('Unexpected fixture request: '+url);
};
window.document.body.innerHTML='<div id="root"></div>';
let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,25));});
const q=(selector,scope=document)=>scope.querySelector(selector),all=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const mount=async(element)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(element));};
const click=async(node)=>{assert.ok(node,'Expected control exists');assert.ok(!node.disabled,'Expected control is enabled');await act(()=>node.click());};
const button=text=>all('button').find(node=>node.textContent.trim()===text);
const select=async(selector,value)=>act(()=>{const node=q(selector);assert.ok(node,selector);assert.ok(!node.disabled);node.value=String(value);node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const input=async(selector,value)=>act(()=>{const node=q(selector);assert.ok(node,selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});
const mode=()=>q('select[aria-label="Scoring mode"]');
const modeText=()=>all('[aria-label="Saved scoring contract"]').map(node=>node.textContent).join(' ');
const noModePicker=()=>assert.equal(mode(),null,'Normal play has no scoring-mode choice');
const contractIs=rules=>assert.ok(modeText().includes(scoringModeLabel(rules)),modeText());
const clearQuickDraft=()=>localStorage.removeItem(draftStorageKey(quick));
try{
 assert.equal(HISTORICAL_SCORING_READY,true);
 const historicalRules=newScoring(.5,true,'historical'),strictRules=newScoring(1,true,'strict'),strictIds=new Set(ATHLETES.map(athlete=>athlete.id));
 const historicalCatalog=athletesFor(historicalRules),olderPlayers=historicalCatalog.filter(athlete=>!strictIds.has(athlete.id)&&athlete.position!=='DEF'&&athlete.position!=='K');
 assert.ok(olderPlayers.length,'Verified earlier players belong to the unified draft board');assert.ok(olderPlayers.every(athlete=>athlete.gameCount>=17));
 const olderQB=olderPlayers.find(athlete=>athlete.position==='QB'&&/Joe Montana/.test(athlete.name))??olderPlayers.find(athlete=>athlete.position==='QB');assert.ok(olderQB);assert.equal(athleteFor(olderQB.id,strictRules),undefined,'A saved Strict contract retains its catalog');
 const modernPlayer=historicalCatalog.find(athlete=>athlete.name==='Christian McCaffrey');assert.ok(modernPlayer);
 // Private queue history remains visible but cannot open ineligible saved-contract details.
 const queueChanges=[],detailsOpened=[],queueFixture={scope:'contract-queue',preferences:{revision:0,queue:[olderQB.id],timerSeconds:0},error:'',busy:false,refresh:()=>{},change:async(...args)=>queueChanges.push(args)};
 const renderQueue=rules=>React.createElement(DraftAssistant,{queue:queueFixture,myTurn:false,turnKey:'queue',nextText:'Waiting',scoring:rules,onDetails:athlete=>detailsOpened.push(athlete.id)});
 await mount(renderQueue(strictRules));assert.match(q('.draft-queue-list').textContent,new RegExp(olderQB.name));assert.match(q('.queue-player').textContent,/Unavailable/i);assert.equal(q('.queue-player').disabled,true);assert.equal(q(`button[aria-label="Remove ${olderQB.name} from queue"]`).disabled,false);
 await mount(renderQueue(historicalRules));assert.equal(q('.queue-player').disabled,false);assert.match(q('.queue-player').textContent,/Available/);await click(q('.queue-player'));assert.deepEqual(detailsOpened,[olderQB.id]);assert.deepEqual(queueFixture.preferences.queue,[olderQB.id]);assert.equal(queueChanges.length,0);
 await mount(React.createElement(ScoringContractSummary,{rules:historicalRules}));noModePicker();contractIs(historicalRules);assert.match(modeText(),/two.point/i);assert.match(modeText(),/recovery/i);assert.match(modeText(),/unknown/i);assert.match(modeText(),/defense interceptions/);assert.match(modeText(),/safeties/);
 await mount(React.createElement(Rules,{scoring:historicalRules}));
 assert.match(document.body.textContent,/excluded for everyone/);assert.doesNotMatch(document.body.textContent,/2 \/ conversion/);assert.doesNotMatch(document.body.textContent,/awaits final|awaiting final/i);assert.ok(document.body.textContent.includes(HISTORICAL_MODE_COVERAGE.earlierEraPerformanceCount.toLocaleString()));assert.match(document.body.textContent,/1950s remain unavailable/);

 // A new quick matchup starts with the common all-era contract; only PPR is editable.
 assert.equal(quick.scoring.mode,'historical','New quick matchups use the unified contract');
 await mount(React.createElement(QuickMatchup));noModePicker();contractIs(quick.scoring);
 assert.equal(q('.ff-position-tabs button').getAttribute('aria-pressed'),'true');assert.equal(q('.ff-position-tabs button').textContent,'All');assert.equal(q('select[aria-label="Verified game era"]').value,'0');
 await select('select[aria-label="Reception scoring"]','0.5');assert.equal(quick.scoring.receptionPoints,.5);assert.equal(writes.at(-1).body.scoringMode,undefined,'PPR changes do not replace the contract');
 for(const era of [1960,1970,1980,1990]){await select('select[aria-label="Verified game era"]',era);assert.ok(all('.ff-player-table tbody tr').length,`${era}s has draftable players`);assert.doesNotMatch(q('.ff-pool').textContent,/Preview only/);}
 await select('select[aria-label="Verified game era"]',1950);assert.equal(all('.ff-player-table tbody tr').length,0);assert.match(q('.ff-empty-search').textContent,/1950s game logs need more verified stats/);assert.match(q('.ff-empty-search').textContent,/return touchdowns/);assert.match(q('.ff-empty-search').textContent,/Unknown stats cannot count as zero/);
 await select('select[aria-label="Verified game era"]',0);await input('input[aria-label="Search available players"]',modernPlayer.name);assert.ok(all('.ff-player-table tbody tr').some(row=>row.textContent.includes(modernPlayer.name)),'Modern players are on the same board');
 await input('input[aria-label="Search available players"]',olderQB.name);await click(all('button.ff-add').find(node=>node.getAttribute('aria-label')===`Add ${olderQB.name}`));assert.match(q('.ff-roster').textContent,new RegExp(olderQB.name));
 await click(button('Fill open slots'));await click(button('Lock home lineup'));await click(button('Confirm & lock'));
 assert.equal(quick.turn,1);await click(button('Away is ready'));noModePicker();assert.equal(q('select[aria-label="Reception scoring"]').disabled,true);assert.match(modeText(),/locked/i);
 const quickContract=JSON.stringify(quick.scoring);
 await click(button('Fill open slots'));await click(button('Lock away lineup'));await click(button('Confirm & lock'));
 assert.equal(quick.status,'reveal');assert.equal(JSON.stringify(quick.history[0].scoring),quickContract);contractIs(quick.scoring);
 const olderDraw=quick.history[0].draws[0].find(draw=>draw.athleteId===olderQB.id);assert.ok(olderDraw);assert.equal(olderDraw.performance.seasonType,'REG');assert.equal(olderDraw.performance.week,null);assert.match(historicalDrawLabel(olderDraw.performance),/week unavailable/i);assert.match(historicalDrawLabel(olderDraw.performance),/ordinal/i);assert.doesNotMatch(document.body.textContent,/Week null/);
 // Previously saved quick contracts have a summary and are never silently changed.
 quick={...newLeague('saved-strict-ui'),scoring:strictRules};clearQuickDraft();let snapshot=JSON.stringify(quick);let writeCount=writes.length;
 await mount(React.createElement(QuickMatchup));noModePicker();contractIs(strictRules);assert.equal(JSON.stringify(quick),snapshot);assert.equal(writes.length,writeCount);
 quick={...newLeague('legacy-ui'),scoring:{...strictRules,version:4}};delete quick.scoring.mode;clearQuickDraft();snapshot=JSON.stringify(quick);writeCount=writes.length;
 await mount(React.createElement(QuickMatchup));noModePicker();contractIs(quick.scoring);assert.equal(JSON.stringify(quick),snapshot);assert.equal(writes.length,writeCount);

 // New solo creation explicitly saves the unified contract and resumes the same order.
 await mount(React.createElement(DemoDraftRoom));noModePicker();contractIs(historicalRules);
 await input('.demo-setup input[maxlength="50"]','Unified solo');await select('.demo-setup .league-form-row select',2);await act(()=>all('.order-mode-picker input')[1].click());await select('select[aria-label="Reception scoring"]','0.5');
 await act(()=>q('.demo-setup form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(demo.scoring.mode,'historical');assert.equal(demo.scoring.receptionPoints,.5);assert.equal(writes.findLast(write=>write.body.action==='create').body.scoringMode,'historical');noModePicker();contractIs(demo.scoring);assert.match(modeText(),/Locked when the draft order was saved/);
 const soloContract=JSON.stringify(demo.scoring);snapshot=JSON.stringify(demo);writeCount=writes.length;await mount(React.createElement(DemoDraftRoom));noModePicker();assert.equal(JSON.stringify(demo),snapshot);assert.equal(writes.length,writeCount);
 const showOrder=button('Show full order');if(showOrder)await click(showOrder);await click(button('Enter draft room'));
 assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(q('select[aria-label="Player era"]').value,'0');
 assert.ok(q(`.demo-player-row[data-player-id="${olderQB.id}"]`),'Older player is visible without filters');assert.ok(q(`.demo-player-row[data-player-id="${modernPlayer.id}"]`),'Modern player is visible without filters');assert.equal(new Set(all('.demo-player-row').map(row=>row.dataset.position)).size,6,'Every eligible position is visible by default');
 assert.equal(all('.demo-player-row').length,historicalCatalog.length,'The entire fresh eligible board is visible');
 await select('select[aria-label="Player position"]','QB');await select('select[aria-label="Player era"]',1980);await input('.season-search input',olderQB.name);await click(all('.demo-player-list button').find(node=>node.getAttribute('aria-label')===`Draft ${olderQB.name}`));assert.ok(demo.teams.find(team=>team.id===demo.humanTeamId).roster.includes(olderQB.id));assert.match(q('.player-browser-empty h3').textContent,/No available QB players match these filters/);
 while(demo.status==='draft'){const candidate=athletesFor(demo.scoring).find(athlete=>!demoPickReason(demo,demo.humanTeamId,athlete.id));assert.ok(candidate,'A legal unified solo pick remains');demo={...demoDraftAction(demo,{action:'draft',athleteId:candidate.id}),revision:demo.revision+1};}
 demo={...demoDraftAction(demo,{action:'startSeason'}),revision:demo.revision+1};await mount(React.createElement(DemoDraftRoom));contractIs(demo.scoring);noModePicker();
 const soloHuman=demo.season.teams.find(team=>team.id===demo.humanTeamId);assert.equal(soloHuman.lineup.QB,olderQB.id);await click(button('2 · Lock lineup'));assert.ok(demo.season.history.length);assert.equal(demo.season.history[0].draws[demo.humanTeamId].find(draw=>draw.athleteId===olderQB.id).performance.seasonType,'REG');assert.equal(JSON.stringify(demo.season.history[0].scoring),soloContract);
 const finishedSolo=demo;demo=newDemoDraft('Saved Strict',1,{modern:true,kickers:true,scoringMode:'strict',capacity:2});snapshot=JSON.stringify(demo);writeCount=writes.length;
 await mount(React.createElement(DemoDraftRoom));noModePicker();contractIs(strictRules);assert.equal(JSON.stringify(demo),snapshot);assert.equal(writes.length,writeCount);demo=finishedSolo;


 // Only the server availability flag authorizes the bounded existing-draft correction.
 demo=newDemoDraft('Correctable saved draft',.5,{modern:true,kickers:true,scoringMode:'strict',capacity:2});const originalDraft=structuredClone(demo);unificationBehavior='success';writeCount=writes.length;
 await mount(React.createElement(DemoDraftRoom));noModePicker();assert.equal(demo.scoring.mode,'historical');assert.deepEqual(unificationBackups.at(-1),originalDraft,'The server fixture retains the exact original before correction');assert.deepEqual(demo.picks,originalDraft.picks);assert.deepEqual(demo.order,originalDraft.order);assert.deepEqual(demo.teams,originalDraft.teams);assert.equal(demo.scoring.receptionPoints,.5);assert.equal(writes.slice(writeCount).filter(write=>write.body.action==='unifyDraft').length,1);assert.ok(writes.slice(writeCount).every(write=>write.body.action!=='reset'));contractIs(demo.scoring);
 for(const conflict of ['conflict-payload','conflict-refresh']){
  demo=newDemoDraft('Concurrent saved draft',1,{modern:true,kickers:true,scoringMode:'strict',capacity:2});unificationBehavior=conflict;const before=structuredClone(demo),readsBefore=demoReads;writeCount=writes.length;
  await mount(React.createElement(DemoDraftRoom));noModePicker();contractIs(demo.scoring);assert.equal(demo.scoring.mode,'strict');assert.deepEqual(demo.picks,before.picks);assert.deepEqual(demo.teams,before.teams);assert.equal(demo.revision,before.revision+1);assert.equal(demoReads-readsBefore,conflict==='conflict-payload'?1:2,'409 fetches at most one normal refresh');
  for(let attempt=0;attempt<3;attempt++)await act(()=>window.dispatchEvent(new window.Event('focus')));
  assert.equal(writes.slice(writeCount).filter(write=>write.body.action==='unifyDraft').length,1,'Polling/focus must not repeat a conflicting migration');assert.ok(writes.slice(writeCount).every(write=>write.body.action!=='reset'));
 }
 unificationBehavior=null;demo=finishedSolo;

 // New online creation explicitly uses the same contract. Existing lobby PPR stays editable.
 await mount(React.createElement(OnlineLeague));noModePicker();contractIs(historicalRules);await input('input[placeholder="Sunday Time Travelers"]','Unified league');await input('input[placeholder="The Throwbacks"]','Owner');await select('.league-entry-grid .league-form-row select',2);
 await act(()=>q('.league-entry-grid form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(season.scoring.mode,'historical');assert.equal(writes.findLast(write=>write.url==='/api/leagues'&&write.body.action==='create').body.scoringMode,'historical');noModePicker();contractIs(season.scoring);
 await select('select[aria-label="Reception scoring"]','0.5');assert.equal(season.scoring.receptionPoints,.5);assert.equal(writes.at(-1).body.scoringMode,undefined);
 const renderWorkspace=viewer=>app.render(React.createElement(SeasonWorkspace,{league:publicSeason(season,viewer),busy:false,onBack:()=>{},onAction:async(action,extra={})=>{season=seasonAction(season,'owner',{action,...extra});season={...season,revision:season.revision+1};renderWorkspace(viewer);return true;}}));
 season=joinSeason(season,'guest','Guest');await mount(React.createElement(SeasonWorkspace,{league:publicSeason(season,'guest'),busy:false,onBack:()=>{},onAction:async()=>true}));noModePicker();contractIs(season.scoring);assert.equal(q('select[aria-label="Reception scoring"]'),null,'Guests cannot edit lobby scoring');
 await mount(React.createElement(React.Fragment));await act(()=>renderWorkspace('owner'));noModePicker();await select('.online-draft-start select','manual');await click(button('Start snake draft'));assert.equal(season.status,'draft');noModePicker();assert.match(modeText(),/Scoring is locked for this season/);
 assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(q('select[aria-label="Player era"]').value,'0');assert.ok(q(`.season-player-row[data-player-id="${olderQB.id}"]`));assert.ok(q(`.season-player-row[data-player-id="${modernPlayer.id}"]`));
 await input('.season-search input',olderQB.name);await click(all('.season-player-list button').find(node=>node.getAttribute('aria-label')===`Draft ${olderQB.name}`));assert.ok(season.teams.find(team=>team.userId==='owner').roster.includes(olderQB.id));
 while(season.status==='draft')season=seasonAction(season,'owner',{action:'autopick'});
 const onlineContract=JSON.stringify(season.scoring),onlineOwner=season.teams.find(team=>team.userId==='owner'),onlineGuest=season.teams.find(team=>team.userId==='guest');assert.equal(onlineOwner.lineup.QB,olderQB.id);
 season=seasonAction(season,'owner',{action:'lock',lineup:onlineOwner.lineup});season=seasonAction(season,'guest',{action:'lock',lineup:onlineGuest.lineup});assert.ok(season.history.length);assert.equal(season.history[0].draws[onlineOwner.id].find(draw=>draw.athleteId===olderQB.id).performance.seasonType,'REG');assert.equal(JSON.stringify(season.history[0].scoring),onlineContract);await mount(React.createElement(React.Fragment));await act(()=>renderWorkspace('owner'));contractIs(season.scoring);noModePicker();
 const originalSeason=season;
 for(const version of [5,4]){season={...newSeason('owner',{name:'Saved lobby',teamName:'Old owner',capacity:2,format:'seventeen',scoringMode:'strict'},'SAVED-CODE'),scoring:{...strictRules,version}};if(version===4)delete season.scoring.mode;snapshot=JSON.stringify(season);writeCount=writes.length;
  await mount(React.createElement(SeasonWorkspace,{league:publicSeason(season,'owner'),busy:false,onBack:()=>{},onAction:async()=>{throw Error('Saved lobby must not change on mount');}}));noModePicker();contractIs(season.scoring);assert.equal(JSON.stringify(season),snapshot);assert.equal(writes.length,writeCount);
 }
 // Replay describes the completed snapshot independently of the current saved contract.
 const historicalRound={number:1,phase:'regular',scoring:newScoring(.5,false,'historical'),draws:{home:[],away:[]},matches:[{home:'home',away:'away',homeScore:0,awayScore:0,winner:null,tiebreak:null}],receiptsHidden:false};
 const replayLeague={...publicSeason(originalSeason,'owner'),scoring:newScoring(1,false,'strict'),teams:[{id:'home',name:'Home'},{id:'away',name:'Away'}],myTeamId:'home'};
 await mount(React.createElement(FantasyReplay,{round:historicalRound,match:historicalRound.matches[0],league:replayLeague,onFinished:async()=>true}));contractIs(historicalRound.scoring);assert.ok(!modeText().includes(scoringModeLabel(replayLeague.scoring)));noModePicker();assert.ok(q('.replay-vs').textContent.includes(scoringModeLabel(historicalRound.scoring)));
 console.log('PASS: unified new quick/solo/online contract; no normal mode selectors; explicit solo/online create payloads; older + modern/all-position/all-era board; optional era filters and 1950 gap; PPR boundaries; immutable saved Strict/v4 UI; guarded no-reset migration and bounded 409 refresh; REG source ordinal receipts and saved replay contract; private queue history retained. Mounted DOM only, isolated fixtures, no rendered browser QA or production writes.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
