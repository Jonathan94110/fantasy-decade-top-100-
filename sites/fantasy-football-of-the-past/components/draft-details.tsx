'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {scoringContractLabel} from '@/lib/scoring-rules';
import {ScoringContractSummary} from './scoring-mode-picker';
import type { Athlete } from '@/lib/game-model';
import type { DraftInsights } from '@/lib/draft-insights';

export function DraftDetails({athlete,revision,canDraft,onClose,onDraft,leagueId,actionLabel,endpoint,bye,availability}:{
 athlete:Athlete;revision:number;canDraft:boolean;onClose:()=>void;onDraft:()=>void;leagueId?:string;actionLabel?:string;endpoint?:string;bye?:string;availability?:'current'|'next'|'ready';
}){
 const [data,setData]=useState<DraftInsights|null>(null);
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`${endpoint||(leagueId?`/api/leagues/${leagueId}`:'/api/game')}?athlete=${encodeURIComponent(athlete.id)}`,{cache:'no-store',signal:controller.signal})
   .then(async r=>{const body=await r.json() as {error?:string;insights:DraftInsights};if(!r.ok)throw new Error(body.error||'Player details could not load.');return body.insights;})
   .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Player details could not load.');});
  return ()=>controller.abort();
 },[athlete.id,revision,attempt,leagueId,endpoint]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="draft-detail-modal">
  <div className="scouting-player-heading"><span className="scouting-position-mark" aria-hidden="true">{athlete.position}</span><div><span className="eyebrow">{athlete.position} · SCOUTING · LOADED ARCHIVE</span><DialogTitle>{athlete.name}</DialogTitle></div></div>
  <div className="player-eligibility"><span>Position: <b>{athlete.position}{['RB','WR','TE'].includes(athlete.position)?' · FLEX':''}</b></span><span>Verified loaded seasons: <b>{athlete.seasons[0]}–{athlete.seasons.at(-1)}</b></span></div><DialogDescription>Full-archive scouting, not a preview of your next draw. Only verified games loaded into this game are included.</DialogDescription>
  {availability&&<p className={`availability-pill availability-${availability}`}>{availability==='current'?'BYE THIS WEEK':availability==='next'?'Available · Bye next week':'Available'}</p>}{bye&&<p className="simulated-bye">{bye} · Fictional league schedule</p>}{athlete.legend&&<p className="detail-hof">Hall of Fame</p>}
  {error?<div className="detail-error" role="alert"><p>{error}</p><button className="secondary-button" onClick={()=>{setError('');setAttempt(a=>a+1);}}>Try again</button></div>:!data?<p className="scouting-loading" role="status">Loading scouting card…</p>:<>
   <ScoringContractSummary rules={data.scoring}/>
   {data.scoringSupported===false?<p className="detail-note">This kicker has {data.count} verified game records, but kickers are not enabled in this saved season’s roster or scoring rules. Start a new 11-player season to draft a kicker.</p>:data.count?<><div className="draft-stat-grid">
    <div><strong>{(data.gameAverage??data.average)!.toFixed(2)}</strong><span>loaded-game average · {scoringContractLabel(data.scoring)}</span></div>
    <div><strong>{data.low!.toFixed(2)} – {data.high!.toFixed(2)}</strong><span>worst to best loaded game</span></div>
    <div><strong>{data.count}</strong><span>verified loaded games · {data.seasons.length} seasons</span></div>
   </div><p className="detail-note">Low-score frequency: {data.lowScoreCount??0} of {data.count} loaded games ({((data.lowScoreCount??0)/data.count*100).toFixed(1)}%) scored below {data.lowScoreThreshold??5} points. Range: {(data.high!-data.low!).toFixed(2)} points. These are descriptive frequencies, not next-draw odds.</p><p className="draw-method">The loaded-game average weights every game equally. The game draws an eligible season first, then an unused game, so its expected score can differ. Full-archive equal-season average: <b>{data.average!.toFixed(2)}</b>. Neither number predicts your next draw.</p>
   <div className="season-table-scroll"><table className="season-table"><caption>Archive coverage · {data.count} loaded games</caption><thead><tr><th scope="col">Season</th><th scope="col">Games loaded</th><th scope="col">Avg {scoringContractLabel(data.scoring)}</th></tr></thead><tbody>{data.seasons.map(s=><tr key={s.year}><th scope="row">{s.year}</th><td>{s.count}</td><td>{s.average.toFixed(2)}</td></tr>)}</tbody></table></div>
   <p className="detail-note">{data.scoring.mode==='historical'?'Historical mode includes loaded regular-season games only; playoff games are excluded for every player.':'Loaded regular-season and playoff games only.'} This may not cover the entire career. Previously used games remain in these static scouting aggregates. No upcoming game or consumed-game identity is exposed.</p></>:<p>No verified games are loaded for this player.</p>}
   {canDraft&&data.scoringSupported!==false&&<button className="primary-button" disabled={data.count===0} onClick={onDraft}>{data.count===0?'Pool exhausted':actionLabel||`Add ${athlete.name} to lineup`}</button>}
  </>}
 </DialogContent></Dialog>;
}
