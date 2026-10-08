/** Metadata-only client DOM regression. Set DOM_HARNESS_MODULE to installed happy-dom. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../',import.meta.url));
const loaded=[];
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
 }
});
const {Window}=await import(process.env.DOM_HARNESS_MODULE||'happy-dom');
const window=new Window({url:'http://fixture.local'});
for(const name of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','NodeFilter','Element','DocumentFragment','Event','CustomEvent','MutationObserver','ResizeObserver'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {PlayerBrowserFilters,PlayerBrowserEmpty}=await import(pathToFileURL(root+'components/player-browser-filters.tsx').href);
const {DemoDraftRoom}=await import(pathToFileURL(root+'components/demo-draft-room.tsx').href);
const {SeasonWorkspace}=await import(pathToFileURL(root+'components/season-workspace.tsx').href);
const {DepthChart}=await import(pathToFileURL(root+'components/depth-chart.tsx').href);
const {HistoricalPreview}=await import(pathToFileURL(root+'components/historical-preview.tsx').href);
const {default:PreviewPage}=await import(pathToFileURL(root+'app/historical-preview/page.tsx').href);
const {ATHLETES,athletesFor,ALL_POSITIONS,LINEUP_SLOTS}=await import(pathToFileURL(root+'lib/game-model.ts').href);
const {newScoring}=await import(pathToFileURL(root+'lib/scoring-rules.ts').href);
const {emptyPreferences,updatePreferences}=await import(pathToFileURL(root+'lib/draft-preferences.ts').href);
const {filterPreview}=await import(pathToFileURL(root+'lib/historical-preview.ts').href);
const {matchesPlayableEra}=await import(pathToFileURL(root+'lib/player-filters.ts').href);
const brady=ATHLETES.find(a=>a.name==='Tom Brady'),manning=ATHLETES.find(a=>a.name==='Peyton Manning'),favre=ATHLETES.find(a=>a.name==='Brett Favre');
assert.ok(brady&&manning&&favre,'stable real player metadata is available');
const scoring=newScoring(1,true,'strict'),averages=new Map(ATHLETES.map((a,i)=>[a.id,100-i/10]));
let demo={id:'filter-solo',revision:0,createdAt:'2026-10-07T00:00:00.000Z',status:'draft',rosterSize:11,scoring,teams:[{id:'me',name:'My filter team',control:'human',strategy:null,roster:[]},{id:'other',name:'Computer',control:'computer',strategy:0,roster:[favre.id]}],order:['me','other'],pick:0,picks:[],humanTeamId:'me'};
let league={id:'filter-online',name:'Filter league',revision:0,createdAt:demo.createdAt,status:'draft',capacity:2,regularRounds:16,format:'seventeen',lineupVersion:3,scoring,hallCap:0,teams:[{id:'me',name:'My filter team',roster:[],lineup:{},locked:false},{id:'other',name:'Other manager',roster:[favre.id],lineup:{},locked:false}],draftOrder:['me','other'],pick:0,round:1,used:[],history:[],trades:[],schedule:Array.from({length:16},()=>[['me','other']]),playoffSeeds:[],champion:null,activity:[],revealedRounds:[],myTeamId:'me',isCommissioner:false};
const requests=[],preferences=new Map(),actions=[];
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;
 requests.push({url,method:options.method||'GET',body});
 if(url==='/api/profile')return Response.json({profile:{reduceMotion:true,avatar:null,displayName:'',receptionPoints:1}});
 if(url.startsWith('/api/draft-preferences')){
  const scope=body?.scope||new URL(url,'http://fixture.local').searchParams.get('scope');
  let value=preferences.get(scope)||emptyPreferences();
  if(body){assert.equal(body.revision,value.revision);value=updatePreferences(value,body);preferences.set(scope,value);}
  return Response.json({preferences:value});
 }
 assert.equal(options.method||'GET','GET','filters never mutate game/league endpoints');
 if(url.includes('?rankings'))return Response.json({rankings:[...averages].map(([athleteId,average])=>({athleteId,average}))});
 assert.equal(url,'/api/demo');
 return Response.json({demo:structuredClone(demo)});
};
window.document.body.innerHTML='<div id="root"></div>';
let app=createRoot(document.getElementById('root'));
const act=async(fn)=>React.act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,25));});
const q=(selector,scope=document)=>scope.querySelector(selector),all=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const button=(text,scope=document)=>all('button',scope).find(node=>node.textContent.trim()===text);
const click=async(node)=>{assert.ok(node,'click target exists');assert.ok(!node.disabled,'click target is enabled');await act(()=>{node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));node.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));node.click();});};
const select=async(label,value,scope=document)=>act(()=>{const node=q(`select[aria-label="${label}"]`,scope);assert.ok(node,`${label} select exists`);assert.ok(!node.disabled,`${label} select enabled`);node.value=String(value);node.dispatchEvent(new window.Event('change',{bubbles:true}));});
const search=async(selector,value)=>act(()=>{const node=q(selector);assert.ok(node,'search input exists');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});
const mount=async(element)=>{await act(()=>app.unmount());app=createRoot(document.getElementById('root'));await act(()=>app.render(element));};
const clear=async(scope=document)=>click(button('Clear player filters',q('.player-browser-filters',scope)||scope));
const names=(selector)=>all(selector).map(node=>node.textContent.replace(/HOF$/,'').trim());
const draftButton=(name,scope)=>all('button[aria-label^="Draft "]',scope).find(node=>node.getAttribute('aria-label').startsWith(`Draft ${name}`));
function previewLink(scope,position,era){const link=q('.player-browser-empty a',scope);assert.ok(link,'empty state has a read-only preview link');const url=new URL(link.href);assert.equal(url.pathname,'/historical-preview');assert.equal(url.searchParams.get('position'),position);assert.equal(url.searchParams.get('era'),String(era));assert.match(link.textContent,/Preview only/);return url;}
const renderLeague=()=>React.createElement(SeasonWorkspace,{league,busy:false,onAction:async(action,extra)=>{actions.push({action,extra});return true;},onBack:()=>{}});
try{
 // Every eligible unowned identity is on the default board; no position/era cap.
 const originalDemo=demo,originalLeague=league;
 for(const mode of ['strict','historical']){
  const rules=newScoring(1,true,mode),expected=athletesFor(rules).filter(a=>a.gameCount>=17);
  assert.equal(expected.length,mode==='strict'?429:1308);
  demo={...originalDemo,id:`all-player-${mode}`,scoring:rules,teams:originalDemo.teams.map(team=>({...team,roster:[]}))};
  const saved=JSON.stringify(demo);
  await mount(React.createElement(DemoDraftRoom));
  assert.equal(q('select[aria-label="Player position"]').value,'ALL');
  assert.equal(q('select[aria-label="Player era"]').value,'0');
  assert.deepEqual(new Set(all('.demo-player-row').map(row=>row.dataset.playerId)),new Set(expected.map(a=>a.id)));
  assert.match(q('.demo-pool .season-panel-heading').textContent,new RegExp(`${expected.length} shown · ${expected.length} available`));
  for(const position of ALL_POSITIONS){
   await select('Player position',position);
   assert.deepEqual(new Set(all('.demo-player-row').map(row=>row.dataset.playerId)),new Set(expected.filter(a=>a.position===position).map(a=>a.id)));
  }
  await select('Player position','ALL');
  for(const era of [1950,1960,1970,1980,1990,2000,2010,2020]){
   await select('Player era',era);
   assert.deepEqual(new Set(all('.demo-player-row').map(row=>row.dataset.playerId)),new Set(expected.filter(a=>matchesPlayableEra(a,era,[],rules)).map(a=>a.id)));
  }
  await search('.demo-pool .season-search input','Joe Montana');await click(q('.draft-checkbox input'));assert.equal(q('.draft-checkbox input').checked,true);await clear(q('.demo-pool'));assert.equal(q('.draft-checkbox input').checked,false);
  assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(q('select[aria-label="Player era"]').value,'0');
  assert.equal(all('.demo-player-row').length,expected.length);assert.equal(JSON.stringify(demo),saved);
  league={...originalLeague,id:`all-online-${mode}`,scoring:rules,teams:originalLeague.teams.map(team=>({...team,roster:[]}))};
  const onlineSaved=JSON.stringify(league);
  await mount(renderLeague());await click(button('Open draft'));
  assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(q('select[aria-label="Player era"]').value,'0');
  assert.deepEqual(new Set(all('.season-player-list .season-player-row').map(row=>row.dataset.playerId)),new Set(expected.map(a=>a.id)));
  assert.equal(all('.season-player-row[data-position="K"]').length,40);
  await select('Player position','WR');await select('Player era',1960);await clear(q('.season-pool'));
  assert.equal(q('select[aria-label="Player position"]').value,'ALL');assert.equal(all('.season-player-list .season-player-row').length,expected.length);
  assert.equal(JSON.stringify(league),onlineSaved);
 }
 demo=originalDemo;league=originalLeague;
 assert.equal(actions.length,0,'all-position browsing never sends a gameplay action');
 // Shared native controls retain enabled early eras and controlled callbacks.
 const changes=[];
 function Controls(){const [position,setPosition]=React.useState('QB'),[era,setEra]=React.useState(0);return React.createElement(PlayerBrowserFilters,{position,positions:[...LINEUP_SLOTS,'K'],era,onPositionChange:value=>{changes.push(['position',value]);setPosition(value);},onEraChange:value=>{changes.push(['era',value]);setEra(value);},onClear:()=>{changes.push(['clear']);setPosition('QB');setEra(0);}});}
 await mount(React.createElement(Controls));
 assert.deepEqual(all('select[aria-label="Player position"] option').map(node=>node.value),[...LINEUP_SLOTS,'K']);
 assert.ok(q('select[aria-label="Player position"]').closest('label'));
 assert.match(q('option[value="DEF"]').textContent,/D\/ST/);
 assert.match(q('option[value="FLEX"]').textContent,/RB, WR or TE/);
 const eraOptions=all('select[aria-label="Player era"] option');
 assert.deepEqual(eraOptions.map(node=>Number(node.value)),[0,1950,1960,1970,1980,1990,2000,2010,2020]);
 assert.ok(eraOptions.every(node=>!node.disabled),'early eras remain discoverable');
 const note=document.getElementById(q('select[aria-label="Player era"]').getAttribute('aria-describedby'));
 assert.match(note.textContent,/full eligible game pool/);
 await select('Player position','FLEX');await select('Player era',1960);await clear();
 assert.deepEqual(changes,[['position','FLEX'],['era',1960],['clear']]);
 assert.equal(q('select[aria-label="Player position"]').value,'QB');assert.equal(q('select[aria-label="Player era"]').value,'0');
 await mount(React.createElement(PlayerBrowserEmpty,{position:'QB',era:1960,search:'Johnny Unitas',onClear:()=>{}}));
 assert.equal(previewLink(document,'QB',1960).searchParams.get('search'),'Johnny Unitas');
 assert.equal(all('button[aria-label^="Draft "]').length,0);

 // Solo draft: position, actual loaded era and search intersect; sorting/ownership survive.
 await mount(React.createElement(DemoDraftRoom));
 const beforeSolo=JSON.stringify(demo);
 await select('Player era',1990);await search('.demo-pool .season-search input','Peyton');
 assert.equal(all('.demo-player-row').length,1);assert.match(q('.demo-player-row').textContent,/Peyton Manning/);
 assert.equal(draftButton(manning.name,q('.demo-pool')).disabled,false);
 await select('Player position','WR');assert.equal(all('.demo-player-row').length,0);assert.equal(q('.demo-pool .season-search input').value,'Peyton');
 await select('Player position','QB');assert.equal(all('.demo-player-row').length,1);
 await search('.demo-pool .season-search input','');await select('Player era',1960);
 assert.equal(all('.demo-player-row').length,0);previewLink(q('.demo-pool'),'QB',1960);
 await clear(q('.demo-pool'));assert.equal(q('.demo-pool .season-search input').value,'');assert.equal(q('select[aria-label="Player era"]').value,'0');
 await select('Sort demo players','name');const soloNames=names('.demo-player-row > div > b');
 assert.deepEqual(soloNames,[...soloNames].sort((a,b)=>a.localeCompare(b)));assert.ok(!soloNames.includes(favre.name),'owned players remain excluded');
 await select('Player position','QB');await search('.demo-pool .season-search input','Brady');
 for(const era of [2000,2010,2020]){
  await select('Player era',era);assert.equal(all('.demo-player-row').length,1);assert.equal(q('.demo-player-row > div > b').textContent,brady.name);
  if(era===2000)await click(q('.demo-player-row .queue-toggle'));
  assert.deepEqual(preferences.get(`demo:${demo.id}`).queue,[brady.id],'multi-era player uses the same identity and queue entry');
  assert.equal(q('.demo-player-row .queue-toggle').getAttribute('aria-pressed'),'true');
 }
 assert.equal(JSON.stringify(demo),beforeSolo,'browsing and queue changes preserve saved draft');
 demo={...demo,pick:1,revision:1};await act(()=>window.dispatchEvent(new window.Event('focus')));
 assert.equal(draftButton(brady.name,q('.demo-pool')).disabled,true,'another manager turn cannot draft');
 demo={...demo,pick:6,revision:2,teams:demo.teams.map(team=>team.id==='me'?{...team,roster:ATHLETES.filter(a=>a.position==='QB'&&a.gameCount>=17&&![brady.id,favre.id].includes(a.id)).slice(0,3).map(a=>a.id)}:team)};
 await act(()=>window.dispatchEvent(new window.Event('focus')));
 assert.equal(draftButton(brady.name,q('.demo-pool')).disabled,true,'an illegal fourth QB remains disabled');
 await click(q('.draft-checkbox input'));assert.equal(all('.demo-player-row').length,0,'legal-only filter composes with era/search');
 await click(q('.draft-checkbox input'));assert.equal(all('.demo-player-row').length,1);

 // Online draft: remaining-game availability, ownership, sorting and turn gates remain.
 await mount(renderLeague());await click(button('Open draft'));
 const beforeLeague=JSON.stringify(league);
 await select('Player position','QB');await select('Player era',1990);await search('.season-pool .season-search input','Peyton');
 assert.equal(all('.season-player-list .season-player-row').length,1);assert.equal(draftButton(manning.name,q('.season-pool')).disabled,false);
 league={...league,revision:1,used:Array.from({length:manning.gamesBySeason[1999]},(_,i)=>`nflverse:${manning.id}:1999_${i}`)};
 await act(()=>app.render(renderLeague()));
 assert.equal(all('.season-player-list .season-player-row').length,0,'consumed decade games no longer match draft era');
 await select('Player era',2000);assert.equal(all('.season-player-list .season-player-row').length,1,'same identity remains eligible in other unused decades');
 league={...league,used:[],pick:1,revision:2};await act(()=>app.render(renderLeague()));
 assert.equal(draftButton(manning.name,q('.season-pool')).disabled,true,'online turn authority is unchanged');
 await search('.season-pool .season-search input','');await select('Player position','QB');await select('Player era',1960);
 assert.equal(all('.season-player-list .season-player-row').length,0);previewLink(q('.season-pool'),'QB',1960);
 await clear(q('.season-pool'));await select('Sort league players','name');
 const leagueNames=names('.season-player-list .season-player-info > b');assert.deepEqual(leagueNames,[...leagueNames].sort((a,b)=>a.localeCompare(b)));assert.ok(!leagueNames.includes(favre.name));
 assert.equal(actions.length,0,'filters do not request draft/swap actions');
 assert.equal(JSON.stringify({...league,pick:0,revision:0}),beforeLeague,'only deliberate fixture turn/used changes occurred');

 // Depth rankings keep full-archive rank and ownership while applying the same controls.
 const context={name:'Filter depth',status:'active',round:1,regularRounds:16,myTeamId:'me',used:[],teams:[{id:'me',name:'My filter team',roster:[manning.id],lineup:{QB:manning.id}},{id:'other',name:'Other manager',roster:[favre.id],lineup:{}}]};
 await mount(React.createElement(DepthChart,{context,averages,scoring}));
 const fullRank=all('tbody tr').find(row=>row.textContent.includes(manning.name)).querySelector('.depth-rank').textContent;
 await select('Player era',1990);await search('input[aria-label="Search depth chart"]','Peyton');
 assert.equal(all('tbody tr').length,1);assert.equal(q('.depth-rank').textContent,fullRank);
 await select('Depth chart ownership','mine');assert.equal(all('tbody tr').length,1);
 await select('Depth chart ownership','free');assert.equal(all('tbody tr').length,0);
 await clear();assert.equal(q('select[aria-label="Depth chart ownership"]').value,'all');assert.equal(q('input[aria-label="Search depth chart"]').value,'');
 await select('Player era',1960);assert.equal(all('tbody tr').length,0);previewLink(document,'QB',1960);
 await clear();await search('input[aria-label="Search depth chart"]','Brady');
 for(const era of [2000,2010,2020]){await select('Player era',era);assert.equal(all('tbody tr').length,1);assert.match(q('tbody').textContent,/Tom Brady/);}
 await clear();await select('Player position','K');assert.equal(all('select[aria-label="Player position"] option').length,ALL_POSITIONS.length);assert.equal(all('tbody tr').length,40);

 // Preview handoff retains selected source filters and exposes no drafting action.
 await mount(React.createElement(HistoricalPreview,{initialPosition:'QB',initialEra:1960}));
 assert.equal(q('select[aria-label="Historical preview position"]').value,'QB');assert.equal(q('select[aria-label="Historical preview era"]').value,'1960');
 assert.equal(all('.preview-profile-card').length,Math.min(36,filterPreview({position:'QB',era:1960}).length));
 assert.ok(all('.preview-position').every(node=>node.textContent==='QB'));
 await click(q('.preview-profile-card'));assert.match(q('[role="dialog"]').textContent,/Preview entry · no draft action/);assert.equal(q('[role="dialog"] button.primary-button'),null);await click(button('Close'));
 assert.ok(!all('button').some(node=>/^(Draft|Add to lineup)/.test(node.textContent)));
 const page=await PreviewPage({searchParams:Promise.resolve({position:'QB',era:'1960',search:'Johnny Unitas'})});await mount(page);
 assert.equal(q('input[aria-label="Search historical preview"]').value,'Johnny Unitas');assert.equal(all('.preview-profile-card').length,filterPreview({position:'QB',era:1960,search:'Johnny Unitas'}).length);
 await mount(await PreviewPage({searchParams:Promise.resolve({position:'FLEX',era:'2020'})}));assert.equal(q('select[aria-label="Historical preview position"]').value,'ALL');assert.equal(q('select[aria-label="Historical preview era"]').value,'0');
 assert.equal(requests.filter(request=>request.method==='POST'&&request.url!=='/api/draft-preferences').length,0);
 assert.ok(!loaded.some(url=>/\/lib\/historical-data\.ts$|\/data\/nflverse\/(?:performances|games|kicker-performances)/.test(url)),'mounted filters load metadata, not raw historical records');
 assert.ok(!ATHLETES.some(a=>a.position==='QB'&&matchesPlayableEra(a,1960)),'career/profile years never become playable games');
 console.log('PASS: shared native position/era/clear controls; solo and online QB/1990/search intersection; enabled early-era empty states and filtered preview handoff; unchanged ownership, sort, legality and turn gates; used-decade exclusion; stable multi-era Brady identity/queue; depth rank/ownership; read-only source preview; metadata-only imports and no gameplay writes. DOM only; no rendered browser QA.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
