export type DraftBoardPick={number:number;round:number;teamId:string;athleteId:string};
type DraftState={status:string;pick:number;draftOrder:string[];teams:{id:string;roster:string[]}[];draftPicks?:DraftBoardPick[]};
/** A live draft's roster arrays are in exact pick order. After drafting, roster
 * changes make reconstruction unsafe; use only the persisted pick ledger then. */
export function visibleDraftPicks(s:DraftState):DraftBoardPick[]{
 if(s.draftPicks)return s.draftPicks;
 if(s.status!=='draft'||!s.draftOrder.length)return [];
 const count=s.draftOrder.length,picks:DraftBoardPick[]=[];
 for(let i=0;i<s.pick;i++){const round=Math.floor(i/count),offset=i%count,teamId=s.draftOrder[round%2?count-1-offset:offset],athleteId=s.teams.find(t=>t.id===teamId)?.roster[round];if(athleteId)picks.push({number:i+1,round:round+1,teamId,athleteId});}
 return picks;
}
