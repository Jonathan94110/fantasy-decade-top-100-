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

const {DraftRecentPicks,DraftRoundBoard}=await import(pathToFileURL(root+'components/draft-board.tsx').href);
const {ATHLETES}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const teams=Array.from({length:16},(_,i)=>({id:`team-${i}`,name:i===0?'My human team':`Computer team ${i}`})),order=teams.map(t=>t.id);
const picks=Array.from({length:160},(_,i)=>{const r=Math.floor(i/16),seat=i%16;return {number:i+1,round:r+1,teamId:order[r%2?15-seat:seat],athleteId:ATHLETES[i%ATHLETES.length].id};});
let count=35;const detail=[];window.document.body.innerHTML='<div id="root"></div>';const app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});
const q=s=>document.querySelector(s);const render=()=>app.render(React.createElement(React.Fragment,null,React.createElement(DraftRecentPicks,{teams,picks:picks.slice(0,count),onDetails:id=>detail.push(id)}),React.createElement(DraftRoundBoard,{teams,order,picks:picks.slice(0,count),pick:count,rounds:10,active:count<160,myTeamId:teams[0].id,onDetails:id=>detail.push(id)})));
try{
 await act(render);assert.equal(document.querySelectorAll('.draft-round-board li').length,16);assert.equal(document.querySelectorAll('.draft-recent-picks li').length,8);assert.match(q('.draft-recent-picks li').textContent,/#35/);assert.equal(q('.draft-round-board select').value,'3');assert.equal(q('.draft-round-board li[aria-current="step"] .board-pick-heading').textContent.includes('#36'),true);
 for(const card of document.querySelectorAll('.draft-round-board li'))assert.ok(card.querySelector('h3').textContent);
 await act(()=>{const select=q('.draft-round-board select');select.value='1';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('.draft-round-board li>strong').length,16);for(const [i,card] of [...document.querySelectorAll('.draft-round-board li')].entries()){assert.match(card.textContent,new RegExp(teams[i].name));assert.equal(card.querySelector('strong').textContent,ATHLETES[i].name);assert.match(card.querySelector('.board-player-position').textContent,new RegExp(ATHLETES[i].position));}
 await act(()=>q('.draft-round-board .player-details-button').click());assert.equal(detail[0],picks[0].athleteId);
 count=36;await act(render);assert.match(q('.draft-recent-picks li').textContent,/#36/);assert.equal(q('.draft-round-board select').value,'1');await act(()=>q('.season-text-button').click());assert.equal(q('.draft-round-board select').value,'3');assert.match(q('.draft-round-board li[aria-current="step"]').textContent,/#37/);
 count=160;await act(render);await act(()=>{const select=q('.draft-round-board select');select.value='10';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('.draft-round-board li>strong').length,16);assert.equal(q('.draft-round-board li').querySelector('h3').textContent,teams[15].name);assert.equal(q('.draft-round-board li[aria-current="step"]'),null);assert.equal(document.body.textContent.includes('NFL Week'),false);
 console.log('PASS: 16-team board, all player/team/position/pick labels, reverse snake rounds, current-pick marker, recent feed updates, follow-current control, player details, all 160 completed selections, no historical game details. DOM only.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
