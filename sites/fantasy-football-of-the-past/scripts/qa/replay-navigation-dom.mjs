/** Isolated mounted replay navigation regression. No requests reach a real API. */
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
const scrolls=[];
window.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,options});};
const reads=[];
globalThis.fetch=async(url,options={})=>{
 assert.equal(options.method||'GET','GET','The mounted regression must never write to an API');
 assert.ok(!options.body,'No request body reaches an API');reads.push(url);
 if(url==='/api/profile')return Response.json({profile:{avatar:null,reduceMotion:true,receptionPoints:1,displayName:'Fixture owner'}});
 if(url.startsWith('/api/draft-preferences'))return Response.json({preferences:{revision:0,queue:[],timerSeconds:0}});
 if(url.includes('?rankings'))return Response.json({rankings:[]});
 throw Error('Unexpected isolated fixture read: '+url);
};
const React=await import('react');const {createRoot}=await import('react-dom/client');
const {SeasonWorkspace}=await import(pathToFileURL(root+'components/season-workspace.tsx').href);
const {newSeason,joinSeason,seasonAction,publicSeason}=await import(pathToFileURL(root+'lib/season-engine.ts').href);
window.document.body.innerHTML='<div id="root"></div>';let app=createRoot(document.getElementById('root'));
const turn=()=>new Promise(resolve=>setTimeout(resolve,30));
const act=async(fn)=>React.act(async()=>{await fn();await turn();});
const q=(selector,scope=document)=>scope.querySelector(selector),all=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const button=(text,scope=document)=>all('button',scope).find(node=>node.textContent.trim()===text);
const tab=text=>all('[role="tab"]').find(node=>node.textContent.trim()===text);
const click=async(node)=>{assert.ok(node,'Expected control exists');assert.ok(!node.disabled,'Expected control is enabled: '+node.textContent);await act(()=>{if(node.getAttribute('role')==='tab')node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));node.click();});};
const savedContract=state=>JSON.stringify({history:state.history,used:state.used,scoring:state.scoring,rosters:state.teams.map(team=>team.roster)});
function draftedFixture(){
 let state=newSeason('owner',{name:'Isolated replay navigation',teamName:'Owner',capacity:2,format:'seventeen',scoringMode:'historical',kickers:true},'REPLAY-FIXTURE');
 state=joinSeason(state,'guest','Guest');state=seasonAction(state,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:[0,1]});
 while(state.status==='draft')state=seasonAction(state,'owner',{action:'autopick'});
 return state;
}
function resolveRound(input){let state=structuredClone(input);for(const team of state.teams)state=seasonAction(state,team.userId,{action:'lock',lineup:team.lineup,acceptBye:true});return state;}
const activeOne=draftedFixture(),hiddenReview=resolveRound(activeOne);
const revealedReview=seasonAction(hiddenReview,'owner',{action:'revealReplay',round:1});
const activeTwo=seasonAction(revealedReview,'owner',{action:'next'}),reviewTwo=resolveRound(activeTwo);
const originalFixtures=JSON.stringify({activeOne,hiddenReview,revealedReview,activeTwo,reviewTwo});
let state,viewer,busy,solo,behavior,actions=[],backCalls=0;
const render=()=>app.render(React.createElement(SeasonWorkspace,{league:publicSeason(state,viewer),busy,solo,onBack:()=>{backCalls++;},onAction:async(action,extra={})=>{
 const body={action,...extra};actions.push(body);
 if(behavior)return behavior(body);
 assert.ok(['next','revealReplay'].includes(action),'Unexpected gameplay action: '+action);
 state=seasonAction(state,viewer,body);state={...state,revision:state.revision+1};render();return true;
}}));
async function mountFixture(input,options={}){
 await act(()=>app.unmount());app=createRoot(document.getElementById('root'));
 state=structuredClone(input);viewer=options.viewer||'owner';busy=options.busy||false;solo=options.solo??true;behavior=options.behavior;actions=[];backCalls=0;scrolls.length=0;
 await act(render);
}
async function openReplay(number=state.round){
 if(number===state.round)await click(q('.play-game-button'));
 else {await click(tab('Results'));await click(button('Watch Week '+number));}
 assert.ok(q(`section[aria-label="Week ${number} fantasy replay"]`));
 assert.equal(q('.replay-navigation'),null,'Navigation is offered at the final whistle');
}
async function final(){await click(button('Skip to final'));assert.ok(q('.replay-final'));assert.equal(all('.replay-navigation').length,2);assert.deepEqual(all('.replay-navigation').map(node=>node.dataset.location),['top','bottom']);}
const navigation=(location='top')=>q(`.replay-navigation[data-location="${location}"]`);
const continueButton=(location='top')=>q('button',navigation(location));
function assertUnchanged(snapshot){assert.equal(savedContract(state),snapshot,'Navigation preserves original records, consumed games, scoring and rosters');}
function assertDestination(id,label){assert.equal(document.activeElement,q('#'+id),'Navigation focuses '+id);assert.ok(scrolls.some(scroll=>scroll.id===id),'Navigation scrolls '+id);assert.equal(all('[role="tab"]').find(node=>node.getAttribute('aria-selected')==='true')?.textContent.trim(),label);}
function assertNextDisabled(){for(const nav of all('.replay-navigation')){assert.equal(button('Next week',nav)?.disabled,true);}}
const nextError='Next week could not open. Your saved replay is still available. Try again.';
try{
 // The current saved review advances exactly once and moves into the next lineup.
 await mountFixture(revealedReview);const beforeNext=savedContract(state);await openReplay();await final();
 assert.equal(continueButton().textContent,'Next week');assert.equal(continueButton().disabled,false);assert.equal(button('Open next week'),undefined,'The overview must not duplicate the replay action');
 await click(continueButton('bottom'));assert.deepEqual(actions,[{action:'next'}]);assert.equal(state.round,2);assert.equal(state.status,'active');assert.equal(q('.fantasy-replay'),null);assertDestination('season-lineup-setup','My team');assertUnchanged(beforeNext);

 // A failed action keeps the final replay available, including rejected requests.
 for(const failure of ['false','throw']){
  await mountFixture(revealedReview,{behavior:async()=>{if(failure==='throw')throw Error('Isolated next failure');return false;}});
  const before=savedContract(state);await openReplay();await final();await click(continueButton());
  assert.deepEqual(actions,[{action:'next'}]);assert.equal(state.round,1);assert.ok(q('.replay-final'));assert.equal(q('.replay-navigation-error[role="alert"]')?.textContent,nextError);assertUnchanged(before);
 }

 // A 409-style response can update authoritative state without a successful next.
 await mountFixture(revealedReview,{behavior:async(body)=>{assert.equal(body.action,'next');state=seasonAction(state,viewer,body);render();return false;}});
 const beforeConflict=savedContract(state);await openReplay();await final();await click(continueButton());
 assert.equal(state.round,2);assert.ok(q('section[aria-label="Week 1 fantasy replay"].replay-final'));assert.equal(continueButton().textContent,'Return to current week');assert.equal(q('.replay-navigation-error[role="alert"]')?.textContent,nextError);assertUnchanged(beforeConflict);assert.notEqual(document.activeElement.id,'season-lineup-setup');

 // A component-level pending guard blocks two controls before busy props arrive.
 let finishNext;await mountFixture(revealedReview,{behavior:body=>{assert.equal(body.action,'next');return new Promise(resolve=>{finishNext=()=>{state=seasonAction(state,viewer,body);render();resolve(true);};});}});
 const beforeDouble=savedContract(state);await openReplay();await final();
 await act(()=>{continueButton().click();continueButton('bottom').click();});assert.deepEqual(actions,[{action:'next'}]);assertNextDisabled();
 await act(()=>finishNext());assert.equal(state.round,2);assert.equal(q('.fantasy-replay'),null);assertDestination('season-lineup-setup','My team');assertUnchanged(beforeDouble);

 // Busy, unplayed active state and a noncommissioner never unlock Next week.
 await mountFixture(revealedReview);await openReplay();await final();busy=true;await act(render);assertNextDisabled();assert.match(q('.replay-navigation-note').textContent,/wait.*current save/i);await act(()=>continueButton().click());assert.equal(actions.length,0);
 await mountFixture({...structuredClone(revealedReview),status:'active'});await openReplay();await final();assertNextDisabled();assert.match(q('.replay-navigation-note').textContent,/Waiting for the other playing teams/);assert.equal(actions.length,0);
 const guestReview=seasonAction(hiddenReview,'guest',{action:'revealReplay',round:1});
 await mountFixture(guestReview,{viewer:'guest',solo:false});await openReplay();await final();assertNextDisabled();assert.match(navigation().textContent,/commissioner/i);assert.equal(actions.length,0);

 // Hidden receipts stay hidden through pending/failed unlock, then use new props.
 let finishReveal;await mountFixture(hiddenReview,{behavior:body=>{assert.deepEqual(body,{action:'revealReplay',round:1});return new Promise(resolve=>{finishReveal=()=>resolve(false);});}});
 const beforeReveal=savedContract(state);await openReplay();assert.equal(q('.replay-team strong'),null);assert.equal(q('.replay-player-receipt a'),null);await final();
 assert.deepEqual(actions,[{action:'revealReplay',round:1}]);assertNextDisabled();assert.equal(q('.replay-player-receipt a'),null);assert.match(q('.replay-receipt-status').textContent,/Saving completion/);
 await act(()=>finishReveal());assert.match(q('.replay-receipt-status').textContent,/Your result is safe/);assertNextDisabled();assertUnchanged(beforeReveal);
 behavior=async(body)=>{state=seasonAction(state,viewer,body);render();return true;};await click(button('Retry receipt reveal'));
 assert.deepEqual(actions,[{action:'revealReplay',round:1},{action:'revealReplay',round:1}]);assert.ok(q('.replay-player-receipt a'));assert.ok(q('.weekly-recap'));assert.equal(continueButton().disabled,false);assertUnchanged(beforeReveal);
 await mountFixture(hiddenReview,{behavior:async()=>{throw Error('Isolated receipt failure');}});await openReplay();await final();assert.match(q('.replay-receipt-status').textContent,/Your result is safe/);assertNextDisabled();assert.equal(actions.length,1);

 // Old replays always return locally to the current week and cannot advance it.
 for(const current of [activeTwo,reviewTwo]){
  await mountFixture(current);const before=savedContract(state);await openReplay(1);await final();assert.equal(continueButton().textContent,'Return to current week');assert.equal(button('Next week',navigation()),undefined);
  await click(continueButton('bottom'));assert.equal(q('.fantasy-replay'),null);assert.equal(state.round,2);assert.equal(actions.length,0);assertDestination('season-lineup-setup','My team');assertUnchanged(before);
  await openReplay(1);await click(tab('My team'));await final();q('select[aria-label="QB starter"]').focus();scrolls.length=0;
  await click(continueButton());assertDestination('season-lineup-setup','My team');assert.equal(actions.length,0);assertUnchanged(before);
 }

 // A saved locked lineup waits for managers, without exposing a playable result.
 const waiting=seasonAction(activeOne,'owner',{action:'lock',lineup:activeOne.teams.find(team=>team.userId==='owner').lineup,acceptBye:true});
 await mountFixture(waiting,{solo:false});assert.equal(q('.play-game-button').disabled,true);assert.match(q('.game-center-heading').textContent,/Waiting for/);assert.match(q('.season-readiness').textContent,/Locked/);assert.match(q('.season-readiness').textContent,/Setting starters/);assert.equal(q('.fantasy-replay'),null);assert.equal(actions.length,0);

 // First-round playoff byes and eliminated managers have explicit local routes.
 let playoff=newSeason('owner',{name:'Isolated playoff navigation',teamName:'Seed one',capacity:8,format:'seventeen',playoffTeams:6,kickers:true},'PLAYOFF-FIXTURE');
 for(let i=1;i<8;i++)playoff=joinSeason(playoff,'guest'+i,'Team '+(i+1));
 const ids=playoff.teams.map(team=>team.id);playoff={...playoff,status:'active',round:15,playoffSeeds:ids.slice(0,6),schedule:Array.from({length:14},()=>[[ids[0],ids[1]],[ids[2],ids[3]],[ids[4],ids[5]],[ids[6],ids[7]]])};
 for(const [user,expected] of [['owner',/First-round.*bye/i],['guest6',/eliminat|out.*championship|outside.*bracket/i]]){
  await mountFixture(playoff,{viewer:user});const before=savedContract(state);assert.match(q('.game-center-heading').textContent,expected);assert.equal(q('.play-game-button').disabled,true);assert.equal(q('.fantasy-replay'),null);
  await click(button('View league & playoffs'));assertDestination('season-league-overview','League');assert.equal(actions.length,0);assertUnchanged(before);
 }
 const lastRegular={...structuredClone(playoff),status:'review',round:14,playoffSeeds:[],history:[{number:14,phase:'regular',resolvedAt:playoff.createdAt,scoring:playoff.scoring,draws:{},matches:[
  {home:ids[0],away:ids[1],homeScore:100,awayScore:90,winner:ids[0]},
  {home:ids[2],away:ids[3],homeScore:80,awayScore:70,winner:ids[2]},
  {home:ids[4],away:ids[5],homeScore:60,awayScore:50,winner:ids[4]},
  {home:ids[6],away:ids[7],homeScore:40,awayScore:55,winner:ids[7]}
 ]}]};
 for(const [user,expected] of [['owner',/First-round.*bye/i],['guest6',/outside.*playoff bracket/i]]){
  const input=seasonAction({...structuredClone(lastRegular),ownerId:user},user,{action:'revealReplay',round:14});
  await mountFixture(input,{viewer:user});const before=savedContract(state);await openReplay();await final();await click(continueButton());
  assert.equal(state.round,15);assert.deepEqual(actions,[{action:'next'}]);assertDestination('season-lineup-setup','My team');assert.match(q('.season-no-match[role="status"]').textContent,expected);assertUnchanged(before);
  await click(button('View league & playoffs',q('.season-no-match')));assertDestination('season-league-overview','League');assert.equal(actions.length,1);assertUnchanged(before);
 }

 // Same-root Home also leaves a current review locally, without a gameplay action.
 await mountFixture(revealedReview);await openReplay();await final();
 const reviewHome=q('a',navigation('bottom')),beforeReviewHome=JSON.stringify(state),readsBeforeReviewHome=reads.length;
 assert.equal(reviewHome.textContent,'Return home');assert.equal(reviewHome.getAttribute('href'),'/');reviewHome.addEventListener('click',event=>event.preventDefault(),{once:true});scrolls.length=0;
 await click(reviewHome);assert.equal(q('.fantasy-replay'),null);assertDestination('season-league-overview','League');assert.equal(JSON.stringify(state),beforeReviewHome);assert.equal(reads.length,readsBeforeReviewHome);assert.equal(actions.length,0);assert.equal(backCalls,0);

 // Completion exposes saved final results; Home clears replay before root routing.
 const complete=structuredClone(revealedReview),ownId=complete.teams.find(team=>team.userId==='owner').id;
 complete.round=17;complete.status='complete';complete.playoffSeeds=complete.teams.map(team=>team.id);complete.champion=ownId;
 complete.history=[{...structuredClone(complete.history[0]),number:17,phase:'final'}];complete.replayReveals={[ownId]:[17]};
 await mountFixture(complete);const beforeComplete=savedContract(state);await openReplay();await final();assert.equal(continueButton().textContent,'View final results');assert.equal(button('Next week',navigation()),undefined);
 const homes=all('.replay-navigation a');assert.equal(homes.length,2);for(const link of homes){assert.equal(link.textContent,'Return home');assert.equal(link.getAttribute('href'),'/');}
 const beforeHome=JSON.stringify(state),readsBeforeHome=reads.length;homes[0].addEventListener('click',event=>event.preventDefault(),{once:true});scrolls.length=0;await click(homes[0]);assert.equal(JSON.stringify(state),beforeHome);assert.equal(reads.length,readsBeforeHome);assert.equal(actions.length,0);assert.equal(backCalls,0);assert.equal(q('.fantasy-replay'),null);assertDestination('season-league-overview','League');
 await openReplay();await final();assert.equal(actions.length,0,'Replaying a revealed final stays local');
 await click(continueButton('bottom'));assert.equal(q('.fantasy-replay'),null);assertDestination('season-final-results','Results');assert.equal(actions.length,0);assertUnchanged(beforeComplete);
 const completeOutside={...structuredClone(playoff),round:17,status:'complete',champion:ids[2],history:[
  {number:16,phase:'semifinal',resolvedAt:complete.createdAt,scoring:complete.scoring,draws:{},matches:[{home:ids[0],away:ids[2],homeScore:1,awayScore:2,winner:ids[2]},{home:ids[1],away:ids[3],homeScore:1,awayScore:2,winner:ids[3]}]},
  {number:17,phase:'final',resolvedAt:complete.createdAt,scoring:complete.scoring,draws:{},matches:[{home:ids[2],away:ids[3],homeScore:2,awayScore:1,winner:ids[2]}]}
 ]};
 await mountFixture(completeOutside,{viewer:'guest6'});assert.equal(q('.play-game-button').disabled,true);await click(button('View final results'));assertDestination('season-final-results','Results');assert.equal(actions.length,0);

 assert.equal(JSON.stringify({activeOne,hiddenReview,revealedReview,activeTwo,reviewTwo}),originalFixtures,'Original input fixtures remain unchanged');assert.ok(reads.length);assert.equal(backCalls,0);
 console.log('PASS: top/bottom final replay navigation; one saved next action with immutable records; false/rejected/409-style failures; double-click and busy guards; active/noncommissioner gating; pending/failed/retried receipt unlock; archived local return and repeated same-tab focus; manager waiting; playoff bye/elimination routes before and after next; completion focus; root Home links clear review/complete replays and focus League with no actions or extra reads. Mounted DOM only; isolated read-only API mocks and in-memory engine fixtures; no browser visual QA or user-state writes.');
}finally{await act(()=>app.unmount());window.happyDOM.abort();}
