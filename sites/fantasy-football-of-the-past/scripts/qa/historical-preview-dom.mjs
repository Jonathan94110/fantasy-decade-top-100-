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

const {default:PreviewPage}=await import(pathToFileURL(root+'app/historical-preview/page.tsx').href);
const requests=[];globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method||'GET'});assert.equal(url,'/api/profile');return Response.json({profile:{reduceMotion:true,avatar:null}});};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];const button=text=>all('button').find(b=>b.textContent.trim()===text);
const click=async(node)=>{assert.ok(node,'target exists');assert.ok(!node.disabled,'enabled target');await act(()=>node.click());};
const select=async(label,value)=>act(()=>{const node=q(`select[aria-label="${label}"]`);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const search=async(value)=>act(()=>{const input=q('input[aria-label="Search historical preview"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
const mountPage=async(params)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));const page=await PreviewPage({searchParams:Promise.resolve(params)});await act(()=>app.render(page));};
try{
 const page=await PreviewPage({searchParams:Promise.resolve({})});await act(()=>app.render(page));assert.match(q('h1').textContent,/Historical player preview/);assert.equal(q('.catalog-subnav a[aria-current="page"]').getAttribute('href'),'/historical-preview');assert.equal(all('.preview-profile-card').length,36);assert.match(q('.preview-results-heading').textContent,/1–36 of 3,913/);assert.match(q('.preview-coverage').textContent,/0new draftable/);assert.match(q('.preview-caution').textContent,/12 IDs/);
 const first=q('.preview-profile-card').id;assert.equal(button('Previous').disabled,true);await click(button('Next'));assert.notEqual(q('.preview-profile-card').id,first);assert.match(q('.preview-results-heading').textContent,/37–72/);
 await select('Historical preview position','K');assert.match(q('.preview-results-heading').textContent,/of 209/);assert.ok(all('.preview-position').every(n=>n.textContent==='K'));await select('Historical preview era','1960');assert.ok(all('.preview-profile-card').length>0);await search('not a real player xyz');assert.ok(q('.preview-empty'));assert.equal(all('.preview-profile-card').length,0);assert.equal(button('Previous').disabled,true);assert.equal(button('Next').disabled,true);await click(button('Show all preview profiles'));assert.equal(q('select[aria-label="Historical preview position"]').value,'ALL');
 await search('Barry Sanders');assert.equal(all('.preview-profile-card').length,1);assert.match(q('.preview-profile-card').textContent,/1989–1998/);const trigger=q('.preview-profile-card');await click(trigger);assert.match(q('[role="dialog"]').textContent,/source-listed seasons/);assert.match(q('[role="dialog"]').textContent,/Preview entry · no draft action/);assert.ok(q('[role="dialog"] a[href="https://www.kaggle.com/datasets/zynicide/nfl-football-player-stats"]'));assert.equal(q('[role="dialog"] button.primary-button'),null);await click(button('Close'));assert.equal(q('[role="dialog"]'),null);assert.equal(document.activeElement,trigger);
 await search('15597');assert.match(q('.preview-profile-card').textContent,/Joe Montana/);await click(q('.preview-profile-card'));assert.match(q('[role="dialog"]').textContent,/1979–1990, 1992–1994/);await click(button('Close'));await search('11346');assert.equal(all('.preview-profile-card').length,0);await click(button('Reset filters'));assert.equal(all('.preview-profile-card').length,36);
 assert.ok(!all('button').some(b=>/^(Draft|Add to lineup)/.test(b.textContent)));assert.ok(requests.every(r=>r.method==='GET'&&r.url==='/api/profile'));
 await mountPage({position:'QB',era:'1960',search:'Joe Namath'});assert.equal(q('select[aria-label="Historical preview position"]').value,'QB');assert.equal(q('select[aria-label="Historical preview era"]').value,'1960');assert.equal(q('input[aria-label="Search historical preview"]').value,'Joe Namath');assert.ok(all('.preview-profile-card').length>0);assert.ok(all('.preview-profile-card').every(card=>card.textContent.includes('Joe Namath')));assert.ok(!all('button').some(b=>/^(Draft|Add to lineup)/.test(b.textContent)));
 await mountPage({position:['QB','WR'],era:'2020',search:'x'.repeat(120)});assert.equal(q('select[aria-label="Historical preview position"]').value,'ALL');assert.equal(q('select[aria-label="Historical preview era"]').value,'0');assert.equal(q('input[aria-label="Search historical preview"]').value.length,100);assert.ok(requests.every(r=>r.method==='GET'&&r.url==='/api/profile'));
 console.log('PASS: 3,913 source profiles, 36-card page bound, pagination, position/era/name/ID intersection, reset/empty states, explicit preview/source limits, exact season gaps, conflict exclusion, dialog close/reopen/focus return, filtered URL handoff, whitelisted initial filters, no game writes or draft controls. DOM only.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
