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

const {DepthChartPage}=await import(pathToFileURL(root+'components/depth-chart-page.tsx').href);
const {newDemoDraft,demoReply}=await import(pathToFileURL(root+'lib/demo-draft-engine.ts').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
const {draftRankings}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {scoringFor}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const {athletesFor}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const solo=newDemoDraft('Solo roster',1,{modern:true,capacity:2});
let online=newSeason('owner',{name:'Online roster',teamName:'Online owner',capacity:2,format:'seventeen',receptionPoints:0},'CODE');
online=joinSeason(online,'other','Other owner');online=seasonAction(online,'owner',{action:'startDraft'});
const bodies={solo:{...demoReply(solo),scoring:scoringFor(solo),rankings:draftRankings([],scoringFor(solo))},online:{league:publicSeason(online,'owner'),scoring:scoringFor(online),rankings:draftRankings([],scoringFor(online))}};
const requests=[],polls=new Map();
const originalSetInterval=globalThis.setInterval,originalClearInterval=globalThis.clearInterval;
// Exercise the component's actual polling callback without waiting eight seconds.
globalThis.setInterval=(callback,delay,...args)=>{
 if(delay!==8000)return originalSetInterval(callback,delay,...args);
 const token={};polls.set(token,()=>callback(...args));return token;
};
globalThis.clearInterval=token=>{if(!polls.delete(token))originalClearInterval(token);};
function delayedDepth(){
 assert.equal(pendingDepth,null,'Only one controlled response is queued');
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 pendingDepth=promise;
 return {resolve:(body,status=200)=>resolve(Response.json(body,{status})),reject};
}
let pendingDepth=null;
const initial=delayedDepth();
globalThis.fetch=async(url,options={})=>{
 requests.push({url,method:options.method||'GET'});
 if(url==='/api/profile')return Response.json({profile:{reduceMotion:true,avatar:null}});
 if(url==='/api/leagues')return Response.json({leagues:[{id:online.id,name:online.name}]});
 if(url==='/api/depth-chart'||url.startsWith('/api/depth-chart?league=')){
  if(pendingDepth){const response=pendingDepth;pendingDepth=null;return response;}
  return Response.json(url==='/api/depth-chart'?bodies.solo:bodies.online);
 }
 throw Error('Unexpected '+url);
};
window.document.body.innerHTML='<div id="root"></div>';
const app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(r=>setTimeout(r,40));});
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const button=text=>all('button').find(node=>node.textContent===text);
const choose=async(label,value)=>act(()=>{const select=q(`select[aria-label="${label}"]`);assert.ok(select,label);select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));});
const click=async(node)=>{assert.ok(node,'Click target exists');assert.ok(!node.disabled,'Click target is enabled');await act(()=>node.click());};
const poll=async()=>act(()=>{assert.equal(polls.size,1,'Exactly one depth refresh timer is active');[...polls.values()][0]();});
function captureView(){
 const table=q('.depth-table'),pagination=q('.preview-pagination');
 assert.ok(table);assert.ok(pagination);
 return {table,pagination,firstRow:q('tbody tr'),filterNodes:all('.depth-chart input,.depth-chart select'),filters:all('.depth-chart input,.depth-chart select').map(node=>node.value),page:q('.preview-pagination>span').textContent,rows:q('tbody').textContent};
}
function remains(view){
 // Compare identities as booleans: assertion errors must not inspect a DOM/React graph.
 assert.ok(q('.depth-table')===view.table,'Loaded table remains mounted');
 assert.ok(q('.preview-pagination')===view.pagination,'Pagination remains mounted');
 assert.ok(q('tbody tr')===view.firstRow,'Saved row remains mounted');
 const filters=all('.depth-chart input,.depth-chart select');
 assert.equal(filters.length,view.filterNodes.length,'Same number of filter controls');
 assert.ok(filters.every((node,index)=>node===view.filterNodes[index]),'Filter controls remain mounted');
 assert.deepEqual(all('.depth-chart input,.depth-chart select').map(node=>node.value),view.filters,'Filter values are unchanged');
 assert.equal(q('.preview-pagination>span').textContent,view.page,'Current page is unchanged');
 assert.equal(q('tbody').textContent,view.rows,'Existing rankings stay visible');
}
try{
 const savedBefore=JSON.stringify({solo,online});
 assert.equal(scoringFor(solo).mode,'historical');assert.equal(scoringFor(online).mode,'historical');
 await act(()=>app.render(React.createElement(DepthChartPage)));
 assert.equal(q('.depth-table'),null);assert.match(q('[role="status"]').textContent,/Loading every playable position/);
 await act(()=>initial.resolve(bodies.solo));
 assert.equal(q('a[aria-current="page"]').textContent,'Depth chart');assert.match(q('.depth-heading').textContent,/Solo roster/);assert.match(q('.depth-heading').textContent,/Full PPR/);
 assert.match(q('.depth-heading').textContent,/All-era scoring/);assert.equal(q('select[aria-label="Scoring mode"]'),null);
 assert.ok(q('select[aria-label="Player era"] option[value="1950"]'));
 await act(()=>{const select=q('select[aria-label="Player era"]');select.value='1950';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('tbody tr').length,0);assert.match(q('.player-browser-empty').textContent,/1950s game logs need more verified stats/);assert.match(q('.player-browser-empty').textContent,/Unknown stats cannot count as zero/);
 const expectedEighties=athletesFor(scoringFor(solo)).filter(athlete=>athlete.position==='QB'&&athlete.seasons.some(year=>year>=1980&&year<=1989&&athlete.gamesBySeason[year]>0));assert.ok(expectedEighties.length);
 await act(()=>{const select=q('select[aria-label="Player era"]');select.value='1980';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('tbody tr').length,Math.min(40,expectedEighties.length));assert.match(q('.depth-result-count').textContent,new RegExp(`${expectedEighties.length} QB entries`));assert.ok([...document.querySelectorAll('tbody tr td:nth-child(2)>b')].every(node=>expectedEighties.some(athlete=>athlete.name===node.textContent)));
 await click(button('Clear player filters'));assert.equal(q('select[aria-label="Player era"]').value,'0');assert.ok(all('tbody tr').length>0);

 // Keep nondefault filters and a later page through two genuinely delayed polls.
 await choose('Player position','WR');await choose('Depth chart ownership','free');
 await act(()=>{const input=q('input[aria-label="Search depth chart"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'a');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
 await click(button('Next'));assert.match(q('.preview-pagination>span').textContent,/Page 2 of/);
 const stable=captureView();q('input[aria-label="Search depth chart"]').focus();const focused=document.activeElement;
 for(let cycle=0;cycle<2;cycle++){
  const response=delayedDepth(),before=requests.length;
  await poll();assert.equal(requests.length,before+1);assert.equal(requests.at(-1).url,'/api/depth-chart');
  remains(stable);assert.ok(document.activeElement===focused,'Refresh preserves filter focus');
  await act(()=>response.resolve(bodies.solo));remains(stable);assert.ok(document.activeElement===focused,'Completed refresh preserves filter focus');
 }

 // A temporary server/network error keeps the same readable snapshot and retry.
 const serverFailure=delayedDepth();await poll();remains(stable);
 await act(()=>serverFailure.resolve({error:'Controlled rankings server interruption.'},500));
 remains(stable);assert.match(q('[role="alert"]').textContent,/Controlled rankings server interruption/);
 const retry=delayedDepth();await click(button('Try again'));remains(stable);
 await act(()=>retry.resolve(bodies.solo));remains(stable);assert.equal(q('[role="alert"]'),null);
 const networkFailure=delayedDepth();await poll();remains(stable);
 await act(()=>networkFailure.reject(Error('Controlled rankings network interruption.')));
 remains(stable);assert.match(q('[role="alert"]').textContent,/Controlled rankings network interruption/);
 const networkRetry=delayedDepth();await click(button('Try again'));remains(stable);
 await act(()=>networkRetry.resolve(bodies.solo));remains(stable);assert.equal(q('[role="alert"]'),null);

 // A different selected league must never show the previous scope while loading.
 const onlineLoad=delayedDepth();await choose('Depth chart league',online.id);
 assert.equal(q('.depth-table'),null);assert.equal(q('.depth-heading'),null);assert.match(q('[role="status"]').textContent,/Loading every playable position/);
 await act(()=>onlineLoad.resolve(bodies.online));
 assert.match(q('.depth-heading').textContent,/Online roster/);assert.match(q('.depth-heading').textContent,/All-era scoring/);assert.match(q('.depth-heading').textContent,/Standard/);
 await act(()=>{const select=q('select[aria-label="Player position"]');select.value='K';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.match(q('.depth-result-count').textContent,/40 K entries/);assert.match(q('.depth-chart').textContent,/no kicker slot/);assert.equal(JSON.stringify({solo,online}),savedBefore);
 for(const status of [401,403,404]){
  const beforeLoss=captureView(),loss=delayedDepth();await poll();remains(beforeLoss);
  await act(()=>loss.resolve({error:`Controlled ${status} membership loss.`},status));
  assert.equal(q('.depth-table'),null);assert.equal(q('.preview-pagination'),null);assert.equal(q('.depth-heading'),null);
  assert.match(q('[role="alert"]').textContent,new RegExp(`Controlled ${status} membership loss`));
  // Regrant access only in the mock, so each independent denial is exercised.
  if(status!==404){await click(button('Try again'));assert.ok(q('.depth-table'));assert.match(q('.depth-heading').textContent,/Online roster/);}
 }
 assert.equal(JSON.stringify({solo,online}),savedBefore);assert.ok(requests.every(r=>r.method==='GET'));
 console.log('PASS: initial loading, historical solo/online contracts and filters, two delayed actual 8s poll callbacks preserve table/pagination/row nodes, filters/page/focus; 500 and network errors retain saved snapshot with successful retry; scope change hides old context; 401/403/404 access loss clears content; fixture state unchanged and GET-only requests. Mounted DOM only, no user-state writes or rendered browser QA.');
}finally{await act(()=>app.unmount());assert.equal(polls.size,0,'Depth polling is cleaned up');globalThis.setInterval=originalSetInterval;globalThis.clearInterval=originalClearInterval;window.happyDOM.abort();}
