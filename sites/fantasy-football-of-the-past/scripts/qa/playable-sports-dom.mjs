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
const {default:Home}=await import(pathToFileURL(root+'app/matchup/page.tsx').href);
const {newLeague,lockLineup,nextRound,publicLeague}=await import(pathToFileURL(root+'lib/game-engine.ts').href);
const {athleteFor,eligibleForSlot}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {fillOpenSlots,draftStorageKey}=await import(pathToFileURL(root+'lib/draft-tools.ts').href);
let league=newLeague('sports-ui-fixture');
const requests=[];
const preferences=new Map();
const {emptyPreferences,updatePreferences}=await import(pathToFileURL(root+'lib/draft-preferences.ts').href);
const {draftRankings,draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {scoringFor}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
globalThis.fetch=async(url,options={})=>{
 requests.push({url,method:options.method||'GET'});
 if(url.startsWith('/api/draft-preferences')){const body=options.body?JSON.parse(options.body):null,scope=body?.scope||new URL(url,'http://fixture.local').searchParams.get('scope');let p=preferences.get(scope)||emptyPreferences();if(body){assert.equal(body.revision,p.revision);p=updatePreferences(p,body);preferences.set(scope,p);}return Response.json({preferences:p});}
 if(url.includes('?rankings'))return Response.json({rankings:draftRankings(league.used,scoringFor(league))});
 if(url.includes('?athlete'))return Response.json({insights:draftInsights(new URL(url,'http://fixture.local').searchParams.get('athlete'),league.used,scoringFor(league))});
 if(options.method==='POST'){
  const body=JSON.parse(options.body);assert.equal(body.revision,league.revision);
  if(body.action==='lock')league=lockLineup(league,body.lineup,body.turn);
  else if(body.action==='next')league=nextRound(league);
  else if(body.action==='rules')league={...league,hallCap:body.cap};
  league={...league,revision:league.revision+1};
 }
 return Response.json({league:publicLeague(league)});
};
window.document.body.innerHTML='<div id="root"></div>';
let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,10));});
const q=selector=>document.querySelector(selector);
const click=async(node)=>{assert.ok(node,'click target exists');assert.ok(!node.disabled,`enabled: ${node.textContent}`);await act(()=>{node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));node.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));node.click();});};
const button=(text)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
try{
 await act(()=>app.render(React.createElement(Home)));
 assert.match(q('.broadcast-board').textContent,/Home is on the clock/);
 const menu=q('select[aria-label="Verified game era"]');
 const beforeBrowse=JSON.stringify(league);
 assert.equal(league.scoring.mode,'historical','New quick games use all-era scoring');
 for(const era of ['1950','1960','1970','1980','1990']){
  assert.ok([...menu.options].find(o=>o.value===era),'era stays visible');await act(()=>{menu.value=era;menu.dispatchEvent(new window.Event('change',{bubbles:true}));});
  if(era==='1950'){assert.equal(document.querySelectorAll('.ff-player-table .ff-add').length,0);assert.match(q('.ff-empty-search').textContent,/1950s game logs need more verified stats/);assert.match(q('.ff-empty-search').textContent,/Unknown stats cannot count as zero/);}
  else assert.ok(document.querySelectorAll('.ff-player-table .ff-add').length>0,`${era}s verified players are draftable`);
 }
 await click(button('Clear player filters'));assert.equal(menu.value,'0');assert.equal(JSON.stringify(league),beforeBrowse);
 assert.equal(q('a[href="/league"]').getAttribute('href'),'/league');
 // Queue/timer is independent from draft authority, including an expired timer.
 const queueButtons=[...document.querySelectorAll('.ff-player-table .queue-toggle')];
 await click(queueButtons[0]);await click(document.querySelectorAll('.ff-player-table .queue-toggle')[1]);
 assert.equal(document.querySelectorAll('.draft-queue-list li').length,2);
 const prefKey=`quick:${league.id}:0`,queued=[...preferences.get(prefKey).queue];
 await click(document.querySelectorAll('.draft-queue-list li')[1].querySelector('button[aria-label$=" up"]'));
 assert.deepEqual(preferences.get(prefKey).queue,queued.toReversed());
 localStorage.setItem(`ffpast:soft-clock:${prefKey}:1:0:60`,String(Date.now()-120000));
 const select=q('select[aria-label="Soft draft timer"]');
 await act(()=>{select.value='60';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.match(q('.soft-clock').textContent,/Take your time/);
 assert.match(q('.draft-assistant').textContent,/Human auto-pick is off/);
 assert.equal(league.turn,0);assert.equal(league.used.length,0);
 assert.equal(requests.filter(r=>r.method==='POST'&&r.url==='/api/game').length,0);

 // All-position browsing is the default; an explicit QB filter keeps slot-by-slot drafting.
 assert.equal(q('.ff-position-tabs button[aria-pressed="true"]').textContent,'All');
 await click([...document.querySelectorAll('.ff-position-tabs button')].find(node=>node.textContent==='QB'));
 await click(q('.ff-player-table .ff-add'));
 assert.equal(q('.ff-position-tabs button[aria-pressed="true"]').textContent,'RB');
 const staged=JSON.parse(localStorage.getItem(draftStorageKey(league)));assert.ok(staged.QB);
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(Home)));
 assert.match(q('.ff-roster').textContent,new RegExp(athleteFor(staged.QB,scoringFor(league)).name));
 await click(button('Fill open slots'));
 let filled=JSON.parse(localStorage.getItem(draftStorageKey(league)));
 assert.equal(Object.keys(filled).length,6);assert.equal(new Set(Object.values(filled)).size,6);assert.equal(filled.QB,staged.QB);
 assert.ok(eligibleForSlot(athleteFor(filled.FLEX,scoringFor(league)),'FLEX'));
 assert.equal(league.hallCap,0,'New quick matches retain unlimited Hall of Fame eligibility');
 assert.equal(league.used.length,0);assert.equal(requests.filter(r=>r.method==='POST'&&r.url==='/api/game').length,0);
 await click(button('Lock home lineup'));await click(button('Confirm & lock'));
 assert.equal(league.turn,1);assert.equal(league.used.length,0);assert.equal(league.history.length,0);
 assert.equal(localStorage.getItem('ffpast:draft:v1:sports-ui-fixture:1:0'),null);
 assert.ok(button('Away is ready'));await click(button('Away is ready'));
 assert.equal(q('.ff-roster').textContent.includes(athleteFor(filled.QB,scoringFor(league)).name),false);
 await click(button('Fill open slots'));await click(button('Lock away lineup'));await click(button('Confirm & lock'));
 assert.equal(league.status,'reveal');assert.equal(league.used.length,12);assert.equal(new Set(league.used).size,12);
 const completed=JSON.stringify(league);assert.ok(button('Reveal the matchup'));
 assert.equal(document.querySelectorAll('.ff-result-row.revealed').length,0);
 await click(button('Reveal the matchup'));
 assert.ok(button('Skip to final'));await click(button('Skip to final'));
 assert.equal(document.querySelectorAll('.ff-result-row.revealed').length,6);
 assert.equal(JSON.stringify(league),completed,'reveal never redraws');
 assert.match(q('.ff-matchup-teams').textContent,new RegExp(league.history[0].totals[0].toFixed(2)));
 assert.ok(q('.matchup-title-actions button'),'next round at top');
 // Reload preserves exact scored results, then next round keeps used archive and history.
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(Home)));
 assert.equal(JSON.stringify(league),completed);assert.ok(q('.matchup-title-actions button'));
 await click(q('.matchup-title-actions button'));
 assert.equal(league.round,2);assert.equal(league.status,'draft');assert.equal(league.used.length,12);assert.equal(league.history.length,1);
 assert.equal(document.querySelectorAll('.ff-roster-player').length,0);
 await click(button('Read-only player profiles'));
 assert.ok(document.querySelectorAll('.ff-archive-table tbody tr').length>0);
 assert.equal(document.querySelectorAll('.ff-archive-add').length,0,'1950s profiles stay out of drafting');
 assert.ok([...document.querySelectorAll('.archive-badge')].every(node=>node.textContent==='Profile only'));
 assert.equal(league.used.length,12,'browsing archive leaves used pool intact');
 for(const hallCap of [0,1,2])for(let i=0;i<20;i++){
  const testLeague={...newLeague('quick-fill-test'),hallCap};
  const lineup=fillOpenSlots(testLeague,{});
  assert.equal(new Set(Object.values(lineup)).size,6);
  for(const [slot,id] of Object.entries(lineup))assert.ok(eligibleForSlot(athleteFor(id,scoringFor(testLeague)),slot));
  assert.equal(testLeague.hallCap,hallCap,'Legacy cap fields stay saved while all legal players remain eligible');
 }
 console.log('PASS: mounted React UI, real game engine, visible verified-era filters and honest empty states, manual pick, slot advancement, staged reload, unlimited legal quick fill with preserved legacy cap fields, six unique eligible picks including FLEX, lock confirmation, hidden handoff, no draw before both locks, twelve real unique draws, staged reveal, immutable scores on refresh, top rematch, history and used pool preserved, no production writes. DOM only.');
}finally{await act(()=>app.unmount());await window.happyDOM.close();}
