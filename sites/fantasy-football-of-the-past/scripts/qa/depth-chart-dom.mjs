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

const {DepthChart}=await import(pathToFileURL(root+'components/depth-chart.tsx').href);
const {ATHLETES,ALL_POSITIONS:POSITIONS}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {LEGACY_SCORING}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const qb=ATHLETES.filter(a=>a.position==='QB'),averages=new Map(ATHLETES.map((a,i)=>[a.id,100-i/10]));
const context={name:'Demo depth',status:'active',round:5,regularRounds:15,myTeamId:'me',used:[],byes:{version:2,firstWeek:5,lastWeek:14,weeks:{[qb[0].id]:5,[qb[1].id]:6}},teams:[{id:'me',name:'My team',roster:[qb[0].id,qb[1].id],lineup:{QB:qb[0].id}},{id:'other',name:'Opponent',roster:[qb[2].id],lineup:{QB:qb[2].id}}]};
window.document.body.innerHTML='<div id="root"></div>';const app=createRoot(document.getElementById('root'));const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];const click=async(node)=>{assert.ok(node);assert.ok(!node.disabled);await act(()=>node.click());};const select=async(value)=>act(()=>{const node=q('select[aria-label="Depth chart ownership"]');node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const choose=async(label,value)=>act(()=>{const node=q(`select[aria-label="${label}"]`);assert.ok(node,label);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});
try{
 const savedContext=JSON.stringify(context);
 await act(()=>app.render(React.createElement(DepthChart,{context:{...context,round:4},averages,scoring:LEGACY_SCORING})));
 assert.equal(all('.availability-current').length,0);assert.equal(all('.availability-next').length,1);assert.match(q('tbody').textContent,/Available · Bye next week/);
 await act(()=>app.render(React.createElement(DepthChart,{context,averages,scoring:LEGACY_SCORING})));assert.equal(all('tbody tr').length,40);assert.match(q('tbody').textContent,/Starter · QB/);assert.match(q('tbody').textContent,/Bench/);assert.match(q('tbody').textContent,/Rostered · lineup private/);assert.match(q('tbody').textContent,/BYE THIS WEEK/);assert.match(q('tbody').textContent,/Bye next week/);
 assert.equal(all('.availability-current').length,1);assert.equal(all('.availability-next').length,1);
 await act(()=>app.render(React.createElement(DepthChart,{context:{...context,round:context.regularRounds+1},averages,scoring:LEGACY_SCORING})));
 assert.equal(all('.availability-current').length,0);assert.equal(all('.availability-next').length,0);assert.ok(all('.availability-pill').every(node=>node.textContent==='Available'));
 await act(()=>app.render(React.createElement(DepthChart,{context,averages,scoring:LEGACY_SCORING})));
 await select('mine');assert.equal(all('tbody tr').length,2);assert.equal(q('.depth-rank').textContent,'#1');await select('free');assert.equal(all('tbody tr').length,40);assert.equal(q('.depth-rank').textContent,'#4');await select('all');
 await click(all('.preview-pagination button').find(b=>b.textContent==='Next'));assert.equal(q('.depth-rank').textContent,'#41');await choose('Player position','WR');assert.equal(q('.depth-rank').textContent,'#1');assert.match(q('.depth-result-count').textContent,/100 WR/);
 for(const era of ['1960','1970','1980']){await choose('Player era',era);assert.equal(all('tbody tr').length,0);assert.match(q('.player-browser-empty').textContent,/No playable WR games/);const link=new URL(q('.player-browser-empty a').getAttribute('href'),'http://fixture.local');assert.equal(link.searchParams.get('position'),'WR');assert.equal(link.searchParams.get('era'),era);}
 await choose('Player era','1990');const nineties=ATHLETES.filter(a=>a.position==='WR'&&a.gamesBySeason[1999]>0);assert.match(q('.depth-result-count').textContent,new RegExp(`${nineties.length} WR`));assert.ok(all('tbody tr').length>0);assert.equal(q('.preview-pagination span').textContent.includes('Page 1'),true);
 await act(()=>{const input=q('input[aria-label="Search depth chart"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'not a real player xyz');input.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.ok(q('.player-browser-empty'));await click(all('button').find(b=>b.textContent==='Clear player filters'));assert.equal(all('tbody tr').length,40);assert.equal(q('select[aria-label="Player position"]').value,'QB');assert.equal(q('select[aria-label="Player era"]').value,'0');assert.equal(q('input[aria-label="Search depth chart"]').value,'');
 await select('mine');await act(()=>app.render(React.createElement(DepthChart,{context:null,averages,scoring:LEGACY_SCORING})));assert.equal(q('select[aria-label="Depth chart ownership"]').disabled,true);assert.equal(q('select[aria-label="Depth chart ownership"]').value,'all');assert.equal(all('tbody tr').length,40);assert.match(q('tbody').textContent,/No league selected/);assert.equal(q('select[aria-label="Player position"]').options.length,POSITIONS.length);assert.equal(q('select[aria-label="Player position"]').disabled,false);assert.equal(JSON.stringify(context),savedContext);
 console.log('PASS: all-player rankings retain drafted players and stable ranks, own starter/bench vs private opponent lineup, Week 4 available/next-week badges, Week 5 current bye and playoff availability, bye colors/text, unowned filter, native position/era navigation, verified-year filtering, historical preview handoff, bounded pagination, combined empty/reset states and no-context fallback. DOM only.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
