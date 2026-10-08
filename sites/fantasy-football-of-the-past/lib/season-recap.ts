import {ALL_ATHLETES} from './game-model';
import {standings} from './season-view';
import type {PublicSeason,PublicSeasonRound} from './season-model';
const athletes=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
/** Only aggregates already-revealed, saved results. Never draws or predicts a game. */
export function seasonRecap(league:PublicSeason,round:PublicSeasonRound){
 if(round.receiptsHidden)return null;
 const entries=Object.entries(round.draws).flatMap(([teamId,draws])=>draws.filter(d=>!d.simulatedBye).map(draw=>({teamId,...draw}))).sort((a,b)=>b.points-a.points||a.athleteId.localeCompare(b.athleteId));
 const prior=league.history.filter(r=>r.number<round.number&&r.phase==='regular');
 const ranked=standings({...league,history:prior});
 const upsets=prior.length?round.matches.filter(m=>m.winner&&m.homeScore!==m.awayScore).map(m=>{const loser=m.winner===m.home?m.away:m.home;const winnerStanding=ranked.find(t=>t.teamId===m.winner)!,loserStanding=ranked.find(t=>t.teamId===loser)!;const tied=winnerStanding.wins+winnerStanding.ties*.5===loserStanding.wins+loserStanding.ties*.5&&winnerStanding.points===loserStanding.points;return {match:m,gap:tied?0:ranked.findIndex(t=>t.teamId===m.winner)-ranked.findIndex(t=>t.teamId===loser)};}).filter(m=>m.gap>0).sort((a,b)=>b.gap-a.gap):[];
 const legends=entries.filter(d=>athletes.get(d.athleteId)?.legend).sort((a,b)=>a.points-b.points);
 return {topTies:entries.filter(d=>d.points===entries[0]?.points),legendTies:legends.filter(d=>d.points===legends[0]?.points),top:entries[0]??null,upset:upsets[0]??null,lowestLegend:legends[0]??null,hasPrior:prior.length>0};
}
