'use client';
import {useEffect,useState} from 'react';
import {GameHeader} from './game-header';
import {DepthChart} from './depth-chart';
import type {DepthContext} from '@/lib/depth-chart';
import {requiredGames} from '@/lib/season-view';
import type {PublicSeason,SeasonSummary} from '@/lib/season-model';
import type {DemoDraft} from '@/lib/demo-draft-model';
import {LEGACY_SCORING,type ScoringRules} from '@/lib/scoring-rules';
type Loaded={context:DepthContext|null;averages:Map<string,number>;scoring:ScoringRules};
export function DepthChartPage(){
 const [scope,setScope]=useState('solo'),[leagues,setLeagues]=useState<SeasonSummary[]>([]),[loaded,setLoaded]=useState<Loaded|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();fetch('/api/leagues',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(r.ok){const body=await r.json() as {leagues:SeasonSummary[]};setLeagues(body.leagues);}}).catch(()=>{});return()=>controller.abort();},[]);
 useEffect(()=>{
  const controller=new AbortController(),endpoint=scope==='solo'?'/api/depth-chart':`/api/depth-chart?league=${encodeURIComponent(scope)}`;let sequence=0;
  async function refresh(){const token=++sequence;let responseStatus=0;setLoading(true);try{const stateResponse=await fetch(endpoint,{signal:controller.signal,cache:'no-store'});responseStatus=stateResponse.status;const state=await stateResponse.json() as {league?:PublicSeason;demo?:DemoDraft;error?:string;rankings?:{athleteId:string;average:number|null}[];scoring?:ScoringRules};if(!stateResponse.ok)throw new Error(state.error||'The rankings could not load.');if(token!==sequence||controller.signal.aborted)return;
   const league=state.league,demo=state.demo;const context:DepthContext|null=league?{name:league.name,status:league.status,round:league.round,regularRounds:league.regularRounds,myTeamId:league.myTeamId,byes:league.byes,used:league.used,teams:league.teams,requiredGames:requiredGames(league)}:demo?{name:demo.teams.find(t=>t.id===demo.humanTeamId)?.name||'My draft',status:'draft',round:1,regularRounds:demo.byes?.lastWeek?demo.byes.lastWeek+1:16,myTeamId:demo.humanTeamId,byes:demo.byes,used:[],teams:demo.teams.map(t=>({...t,lineup:{}})),requiredGames:demo.rosterSize?17:1}:null;
   setLoaded({context,scoring:state.scoring??LEGACY_SCORING,averages:new Map((state.rankings||[]).filter(r=>r.average!==null).map(r=>[r.athleteId,r.average!]))});setError('');
  }catch(e){if(!controller.signal.aborted&&token===sequence){setError(e instanceof Error?e.message:'Could not load the depth chart.');if([401,403,404].includes(responseStatus))setLoaded(null);}}finally{if(!controller.signal.aborted&&token===sequence)setLoading(false);}}
  void refresh();const poll=()=>{if(document.visibilityState!=='hidden')void refresh();};const timer=setInterval(poll,8000);window.addEventListener('focus',poll);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',poll);};
 },[scope,attempt]);
 return <div className="fantasy-app online-app"><GameHeader active="depth"/><main className="league-main depth-main"><div className="league-page-heading"><span className="sports-kicker">THE WHOLE PLAYER POOL</span><h1>Depth chart</h1><p>Position rankings, ownership and weekly availability in one place.</p></div><label className="depth-context-picker">League context<select aria-label="Depth chart league" value={scope} onChange={e=>{setScope(e.target.value);setLoaded(null);setError('');setLoading(true);}}><option value="solo">My solo season / draft</option>{leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>{error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setAttempt(n=>n+1)}>Try again</button></div>}{loaded?<DepthChart key={scope} {...loaded} loading={loading}/>:loading?<p role="status">Loading every playable position…</p>:null}</main></div>;
}
