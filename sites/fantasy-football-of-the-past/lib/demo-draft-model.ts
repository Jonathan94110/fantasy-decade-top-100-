import type {Season} from './season-model';
import {canCompleteRoster} from './roster-feasibility';
import {scoringFor,type ScoringRules} from './scoring-rules';
import {ALL_ATHLETES,athletesFor,athleteFor,POSITIONS,FLEX_POSITIONS,type LineupSlot,type Position} from './game-model';
export const DEMO_ROUNDS=6;
export const DEMO_CAPACITY=8;
export const DEMO_STRATEGIES=[
 {name:'Balanced',description:'Historical average with a small bonus for unfilled positions.'},
 {name:'Upside',description:'Historical average plus a share of the best recorded game.'},
 {name:'Steady',description:'Historical average with extra weight on the lowest recorded game.'},
 {name:'Ground game',description:'A running-back preference when the remaining roster can still be filled.'},
 {name:'Air attack',description:'A wide-receiver preference while preserving every required position.'},
 {name:'Scarcity',description:'Prefers the best available players relative to others at their position.'},
 {name:'Value',description:'Historical average with a small bonus for filling an open position.'},
] as const;
export type DemoTeam={id:string;name:string;control:'human'|'computer';strategy:number|null;roster:string[]};
export type DemoPick={number:number;round:number;teamId:string;athleteId:string;control:'human'|'computer';at:string;reason:string};
export type DemoDraft={unificationReverted?:true;orderMode?:'random'|'manual';orderRevealPending?:boolean;byes?:import('./season-byes').ByeSchedule;rosterSize?:10|11;playoffTeams?:4|6;season?:Season;scoring?:ScoringRules;id:string;revision:number;createdAt:string;status:'draft'|'complete';teams:DemoTeam[];order:string[];pick:number;picks:DemoPick[];humanTeamId:string};
const byId=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
export function demoCurrentTeam(s:DemoDraft){if(s.status==='complete')return null;const capacity=s.teams.length,round=Math.floor(s.pick/capacity),offset=s.pick%capacity;return s.order[round%2?capacity-1-offset:offset];}
export function demoLineup(roster:string[]):Partial<Record<LineupSlot,string>>{
 const lineup:Partial<Record<LineupSlot,string>>={};
 for(const id of roster){const p=byId.get(id)!.position;if(!lineup[p])lineup[p]=id;else if(!lineup.FLEX&&FLEX_POSITIONS.includes(p))lineup.FLEX=id;}
 return lineup;
}
function canFinish(roster:string[],available:typeof ALL_ATHLETES){
 if(roster.length>DEMO_ROUNDS||new Set(roster).size!==roster.length||roster.some(id=>!byId.has(id)))return false;
 const counts=Object.fromEntries(POSITIONS.map(p=>[p,roster.filter(id=>byId.get(id)!.position===p).length])) as Record<Position,number>;
 return FLEX_POSITIONS.some(flex=>{
  for(const p of POSITIONS){const need=1+Number(p===flex)-counts[p];if(need<0)return false;
   const options=available.filter(a=>a.position===p);if(options.length<need)return false;
  }
  return true;
 });
}
/** Shared client/server checks. Every accepted pick leaves legal six-starter rosters possible. */
export function demoPickReason(s:DemoDraft,teamId:string,athleteId:string){
 if(s.rosterSize!==11&&byId.get(athleteId)?.position==='K')return 'Kickers are available in new 11-player seasons only.';
 if(s.status!=='draft')return 'This draft is complete.';
 const team=s.teams.find(t=>t.id===teamId),a=athleteFor(athleteId,scoringFor(s));
 if(!team||!a||a.gameCount<1)return 'Choose a player with verified historical games.';
 if(s.teams.some(t=>t.roster.includes(athleteId)))return 'Already drafted.';
 const roster=[...team.roster,athleteId];
 const unavailable=new Set(s.teams.flatMap(t=>t.roster).concat(athleteId));
 const minimum=s.rosterSize||scoringFor(s).mode==='historical'?17:1;
 if(a.gameCount<minimum)return 'Choose a player with at least 17 verified games for the full season.';
 const available=athletesFor(scoringFor(s)).filter(a=>a.gameCount>=minimum&&!unavailable.has(a.id)&&(s.rosterSize===11||a.position!=='K'));
 if(s.rosterSize===11){const missing=s.teams.filter(t=>!(t.id===teamId?roster:t.roster).some(id=>byId.get(id)?.position==='K')).length;if(available.filter(a=>a.position==='K').length<missing)return 'Keep a kicker available for every team that still needs one.';}
 const finish=(ids:string[])=>s.rosterSize?canCompleteRoster(ids,available,s.rosterSize,0,s.rosterSize===11):canFinish(ids,available);
 if(!finish(roster))return 'Keep room for QB, RB, WR, TE, DEF and a different RB, WR or TE at FLEX.';
 if(s.teams.some(t=>t.id!==teamId&&!finish(t.roster)))return 'That pick would leave another team without a legal full roster.';
 return null;
}

export function demoRosterSize(s:DemoDraft){return s.rosterSize??6;}
