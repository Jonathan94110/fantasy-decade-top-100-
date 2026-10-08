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
const {DraftRecentPicks,DraftRoundBoard}=await import(pathToFileURL(root+'components/draft-board.tsx').href);
const {DraftDetails}=await import(pathToFileURL(root+'components/draft-details.tsx').href);
const {BenchPoints}=await import(pathToFileURL(root+'components/bench-points.tsx').href);
const {SeasonRecap}=await import(pathToFileURL(root+'components/season-recap.tsx').href);
const {TradeDesk}=await import(pathToFileURL(root+'components/trade-desk.tsx').href);
const {ATHLETES,HISTORICAL_ATHLETES,athleteFor,score}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {PERFORMANCES,performancePool}=await import(pathToFileURL(root+'lib/historical-data.ts').href);
const {depthRows}=await import(pathToFileURL(root+'lib/depth-chart.ts').href);
const {draftInsights}=await import(pathToFileURL(root+'lib/draft-insights.ts').href);
const {newScoring}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const historical=newScoring(.5,true,'historical'),strict=newScoring(.5,true,'strict');
const old=HISTORICAL_ATHLETES.find(a=>a.name==='Joe Montana'&&!ATHLETES.some(original=>original.id===a.id));
assert.ok(old,'A historical-only quarterback is loaded');assert.ok(old.gameCount>=17);
const modern=ATHLETES.find(a=>a.position==='QB'&&a.seasons[0]>=2000&&PERFORMANCES.some(p=>p.athleteId===a.id&&p.seasonType==='POST'));
assert.ok(modern,'A modern quarterback with playoff records is loaded');
const modernRegular=PERFORMANCES.filter(p=>p.athleteId===modern.id&&p.seasonType==='REG');
const historicalModern=athleteFor(modern.id,historical);
assert.ok(historicalModern);assert.equal(historicalModern.gameCount,modernRegular.length);
assert.ok(modern.gameCount>historicalModern.gameCount,'Strict retains modern playoff coverage');
const record=performancePool(old.id,historical)[0];assert.ok(record);assert.equal(record.seasonType,'REG');
const rawRecord=JSON.stringify(record),originalCounts=JSON.stringify(ATHLETES.map(a=>[a.id,a.gameCount,a.gamesBySeason]));
const points=score(record.stats,old.position,historical),averages=new Map([[old.id,30],[modern.id,20]]);
const teams=[{id:'me',name:'My team',roster:[old.id],lineup:{QB:old.id},locked:false},{id:'other',name:'Other team',roster:[modern.id],lineup:{QB:modern.id},locked:false}];
const context={name:'Historical fixture',status:'active',round:1,regularRounds:16,myTeamId:'me',used:[record.id],teams,requiredGames:17,byes:{version:2,firstWeek:5,lastWeek:15,weeks:{[old.id]:5,[modern.id]:6}}};
const historicalRows=depthRows('QB',averages,context,historical),strictRows=depthRows('QB',averages,context,strict);
assert.equal(historicalRows.find(row=>row.athlete.id===old.id).remaining,old.gameCount-1);
assert.equal(historicalRows.find(row=>row.athlete.id===modern.id).remaining,modernRegular.length);
assert.equal(strictRows.find(row=>row.athlete.id===modern.id).remaining,modern.gameCount);
assert.ok(!strictRows.some(row=>row.athlete.id===old.id));
assert.ok(performancePool(modern.id,historical).every(p=>p.seasonType==='REG'));
const match={home:'me',away:'other',homeScore:points,awayScore:0,winner:'me'};
const draw={athleteId:old.id,slot:'QB',points,performance:record};
const round={number:1,phase:'regular',resolvedAt:'2000-01-01T00:00:00Z',scoring:historical,receiptsHidden:false,matches:[match],draws:{me:[draw],other:[]},benchDraws:{me:[draw],other:[]}};
const league={id:'fixture',name:'Historical fixture',revision:0,capacity:2,regularRounds:16,round:1,format:'seventeen',lineupVersion:3,status:'active',scoring:historical,teams,myTeamId:'me',history:[round],used:[record.id],trades:[{id:'trade',from:'me',to:'other',give:old.id,receive:modern.id,status:'accepted'}]};
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,25));});
const mount=async(element)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(element));};
const q=selector=>document.querySelector(selector);
const choose=async(label,value)=>act(()=>{const node=q(`select[aria-label="${label}"]`);assert.ok(node);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});
let requestedScoring=historical;const reads=[];
globalThis.fetch=async(url,options={})=>{assert.ok(!options.body,'Scouting does not write state');reads.push(url);const id=new URL(url,'http://fixture.local').searchParams.get('athlete');return Response.json({insights:draftInsights(id,[],requestedScoring)});};
try{
 await mount(React.createElement(DepthChart,{context,averages,scoring:historical}));
 assert.match(q('[aria-label="Saved scoring contract"]').textContent,/All-era scoring · Half PPR/);
 assert.match(q('.depth-explainer').textContent,/excludes playoff games for every player/);
 for(let week=1;week<=4;week++){
  await act(()=>app.render(React.createElement(DepthChart,{context:{...context,round:week},averages,scoring:historical})));
  assert.equal(document.querySelectorAll('.availability-current').length,0);
  const row=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(old.name));assert.ok(row);
  assert.equal(row.querySelector('.availability-pill').textContent,week===4?'Available · Bye next week':'Available');
 }
 await act(()=>app.render(React.createElement(DepthChart,{context:{...context,round:5},averages,scoring:historical})));
 const byeRow=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(old.name));assert.equal(byeRow.querySelector('.availability-current').textContent,'BYE THIS WEEK');
 const nextRow=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(modern.name));assert.equal(nextRow.querySelector('.availability-next').textContent,'Available · Bye next week');
 await act(()=>app.render(React.createElement(DepthChart,{context:{...context,round:context.regularRounds+1},averages,scoring:historical})));
 assert.equal(document.querySelectorAll('.availability-current').length,0);assert.equal(document.querySelectorAll('.availability-next').length,0);assert.ok([...document.querySelectorAll('.availability-pill')].every(node=>node.textContent==='Available'));
 await act(()=>app.render(React.createElement(DepthChart,{context,averages,scoring:historical})));
 await choose('Player era','1980');assert.match(q('tbody').textContent,new RegExp(old.name));
 const oldRow=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes(old.name));
 assert.ok(oldRow);assert.equal(oldRow.lastElementChild.textContent,String(old.gameCount-1));
 await mount(React.createElement(DepthChart,{context,averages,scoring:strict}));await choose('Player era','1980');
 assert.equal(document.querySelectorAll('tbody tr').length,0);assert.match(q('[aria-label="Saved scoring contract"]').textContent,/Saved scoring · Half PPR/);
 const picks=[{number:1,round:1,teamId:'me',athleteId:old.id}];
 await mount(React.createElement(React.Fragment,null,React.createElement(DraftRecentPicks,{teams,picks}),React.createElement(DraftRoundBoard,{teams,picks,order:['me','other'],pick:1,rounds:11,active:true,myTeamId:'me'})));
 assert.match(q('.draft-recent-picks').textContent,new RegExp(old.name));assert.equal(q('.draft-round-board li > strong').textContent,old.name);
 await mount(React.createElement(BenchPoints,{league,round}));assert.equal(q('.bench-player-name').textContent,old.name);assert.equal(q('.bench-player-position').textContent,'QB · Bench');assert.ok(q('.score-receipt'));
 await mount(React.createElement(SeasonRecap,{league,round}));assert.match(q('.weekly-recap').textContent,new RegExp(old.name));assert.doesNotMatch(q('.weekly-recap').textContent,new RegExp(old.id));
 await mount(React.createElement(TradeDesk,{league,solo:true,busy:false,onAction:async()=>{throw Error('No trade should be submitted');},rankings:averages}));assert.match(q('.season-offers h3').textContent,new RegExp(old.name));assert.match(document.querySelectorAll('select')[1].textContent,new RegExp(old.name));
 await mount(React.createElement(DraftDetails,{athlete:old,revision:1,canDraft:true,onClose:()=>{},onDraft:()=>{},endpoint:'/api/demo'}));
 assert.match(q('[role="dialog"]').textContent,/All-era scoring · Half PPR/);assert.match(q('[role="dialog"]').textContent,/regular-season games only; playoff games are excluded for every player/);assert.match(q('[role="dialog"]').textContent,/Missing excluded stats remain unknown/);
 requestedScoring=strict;
 await mount(React.createElement(DraftDetails,{athlete:modern,revision:2,canDraft:true,onClose:()=>{},onDraft:()=>{},endpoint:'/api/demo'}));
 assert.match(q('[role="dialog"]').textContent,/Saved scoring · Half PPR/);assert.match(q('[role="dialog"]').textContent,/Loaded regular-season and playoff games only/);
 assert.equal(reads.length,2);assert.equal(JSON.stringify(record),rawRecord);assert.equal(JSON.stringify(ATHLETES.map(a=>[a.id,a.gameCount,a.gamesBySeason])),originalCounts);
 console.log('PASS: older QB depth/era eligibility under All-era scoring; Weeks 1–4 availability, Week 5 current/next bye badges and playoff availability; real used-game counts; modern REG-only versus saved Strict playoff counts; older saved draft, bench, recap and trade names; All-era/Saved scoring and PPR labels; raw unknowns and strict catalog unchanged. Mounted DOM only; no browser visual QA or saved-state writes.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
