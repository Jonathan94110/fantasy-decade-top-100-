import {LEGACY_SCORING,newScoring,scoringFor,withReceptionPoints,withScoringMode,type ScoringRules} from './scoring-rules';
import { athleteFor, performancePool, lineupSlots, eligibleForSlot, score, type LineupSlot, type Performance } from './historical-data';
export type Lineup = Record<string,string>;
export type Draw = {slot?:LineupSlot;athleteId:string;performance:Performance;points:number};
export type Round = {scoring?:ScoringRules;lineupVersion?:1|2|3;number:number;lineups:Lineup[];draws:Draw[][];totals:number[];lockedAt:string;winner:number|null};
export type League = {scoring?:ScoringRules;lineupVersion?:1|2|3;id:string;round:number;status:'draft'|'reveal';turn:number;lineups:Lineup[];used:string[];history:Round[];hallCap:number;wins:number[];revision:number;createdAt:string};
export function newLeague(id:string,receptionPoints:unknown=1,scoringMode:unknown='historical'):League{return {scoring:newScoring(receptionPoints,false,scoringMode),lineupVersion:2,id,round:1,status:'draft',turn:0,lineups:[{},{}],used:[],history:[],hallCap:0,wins:[0,0],revision:0,createdAt:new Date().toISOString()};}
/** The first saved lineup fixes the whole game's contract, including later rounds. */
export function updateLeagueRules(input:League,body:Record<string,unknown>):League {
 if(input.round!==1||input.turn!==0||input.status!=='draft')throw new Error('Rules are fixed once the first lineup locks.');
 if(body.receptionPoints!==undefined&&!input.scoring)throw new Error('This saved matchup keeps its original Full PPR rules.');
 let scoring=input.scoring;
 if(body.scoringMode!==undefined)scoring=withScoringMode(scoringFor(input),body.scoringMode);
 if(body.receptionPoints!==undefined)scoring=withReceptionPoints(scoringFor({scoring}),body.receptionPoints);
 return {...input,hallCap:0,...(scoring?{scoring}:{})};
}
function randomIndex(n:number){if(n<1)throw new Error('No unused performances remain.');const max=2**32;const limit=max-max%n;let r:number;do{r=crypto.getRandomValues(new Uint32Array(1))[0];}while(r>=limit);return r%n;}
export function drawPerformance(athleteId:string,used:Set<string>,rules:ScoringRules=LEGACY_SCORING){
 const eligible=performancePool(athleteId,rules).filter(p=>!used.has(p.id));
 const years=[...new Set(eligible.map(p=>p.season))];
 const year=years[randomIndex(years.length)];
 const games=eligible.filter(p=>p.season===year);const game=games[randomIndex(games.length)];used.add(game.id);return game;
}
/** Never change a round after one team has locked, or rewrite past results. */
export function normalizeLeague(input:League):League {
 if(input.lineupVersion)return input;
 return {...input,lineupVersion:input.status==='draft'&&input.turn===0?2:1};
}
export function validateLineup(lineup:Lineup,league:League){
 const slots=lineupSlots(normalizeLeague(league));
 if(!lineup||typeof lineup!=='object'||Array.isArray(lineup)||Object.keys(lineup).length!==slots.length)throw new Error(`Fill all ${slots.length} lineup slots before locking.`);
 const selected=new Set<string>();
 for(const slot of slots){
  const a=athleteFor(lineup[slot],scoringFor(league));
  if(!eligibleForSlot(a,slot))throw new Error(`Choose a valid ${slot}${slot==='FLEX'?' (RB, WR or TE)':''}.`);
  if(selected.has(a!.id))throw new Error('Choose a different athlete for every slot; FLEX cannot duplicate a starter.');
  selected.add(a!.id);
  // Shared athletes can appear in different slots across the two teams.
  const needed=league.turn===1&&Object.values(league.lineups[0]).includes(a!.id)?2:1;
  if(performancePool(a!.id,scoringFor(league)).filter(p=>!league.used.includes(p.id)).length<needed)throw new Error(`${a!.name} has no available performance for this round.`);
 }
}
export function lockLineup(input:League,lineup:Lineup,expectedTurn:number){
 if(input.status!=='draft'||input.turn!==expectedTurn)throw new Error('This lineup is already locked. Reload to see the saved round.');
 validateLineup(lineup,input);const l=structuredClone(normalizeLeague(input));l.lineups[l.turn]={...lineup};
 if(l.turn===0){l.turn=1;return l;}
 // Randomness occurs only here, after both validated lineups are locked.
 const used=new Set(l.used);const draws=l.lineups.map(team=>lineupSlots(l).map(pos=>{const a=athleteFor(team[pos],scoringFor(l))!;const performance=drawPerformance(a.id,used,scoringFor(l));return {slot:pos,athleteId:a.id,performance,points:score(performance.stats,a.position,scoringFor(l))};}));
 const totals=draws.map(d=>Math.round(d.reduce((sum,g)=>sum+g.points,0)*100)/100);const winner=totals[0]===totals[1]?null:totals[0]>totals[1]?0:1;
 const round={scoring:structuredClone(scoringFor(l)),lineupVersion:l.lineupVersion,number:l.round,lineups:l.lineups,draws,totals,lockedAt:new Date().toISOString(),winner};l.history.push(round);l.used=[...used];l.status='reveal';if(winner!==null)l.wins[winner]++;return l;
}
export function nextRound(input:League){if(input.status!=='reveal')throw new Error('Finish the current round first.');return {...structuredClone(input),lineupVersion:2 as const,round:input.round+1,status:'draft' as const,turn:0,lineups:[{},{}]};}
export function publicLeague(l:League){return {...normalizeLeague(l),lineups:l.status==='draft'?[{},{}]:l.lineups};}
