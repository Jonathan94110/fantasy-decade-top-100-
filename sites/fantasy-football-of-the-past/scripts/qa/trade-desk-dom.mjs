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
const {TradeDesk}=await import(pathToFileURL(root+'components/trade-desk.tsx').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
let season=newSeason('a',{name:'UI fixture',teamName:'A',capacity:2,format:'seventeen'},'test');season=joinSeason(season,'b','B');season=seasonAction(season,'a',{action:'startDraft'});while(season.status==='draft')season=seasonAction(season,'a',{action:'autopick'});
let league=publicSeason(season,'a'),calls=[];const rankings=new Map();
window.document.body.innerHTML='<div id="root"></div>';const app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,10));});
const render=()=>app.render(React.createElement(TradeDesk,{league,solo:true,busy:false,rankings,onAction:async(action,body)=>{calls.push({action,...body});return true;}}));
const button=text=>[...document.querySelectorAll('button')].find(n=>n.textContent===text);
const click=async n=>{assert.ok(n);assert.ok(!n.disabled);await act(()=>n.click());};
const select=async(i,value)=>act(()=>{const n=document.querySelectorAll('select')[i];n.value=value;n.dispatchEvent(new window.Event('change',{bubbles:true}));});
try{
 await act(render);assert.match(document.body.textContent,/Computer teams answer immediately/);assert.ok(button(' Review offer')||button('Review offer'));
 await select(0,season.teams[1].id);await select(1,season.teams[0].lineup.QB);await select(2,season.teams[1].lineup.QB);
 await act(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.length,0);assert.match(document.querySelector('[role="dialog"]').textContent,/You give:/);assert.match(document.querySelector('[role="dialog"]').textContent,/You receive:/);
 await click(button('Go back'));assert.equal(calls.length,0);
 await act(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 await click(button('Confirm & send to computer'));assert.equal(calls.length,1);assert.equal(calls[0].give,season.teams[0].lineup.QB);assert.equal(calls[0].receive,season.teams[1].lineup.QB);
 await select(1,season.teams[0].lineup.QB);await select(2,season.teams[1].lineup.QB);await act(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 league={...league,revision:1};await act(render);assert.ok(button('Confirm & send to computer').disabled);assert.match(document.body.textContent,/The league changed/);await click(button('Go back'));
 league={...league,status:'review'};await act(render);assert.match(document.body.textContent,/Open the next week/);assert.ok(document.querySelector('select').disabled);
 console.log('PASS: roster selection, outgoing/incoming confirmation, cancel, confirmed offer, stale review, and closed-week DOM states');
}finally{await act(()=>app.unmount());await window.happyDOM.abort();}
