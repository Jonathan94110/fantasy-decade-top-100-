'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowDown,Bookmark,Clock3,X} from 'lucide-react';
import {ALL_ATHLETES,athleteFor,type Athlete} from '@/lib/game-model';
import {emptyPreferences,type DraftPreferences} from '@/lib/draft-preferences';
import {scoringContractLabel,newScoring,lostFumbleScoringNote,type ScoringRules} from '@/lib/scoring-rules';

export function ScoringPicker({value,onChange,disabled=false,label='Reception scoring',rules}:{value:number;onChange:(value:number)=>void;disabled?:boolean;label?:string;rules?:ScoringRules}){
 const scoring=rules??newScoring(value);
 return <><label className="scoring-picker">{label}<select aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}><option value={0}>Standard · 0 points / catch</option><option value={.5}>Half PPR · 0.5 points / catch</option><option value={1}>Full PPR · 1 point / catch</option></select></label><p className="season-pool-note">{lostFumbleScoringNote(scoring)} {!rules&&'Existing games and seasons keep their saved scoring.'}</p></>;
}
export function useDraftRankings(endpoint:string,revision:number){
 const [state,setState]=useState<{key:string;values:Map<string,number>}>({key:'',values:new Map()});
 const key=`${endpoint}:${revision}`;
 useEffect(()=>{if(!endpoint)return;const controller=new AbortController();fetch(`${endpoint}?rankings=1`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)return;const body=await r.json() as {rankings?:{athleteId:string;average:number|null}[]};if(body.rankings)setState({key,values:new Map(body.rankings.filter(r=>r.average!==null).map(r=>[r.athleteId,r.average!]))});}).catch(()=>{});return()=>controller.abort();},[endpoint,key]);
 return state.key===key?state.values:new Map<string,number>();
}
export function useDraftQueue(scope:string){
 const [state,setState]=useState<{scope:string;preferences:DraftPreferences}>({scope:'',preferences:emptyPreferences()}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState('');
 const working=useRef(false);
 const preferences=state.scope===scope?state.preferences:emptyPreferences();
 const refresh=useCallback(async(signal?:AbortSignal)=>{if(!scope)return;try{const r=await fetch(`/api/draft-preferences?scope=${encodeURIComponent(scope)}`,{cache:'no-store',signal}),body=await r.json() as {error?:string;preferences:DraftPreferences};if(!r.ok)throw new Error(body.error);if(!body.preferences||!Array.isArray(body.preferences.queue))throw new Error('Your queue response was incomplete. Reload to try again.');setState({scope,preferences:body.preferences});setLoaded(scope);setError('');}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Your queue could not load.');}},[scope]);
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>refresh(c.signal));return()=>c.abort();},[refresh]);
 async function change(action:string,extra:Record<string,unknown>){
  if(!scope||loaded!==scope||working.current)return;working.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/draft-preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,action,revision:preferences.revision,...extra})}),body=await r.json() as {error?:string;preferences:DraftPreferences};if(body.preferences&&Array.isArray(body.preferences.queue))setState({scope,preferences:body.preferences});if(!r.ok)throw new Error(body.error);if(!body.preferences)throw new Error('Your queue response was incomplete. Reload before trying again.');}
  catch(e){setError(e instanceof Error?e.message:'Your queue could not save.');}finally{working.current=false;setBusy(false);}
 }
 return {scope,preferences,error,busy:busy||loaded!==scope,refresh:()=>void refresh(),change};
}
type Queue=ReturnType<typeof useDraftQueue>;
export function QueueButton({queue,athlete}:{queue:Queue;athlete:Athlete}){
 const saved=queue.preferences.queue.includes(athlete.id);
 return <button className={`queue-toggle ${saved?'queued':''}`} disabled={queue.busy} aria-pressed={saved} aria-label={`${saved?'Remove':'Queue'} ${athlete.name}${saved?' from queue':''}`} title={saved?'Remove from queue':'Add to my queue'} onClick={()=>void queue.change('toggle',{athleteId:athlete.id})}><Bookmark size={16} fill={saved?'currentColor':'none'}/><span>{saved?'Queued':'Queue'}</span></button>;
}
export function DraftAssistant({queue,unavailable=[],onDetails,myTurn,turnKey,nextText,scoring}:{queue:Queue;unavailable?:string[];onDetails:(a:Athlete)=>void;myTurn:boolean;turnKey:string;nextText:string;scoring:ScoringRules}){
 const [clock,setClock]=useState({key:'',left:0}),seconds=queue.preferences.timerSeconds,key=`${queue.scope}:${turnKey}:${seconds}`;
 useEffect(()=>{
  if(!myTurn||!seconds)return;
  let start=Date.now();const storageKey=`ffpast:soft-clock:${key}`;
  try{const stored=Number(localStorage.getItem(storageKey));if(stored>0&&stored<=start)start=stored;else localStorage.setItem(storageKey,String(start));}catch{}
  const tick=()=>setClock({key,left:Math.max(0,seconds-Math.floor((Date.now()-start)/1000))});tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
 },[key,myTurn,seconds]);
 const left=clock.key===key?clock.left:seconds;
 return <section className={`draft-assistant ${myTurn?'draft-assistant-your-turn':''}`} aria-label="My draft tools"><div className="draft-assistant-top"><div><span className="sports-kicker">{myTurn?'YOUR TURN':nextText}</span><h3>My draft queue <span aria-label={`${queue.preferences.queue.length} queued players`}>{queue.preferences.queue.length}</span></h3></div><span className="draft-scoring-tag">{scoringContractLabel(scoring)}</span></div>
 <div className="soft-clock"><label><Clock3 size={15}/> Soft timer<select aria-label="Soft draft timer" value={seconds} disabled={queue.busy} onChange={e=>void queue.change('timer',{seconds:Number(e.target.value)})}><option value={0}>Off</option><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>2 min</option></select></label><strong>{!seconds?'No deadline':!myTurn?'Waiting':left?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Take your time'}</strong></div><p className="draft-helper-note">Human auto-pick is off. The timer is only a guide; it never chooses, locks or skips a pick.</p>
 {queue.error&&<p className="queue-error" role="alert">{queue.error} <button onClick={queue.refresh}>Reload queue</button></p>}
 <ol className="draft-queue-list">{queue.preferences.queue.map((id,index)=>{const active=athleteFor(id,scoring),a=active??ALL_ATHLETES.find(a=>a.id===id);if(!a)return null;const taken=unavailable.includes(id),modeEligible=!!active;return <li className={taken?'taken':''} key={id}><span>{index+1}</span><button className="queue-player" disabled={!modeEligible} title={modeEligible?`View ${a.name} details`:`${a.name} is unavailable under this scoring mode`} onClick={()=>onDetails(a)}><b>{a.name}</b><small>{a.position} · {!modeEligible?'Unavailable under this scoring mode':a.position==='K'&&!scoring.kicking?'New seasons only':taken?'Already selected':'Available'}</small></button><div><button disabled={queue.busy||index===0} aria-label={`Move ${a.name} up`} onClick={()=>void queue.change('move',{athleteId:id,direction:-1})}><ArrowUp size={14}/></button><button disabled={queue.busy||index===queue.preferences.queue.length-1} aria-label={`Move ${a.name} down`} onClick={()=>void queue.change('move',{athleteId:id,direction:1})}><ArrowDown size={14}/></button><button disabled={queue.busy} aria-label={`Remove ${a.name} from queue`} onClick={()=>void queue.change('toggle',{athleteId:id})}><X size={14}/></button></div></li>;})}</ol>
 {!queue.preferences.queue.length&&<p className="queue-empty"><Bookmark size={22} aria-hidden="true"/>Use Queue beside a player to build your shortlist. Your order is private and saved to your account.</p>}
 </section>;
}
