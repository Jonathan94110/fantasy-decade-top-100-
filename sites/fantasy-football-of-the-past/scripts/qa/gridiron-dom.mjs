/** Client-only UI regression. Set DOM_HARNESS_MODULE to an installed happy-dom module. */
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

const {DemoDraftRoom}=await import(pathToFileURL(root+'components/demo-draft-room.tsx').href);
const {FantasyReplay}=await import(pathToFileURL(root+'components/fantasy-replay.tsx').href);
const {newDemoDraft,demoDraftAction,demoReply}=await import(pathToFileURL(root+'lib/demo-draft-engine.ts').href);
const {demoPickReason}=await import(pathToFileURL(root+'lib/demo-draft-model.ts').href);
const {athletesFor}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {draftRankings,draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {emptyPreferences,updatePreferences}=await import(pathToFileURL(root+'lib/draft-preferences.ts').href);
const {matchesPlayableEra}=await import(pathToFileURL(root+'lib/player-filters.ts').href);
const {scoringFor}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
let saved=null,prefs=emptyPreferences(),backups=[],generation=0;const requests=[];
globalThis.fetch=async(url,options={})=>{
 requests.push({url,method:options.method||'GET'});
 if(url==='/api/profile')return Response.json({profile:{reduceMotion:true,avatar:null,displayName:'',receptionPoints:1}});
 if(url.startsWith('/api/draft-preferences')){if(options.body)prefs=updatePreferences(prefs,JSON.parse(options.body));return Response.json({preferences:prefs});}
 if(url.includes('?rankings'))return Response.json({rankings:draftRankings(saved?.season?.used||[],scoringFor(saved))});
 if(url.includes('?athlete'))return Response.json({insights:draftInsights(new URL(url,'http://fixture.local').searchParams.get('athlete'),saved?.season?.used||[],scoringFor(saved))});
 assert.equal(url,'/api/demo');
 if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='reset'){backups.unshift(structuredClone(saved));generation=saved.revision+1;saved=null;}else if(body.action==='restore'){saved=structuredClone(backups.find(b=>b.id===body.archiveId));saved.revision=generation;}else{saved=body.action==='create'?newDemoDraft(body.teamName,body.receptionPoints,{modern:true,capacity:body.capacity,names:body.names,playoffTeams:body.playoffTeams,opening:body.opening,orderMode:body.orderMode,orderIndexes:body.orderIndexes,kickers:body.kickers,scoringMode:body.scoringMode}):demoDraftAction(saved,body);saved.revision=++generation;}}
 return Response.json({...demoReply(saved),...(!saved?{generation,archives:backups.map(b=>({id:b.id,name:b.teams.find(t=>t.id===b.humanTeamId).name,archivedAt:b.createdAt}))}:{})});
};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,30));});
const q=s=>document.querySelector(s);
const byText=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const click=async(node)=>{assert.ok(node,'click target exists');assert.ok(!node.disabled,node.textContent);await act(()=>node.click());};
const choosePlayerFilter=async(label,value)=>act(()=>{const node=q(`select[aria-label="${label}"]`);assert.ok(node,label);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const remount=async()=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(DemoDraftRoom)));};
try {
 await act(()=>app.render(React.createElement(DemoDraftRoom)));
 assert.match(q('h1').textContent,/Build your team. Make history./);assert.match(q('.season-ticket').textContent,/17 WEEKS/);assert.ok(q('form button.primary-button'));assert.equal(q('a[aria-current="page"]').textContent,'My season');
 await act(()=>{const input=q('form input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'DOM owner');input.dispatchEvent(new window.Event('input',{bubbles:true}));const teams=q('form select');teams.value='2';teams.dispatchEvent(new window.Event('change',{bubbles:true}));});
 await click(document.querySelectorAll('input[name="order-mode"]')[1]);assert.ok(q('.custom-draft-order'));await click(q('button[aria-label="Move DOM owner later"]'));assert.match(q('.custom-draft-order li').textContent,/Computer 1/);
 await act(()=>q('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(saved);assert.equal(saved.rosterSize,11);assert.equal(saved.scoring.version,5);assert.equal(saved.scoring.mode,'historical');assert.equal(saved.scoring.lostFumble,0);assert.equal(saved.pick,0);assert.ok(q('.draft-lottery'));assert.match(q('.lottery-heading').textContent,/COMMISSIONER-SET ORDER/);const order=JSON.stringify(saved.order);await remount();assert.equal(JSON.stringify(saved.order),order);assert.equal(saved.pick,0);await click(byText('Enter draft room'));
 const savedBeforeReset=JSON.stringify(saved);await click(byText('Reset season'));assert.match(q('[role="dialog"]').textContent,/Team count/);await click(byText('Keep my season'));assert.equal(JSON.stringify(saved),savedBeforeReset);
 await click(byText('Reset season'));await click(byText('Back up & reset season'));assert.equal(saved,null);assert.equal(q('form input').value,'');assert.ok(q('.season-backup'));await click(byText('Restore DOM owner'));assert.equal(saved.id,JSON.parse(savedBeforeReset).id);assert.deepEqual(saved.picks,JSON.parse(savedBeforeReset).picks);
 assert.equal(q('.draft-pick-number strong').textContent,String(saved.pick+1).padStart(2,'0'));assert.ok(q('.demo-player-row[data-position="QB"]'));assert.ok([...q('select[aria-label="Player position"]').options].some(option=>option.value==='K'));assert.ok(q('.demo-player-row button[aria-label^="Draft "]'));
 const beforeFilters=JSON.stringify(saved),postsBeforeFilters=requests.filter(r=>r.url==='/api/demo'&&r.method==='POST').length;
 assert.deepEqual([...q('select[aria-label="Player era"]').options].map(option=>option.value),['0','1950','1960','1970','1980','1990','2000','2010','2020']);
 assert.equal(q('select[aria-label="Player position"]').value,'ALL');await choosePlayerFilter('Player position','QB');
 await choosePlayerFilter('Player era','1950');assert.equal(document.querySelectorAll('.demo-player-row').length,0);assert.match(q('.player-browser-empty').textContent,/1950s game logs need more verified stats/);assert.match(q('.player-browser-empty').textContent,/Unknown stats cannot count as zero/);assert.equal(q('.player-browser-empty a'),null);
 for(const era of ['1960','1970','1980','1990']){
  await choosePlayerFilter('Player era',era);const rows=[...document.querySelectorAll('.demo-player-row')],owned=new Set(saved.teams.flatMap(t=>t.roster));
  const expected=athletesFor(saved.scoring).filter(a=>a.position==='QB'&&a.gameCount>=17&&!owned.has(a.id)&&matchesPlayableEra(a,Number(era),[],saved.scoring));
  assert.ok(rows.length,`${era}s has eligible quarterbacks`);assert.deepEqual(new Set(rows.map(row=>row.dataset.playerId)),new Set(expected.map(a=>a.id)));
 }
 await choosePlayerFilter('Player position','RB');await act(()=>{const input=q('.season-search input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'not a real player xyz');input.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.equal(document.querySelectorAll('.demo-player-row').length,0);
 await click(byText('Clear player filters'));assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(q('select[aria-label="Player era"]').value,'0');assert.equal(q('.season-search input').value,'');assert.ok(q('.demo-player-row[data-position="QB"]'));assert.equal(JSON.stringify(saved),beforeFilters);assert.equal(requests.filter(r=>r.url==='/api/demo'&&r.method==='POST').length,postsBeforeFilters);
 const before=JSON.stringify(saved);await click(q('.demo-player-row .player-details-button'));assert.ok(q('[role="dialog"]'));assert.equal(JSON.stringify(saved),before);await click([...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Close'||b.textContent.trim()==='Close'));
 await act(()=>app.unmount());while(saved.status==='draft'){const a=athletesFor(saved.scoring).find(a=>!demoPickReason(saved,saved.humanTeamId,a.id));assert.ok(a);saved=demoDraftAction(saved,{action:'draft',athleteId:a.id});}
 saved=demoDraftAction(saved,{action:'startSeason'});app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(DemoDraftRoom)));
 assert.ok(q('.game-center-heading'));assert.match(q('.game-center-heading').textContent,/Set starters/);assert.equal(byText('Play Game').disabled,true);
 await act(()=>app.unmount());const team=saved.season.teams.find(t=>t.id===saved.humanTeamId);saved=demoDraftAction(saved,{action:'lock',lineup:team.lineup,acceptBye:true});const immutable=JSON.stringify({history:saved.season.history,used:saved.season.used});
 let league=demoReply(saved).league;let round=league.history[0],match=round.matches.find(m=>[m.home,m.away].includes(league.myTeamId));assert.equal(round.receiptsHidden,true);
 app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(FantasyReplay,{league,round,match,onFinished:async()=>{saved=demoDraftAction(saved,{action:'revealReplay',round:1});return true;}})));
 assert.equal(q('.replay-vs b').textContent,'VS');assert.equal(q('.replay-team strong'),null);assert.equal(q('.replay-player-receipt a'),null);assert.ok([...document.querySelectorAll('.replay-historical-game')].every(n=>!n.textContent.includes('NFL Week')));
 const speeds=[...q('select').options].map(o=>o.value);assert.deepEqual(speeds,['0.25','0.5','1','2']);
 await click(byText('Watch four quarters'));assert.ok(q('.replay-team strong'));await click(byText('Pause'));await click(byText('Next highlight'));assert.ok(q('.replay-highlight'));await click(byText('Skip to final'));assert.ok(q('.replay-final'));assert.equal(q('.replay-vs b').textContent,'FT');
 assert.equal(JSON.stringify({history:saved.season.history,used:saved.season.used}),immutable);assert.equal(q('.replay-player-receipt a'),null,'until server-provided full receipt props arrive');
 league=demoReply(saved).league;round=league.history[0];match=round.matches.find(m=>[m.home,m.away].includes(league.myTeamId));await act(()=>app.render(React.createElement(FantasyReplay,{league,round,match,onFinished:async()=>true})));
 assert.ok(q('.replay-player-receipt a'));assert.ok(q('.weekly-recap'));assert.ok([...document.querySelectorAll('.replay-historical-game')].some(n=>n.textContent.includes('NFL Week')));
 await click(byText('Replay game'));assert.equal(q('.replay-final'),null);assert.equal(q('.replay-player-receipt a'),null);assert.equal(JSON.stringify({history:saved.season.history,used:saved.season.used}),immutable);
 console.log('PASS: setup, season pass, draft pick count, player cards, details close, full preserved draft, saved season, game-center lock gating, preview hidden scores, year-only receipts, all four speed options, play/pause/step/skip/replay, final-only receipt unlock, weekly recap, immutable saved draws. DOM only; no rendered browser QA.');
} finally {await act(()=>app.unmount());window.happyDOM.abort();}
