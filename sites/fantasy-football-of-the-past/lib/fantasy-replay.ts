import type {Performance} from './game-model';
import type {PublicSeasonRound,SeasonRound,Match} from './season-model';
export type ReplayEvent={quarter:number;teamId:string;athleteId:string|null;slot:string;delta:number;label:string;historicalGame?:string};
type HistoricalReceipt=Partial<Performance>&{sourceWeek?:number|null};
/** Describes the actual saved NFL receipt, never the fantasy league round. */
export function historicalDrawLabel(performance?:HistoricalReceipt|null){
 if(!performance)return 'Historical game unavailable';
 const year=Number.isInteger(performance.season)?`${performance.season} season`:'Season unavailable';
 const knownWeek=Number.isInteger(performance.week)&&performance.week!>0;
 const week=knownWeek?`NFL Week ${performance.week}`:'NFL week unavailable';
 // The source's game ordinal is not an NFL week. Keep both meanings explicit.
 const ordinal=!knownWeek&&Number.isInteger(performance.sourceWeek)&&performance.sourceWeek!>0?` · Source game ordinal ${performance.sourceWeek}`:'';
 const date=!knownWeek&&typeof performance.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(performance.date)?` · ${performance.date}`:'';
 return `${year} · ${week}${performance.seasonType==='POST'?' · Playoffs':''}${ordinal}${date}`;
}
export function historicalSeasonLabel(performance?:Partial<Performance>|null){return Number.isInteger(performance?.season)?`${performance!.season} season`:'Season unavailable';}
export function fullReceipt(performance?:Partial<Performance>|null):performance is Performance{return !!performance&&typeof performance.id==='string'&&performance.id.length>0&&!!performance.stats&&typeof performance.stats==='object';}
export const cents=(points:number)=>Math.round(points*100);
/** Presentation only. Never samples records or modifies the saved round. */
export function fantasyReplay(round:SeasonRound|PublicSeasonRound,match:Match):ReplayEvent[]{
 const events:ReplayEvent[]=[];
 const teams=[match.home,match.away];
 const draws=teams.flatMap(teamId=>(round.draws[teamId]||[]).map((draw,index)=>({teamId,draw,index})));
 for(let quarter=1;quarter<=4;quarter++){
  const items=draws.filter(({draw,index})=>!draw.simulatedBye&&index%2===(quarter-1)%2);
  items.sort((a,b)=>a.index-b.index||teams.indexOf(a.teamId)-teams.indexOf(b.teamId));
  for(const {teamId,draw,index} of items){const total=cents(draw.points),first=Math.trunc(total*(index%3===0?.4:.6));const delta=quarter<=2?first:total-first;
   events.push({quarter,teamId,athleteId:draw.athleteId,slot:draw.slot||'',delta,historicalGame:historicalDrawLabel(draw.performance),label:delta<0?'A setback on the fantasy scoreboard':delta===0?'A quiet stretch':'Points on the board'});
  }
 }
 // Legacy saved totals are authoritative, even if an older scoring receipt differs.
 teams.forEach((teamId,i)=>{const delta=cents(i===0?match.homeScore:match.awayScore)-events.filter(e=>e.teamId===teamId).reduce((s,e)=>s+e.delta,0);if(delta)events.push({quarter:4,teamId,athleteId:null,slot:'',delta,label:'Saved-total reconciliation'});});
 return events;
}
export function replayScore(events:ReplayEvent[],step:number,teamId:string){return events.slice(0,Math.max(0,step)).filter(e=>e.teamId===teamId).reduce((s,e)=>s+e.delta,0)/100;}
