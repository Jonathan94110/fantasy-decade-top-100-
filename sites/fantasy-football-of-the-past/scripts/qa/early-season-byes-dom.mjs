/** Mounted Week 5 fantasy-bye regression using isolated fixtures. No saved-state writes or browser rendering. */
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
const {OnlineLeague}=await import(pathToFileURL(root+'components/online-league.tsx').href);
const {SeasonWorkspace}=await import(pathToFileURL(root+'components/season-workspace.tsx').href);
const {athletesFor,athleteFor}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
const reads=[];
globalThis.fetch=async(url,options={})=>{
 assert.ok(!options.body,'The mounted fixture never writes to an API');reads.push(url);
 if(url==='/api/profile')return Response.json({profile:{receptionPoints:1,displayName:'Fixture owner'}});
 if(url==='/api/demo')return Response.json({demo:null,league:null});
 if(url==='/api/leagues')return Response.json({leagues:[]});
 if(url.startsWith('/api/draft-preferences'))return Response.json({preferences:{revision:0,queue:[],timerSeconds:0}});
 if(url.includes('?rankings'))return Response.json({rankings:[]});
 throw Error('Unexpected fixture request: '+url);
};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,25));});
const q=(selector,scope=document)=>scope.querySelector(selector),all=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const mount=async(element)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(element));};
const click=async(node)=>{assert.ok(node,'Expected control exists');assert.ok(!node.disabled,'Expected control is enabled');await act(()=>{if(node.getAttribute('role')==='tab')node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));node.click();});};
const button=text=>all('button').find(node=>node.textContent.trim()===text);
const tab=text=>all('[role="tab"]').find(node=>node.textContent.trim()===text);
const input=async(selector,value)=>act(()=>{const node=q(selector);assert.ok(node);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});
const rowFor=(name,selector)=>all(selector).find(node=>q('b',node)?.textContent===name);
function fixture(mode){
 let state=newSeason('owner',{name:'Isolated '+mode+' bye fixture',teamName:'Owner',capacity:2,format:'seventeen',scoringMode:mode,kickers:true,hallCap:0},'BYE-FIXTURE');
 state=joinSeason(state,'guest','Guest');state=seasonAction(state,'owner',{action:'startDraft'});
 while(state.status==='draft')state=seasonAction(state,'owner',{action:'autopick'});
 assert.equal(state.scoring.mode,mode);assert.equal(state.byes.firstWeek,5);
 const me=state.teams.find(team=>team.userId==='owner'),qb=athleteFor(me.lineup.QB,state.scoring),owned=new Set(state.teams.flatMap(team=>team.roster));
 const freeQB=athletesFor(state.scoring).find(athlete=>athlete.position==='QB'&&!owned.has(athlete.id)&&athlete.gameCount>=17);
 assert.ok(qb&&freeQB);state.byes.weeks[qb.id]=5;state.byes.weeks[freeQB.id]=5;
 return {state,qb,freeQB};
}
try{
 await mount(React.createElement(DemoDraftRoom));assert.match(q('.demo-setup').textContent,/Weeks 1–4 are bye-free/);assert.match(q('.demo-setup').textContent,/Fantasy Week 5/);
 await mount(React.createElement(OnlineLeague));assert.match(q('.league-entry-grid').textContent,/Weeks 1–4 are bye-free/);assert.match(q('.league-entry-grid').textContent,/Fantasy Week 5/);
 for(const mode of ['strict','historical']){
  const {state,qb,freeQB}=fixture(mode),actions=[],unchanged=JSON.stringify(state);
  const render=(round,byes=state.byes)=>mount(React.createElement(SeasonWorkspace,{league:publicSeason({...state,round,byes},'owner'),busy:false,onBack:()=>{},onAction:async(action,extra={})=>{actions.push({action,...extra});return true;}}));
  await render(4);await click(tab('My team'));assert.equal(q('.season-columns .season-panel-heading .archive-badge.playable').textContent,'11/11 roster spots');
  assert.match(q('.season-starters').textContent,/QB/);assert.match([...q('select[aria-label="QB starter"]').options].find(option=>option.value===q('select[aria-label="QB starter"]').value).textContent,/Available · Bye next week/);assert.match(q('.season-roster-list').textContent,/Available · Bye next week/);assert.equal(q('.bye-warning'),null);assert.match(document.body.textContent,/Weeks 1–4 are bye-free for unplayed rounds/);
  await click(tab('Free agents'));await input('.season-search input',freeQB.name);
  let row=rowFor(freeQB.name,'.season-player-list .season-player-row');assert.ok(row);assert.match(row.textContent,/Available · Bye next week/);assert.doesNotMatch(row.textContent,/BYE THIS WEEK/);assert.equal(actions.length,0);
  await render(5);await click(tab('My team'));
  assert.match(q('.bye-warning').textContent,new RegExp(qb.name));assert.match([...q('select[aria-label="QB starter"]').options].find(option=>option.value===q('select[aria-label="QB starter"]').value).textContent,/BYE THIS WEEK.*0 points/);assert.match(rowFor(qb.name,'.season-roster-list .season-player-row').textContent,/BYE THIS WEEK/);
  await click(tab('Free agents'));await input('.season-search input',freeQB.name);
  row=rowFor(freeQB.name,'.season-player-list .season-player-row');assert.ok(row);assert.match(row.textContent,/BYE THIS WEEK/);await click(q(`button[aria-label="Add ${freeQB.name}"]`,row));assert.match(q('[role="dialog"]').textContent,/zero|0 points/i);await click(q('[role="dialog"] [data-slot="dialog-close"]'));
  await click(tab('My team'));await click(button('Lock lineup'));
  assert.match(q('[role="alertdialog"]').textContent,/will score zero this week and consume no historical game/);assert.equal(actions.length,0,'Opening acknowledgement does not lock');await click(button('Lock with zero-point byes'));assert.equal(actions.length,1);assert.equal(actions[0].action,'lock');assert.equal(actions[0].acceptBye,true);assert.equal(actions[0].lineup.QB,qb.id);assert.equal(JSON.stringify(state),unchanged,'Mounted views do not mutate fixture state');
  const current={...structuredClone(state),round:5};assert.throws(()=>seasonAction(current,'owner',{action:'lock',lineup:current.teams.find(team=>team.userId==='owner').lineup}),/simulated BYE/);
  let locked=seasonAction(current,'owner',actions[0]);locked=seasonAction(locked,'guest',{action:'lock',lineup:locked.teams.find(team=>team.userId==='guest').lineup,acceptBye:true});
  const ownerId=locked.teams.find(team=>team.userId==='owner').id,draw=locked.history.at(-1).draws[ownerId].find(draw=>draw.athleteId===qb.id);assert.equal(draw.simulatedBye,true);assert.equal(draw.points,0);assert.deepEqual(draw.performance,{});
  const allDraws=[...Object.values(locked.history.at(-1).draws).flat(),...Object.values(locked.history.at(-1).benchDraws??{}).flat()];assert.equal(locked.used.length,allDraws.filter(draw=>!draw.simulatedBye).length);
  await render(state.regularRounds+1);await click(tab('My team'));assert.equal(q('.bye-warning'),null);assert.doesNotMatch(q('.season-starters').textContent,/BYE THIS WEEK/);assert.match(rowFor(qb.name,'.season-roster-list .season-player-row').textContent,/Available/);assert.doesNotMatch(rowFor(qb.name,'.season-roster-list .season-player-row').textContent,/BYE THIS WEEK|Bye next week/);
  await render(4,{...state.byes,repairedEarlyWeeks:true,legacyDeferred:true});await click(tab('My team'));assert.match(document.body.textContent,/Unplayed Weeks 1–4 rest dates were corrected/);assert.match(document.body.textContent,/defers new or affected byes/);assert.doesNotMatch(document.body.textContent,/Each player and defense has one fictional bye/);assert.equal(JSON.stringify(state),unchanged);
 }
 assert.ok(reads.length);console.log('PASS: solo/online Week 5 setup notes; Strict and Historical Week 4 roster/free-agent next-bye availability; Week 5 current-bye roster/add warnings; explicit zero-point lock acknowledgement reaches isolated engine and consumes no bye game; playoff availability; accurate early-repair/deferred notes; original fixtures unchanged. Mounted DOM only; no browser rendering, saved-state writes or production operations.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
