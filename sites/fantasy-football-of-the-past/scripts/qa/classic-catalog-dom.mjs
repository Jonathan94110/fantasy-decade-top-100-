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

const {default:LegendsPage}=await import(pathToFileURL(root+'app/legends/page.tsx').href);
const {EraLibrary}=await import(pathToFileURL(root+'components/era-library.tsx').href);
const requests=[],picked=[];
globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method||'GET'});assert.equal(url,'/api/profile');return Response.json({profile:{reduceMotion:false,avatar:null}});};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,20));});
const click=async(node)=>{assert.ok(node,'click target exists');assert.ok(!node.disabled,'button enabled');await act(()=>node.click());};
const q=s=>document.querySelector(s);
const byText=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const choose=async(label,value)=>act(()=>{const input=q(`select[aria-label="${label}"]`);assert.ok(input,label);input.value=value;input.dispatchEvent(new window.Event('change',{bubbles:true}));});
const search=async(value)=>act(()=>{const input=q('input[aria-label="Search the era library"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
const close=async()=>click([...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Close'||b.textContent.trim()==='Close'));
const view=async(name)=>click(q(`button[aria-label="View ${name} profile"]`));
const rows=()=>[...document.querySelectorAll('tbody tr')];
try{
 await act(()=>app.render(React.createElement(LegendsPage)));
 assert.equal(q('nav[aria-label="Game mode"] a[href="/legends"]'),null,'The profile catalog is absent from primary game navigation');
 assert.equal(q('h1').textContent,'Classic Legends','The direct read-only route still opens');
 assert.equal(q('.catalog-subnav a[href="/legends"]').getAttribute('aria-current'),'page');
 assert.match(q('.library-results-heading').textContent,/105 profiles/);
 assert.match(q('.classic-coverage-notice').textContent,/Classic competition not enabled/);
 assert.equal(rows().length,48);
 await click(byText('Next'));assert.match(q('.library-results-heading').textContent,/49–96 of 105/);
 await click([...document.querySelectorAll('.collection-positions button')].find(b=>b.textContent.startsWith('Kickers')));
 assert.equal(rows().length,5);assert.match(q('tbody').textContent,/George Blanda/);assert.match(q('tbody').textContent,/Adam Vinatieri/);
 assert.equal(q('button[aria-label^="Add "]'),null);
 await view('Lou Groza');assert.match(q('[role="dialog"]').textContent,/1961–1967/);assert.match(q('[role="dialog"]').textContent,/1946–1959, 1961–1967/);assert.match(q('[role="dialog"]').textContent,/Kickers with verified game logs can be drafted in new 11-player seasons/);assert.ok(q('[role="dialog"] a[href="https://www.profootballhof.com/players/lou-groza"]'));await close();
 await view('George Blanda');assert.match(q('[role="dialog"]').textContent,/1949–1958, 1960–1975/);assert.match(q('[role="dialog"]').textContent,/One quarterback identity/);await close();
 await search('The Toe');assert.equal(rows().length,1);assert.match(q('tbody').textContent,/Lou Groza/);
 await choose('Player recognition','nfl100');assert.equal(rows().length,0);assert.match(document.body.textContent,/No profiles with these filters/);
 await click(byText('Reset filters'));assert.equal(q('select[aria-label="Player collection"]').value,'classic');assert.match(q('.library-results-heading').textContent,/105 profiles/);
 await choose('Player recognition','nfl100');assert.equal(rows().length,33);await search('Tom Brady');assert.equal(rows().length,1);assert.equal(q('tbody .hof-badge'),null);assert.ok(q('tbody .nfl100-badge'));
 await view('Tom Brady');assert.match(q('[role="dialog"]').textContent,/164 verified Classic game records loaded/);assert.match(q('[role="dialog"]').textContent,/2000–2010/);assert.equal(q('[role="dialog"] .primary-button'),null);await close();
 await search('');await choose('Player recognition','all');await choose('Profile availability','playable');assert.equal(rows().length,36);
 await search('Jerry Rice');await view('Jerry Rice');assert.match(q('[role="dialog"]').textContent,/Career 1985–2004/);assert.match(q('[role="dialog"]').textContent,/Loaded seasons: 1999–2004/);assert.equal(q('[role="dialog"] .primary-button'),null);await close();
 await search('John Constantine Unitas');assert.equal(rows().length,0);await choose('Profile availability','profiles');assert.equal(rows().length,1);assert.match(q('tbody').textContent,/Johnny Unitas/);
 // Remount the original quick-matchup library contract. Browse filters must not alter its callback.
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));
 await act(()=>app.render(React.createElement(EraLibrary,{used:[],canDraft:true,onDraft:a=>picked.push(a)})));
 await search('Jerry Rice');await click(q('button[aria-label="Add Jerry Rice to lineup"]'));assert.equal(picked.length,1);assert.equal(picked[0].name,'Jerry Rice');
 await search('Lou Groza');assert.equal(q('button[aria-label^="Add "]'),null);await view('Lou Groza');assert.equal(q('[role="dialog"] .primary-button'),null);await close();
 await choose('Player collection','classic');await search('Jerry Rice');assert.equal(q('button[aria-label^="Add "]'),null);await view('Jerry Rice');assert.equal(q('[role="dialog"] .primary-button'),null);await close();assert.equal(picked.length,1);
 assert.ok(requests.every(r=>r.method==='GET'&&r.url==='/api/profile'));
 console.log('PASS: direct read-only Classic route remains accessible without a primary game-navigation link; 105 deduplicated identities, pagination/reset, K and dual-role discovery, exact career gaps, alias search, Hall/NFL100 distinction, 36 loaded-game filter, source links, close/reopen, no Classic draft controls or game writes; isolated legacy library callback preserved. DOM-only, no rendered visual QA.');
}finally{await act(()=>app.unmount());await window.happyDOM.close();}
