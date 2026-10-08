import {byeLabel,byeStatus,byeStatusLabel} from '@/lib/season-byes';
import type {PublicSeason} from '@/lib/season-model';
type ByeLeague=Pick<PublicSeason,'byes'|'round'|'regularRounds'|'status'>;
/** Only a current fictional absence receives a warning badge. Future rest dates are secondary. */
export function ByeAvailability({league,athleteId,confirmation=false}:{league:ByeLeague;athleteId:string;confirmation?:boolean}){
 const status=byeStatus(league,athleteId),current=status==='current',label=byeLabel(league,athleteId);
 return <div className={`free-agent-availability ${current?'on-bye':'off-bye'} availability-${status}`} aria-label="Player availability">
  <strong>{byeStatusLabel(league,athleteId)}</strong>
  {current?<span>Fantasy Week {league.round} · 0 points · Fictional rest week</span>:label?<small>{label}</small>:null}
  {confirmation&&current&&<p>This player cannot score this week. Adding them won’t change their rest week.</p>}
 </div>;
}
