'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle2,ChevronRight,Compass,History,RefreshCw,Shield,Trophy,Users,WifiOff} from 'lucide-react';
import {GameHeader} from './game-header';
import {AccountEntry} from './account-entry';
import {useAccountSession} from './account-session';
import {journeyFetch} from '@/lib/journey-fetch';
import type {DashboardOverview,SavedProgress} from '@/lib/dashboard-model';

export function Dashboard(){
 const session=useAccountSession();
 if(session.status==='signed-out')return <AccountEntry returnTo="/"/>;
 return <div className="site-shell fantasy-app dashboard-app"><GameHeader active="dashboard"/>
  <main className="dashboard-main" id="main-content" tabIndex={-1}>
   <div className="dashboard-heading"><div><span className="sports-kicker">YOUR CLUBHOUSE</span><h1>Your next chapter<br/>starts here.</h1><p>{session.status==='authenticated'?`Welcome back, ${session.displayName||'Manager'}.`:'Welcome to Fantasy Football of the Past.'} Pick up your season or start something new.</p></div><span className="dashboard-season-stamp"><Shield size={22}/><span>THE PAST<br/><b>IS IN PLAY</b></span></span></div>
   {session.status==='loading'?<section className="dashboard-loading" role="status"><span className="spinner"/> Opening your clubhouse…</section>:<DashboardWorkspace key={session.accountKey}/>}
  </main><footer className="dashboard-footer"><span>FANTASY FOOTBALL OF THE PAST</span><span>Independent fan project · No NFL affiliation</span><a href="/profile">Account & settings</a></footer>
 </div>;
}

