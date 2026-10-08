'use client';
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import {useEffect,useState} from 'react';
import {Shield,UserCircle,ArrowUpRight} from 'lucide-react';

export function GameHeader({active}:{active:'season'|'online'|'quick'|'profile'|'legends'|'depth'}){
 const [avatar,setAvatar]=useState<string|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/profile',{cache:'no-store',signal:controller.signal}).then(async r=>{
   if(r.ok){
    const body=await r.json() as {profile:{reduceMotion:boolean;avatar:string|null}};
    document.documentElement.dataset.reduceMotion=String(body.profile.reduceMotion);
    setAvatar(body.profile.avatar);
   }
  }).catch(()=>{});
  return()=>controller.abort();
 },[]);
 return <header className="ff-header broadcast-header">
  <div className="ff-header-inner">
   <a className="ff-brand" href="/" aria-label="Fantasy Football of the Past home">
    <span className="ff-brand-icon"><Shield size={26}/><span aria-hidden="true">F</span></span>
    <span className="ff-brand-wordmark">FANTASY FOOTBALL <b>OF THE PAST</b><small>THE PAST IS IN PLAY</small></span>
   </a>
   <nav className="ff-mode-nav" aria-label="Game mode">
    <a href="/" aria-current={active==='season'?'page':undefined}>My season</a>
    <a href="/league" aria-current={active==='online'?'page':undefined}>Online leagues</a>
    <a href="/matchup" aria-current={active==='quick'?'page':undefined}>Quick matchup</a>
    <a href="/depth-chart" aria-current={active==='depth'?'page':undefined}>Depth chart</a>
    <a className="ff-profile-link" href="/profile" aria-current={active==='profile'?'page':undefined}>{avatar?<img className="header-avatar" src={avatar} alt="Your profile"/>:<UserCircle size={18}/>}<span>Profile & settings</span><ArrowUpRight size={14} aria-hidden="true"/></a>
   </nav>
   <span className="ff-private"><Shield size={12}/> Private site</span>
  </div>
 </header>;
}
