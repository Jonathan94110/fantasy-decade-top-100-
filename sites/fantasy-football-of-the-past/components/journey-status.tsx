'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {CloudOff,LoaderCircle,RefreshCw,ShieldCheck} from 'lucide-react';
import {accountEntryPath} from '@/lib/account-navigation';

function subscribe(change:()=>void){window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};}
export function useOffline(markStale?:(stale:boolean)=>void){
 const offline=useSyncExternalStore(subscribe,()=>navigator.onLine===false,()=>false);
 useEffect(()=>{if(!markStale)return;const interrupted=()=>markStale(true);window.addEventListener('offline',interrupted);void Promise.resolve().then(()=>{if(navigator.onLine===false)interrupted();});return()=>window.removeEventListener('offline',interrupted);},[markStale]);
 return offline;
}
export function sessionExpired(){window.dispatchEvent(new Event('fantasy:session-expired'));}
export function journeyLoginHref(){return accountEntryPath(typeof window==='undefined'?'/':window.location.pathname+window.location.search+window.location.hash);}
export function JourneyStatus({busy=false,loading=false,stale=false,error='',signin=false,pendingCheck=false,onRefresh}:{busy?:boolean;loading?:boolean;stale?:boolean;error?:string;signin?:boolean;pendingCheck?:boolean;onRefresh?:()=>void}){
 const offline=useOffline();
 if(!busy&&!loading&&!offline&&!stale&&!error&&!signin)return null;
 const note=signin?'Sign in again to continue. Your saved progress stays with your account.':offline?'You’re offline. This is the last loaded view. Reconnect and refresh before saving.':pendingCheck?'The save response was interrupted. Refresh to check the saved state before trying the action again.':stale?'Updates are interrupted. This is the last loaded view. Refresh before saving.':busy?'Saving your change. Keep this page open until the response arrives.':loading?'Opening your saved progress…':error;
 return <div className={`journey-status${signin||error||stale||offline?' needs-attention':''}`} role={error||signin?'alert':'status'} aria-live={error||signin?'assertive':'polite'} aria-atomic="true">
  <span className="journey-status-icon" aria-hidden="true">{busy||loading?<LoaderCircle size={18} className="journey-status-spinner"/>:offline||stale?<CloudOff size={18}/>:<ShieldCheck size={18}/>}</span>
  <div><p>{note}</p>{error&&error!==note&&<small>{error}</small>}</div>
  {signin?<a href={journeyLoginHref()} target="_top" className="secondary-button">Sign in again</a>:onRefresh&&!busy&&!loading&&<button type="button" className="secondary-button" disabled={offline} onClick={onRefresh}><RefreshCw size={15}/>Refresh saved progress</button>}
 </div>;
}
