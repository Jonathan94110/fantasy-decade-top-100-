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
const window=new Window({url:'http://fixture.local/demo?desk=draft&keep=fixture'});
for(const name of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','NodeFilter','Element','DocumentFragment','Event','CustomEvent','MutationObserver','ResizeObserver'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// RootLayout's account provider supplies this preference in the real app.
document.documentElement.dataset.reduceMotion='true';
const React=await import('react');const {createRoot}=await import('react-dom/client');
const {DemoDraftRoom}=await import(pathToFileURL(root+'components/demo-draft-room.tsx').href);
const {newDemoDraft,demoDraftAction,demoReply}=await import(pathToFileURL(root+'lib/demo-draft-engine.ts').href);
const {demoPickReason}=await import(pathToFileURL(root+'lib/demo-draft-model.ts').href);
const {athletesFor}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {emptyPreferences}=await import(pathToFileURL(root+'lib/draft-preferences.ts').href);
let saved=newDemoDraft('Start-season fixture',1,{modern:true,capacity:2,kickers:true,opening:true,orderMode:'manual',orderIndexes:[0,1]});
saved=demoDraftAction(saved,{action:'beginDraft'});
while(saved.status==='draft'){const athlete=athletesFor(saved.scoring).find(a=>!demoPickReason(saved,saved.humanTeamId,a.id));assert.ok(athlete);saved=demoDraftAction(saved,{action:'draft',athleteId:athlete.id});}
const contract=JSON.stringify({id:saved.id,scoring:saved.scoring,teams:saved.teams,picks:saved.picks,order:saved.order}),writes=[];
let failNext=true;
globalThis.fetch=async(url,options={})=>{
 if(url==='/api/profile')return Response.json({profile:{reduceMotion:true,avatar:null,displayName:'Fixture manager',receptionPoints:1}});
 if(url.startsWith('/api/draft-preferences')){assert.equal(options.method||'GET','GET');return Response.json({preferences:emptyPreferences()});}
 if(url.includes('?rankings')){assert.equal(options.method||'GET','GET');return Response.json({rankings:[]});}
 assert.equal(url,'/api/demo');
 if(options.method==='POST'){
  const body=JSON.parse(options.body);writes.push(body);assert.equal(body.action,'startSeason');assert.equal(body.seasonId,saved.id);assert.equal(body.revision,saved.revision);
  if(failNext){failNext=false;return Response.json({error:'Fixture service interruption'},{status:503});}
  saved={...demoDraftAction(saved,body),revision:saved.revision+1};
 }
 return Response.json(demoReply(saved));
};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,30));});
const q=selector=>document.querySelector(selector);
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const click=async(node)=>{assert.ok(node,'Expected control exists');assert.equal(node.disabled,false,'Expected enabled control');await act(()=>node.click());};
try{
 await act(()=>app.render(React.createElement(DemoDraftRoom)));
 assert.ok(q('.demo-complete'));assert.ok(button('Start Week 1 with this team'));assert.equal(saved.season,undefined);assert.equal(writes.length,0);
 const before=JSON.stringify(saved);
 await click(button('Start Week 1 with this team'));
 assert.equal(JSON.stringify(saved),before,'A failed save keeps the completed draft');assert.equal(new URLSearchParams(window.location.search).get('desk'),'draft');assert.equal(button('Start Week 1 with this team').disabled,true);
 await click(button('Refresh saved progress'));assert.equal(writes.length,1,'Refresh verifies with GET without retrying the action');
 await click(button('Start Week 1 with this team'));
 assert.equal(new URLSearchParams(window.location.search).get('desk'),null,'Successful start opens the season instead of leaving the draft desk selected');assert.equal(new URLSearchParams(window.location.search).get('keep'),'fixture');
 assert.ok(q('.game-center-heading'));assert.equal(q('.demo-complete'),null);assert.equal(saved.season.round,1);assert.deepEqual(saved.season.used,[]);assert.deepEqual(saved.season.history,[]);
 assert.equal(JSON.stringify({id:saved.id,scoring:saved.scoring,teams:saved.teams,picks:saved.picks,order:saved.order}),contract,'Starting a season preserves saved picks, order, rosters and scoring');
 const started=JSON.stringify(saved);
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(DemoDraftRoom)));
 assert.ok(q('.game-center-heading'));assert.equal(JSON.stringify(saved),started);assert.equal(writes.length,2,'Refresh and remount never start another season or draw');
 await act(()=>window.history.back());assert.ok(q('.demo-complete'));await click(button('Return to my season'));assert.ok(q('.game-center-heading'));assert.equal(writes.length,2);assert.equal(JSON.stringify(saved),started);
 console.log('PASS: dashboard desk=draft completed roster; failed start retains desk/progress and requires GET verification; one successful real-engine start opens saved Week1; rosters/picks/order/scoring preserved, no draws; refresh/back/return do not write or redraw. Isolated mounted DOM and in-memory API fixture only.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
