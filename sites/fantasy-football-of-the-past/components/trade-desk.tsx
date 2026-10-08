'use client';
import {useState} from 'react';
import {ArrowLeftRight} from 'lucide-react';
import {ALL_ATHLETES} from '@/lib/game-model';
import {byeLabel} from '@/lib/season-byes';
import {normalizeSearch} from '@/lib/era-catalog';
import {seasonRosterSize} from '@/lib/season-model';
import type {PublicSeason} from '@/lib/season-model';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
const byId=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
const name=(id:string)=>byId.get(id)?.name||'Unknown player';
type Action=(action:string,extra?:Record<string,unknown>)=>Promise<boolean>;
export function TradeDesk({league,solo,busy,onAction,rankings}:{league:PublicSeason;solo:boolean;busy:boolean;onAction:Action;rankings:Map<string,number>}){
 const me=league.teams.find(t=>t.id===league.myTeamId)!;
 const [to,setTo]=useState(''),[give,setGive]=useState(''),[receive,setReceive]=useState(''),[search,setSearch]=useState('');
 const [review,setReview]=useState<{action:'offer'|'accept';revision:number;to:string;give:string;receive:string;tradeId?:string}|null>(null);
 const [result,setResult]=useState('');
 const other=league.teams.find(t=>t.id===to&&!t.vacant);
 const open=league.status==='active'&&!me.locked&&(league.format==='seventeen'||league.round<=league.regularRounds);
 const reason=league.status==='complete'?'The season is complete. Trading is closed.':league.status==='review'?'Open the next week to make trades. Saved results stay unchanged.':me.locked?'Your lineup is locked. Trade when the next week opens.':!open?'Trades open after the draft, during an unlocked week.':'';
 const label=(id:string)=>`${byId.get(id)?.position} · ${name(id)} · ${byeLabel(league,id)} · ${rankings.has(id)?rankings.get(id)!.toFixed(1)+' avg':'average loading'}`;
 const matching=(id:string,selected:string)=>id===selected||normalizeSearch(`${name(id)} ${byId.get(id)?.position}`).includes(normalizeSearch(search));
 async function confirm(){if(!review||review.revision!==league.revision)return;const ok=await onAction(review.action,review.action==='offer'?{to:review.to,give:review.give,receive:review.receive}:{tradeId:review.tradeId});if(ok){setResult(solo?'Offer evaluated. See the decision in your trade desk below.':review.action==='offer'?'Offer sent. The receiving manager must accept it.':'Trade accepted. Review your starters before locking.');setGive('');setReceive('');setReview(null);}}
 return <><div className="season-columns"><section className="league-panel"><h2>Make a trade</h2><p className="season-pool-note">One player for one player. Both teams keep {seasonRosterSize(league)} players and a legal lineup. Saved starters stay selected where possible.</p>{reason&&<p role="status" className="source-warning">{reason}</p>}
 <form onSubmit={e=>{e.preventDefault();setReview({action:'offer',revision:league.revision,to,give,receive});}}>
 <label>Trade with<select required value={other?to:''} disabled={!open||busy} onChange={e=>{setTo(e.target.value);setReceive('');setResult('');}}><option value="">Choose a {solo?'computer team':'manager'}</option>{league.teams.filter(t=>t.id!==me.id&&!t.vacant).map(t=><option key={t.id} value={t.id}>{t.name}{t.locked?' · Locked':''}</option>)}</select></label>
 <label>Search these rosters<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player name or position"/></label>
 <label>You give<select required value={give} disabled={!open||busy} onChange={e=>setGive(e.target.value)}><option value="">Choose your player</option>{me.roster.filter(id=>matching(id,give)).map(id=><option key={id} value={id}>{label(id)}</option>)}</select></label>
 <label>You receive<select required value={receive} disabled={!open||busy||!other||other.locked} onChange={e=>setReceive(e.target.value)}><option value="">Choose their player</option>{other?.roster.filter(id=>matching(id,receive)).map(id=><option key={id} value={id}>{label(id)}</option>)}</select></label>
 <button className="primary-button" disabled={!open||busy||!other||other.locked||!give||!receive}><ArrowLeftRight size={16}/> Review offer</button></form>
 {solo&&<p className="season-pool-note">Computer teams answer immediately. They compare full-archive historical averages, their best legal lineup and bench depth. They accept only if their roster value does not fall and your player’s average is at least 90% of theirs. They never see a future game draw.</p>}
 <p className="season-pool-note">Byes and used games follow each player. Offers expire when the week ends or player ownership changes. {league.format==='seventeen'?'Trades stay open in unlocked playoff weeks.':'Trades close for the playoffs.'}</p>
 {result&&<p role="status">{result}</p>}</section>
 <section className="league-panel"><h2>Your trade desk</h2><div className="season-offers">{league.trades.filter(o=>o.from===me.id||o.to===me.id).map(o=><article key={o.id}><span>{league.teams.find(t=>t.id===o.from)?.name} → {league.teams.find(t=>t.id===o.to)?.name} · {o.status}{o.round?` · Week ${o.round}`:''}</span><h3>{name(o.give)} <small>for</small> {name(o.receive)}</h3><p>{o.from===me.id?'You give':'You receive'} {name(o.give)} · {o.from===me.id?'You receive':'You give'} {name(o.receive)}</p>{o.reason&&<p>{o.reason}</p>}{o.status==='accepted'&&<p>Review your starters before locking your lineup.</p>}{o.status==='pending'&&<div className="season-button-row">{o.to===me.id?<><button className="primary-button" disabled={busy||!open||league.teams.find(t=>t.id===o.from)?.locked} onClick={()=>setReview({action:'accept',revision:league.revision,to:o.from,give:o.receive,receive:o.give,tradeId:o.id})}>Review & accept</button><button className="secondary-button" disabled={busy} onClick={()=>void onAction('reject',{tradeId:o.id})}>Decline</button></>:<button className="secondary-button" disabled={busy} onClick={()=>void onAction('cancel',{tradeId:o.id})}>Cancel offer</button>}</div>}</article>)}{!league.trades.some(o=>o.from===me.id||o.to===me.id)&&<p>No offers yet. Choose a team and compare your rosters to make your first trade.</p>}</div></section></div>
 <Dialog open={!!review} onOpenChange={v=>{if(!v&&!busy)setReview(null);}}><DialogContent><DialogTitle>{review?.action==='accept'?'Accept this trade?':'Send this offer?'}</DialogTitle><DialogDescription>{solo?'If the computer accepts, this exchange happens immediately.':'Both managers must approve before players change teams.'} Your saved results will not change.</DialogDescription>{review&&<><p>You give: <b>{name(review.give)}</b><br/>{label(review.give)}</p><p>You receive: <b>{name(review.receive)}</b><br/>{label(review.receive)}</p><p>Trade partner: {league.teams.find(t=>t.id===review.to)?.name}</p><p>Each player keeps their bye and remaining game pool. Check your starters after the trade.</p>{review.revision!==league.revision&&<p role="alert">The league changed. Close this review and check the current rosters before trying again.</p>}<div className="season-button-row"><button className="secondary-button" disabled={busy} onClick={()=>setReview(null)}>Go back</button><button className="primary-button" disabled={busy||review.revision!==league.revision} onClick={()=>void confirm()}>{busy?'Saving…':review.action==='accept'?'Confirm trade':solo?'Confirm & send to computer':'Confirm & send offer'}</button></div></>}</DialogContent></Dialog>
 </>;
}
