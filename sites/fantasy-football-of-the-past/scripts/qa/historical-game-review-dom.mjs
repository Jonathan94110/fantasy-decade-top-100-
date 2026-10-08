/** Read-only review DOM regression; this does not perform rendered browser QA. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../../',import.meta.url)),loaded=[];
registerHooks({
 resolve(id,context,next){
  if(id==='next/link')return {url:'data:text/javascript,import React from "'+pathToFileURL(root+'node_modules/react/index.js').href+'";export default function Link(p){return React.createElement("a",p)}',shortCircuit:true};
  if(id.startsWith('@/'))id=pathToFileURL(root+id.slice(2)).href;
  try{return next(id,context);}catch(error){for(const ext of ['.ts','.tsx'])try{return next(id+ext,context);}catch{}throw error;}
 },
 load(url,context,next){
  loaded.push(url);
  if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};
  if(url.startsWith('file:')&&/\.(ts|tsx)$/.test(url)&&!url.includes('/node_modules/'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};
  return next(url,context);
 },
});
const {Window}=await import(process.env.DOM_HARNESS_MODULE||'happy-dom');
const window=new Window({url:'http://fixture.local'});
for(const name of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','NodeFilter','Element','DocumentFragment','Event','CustomEvent','MutationObserver','ResizeObserver'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react'),{createRoot}=await import('react-dom/client');
const {default:ReviewPage}=await import(pathToFileURL(root+'app/historical-game-review/page.tsx').href);
const {HistoricalPreview}=await import(pathToFileURL(root+'components/historical-preview.tsx').href);
const {REVIEW_PERFORMANCES,REVIEW_PLAYERS}=await import(pathToFileURL(root+'lib/historical-game-review.ts').href);
const {ATHLETES}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const requests=[];
globalThis.fetch=async(url,options={})=>{
 requests.push({url,method:options.method||'GET'});
 assert.equal(options.method||'GET','GET','The review never writes to gameplay endpoints');
 assert.equal(url,'/api/profile','Only the existing private-site header reads account preferences');
 return Response.json({profile:{reduceMotion:true,avatar:null}});
};
window.document.body.innerHTML='<div id="root"></div>';
let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,25));});
const q=(selector,scope=document)=>scope.querySelector(selector),all=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const mount=async(element)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(element));};
const select=async(label,value)=>act(()=>{const node=q(`select[aria-label="${label}"]`);assert.ok(node,label);node.value=String(value);node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const click=async(node)=>{assert.ok(node,'Review control exists');assert.ok(!node.disabled);await act(()=>{node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));node.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));node.click();});};
const expectedScore=(record,ppr)=>{const s=record.stats;return Math.round((s.passingYards*.04+s.passingTD*4-s.interceptions*2+(s.rushingYards+s.receivingYards)*.1+(s.rushingTD+s.receivingTD+s.returnTD+s.fumbleRecoveryTD)*6+s.receptions*ppr+s.twoPoint*2)*100)/100;};
try{
 const original=JSON.stringify(REVIEW_PERFORMANCES),normalIds=ATHLETES.map(a=>a.id);
 assert.equal(REVIEW_PERFORMANCES.length,24);assert.equal(REVIEW_PLAYERS.length,7);
 assert.equal(ATHLETES.length,435,'The selected shutout sample does not expand normal gameplay');
 assert.ok(REVIEW_PLAYERS.every(player=>!normalIds.includes(player.athleteId)));
 await mount(React.createElement(ReviewPage));
 const caution=q('[aria-label="Selected shutout sample limits"]');assert.ok(caution);
 assert.match(caution.textContent,/selected shutouts only/i);assert.match(caution.textContent,/biased low-scoring/);
 assert.match(caution.textContent,/not a representative career sample/);assert.match(caution.textContent,/excluded/i);
 assert.match(caution.textContent,/drafts/);assert.match(caution.textContent,/random draws/);assert.match(caution.textContent,/seasons/);
 assert.equal(all('.historical-game-review tbody tr').length,24);
 assert.equal(all('select[aria-label="Review quarterback"] option').length,8);
 assert.deepEqual(all('select[aria-label="Review PPR scoring"] option').map(node=>node.value),['0','0.5','1']);
 for(const ppr of [0,.5,1]){
  await select('Review PPR scoring',ppr);
  assert.match(q('.preview-results-heading [role="status"]').textContent,ppr===0?/Standard/:ppr===.5?/Half PPR/:/Full PPR/);
  for(const record of REVIEW_PERFORMANCES){const cell=all('[data-review-points]').find(node=>node.dataset.reviewPoints===record.id);assert.equal(cell.textContent,expectedScore(record,ppr).toFixed(2),record.id);}
 }
 for(const player of REVIEW_PLAYERS){await select('Review quarterback',player.id);assert.equal(all('.historical-game-review tbody tr').length,player.gameCount);assert.ok(all('.historical-game-review tbody tr').every(row=>row.textContent.includes(player.name)));}
 await select('Review quarterback','ALL');
 const postseason=REVIEW_PERFORMANCES.find(record=>record.seasonType==='POST'&&record.week===null);assert.ok(postseason,'An explicitly unavailable postseason week is represented');
 const opener=document.getElementById(`review-game-${postseason.id}`);await click(opener);
 const dialog=q('[role="dialog"]');assert.ok(dialog);assert.match(dialog.textContent,/NFL week unavailable/);
 assert.match(dialog.textContent,new RegExp(`Source game ordinal: ${postseason.sourceWeek}`));
 assert.match(dialog.textContent,/distinct from the NFL week/);
 assert.match(dialog.textContent,/Two-point creditsUnavailable0 · derived from completed team shutout/);
 assert.match(dialog.textContent,/Offensive recovery touchdownsUnavailable0 · derived from completed team shutout/);
 assert.match(dialog.textContent,/Individual lost fumblesUnavailableDisabled · remains unknown/);
 assert.match(dialog.textContent,/Final:/);assert.match(dialog.textContent,/Total illustrated points/);
 for(const url of postseason.sourceUrls)assert.ok(all('a',dialog).some(link=>link.getAttribute('href')===url),url);
 assert.ok(all('a',dialog).some(link=>/profootballhof.com/.test(link.href)),'Reviewed identity links to its evidence');
 assert.equal(all('button.primary-button',dialog).length,0);
 const close=all('button',dialog).find(node=>node.textContent==='Close');await click(close);assert.equal(q('[role="dialog"]'),null);
 assert.equal(document.activeElement.id,opener.id,'Closing returns focus to the reviewed game');
 assert.equal(JSON.stringify(REVIEW_PERFORMANCES),original);
 assert.deepEqual(ATHLETES.map(a=>a.id),normalIds);
 assert.ok(!all('button').some(node=>/^(Draft|Add to lineup|Draw|Random|Start season)/i.test(node.textContent.trim())));
 await mount(React.createElement(HistoricalPreview));
 const link=q('a[href="/historical-game-review"]');assert.ok(link);assert.match(link.closest('p').textContent,/biased sample/);assert.match(link.closest('p').textContent,/excluded from drafts, random draws and seasons/);
 assert.ok(requests.every(request=>request.method==='GET'));
 assert.ok(!loaded.some(url=>/\/lib\/historical-data\.ts$|\/data\/nflverse\/records\.json$/.test(url)),'The review loads its24 permitted records, not the normal full raw archive');
 console.log('PASS: read-only selected-shutout bias labels; 24game/7identity counts; native filters and all PPR illustrations; raw unknowns vs separate final-zero proofs; unknown postseason week/ordinal labels; source/identity links; focus return; preserved435normal athletes; no drafting, random draws, season writes, or full-archive client imports. DOM only; no rendered browser QA.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
