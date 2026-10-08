import {athletesFor,type Athlete,type Position} from './game-model';
import {byeStatus,byeStatusLabel,byeLabel,type ByeSchedule} from './season-byes';
import {poolAvailability} from './era-catalog';
import {LEGACY_SCORING,type ScoringRules} from './scoring-rules';
export type DepthContext={name:string;status:string;round:number;regularRounds:number;myTeamId:string;byes?:ByeSchedule;used:string[];teams:{id:string;name:string;roster:string[];lineup:Record<string,string>}[];requiredGames?:number};
export type DepthRow={athlete:Athlete;rank:number;average:number|null;ownerId:string|null;owner:string;role:string;availability:'current'|'next'|'ready'|null;availabilityLabel:string;bye:string;remaining:number;enoughGames:boolean};
/** Ownership does not remove players or alter rank. Opponent starter choices remain private. */
export function depthRows(position:Position,averages:Map<string,number>,context?:DepthContext|null,scoring:ScoringRules=LEGACY_SCORING):DepthRow[]{
 const pool=athletesFor(scoring).filter(a=>a.position===position&&a.gameCount>0).sort((a,b)=>(averages.get(b.id)??-Infinity)-(averages.get(a.id)??-Infinity)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return pool.map((athlete,index)=>{
  const owner=context?.teams.find(t=>t.roster.includes(athlete.id)),slot=owner?.id===context?.myTeamId?Object.entries(owner?.lineup||{}).find(([,id])=>id===athlete.id)?.[0]:undefined;
  const byeState=context?{byes:context.byes,round:context.round,regularRounds:context.regularRounds,status:context.status as 'active'}:null;
  const remaining=poolAvailability(athlete,context?.used||[],scoring).count;
  return {athlete,rank:index+1,average:averages.get(athlete.id)??null,ownerId:owner?.id??null,owner:owner?.name??(context?'Free agent':'No league selected'),role:!owner?'':context?.status==='draft'||context?.status==='lobby'?'Drafted':owner.id!==context?.myTeamId?'Rostered · lineup private':slot?`Starter · ${slot}`:'Bench',availability:byeState?byeStatus(byeState,athlete.id):null,availabilityLabel:byeState?byeStatusLabel(byeState,athlete.id):'League status unavailable',bye:byeState?byeLabel(byeState,athlete.id):'',remaining,enoughGames:remaining>=(context?.requiredGames??1)};
 });
}
