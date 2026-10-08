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
const {newDemoDraft,demoDraftAction}=await import(pathToFileURL(root+'lib/demo-draft-engine.ts').href);
const {emptyPreferences,updatePreferences}=await import(pathToFileURL(root+'lib/draft-preferences.ts').href);
const {draftRankings,draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {scoringFor}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
let demo=null;const preferences=new Map(),writes=[];
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;
 if(body)writes.push({url,body});
 if(url.startsWith('/api/draft-preferences')){const scope=body?.scope||new URL(url,'http://fixture.local').searchParams.get('scope');let p=preferences.get(scope)||emptyPreferences();if(body){assert.equal(body.revision,p.revision);p=updatePreferences(p,body);preferences.set(scope,p);}return Response.json({preferences:p});}
 if(url.includes('?rankings'))return Response.json({rankings:draftRankings([],scoringFor(demo))});
 if(url.includes('?athlete'))return Response.json({insights:draftInsights(new URL(url,'http://fixture.local').searchParams.get('athlete'),[],scoringFor(demo))});
 // Retain the saved six-pick draft fixture to verify legacy scouting and private queues.
 if(body){if(body.action==='create')demo??=newDemoDraft(body.teamName,body.receptionPoints,{scoringMode:'strict'});else{assert.equal(body.revision,demo.revision);demo={...demoDraftAction(demo,body),revision:demo.revision+1};}}
 return Response.json({demo});
};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});
const click=async(node)=>{assert.ok(node,'click target exists');assert.ok(!node.disabled,'button enabled');await act(()=>node.click());};
const q=s=>document.querySelector(s);const byText=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
try{
 await act(()=>app.render(React.createElement(DemoDraftRoom)));
 const teamName=q('.demo-setup input');await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(teamName,'My fixture team');teamName.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const scoring=q('select[aria-label="Reception scoring"]');assert.ok(scoring);
 await act(()=>{scoring.value='0.5';scoring.dispatchEvent(new window.Event('change',{bubbles:true}));});
 await click(byText('Run the draft lottery'));assert.equal(demo.scoring.receptionPoints,.5);assert.equal(demo.pick,7);assert.equal(demo.teams[7].roster.length,0);const preserved=JSON.stringify(demo.picks);
 assert.match(q('.demo-clock').textContent,/You’re on the clock/);assert.match(q('.demo-title').textContent,/Half PPR/);
 const position=q('select[aria-label="Player position"]');await act(()=>{position.value='WR';position.dispatchEvent(new window.Event('change',{bubbles:true}));});
 const search=q('.season-search input');await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'Puka');search.dispatchEvent(new window.Event('input',{bubbles:true}));});
 assert.match(q('.demo-player-list').textContent,/Puka Nacua/);
 assert.equal(q('.demo-player-list').querySelectorAll('.demo-player-row').length,1);
 await click(q('.demo-player-list .queue-toggle'));assert.equal(preferences.get(`demo:${demo.id}`).queue.length,1);assert.equal(JSON.stringify(demo.picks),preserved);
 await click(q('.demo-player-list .player-details-button'));assert.match(document.body.textContent,/Position: WR · FLEX/);assert.match(document.body.textContent,/Avg Saved scoring · Half PPR/);
 const close=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Close'||b.textContent.trim()==='Close');await click(close);
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(React.createElement(DemoDraftRoom)));
 assert.equal(JSON.stringify(demo.picks),preserved);assert.match(q('.draft-queue-list').textContent,/Puka Nacua/);
 const enabled=[...document.querySelectorAll('.demo-player-list button')].find(b=>b.textContent.trim()==='Draft'&&!b.disabled);await click(enabled);assert.equal(demo.pick,8);assert.equal(demo.teams[7].roster.length,1);assert.equal(demo.scoring.receptionPoints,.5);assert.deepEqual(demo.picks.slice(0,7),JSON.parse(preserved));
 console.log('PASS: mounted demo setup, Half PPR selection, seven initial bots pause on human, new-player search, private queue save/reload, eligibility and scoring details, dialog close, exactly one human pick, old picks and scoring preserved; no browser rendering or production writes');
}finally{await act(()=>app.unmount());await window.happyDOM.close();}
