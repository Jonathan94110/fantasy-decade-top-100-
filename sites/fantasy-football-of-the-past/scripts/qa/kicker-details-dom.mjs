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

const {DraftDetails}=await import(pathToFileURL(root+'components/draft-details.tsx').href);
const {ATHLETES}=await import(pathToFileURL(root+'lib/game-model.ts').href);const {draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);const {LEGACY_SCORING,newScoring}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const kicker=ATHLETES.find(a=>a.position==='K');let scoring=LEGACY_SCORING,picks=0;globalThis.fetch=async()=>Response.json({insights:draftInsights(kicker.id,[],scoring)});
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});const render=()=>app.render(React.createElement(DraftDetails,{athlete:kicker,revision:0,canDraft:true,onClose:()=>{},onDraft:()=>picks++,endpoint:'/api/demo'}));
try{await act(render);assert.match(document.querySelector('[role="dialog"]').textContent,/kickers are not enabled/);assert.equal(document.querySelector('.draft-stat-grid'),null);assert.equal(document.querySelector('button.primary-button'),null);await act(()=>app.unmount());app=createRoot(document.getElementById('root'));scoring=newScoring(1,true);await act(render);assert.ok(document.querySelector('.draft-stat-grid'));assert.ok(document.querySelector('button.primary-button'));assert.equal(document.querySelector('button.primary-button').disabled,false);assert.equal(picks,0);console.log('PASS: unsupported legacy K scouting renders safely without a Draft action; new K scoring renders real metrics and eligible selection. DOM only.');}finally{await act(()=>app.unmount());window.happyDOM.abort();}
