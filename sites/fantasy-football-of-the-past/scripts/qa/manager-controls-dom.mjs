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

const {CommissionerControls}=await import(pathToFileURL(root+'components/commissioner-controls.tsx').href);
const {OnlineLeague}=await import(pathToFileURL(root+'components/online-league.tsx').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
let saved=newSeason('owner',{name:'Manager DOM',teamName:'Owner',capacity:2,format:'seventeen'},'TEST-CODE');saved=joinSeason(saved,'departing','Departing team');saved=seasonAction(saved,'owner',{action:'startDraft'});while(saved.status==='draft')saved=seasonAction(saved,'owner',{action:'autopick'});
const original=structuredClone(saved),requests=[];let viewer='owner';
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,30));});
const q=s=>document.querySelector(s),buttons=text=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===text),button=text=>buttons(text).at(-1);
const click=async(node)=>{assert.ok(node);assert.ok(!node.disabled);await act(()=>node.click());};
const renderControls=()=>app.render(React.createElement(CommissionerControls,{league:publicSeason(saved,'owner'),busy:false,onAction:async(action,extra={})=>{requests.push(action);saved=seasonAction(saved,'owner',{action,...extra,...(action==='removeManager'?{inviteCode:'REPLACEMENT-CODE'}:{})});saved.revision++;renderControls();return true;}}));
globalThis.fetch=async(url,options={})=>{
 if(url==='/api/profile')return Response.json({profile:{reduceMotion:true,avatar:null}});
 if(url==='/api/leagues'&&!options.method)return Response.json({leagues:[]});
 if(url==='/api/leagues'&&options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='inspectInvite')return Response.json({invitation:{name:saved.name,status:saved.status,canJoin:false,vacancies:saved.teams.filter(t=>t.vacant).map(t=>({id:t.id,name:t.name,locked:t.locked}))}});if(body.action==='join'){saved=joinSeason(saved,viewer,body.teamName,body.teamId);return Response.json({league:publicSeason(saved,viewer)});}}
 if(url.startsWith('/api/draft-preferences'))return Response.json({preferences:{revision:0,queue:[],timerSeconds:0}});
 if(url.includes('?rankings'))return Response.json({rankings:[]});
 if(url.startsWith('/api/leagues/')){if(!saved.teams.some(t=>t.userId===viewer))return Response.json({error:'No access'},{status:404});return Response.json({league:publicSeason(saved,viewer)});}
 throw Error('Unexpected '+url);
};
try{
 await act(renderControls);assert.equal(buttons('Remove manager').length,1);await click(button('Remove manager'));assert.match(q('[role="dialog"]').textContent,/Departing team/);await click(button('Keep manager'));assert.equal(requests.length,0);await click(button('Remove manager'));await click(button('Remove manager'));assert.equal(saved.teams[1].vacant,true);assert.match(q('.manager-list').textContent,/Vacant/);assert.deepEqual(saved.teams.map(t=>t.roster),original.teams.map(t=>t.roster));assert.deepEqual(saved.history,original.history);
 await click(button('Prepare & lock caretaker lineups'));assert.match(q('[role="dialog"]').textContent,/consume historical games once/);await click(button('Cancel'));assert.equal(saved.teams[1].locked,false);
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));viewer='replacement';await act(()=>app.render(React.createElement(OnlineLeague)));
 await act(()=>{const input=q('input[placeholder="XXXX-XXXX-XXXX-XXXX"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'REPLACEMENT-CODE');input.dispatchEvent(new window.Event('input',{bubbles:true}));});await click(button('Check invitation'));assert.match(q('.league-join-panel').textContent,/Existing teams only/);assert.equal(button('Take over selected team').disabled,true);
 await act(()=>{const select=q('.league-join-panel select');select.value=saved.teams[1].id;select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(button('Take over selected team').disabled,false);await act(()=>q('.league-join-panel form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved.teams[1].userId,'replacement');assert.ok(q('.league-workspace-toolbar'));assert.equal(q('.commissioner-controls'),null);
 saved=seasonAction(saved,'owner',{action:'removeManager',teamId:saved.teams[1].id,confirm:true,inviteCode:'NEXT-CODE'});await act(()=>window.dispatchEvent(new window.Event('focus')));assert.equal(q('.league-workspace-toolbar'),null);assert.match(document.body.textContent,/access to this league is no longer available/);
 console.log('PASS: commissioner-only manager controls, cancel/confirm, stable roster, caretaker warning/cancel, invitation preview, explicit existing-team takeover, no owner controls for replacement, polling revokes removed manager display. DOM only.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