function DashboardWorkspace(){
 const {status,refresh:refreshSession,expireSession}=useAccountSession();
 const [overview,setOverview]=useState<DashboardOverview|null>(null),[loading,setLoading]=useState(status==='authenticated'),[issue,setIssue]=useState(''),[offline,setOffline]=useState(false),[checkedAt,setCheckedAt]=useState<string|null>(null);
 const pending=useRef(false),controller=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  if(pending.current)return;
  if(!navigator.onLine){setOffline(true);setIssue('You are offline. Reconnect, then refresh your saved progress.');return;}
  pending.current=true;setLoading(true);setIssue('');
  const request=new AbortController();controller.current=request;
  try{
   const r=await journeyFetch('/api/dashboard',{cache:'no-store',signal:request.signal});
   if(request.signal.aborted||controller.current!==request)return;
   if(r.status===401){setOverview(null);expireSession();return;}
   const body=await r.json() as {overview?:DashboardOverview;error?:string};
   if(request.signal.aborted||controller.current!==request)return;
   if(!r.ok||!body.overview)throw new Error(body.error||'Your saved progress is temporarily unavailable.');
   setOverview(body.overview);setOffline(false);setCheckedAt(new Date().toISOString());
  }catch(e){if(request.signal.aborted)return;setIssue(e instanceof Error&&e.name!=='AbortError'?e.message:'The connection was interrupted. Refresh to check your saved progress.');}
  finally{if(controller.current===request){pending.current=false;setLoading(false);}}
 },[expireSession]);
 useEffect(()=>{let mounted=true;void Promise.resolve().then(()=>{if(mounted&&status==='authenticated')void load();});return()=>{mounted=false;controller.current?.abort();pending.current=false;};},[status,load]);
 useEffect(()=>{const changed=()=>controller.current?.abort();window.addEventListener('fantasy:account-changed',changed);return()=>window.removeEventListener('fantasy:account-changed',changed);},[]);
 useEffect(()=>{
  const disconnected=()=>{setOffline(true);setIssue('You are offline. This view may be out of date. Reconnect, then refresh.');};
  const connected=()=>{setOffline(false);if(status==='authenticated')void load();};
  const focused=()=>{if(document.visibilityState==='visible'&&status==='authenticated')void load();};
  window.addEventListener('offline',disconnected);window.addEventListener('online',connected);window.addEventListener('focus',focused);
  return()=>{window.removeEventListener('offline',disconnected);window.removeEventListener('online',connected);window.removeEventListener('focus',focused);};
 },[load,status]);
 const retry=async()=>{if(status!=='authenticated')await refreshSession();else await load();};
 const problem=issue|| (status==='unavailable'?'Your account connection is temporarily unavailable. Reconnect and try again.':'');
 return <>
  <div className="dashboard-sync"><span role="status">{loading?'Checking saved progress…':checkedAt&&!problem?`Saved progress checked at ${new Date(checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`:'Your seasons are saved to your signed-in account.'}</span><button className="dashboard-refresh" onClick={()=>void retry()} disabled={loading}><RefreshCw size={15} className={loading?'dashboard-spinning':''}/> Refresh</button></div>
  {problem&&<section className="dashboard-connection" role="alert">{offline?<WifiOff size={20}/>:<RefreshCw size={20}/>}<div><strong>{offline?'Connection offline':'Saved progress needs a refresh'}</strong><p>{problem}{overview?' Your last loaded progress is shown below.':''}</p></div><button onClick={()=>void retry()} disabled={loading}>Try again</button></section>}
  {!overview?(loading?<div className="dashboard-skeleton" role="status" aria-label="Loading saved progress"><span/><span/><span/></div>:<section className="dashboard-unavailable"><Shield size={30}/><h2>We couldn’t open your progress yet.</h2><p>Refresh to check your saved seasons before starting or continuing a game.</p><button className="primary-button" onClick={()=>void retry()}>Try again <RefreshCw size={16}/></button></section>):<>
   <section className="dashboard-primary-grid" aria-label="Continue your season">
    {overview.solo?<ProgressCard progress={overview.solo} primary/>:<section className="dashboard-feature dashboard-new-season"><div className="dashboard-feature-kicker"><Shield size={17}/> THE SOLO SEASON</div><h2>Build your team.<br/>Make your history.</h2><p>Draft older and modern NFL players together, then play a 17-week season against computer managers.</p><div className="dashboard-feature-actions"><a className="primary-button" href="/demo">Set up my season <ArrowRight size={18}/></a><span>Draft once · 11 players · 7 starters</span></div><span className="dashboard-field-mark" aria-hidden="true">17</span></section>}
    <section className="dashboard-online-feature"><div className="dashboard-feature-kicker"><Users size={18}/> PLAY WITH FRIENDS</div><h2>A league of<br/>your own.</h2><p>Create a league or bring an invitation code. Each manager keeps their own team and saved progress.</p><a className="secondary-button" href="/league">{overview.leagues.length?'Open my leagues':'Create or join a league'} <ArrowRight size={17}/></a><small>Friends need Site access before they can join your league.</small></section>
   </section>
   {overview.leagues.length>0&&<section className="dashboard-leagues" aria-labelledby="dashboard-leagues-title"><div className="dashboard-section-heading"><div><span className="sports-kicker">TOGETHER THROUGH THE SEASON</span><h2 id="dashboard-leagues-title">My leagues</h2></div><a href="/league">All leagues <ChevronRight size={16}/></a></div><div className="dashboard-league-grid">{overview.leagues.map(league=><ProgressCard key={league.id} progress={league}/>)}</div></section>}
   <section className="dashboard-tools" aria-labelledby="dashboard-tools-title"><div className="dashboard-section-heading"><div><span className="sports-kicker">AROUND THE CLUBHOUSE</span><h2 id="dashboard-tools-title">Choose your next move</h2></div></div><div className="dashboard-tool-grid"><a className="dashboard-tool" href={overview.quick?.href||'/matchup'}><Trophy size={24}/><div><h3>Quick matchup</h3><p>{overview.quick?`${overview.quick.stage}. ${overview.quick.action}.`:'Two teams. One device. A head-to-head historical draw.'}</p></div><ArrowRight size={18}/></a><a className="dashboard-tool" href="/depth-chart"><Compass size={24}/><div><h3>Explore the depth chart</h3><p>Browse verified players and compare available historical games.</p></div><ArrowRight size={18}/></a><a className="dashboard-tool" href="/profile"><Shield size={24}/><div><h3>Make it your clubhouse</h3><p>Choose your manager name, profile photo and new-game preferences.</p></div><ArrowRight size={18}/></a></div></section>
   {overview.archivedSoloCount>0&&<a className="dashboard-backups" href="/demo"><History size={18}/><span>{overview.archivedSoloCount} previous {overview.archivedSoloCount===1?'season':'seasons'} backed up · Open your season to review restoration options</span><ChevronRight size={17}/></a>}
   <section className="dashboard-how"><span className="sports-kicker">THE SEASON JOURNEY</span><ol><li><b>01</b><span>Draft your roster</span></li><li><b>02</b><span>Set & lock starters</span></li><li><b>03</b><span>Watch the saved replay</span></li><li><b>04</b><span>Open the next week</span></li></ol><p><CheckCircle2 size={16}/> Your scoring rules and completed results stay with the season you saved.</p></section>
  </>}
 </>;
}
function ProgressCard({progress,primary=false}:{progress:SavedProgress;primary?:boolean}){
 return <section className={primary?'dashboard-feature dashboard-saved-season':'dashboard-league-card'}>
  <div className="dashboard-feature-kicker">{primary?<Shield size={17}/>:<Users size={17}/>} {primary?'YOUR SAVED SEASON':'ONLINE LEAGUE'}</div>
  <span className="dashboard-stage">{progress.stage}</span><h2>{progress.name}</h2><p>{progress.detail}</p>
  {primary&&<div className="dashboard-progress-facts"><span><b>{progress.rosterCount??0}/{progress.rosterSize??11}</b> roster spots</span><span><b>{progress.completedRounds}</b> saved weeks</span></div>}
  <a className={primary?'primary-button':'dashboard-card-link'} href={progress.href}>{progress.action} <ArrowRight size={17}/></a>
 </section>;
}
