import {scoringFor,scoringLabel} from '@/lib/scoring-rules';
import { LockKeyhole, Trophy, Shield, Zap } from 'lucide-react';
import type { League } from '@/lib/game-engine';
export function BroadcastBoard({league,picked,total,showGames}:{league:League|null;picked:number;total:number;showGames:boolean}){
 const result=league?.status==='reveal'?league.history.at(-1):null;
 const visibleWins=(league?.wins??[0,0]).map((wins,index)=>wins-(result&&!showGames&&result.winner===index?1:0));
 return <section className={`broadcast-board broadcast-quick-board ${result&&showGames?'broadcast-result-visible':''}`} aria-label="Matchup scoreboard">
  <div className="broadcast-top"><span><Zap size={14}/> HISTORICAL FANTASY FOOTBALL</span><span>PASS & PLAY <i/> {scoringLabel(scoringFor(league)).toUpperCase()}</span></div>
  <div className="broadcast-match">
   <div className={`broadcast-team home ${league?.turn===0&&league.status==='draft'?'on-clock':''}`}><span className="team-crest" aria-hidden="true"><Shield size={40}/><b>H</b></span><div><small>HOME TEAM</small><h2>Home</h2><p>{league?.status==='reveal'?<><LockKeyhole size={12} aria-hidden="true"/> Locked</>:league?.turn===1?<><LockKeyhole size={12} aria-hidden="true"/> Locked</>:`${picked} / ${total} starters`}</p></div><strong>{result&&showGames?result.totals[0].toFixed(2):'—'}</strong></div>
   <div className="broadcast-center"><span>ROUND {league?.round??1}</span><b>{result&&showGames?<Trophy size={26}/>:<span>VS</span>}</b><small>{result&&showGames?'FINAL':result?'READY TO REVEAL':'DRAFT ROOM'}</small></div>
   <div className={`broadcast-team away ${league?.turn===1&&league.status==='draft'?'on-clock':''}`}><strong>{result&&showGames?result.totals[1].toFixed(2):'—'}</strong><div><small>AWAY TEAM</small><h2>Away</h2><p>{league?.status==='reveal'?<><LockKeyhole size={12} aria-hidden="true"/> Locked</>:league?.turn===1?`${picked} / ${total} starters`:'Up next'}</p></div><span className="team-crest" aria-hidden="true"><Shield size={40}/><b>A</b></span></div>
  </div>
  <div className="broadcast-bottom"><span>{result&&showGames?(result.winner===null?'TIE GAME':`${result.winner===0?'HOME':'AWAY'} WINS THE ROUND`):result?'Both teams locked. Time to reveal.':`${league?.turn===1?'Away':'Home'} is on the clock. Pick your six.`}</span><span>SERIES <b>{visibleWins[0]}</b><i>–</i><b>{visibleWins[1]}</b></span></div>
 </section>;
}
