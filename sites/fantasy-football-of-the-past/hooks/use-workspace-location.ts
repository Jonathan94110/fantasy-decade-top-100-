'use client';
import {useCallback,useEffect,useRef,useSyncExternalStore} from 'react';
import {journeyFetch} from '../lib/journey-fetch.ts';

const LOCATION_CHANGED='fantasy:workspace-location';
function subscribe(change:()=>void){window.addEventListener('popstate',change);window.addEventListener(LOCATION_CHANGED,change);return()=>{window.removeEventListener('popstate',change);window.removeEventListener(LOCATION_CHANGED,change);};}
function snapshot(){return window.location.search;}
export function workspaceLocation(search:string,views:readonly string[],fallback:string,scope?:string){
 const params=new URLSearchParams(search),matches=!scope||!params.get('scope')||params.get('scope')===scope;
 const candidate=matches?params.get('view'):null,raw=matches?params.get('replay'):null;
 const number=raw&&/^[1-9]\d*$/.test(raw)?Number(raw):null;
 return {view:candidate&&views.includes(candidate)?candidate:fallback,replayRound:number&&Number.isSafeInteger(number)?number:null};
}
export function workspaceUrl(current:string,patch:Record<string,string|null>){
 const url=new URL(current,'https://workspace.local');
 for(const [key,value] of Object.entries(patch)){if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);}
 return url.pathname+url.search+url.hash;
}
export function navigateWorkspace(patch:Record<string,string|null>,replace=false){
 const next=workspaceUrl(window.location.href,patch),current=window.location.pathname+window.location.search+window.location.hash;
 if(next===current)return;
 window.history[replace?'replaceState':'pushState'](window.history.state,'',next);
 window.dispatchEvent(new Event(LOCATION_CHANGED));
}
export function useLocationQuery(key:string){const search=useSyncExternalStore(subscribe,snapshot,()=> '');return new URLSearchParams(search).get(key);}
export function useWorkspaceLocation(views:readonly string[],fallback:string,scope?:string){
 const search=useSyncExternalStore(subscribe,snapshot,()=> '');
 const location=workspaceLocation(search,views,fallback,scope);
 const viewKeys=views.join('|');
 const setView=useCallback((view:string)=>{if(viewKeys.split('|').includes(view))navigateWorkspace({view,...(scope?{scope}:{})});},[viewKeys,scope]);
 const setReplayRound=useCallback((round:number|null)=>{if(round===null||Number.isSafeInteger(round)&&round>0)navigateWorkspace({replay:round===null?null:String(round),...(scope?{scope}:{})});},[scope]);
 return {...location,setView,setReplayRound};
}
/** Changing accounts unmounts a workspace and aborts its outstanding reads and writes. */
export function useScopedJourneyFetch(){
 const lifetime=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;const accountChanged=()=>controller.abort(new DOMException('Account changed.','AbortError'));window.addEventListener('fantasy:account-changed',accountChanged);return()=>{window.removeEventListener('fantasy:account-changed',accountChanged);controller.abort();};},[]);
 const scopedFetch=useCallback(async(input:RequestInfo|URL,init:RequestInit={})=>{const scope=lifetime.current?.signal,external=init.signal??(input instanceof Request?input.signal:undefined);const signal=scope&&external?AbortSignal.any([scope,external]):scope??external;const response=await journeyFetch(input,{...init,signal});if(scope?.aborted)throw scope.reason??new DOMException('Workspace changed.','AbortError');return response;},[]);
 const isActive=useCallback(()=>lifetime.current!==null&&!lifetime.current.signal.aborted,[]);
 return {fetch:scopedFetch,isActive};
}
