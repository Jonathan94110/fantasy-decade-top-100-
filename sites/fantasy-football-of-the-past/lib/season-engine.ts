import {visibleDraftPicks} from './draft-board';
import {FIRST_BYE_WEEK,assignByes,normalizeByes,onBye} from './season-byes';
import {newScoring,scoringFor,withReceptionPoints,withScoringMode,parseScoringMode,type ScoringRules} from './scoring-rules';
import {requiredGames,draftTeam,standings,currentPairs,seasonPhase} from './season-view';
export {seasonLength,requiredGames,draftTeam,standings,currentPairs} from './season-view';
import {ALL_ATHLETES,PERFORMANCES,athletesFor,athleteFor,performancePool,rosterPositions,FLEX_POSITIONS,lineupSlots,eligibleForSlot} from './historical-data';
import {drawPerformance} from './game-engine';
import {score} from './game-model';
import {seasonRosterSize,regularRoundOptions,TEAM_COUNTS,modernRegularWeeks,playoffCount,type Season,type SeasonTeam,type PublicSeason,type SeasonRound,type BenchDraw} from './season-model';

export class SeasonRuleError extends Error {}
const athleteById=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
// Preserve the saved Strict archive index; Historical pools are resolved lazily.
const strictPerformanceIdsByAthlete=new Map<string,string[]>();
for(const p of PERFORMANCES){const ids=strictPerformanceIdsByAthlete.get(p.athleteId)||[];ids.push(p.id);strictPerformanceIdsByAthlete.set(p.athleteId,ids);}
function cleanName(value:unknown,label:string){if(typeof value!=='string'||!value.trim()||value.trim().length>50)throw new SeasonRuleError(`${label} must be 1–50 characters.`);return value.trim();}
function note(s:Season,text:string){s.activity.unshift({id:crypto.randomUUID(),text,at:new Date().toISOString()});s.activity=s.activity.slice(0,80);}
function teamFor(s:Season,userId:string){const t=s.teams.find(t=>t.userId===userId);if(!t)throw new SeasonRuleError('You are not a manager in this league.');return t;}
function commissioner(s:Season,userId:string){if(s.ownerId!==userId)throw new SeasonRuleError('Only the commissioner can do that.');}
function ownedBy(s:Season,id:string){return s.teams.find(t=>t.roster.includes(id));}
export function remainingGames(s:Season,id:string){
 const used=new Set(s.used),rules=scoringFor(s);
 if(rules.mode!=='historical')return (strictPerformanceIdsByAthlete.get(id)||[]).filter(id=>!used.has(id)).length;
 const athlete=athleteFor(id,rules);if(!athlete)return 0;
 // The canonical ledger contains draws made under this fixed mode. Count complete
 // source prefixes so identities containing colons cannot consume another career.
 const prefixes=[`nflverse:${id}:`,`prime-rushmore:${id}:`];
 let consumed=0;for(const performanceId of used)if(prefixes.some(prefix=>performanceId.startsWith(prefix)))consumed++;
 return Math.max(0,athlete.gameCount-consumed);
}


function eligible(s:Season,id:string){const a=athleteFor(id,scoringFor(s));if(a?.position==='K'&&s.lineupVersion!==3)throw new SeasonRuleError('Kickers are available in new 11-player seasons only.');if(!a)throw new SeasonRuleError('Choose a playable player under this scoring mode.');if(scoringFor(s).mode==='historical'&&a.gameCount<17)throw new SeasonRuleError(`${a.name} needs at least 17 eligible career games for Historical seasons.`);if(remainingGames(s,id)<requiredGames(s))throw new SeasonRuleError(`${a.name} needs enough unused games for the remaining season.`);return a;}
function positions(roster:string[]){return new Set(roster.map(id=>athleteById.get(id)!.position));}
function validRoster(roster:string[],complete:boolean,s:Season){
 const size=seasonRosterSize(s),required=rosterPositions(s);
 if(roster.length>size||new Set(roster).size!==roster.length)throw new SeasonRuleError(`The roster must contain ${size} different players.`);
 if(roster.some(id=>!athleteFor(id,scoringFor(s))||!required.includes(athleteById.get(id)!.position)))throw new SeasonRuleError('This player is not eligible under the saved roster rules.');
 if(complete&&(roster.length!==size||required.some(p=>!positions(roster).has(p))))throw new SeasonRuleError(`Keep ${size} players and cover every starting position.`);
 for(const p of required)if(roster.filter(id=>athleteById.get(id)!.position===p).length>(p==='DEF'||p==='K'?2:3))throw new SeasonRuleError(`Roster limit: ${p==='DEF'||p==='K'?2:3} ${p} players.`);
 if(size-roster.length<required.filter(p=>!positions(roster).has(p)).length)throw new SeasonRuleError('Save enough roster room for every starting position.');
}
function reserveKickers(s:Season,teamId?:string,roster?:string[]){
 if(s.lineupVersion!==3)return true;
 const rosters=s.teams.map(t=>t.id===teamId?roster!:t.roster),owned=new Set(rosters.flat());
 return athletesFor(scoringFor(s)).filter(a=>a.position==='K'&&!owned.has(a.id)&&remainingGames(s,a.id)>=requiredGames(s)).length>=rosters.filter(r=>!r.some(id=>athleteById.get(id)?.position==='K')).length;
}
function legalLineup(s:Season,t:SeasonTeam,lineup:unknown){
 const slots=lineupSlots(s);
 if(!lineup||typeof lineup!=='object'||Array.isArray(lineup)||Object.keys(lineup).length!==slots.length)throw new SeasonRuleError(`Choose all ${slots.length} starters.`);
 const value=lineup as Record<string,string>,selected=new Set<string>();
 for(const p of slots){
  if(!t.roster.includes(value[p])||!eligibleForSlot(athleteById.get(value[p]),p))throw new SeasonRuleError(`Choose a ${p}${p==='FLEX'?' (RB, WR or TE)':''} from your own roster.`);
  if(selected.has(value[p]))throw new SeasonRuleError('Every starter must be different; FLEX cannot duplicate another slot.');
  selected.add(value[p]);if(!onBye(s,value[p])&&!remainingGames(s,value[p]))throw new SeasonRuleError('That starter has no unused performances.');
 }
 return {...value};
}
function defaultLineup(s:Season,t:SeasonTeam){return repairLineup(s,{...t,lineup:{}});}
export function repairLineup(s:Season,t:SeasonTeam,avoidByes=false,minimizeByes=false){
 // Preserve as many saved choices as possible; FLEX must use a distinct athlete.
 const slots=lineupSlots(s);let best:Record<string,string>|null=null,bestChanges=Infinity;
 function visit(index:number,lineup:Record<string,string>,changes:number){
  if(changes>=bestChanges)return;
  if(index===slots.length){best={...lineup};bestChanges=changes;return;}
  const p=slots[index],options=t.roster.filter(id=>eligibleForSlot(athleteById.get(id),p)&&!Object.values(lineup).includes(id)&&(onBye(s,id)||remainingGames(s,id)>0)&&(!avoidByes||!onBye(s,id)));
  options.sort((a,b)=>Number(b===t.lineup[p])-Number(a===t.lineup[p]));
  for(const id of options)visit(index+1,{...lineup,[p]:id},changes+Number(id!==t.lineup[p])+(minimizeByes&&onBye(s,id)?slots.length+1:0));
 }
 visit(0,{},0);
 if(!best)throw new SeasonRuleError(`This roster needs ${slots.length} distinct eligible starters with unused games. Add an eligible free agent.`);
 return legalLineup(s,t,best);
}
/** A structurally legal roster can recover from several exhausted starters one swap at a time. */
function repairAfterMove(s:Season,t:SeasonTeam){
 try{return repairLineup(s,t);}catch{
  // Still reject moves that cannot ever field a legal lineup (position coverage).
  repairLineup({...s,used:[]},t);
  const seen=new Set<string>();
  return Object.fromEntries(lineupSlots(s).map(slot=>{const id=t.lineup[slot],a=athleteById.get(id);if(!t.roster.includes(id)||!eligibleForSlot(a,slot)||!remainingGames(s,id)||seen.has(id))return [slot,''];seen.add(id);return [slot,id];}));
 }
}
/** Upgrade only unlocked rounds. Locked rounds and all historical records retain their format. */
export function normalizeSeason(input:Season):Season {
 input=normalizeByes(input);
 if(input.lineupVersion)return input;
 const s=structuredClone(input);
 s.lineupVersion=(s.status==='lobby'||s.status==='draft'||(s.status==='active'&&!s.teams.some(t=>t.locked)))?2:1;
 // A legacy draft may already contain picks that cannot support six starters.
 // Finish its original draft safely, then open roster editing with FLEX.
 if(s.status==='draft'&&!s.teams.every(t=>canFinishDraft(s,t.roster)))s.lineupVersion=1;
 if(s.lineupVersion===2&&s.status==='active')upgradeStarters(s);
 return s;
}
function upgradeStarters(s:Season){
 s.lineupVersion=2;
 const choices=s.teams.map(t=>{try{return repairLineup(s,t);}catch{return null;}});
 // Legacy playoff rosters are frozen: do not strand a saved season at its cap.
 if(s.round>s.regularRounds&&choices.some(lineup=>!lineup)){s.lineupVersion=1;return;}
 s.teams.forEach((t,i)=>{t.lineup=choices[i]||{...t.lineup,FLEX:''};});
}
function canFinishDraft(s:Season,roster:string[]){
 const rules=scoringFor(s),counts=new Map<string,number>();
 if(rules.mode==='historical'){
  // Fresh drafts use the verified career counts without decoding every CSV row.
  for(const a of athletesFor(rules))counts.set(a.id,s.used.length?remainingGames(s,a.id):a.gameCount);
 }else{
  const used=new Set(s.used);
  for(const p of PERFORMANCES)if(!used.has(p.id))counts.set(p.athleteId,(counts.get(p.athleteId)||0)+1);
 }
 const unavailable=new Set(s.teams.flatMap(t=>t.roster).concat(roster));
 let possibilities=[{picks:0,hall:0,flex:0}],room=0;
 for(const position of rosterPositions(s)){
  const existing=roster.map(id=>athleteById.get(id)!).filter(a=>a.position===position),limit=position==='DEF'||position==='K'?2:3;
  const available=athletesFor(scoringFor(s)).filter(a=>a.position===position&&!unavailable.has(a.id)&&(counts.get(a.id)||0)>=requiredGames(s)&&(scoringFor(s).mode!=='historical'||a.gameCount>=17));
  room+=Math.min(limit-existing.length,available.length);
  const choices:{picks:number;hall:number;flex:number}[]=[];
  // One starter at each base position, and two at one RB/WR/TE position for FLEX.
  for(const need of FLEX_POSITIONS.includes(position)&&s.lineupVersion!==1?[1,2]:[1])for(let hall=0;hall<=need;hall++){
   const unmarked=need-hall;
   const addPlain=Math.max(0,unmarked-existing.filter(a=>!a.legend).length);
   const addHall=Math.max(0,hall-existing.filter(a=>a.legend).length);
   if(addPlain<=available.filter(a=>!a.legend).length&&addHall<=available.filter(a=>a.legend).length&&existing.length+addPlain+addHall<=limit)choices.push({picks:addPlain+addHall,hall,flex:need-1});
  }
  possibilities=possibilities.flatMap(a=>choices.map(b=>({picks:a.picks+b.picks,hall:a.hall+b.hall,flex:a.flex+b.flex}))).filter(a=>a.picks<=seasonRosterSize(s)-roster.length&&a.flex<=1);
 }
 return room>=seasonRosterSize(s)-roster.length&&possibilities.some(a=>a.flex===(s.lineupVersion!==1?1:0));
}
export function newSeason(userId:string,input:Record<string,unknown>,inviteCode:string):Season{
 let scoring:ScoringRules;try{scoring=newScoring(input.receptionPoints??1,input.kickers===true,input.scoringMode===undefined?'historical':input.scoringMode);}catch(e){throw new SeasonRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
 if(input.receptionPoints!==undefined&&![0,.5,1].includes(input.receptionPoints as number))throw new SeasonRuleError('Choose Standard, Half PPR, or Full PPR.');
 const capacity=Number(input.capacity??8),modern=input.format==='seventeen',qualifiers=Number(input.playoffTeams??(capacity>=6?6:4)),regularRounds=Number(modern?modernRegularWeeks(capacity,qualifiers):input.regularRounds??(capacity===2?14:2*(capacity-1))),hallCap=0;
 if((modern&&capacity>=4&&(![4,6].includes(qualifiers)||qualifiers>capacity))||!TEAM_COUNTS.includes(capacity)||(!modern&&!regularRoundOptions(capacity).includes(regularRounds)))throw new SeasonRuleError('Choose valid league rules.');
 const team:SeasonTeam={id:crypto.randomUUID(),userId,name:cleanName(input.teamName,'Team name'),roster:[],lineup:{},locked:false};
 const id=crypto.randomUUID();
 return {byes:assignByes(id,regularRounds,FIRST_BYE_WEEK,scoring),...(modern?{format:'seventeen' as const,playoffTeams:qualifiers as 4|6}:{}),scoring,lineupVersion:input.kickers===true?3:2,id,name:cleanName(input.name,'League name'),ownerId:userId,inviteCode,capacity,regularRounds,hallCap,teams:[team],status:'lobby',revision:0,createdAt:new Date().toISOString(),draftOrder:[],pick:0,round:1,used:[],history:[],trades:[],schedule:[],playoffSeeds:[],champion:null,activity:[]};
}
export function joinSeason(input:Season,userId:string,name:unknown,teamId?:unknown){
 if(input.teams.some(t=>t.userId===userId))return structuredClone(input);
 if(input.removedUserIds?.includes(userId))throw new SeasonRuleError('Your membership in this league was removed.');
 if(input.status!=='lobby'){
  if(input.status==='complete')throw new SeasonRuleError('This season is complete.');
  const s=structuredClone(input),team=s.teams.find(t=>t.id===teamId&&t.vacant);
  if(!team)throw new SeasonRuleError('Choose an available existing team to take over.');
  team.userId=userId;delete team.vacant;
  if(s.replayReveals)delete s.replayReveals[team.id];
  note(s,`A new manager took over ${team.name}. Its roster and record stay unchanged.`);return s;
 }
 if(input.teams.length>=input.capacity)throw new SeasonRuleError('This league is full.');
 const s=structuredClone(input);const n=cleanName(name,'Team name');if(s.teams.some(t=>t.name.toLowerCase()===n.toLowerCase()))throw new SeasonRuleError('Choose a different team name.');
 s.teams.push({id:crypto.randomUUID(),userId,name:n,roster:[],lineup:{},locked:false});note(s,`${n} joined the league.`);return s;
}

export function schedule(order:string[],rounds:number){
 const rotation=[...order],cycle:[string,string][][]=[];
 for(let r=0;r<order.length-1;r++){const pairs:[string,string][]=[];for(let i=0;i<rotation.length/2;i++){const pair:[string,string]=[rotation[i],rotation[rotation.length-1-i]];pairs.push(r%2?pair.reverse() as [string,string]:pair);}cycle.push(pairs);rotation.splice(1,0,rotation.pop()!);}
 return Array.from({length:rounds},(_,i)=>cycle[i%cycle.length].map(([a,b])=>Math.floor(i/cycle.length)%2?[b,a] as [string,string]:[a,b] as [string,string]));
}


function expireTrades(s:Season){for(const o of s.trades)if(o.status==='pending'&&(ownedBy(s,o.give)?.id!==o.from||ownedBy(s,o.receive)?.id!==o.to))o.status='expired';}
function rosterEditable(s:Season,t:SeasonTeam){if(!['active','review'].includes(s.status)||(s.format!=='seventeen'&&s.round>s.regularRounds))throw new SeasonRuleError('Roster moves open during the regular season.');if(t.locked&&s.status==='active')throw new SeasonRuleError('This team has locked its lineup. Try again between rounds.');}
/** Trades settle only in an open week; no historical roster or draw is rewritten. */
function tradeEditable(s:Season,t:SeasonTeam){
 if(s.status!=='active'||s.history.some(r=>r.number===s.round))throw new SeasonRuleError('Open the next week before making trades. Trading is closed after the season.');
 rosterEditable(s,t);
}
export function tradePreview(s:Season,from:SeasonTeam,to:SeasonTeam,give:string,receive:string){
 tradeEditable(s,from);tradeEditable(s,to);
 if(from.id===to.id||give===receive||ownedBy(s,give)?.id!==from.id||ownedBy(s,receive)?.id!==to.id)throw new SeasonRuleError('Both players must belong to the offered teams.');
 eligible(s,give);eligible(s,receive);
 const a={...from,roster:from.roster.map(id=>id===give?receive:id)},b={...to,roster:to.roster.map(id=>id===receive?give:id)};
 validRoster(a.roster,true,s);validRoster(b.roster,true,s);
 a.lineup=repairLineup(s,a);b.lineup=repairLineup(s,b);
 return [a,b];
}
function resolve(s:Season){
 const pairs=currentPairs(s),active=new Set(pairs.flat()),used=new Set(s.used),draws:SeasonRound['draws']={};
 const playing=s.teams.filter(t=>active.has(t.id));for(const t of playing)legalLineup(s,t,t.lineup);
 for(const t of playing){draws[t.id]=lineupSlots(s).map(p=>{if(onBye(s,t.lineup[p]))return {slot:p,athleteId:t.lineup[p],simulatedBye:true as const,performance:{},points:0};const performance=drawPerformance(t.lineup[p],used,scoringFor(s));return {slot:p,athleteId:t.lineup[p],performance,points:score(performance.stats,athleteById.get(t.lineup[p])!.position,scoringFor(s))};});}
 // Resolve the frozen roster in the same transaction and ledger as its starters.
 const rosterSnapshots=Object.fromEntries(playing.map(t=>[t.id,[...t.roster]]));
 const benchDraws:Record<string,BenchDraw[]>={};
 for(const t of playing){const starters=new Set(Object.values(t.lineup));benchDraws[t.id]=rosterSnapshots[t.id].filter(id=>!starters.has(id)).map(athleteId=>{
  if(onBye(s,athleteId))return {athleteId,simulatedBye:true as const,performance:{},points:0};
  if(!(scoringFor(s).mode==='historical'?performancePool(athleteId,scoringFor(s)).some(p=>!used.has(p.id)):(strictPerformanceIdsByAthlete.get(athleteId)||[]).some(id=>!used.has(id))))return {athleteId,performance:{},points:null,unavailable:'exhausted' as const};
  const performance=drawPerformance(athleteId,used,scoringFor(s));return {athleteId,performance,points:score(performance.stats,athleteById.get(athleteId)!.position,scoringFor(s))};
 });}
 const totals=Object.fromEntries(Object.entries(draws).map(([id,d])=>[id,Math.round(d.reduce((n,g)=>n+g.points,0)*100)/100]));
 const phase=seasonPhase(s);
 const matches=pairs.map(([home,away])=>matchResult(home,away,totals[home],totals[away],phase,s.playoffSeeds));
 s.history.push({scoring:structuredClone(scoringFor(s)),lineupVersion:s.lineupVersion,number:s.round,phase,matches,draws,benchDraws,rosterSnapshots,resolvedAt:new Date().toISOString()});s.used=[...used];for(const t of s.teams)t.locked=false;
 for(const offer of s.trades)if(offer.status==='pending')offer.status='expired';
 s.status=phase==='final'?'complete':'review';if(phase==='final'){s.champion=matches[0].winner;for(const o of s.trades)if(o.status==='pending')o.status='expired';}note(s,phase==='final'?'The championship is decided.':`Round ${s.round} is on record.`);
}
export function seasonAction(input:Season,userId:string,body:Record<string,unknown>):Season{
 if(body.scoringMode!==undefined){
  if(body.action!=='rules')throw new SeasonRuleError('Scoring is fixed when the draft starts. Use the lobby scoring settings before then.');
  try{parseScoringMode(body.scoringMode);}catch(e){throw new SeasonRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
 }
 if(body.action==='removeManager'){
  const s=structuredClone(input);commissioner(s,userId);
  const target=s.teams.find(t=>t.id===body.teamId);if(!target||target.vacant)throw new SeasonRuleError('Choose a current manager.');
  if(target.userId===s.ownerId)throw new SeasonRuleError('The commissioner cannot remove their own team.');
  if(body.confirm!==true||typeof body.inviteCode!=='string')throw new SeasonRuleError('Confirm removal of this manager.');
  if(s.status==='complete')throw new SeasonRuleError('The completed season is read-only.');
  s.removedUserIds=[...new Set([...(s.removedUserIds||[]),target.userId])];
  if(s.status==='lobby'){s.teams=s.teams.filter(t=>t.id!==target.id);s.draftOrder=[];s.schedule=[];}
  else {target.userId='';target.vacant=true;for(const trade of s.trades)if(trade.status==='pending'&&(trade.from===target.id||trade.to===target.id))trade.status='expired';}
  s.inviteCode=body.inviteCode;note(s,`The commissioner removed the manager of ${target.name}.${s.status==='lobby'?' The lobby seat is open.':' The team is vacant; its roster and record are preserved.'}`);return s;
 }
 const s=structuredClone(normalizeSeason(input));if(s.status==='draft'&&!s.draftPicks)s.draftPicks=visibleDraftPicks(s);let me=teamFor(s,userId),action=body.action;
 if(action==='resizeLeague'){
  commissioner(s,userId);if(s.status!=='lobby')throw new SeasonRuleError('Team count is fixed once the draft starts.');
  const capacity=Number(body.capacity),qualifiers=Number(body.playoffTeams??(capacity>=6?6:4));
  if(!TEAM_COUNTS.includes(capacity)||capacity<s.teams.length||![4,6].includes(qualifiers)||(capacity>=4&&qualifiers>capacity))throw new SeasonRuleError('Choose an even team count from 2–16 that fits every current manager and the playoff field.');
  s.capacity=capacity;if(s.format==='seventeen'){s.playoffTeams=qualifiers as 4|6;s.regularRounds=modernRegularWeeks(capacity,qualifiers);}else s.regularRounds=regularRoundOptions(capacity)[0];
  s.byes=assignByes(s.id,s.regularRounds,FIRST_BYE_WEEK,scoringFor(s));s.draftOrder=[];s.schedule=[];note(s,`The commissioner set the lobby to ${capacity} teams.`);return s;
 }
 if(action==='caretaker'){
  commissioner(s,userId);if(s.status!=='active')throw new SeasonRuleError('Caretaker lineups are prepared in an open week.');
  const playing=currentPairs(s).flat(),vacant=s.teams.filter(t=>t.vacant&&!t.locked&&playing.includes(t.id));
  if(!vacant.length)throw new SeasonRuleError('No vacant team needs a lineup this week.');
  for(const team of vacant){try{team.lineup=repairLineup(s,team,false,true);}catch{throw new SeasonRuleError(`${team.name} cannot field a legal lineup from its roster. A replacement manager must repair it first.`);}legalLineup(s,team,team.lineup);team.locked=true;}
  note(s,'The commissioner locked caretaker lineups for vacant teams without changing their rosters.');if(s.teams.filter(t=>playing.includes(t.id)).every(t=>t.locked))resolve(s);return s;
 }
 if(action==='autopick'){
  commissioner(s,userId);if(s.status!=='draft')throw new SeasonRuleError('The draft is not open.');
  me=s.teams.find(t=>t.id===draftTeam(s))!;
  const candidates=athletesFor(scoringFor(s)).filter(a=>(s.lineupVersion===3||a.position!=='K')&&!ownedBy(s,a.id)&&remainingGames(s,a.id)>=requiredGames(s)&&(scoringFor(s).mode!=='historical'||a.gameCount>=17)).sort((a,b)=>me.roster.filter(id=>athleteById.get(id)!.position===a.position).length-me.roster.filter(id=>athleteById.get(id)!.position===b.position).length);
  const candidate=candidates.find(a=>{const roster=[...me.roster,a.id];try{validRoster(roster,roster.length===seasonRosterSize(s),s);return canFinishDraft(s,roster)&&reserveKickers(s,me.id,roster);}catch{return false;}});
  if(!candidate)throw new SeasonRuleError('There is no legal automatic pick.');
  body={...body,athleteId:candidate.id};action='draft';
  note(s,`The commissioner made an automatic pick for ${me.name}.`);
 }
 if(action==='revealReplay'){
  const number=Number(body.round),round=s.history.find(r=>r.number===number);
  if(!Number.isInteger(number)||!round)throw new SeasonRuleError('Finish and save that round before revealing its receipts.');
  // An explicit final/skip is permanent for this manager, not for other managers.
  s.replayReveals={...s.replayReveals,[me.id]:[...new Set([...(s.replayReveals?.[me.id]||[]),number])]};
 }else if(action==='rules'){
  commissioner(s,userId);if(s.status!=='lobby'||!s.scoring)throw new SeasonRuleError('Scoring is fixed once the draft starts. Saved legacy leagues keep Full PPR.');
  if(body.scoringMode!==undefined){try{s.scoring=withScoringMode(s.scoring,body.scoringMode);s.byes=assignByes(s.id,s.regularRounds,FIRST_BYE_WEEK,scoringFor(s));}catch(e){throw new SeasonRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}}
  if(body.receptionPoints!==undefined){if(![0,.5,1].includes(body.receptionPoints as number))throw new SeasonRuleError('Choose valid reception scoring.');s.scoring=withReceptionPoints(s.scoring,body.receptionPoints);}
  if(body.playoffTeams!==undefined){if(s.format!=='seventeen'||![4,6].includes(Number(body.playoffTeams))||Number(body.playoffTeams)>s.capacity)throw new SeasonRuleError('Choose a valid playoff field.');s.playoffTeams=Number(body.playoffTeams) as 4|6;s.regularRounds=modernRegularWeeks(s.capacity,s.playoffTeams);s.byes=assignByes(s.id,s.regularRounds,FIRST_BYE_WEEK,scoringFor(s));}note(s,'The commissioner updated league rules before the draft.');
 }else if(action==='startDraft'){
  commissioner(s,userId);if(s.status!=='lobby'||s.teams.length!==s.capacity)throw new SeasonRuleError('Fill every league seat before starting the draft.');
  const mode=body.orderMode??'random',indexes=body.orderIndexes;
  if(!['random','manual'].includes(String(mode))||(mode==='manual'&&(!Array.isArray(indexes)||indexes.length!==s.capacity||indexes.some(i=>!Number.isInteger(i)||i<0||i>=s.capacity)||new Set(indexes).size!==s.capacity)))throw new SeasonRuleError('Assign every team exactly one draft position.');
  s.orderMode=mode as 'random'|'manual';s.draftOrder=mode==='manual'?(indexes as number[]).map(i=>s.teams[i].id):s.teams.map(t=>t.id);if(mode==='random')for(let i=s.draftOrder.length-1;i>0;i--){const max=2**32,limit=max-max%(i+1);let random:number;do{random=crypto.getRandomValues(new Uint32Array(1))[0];}while(random>=limit);const n=random%(i+1);[s.draftOrder[i],s.draftOrder[n]]=[s.draftOrder[n],s.draftOrder[i]];}
  s.schedule=schedule(s.draftOrder,s.regularRounds);s.draftPicks=[];s.status='draft';note(s,'The snake draft started.');
 }else if(action==='draft'){
  if(s.status!=='draft'||draftTeam(s)!==me.id)throw new SeasonRuleError('Wait for your draft turn.');const id=String(body.athleteId),a=eligible(s,id);if(ownedBy(s,id))throw new SeasonRuleError('That player already belongs to another team.');
  const roster=[...me.roster,id];validRoster(roster,roster.length===seasonRosterSize(s),s);
  if(!reserveKickers(s,me.id,roster))throw new SeasonRuleError('Keep a kicker available for every team that still needs one.');
  if(!canFinishDraft(s,roster))throw new SeasonRuleError('Save enough roster room for all required positions and distinct starters.');
  me.roster=roster;if(s.teams.some(t=>!canFinishDraft(s,t.roster)))throw new SeasonRuleError('This pick would leave a team without a legal full roster. Choose another player.');s.pick++;(s.draftPicks??=[]).push({number:s.pick,round:Math.floor((s.pick-1)/s.capacity)+1,teamId:me.id,athleteId:id});note(s,`${me.name} drafted ${a.name}.`);
  if(s.pick===s.capacity*seasonRosterSize(s)){for(const t of s.teams){validRoster(t.roster,true,s);t.lineup=defaultLineup(s,t);}s.status='active';if(s.lineupVersion!==3&&s.lineupVersion!==2)upgradeStarters(s);note(s,'Rosters are set. Round 1 is open.');}
 }else if(action==='lineup'||action==='lock'){
  if(s.status!=='active'||!currentPairs(s).flat().includes(me.id)||me.locked)throw new SeasonRuleError('Your lineup is not open for editing.');me.lineup=legalLineup(s,me,body.lineup);if(action==='lock'){if(Object.values(me.lineup).some(id=>onBye(s,id))&&body.acceptBye!==true)throw new SeasonRuleError('A starter has a simulated BYE. Choose a replacement, or explicitly confirm zero points for bye starters.');me.locked=true;note(s,`${me.name} locked its starters.`);const playing=currentPairs(s).flat();if(s.teams.filter(t=>playing.includes(t.id)).every(t=>t.locked))resolve(s);}
 }else if(action==='closeRound'){
  commissioner(s,userId);if(s.status!=='active')throw new SeasonRuleError('This round is already closed.');resolve(s);
 }else if(action==='next'){
  commissioner(s,userId);if(s.status!=='review')throw new SeasonRuleError('Finish the current round first.');if(s.round===s.regularRounds)s.playoffSeeds=standings(s).slice(0,playoffCount(s)).map(t=>t.teamId);s.round++;s.status='active';const upgrading=s.lineupVersion!==3&&s.lineupVersion!==2;for(const t of s.teams)t.locked=false;if(upgrading)upgradeStarters(s);if(s.round>s.regularRounds)for(const o of s.trades)if(o.status==='pending')o.status='expired';note(s,`Round ${s.round} is open.`);
 }else if(action==='swap'){
  rosterEditable(s,me);const drop=String(body.drop),add=String(body.add),a=eligible(s,add);if(!me.roster.includes(drop)||ownedBy(s,add))throw new SeasonRuleError('Choose one of your players and an unowned free agent.');const roster=me.roster.map(id=>id===drop?add:id);validRoster(roster,true,s);me.roster=roster;me.lineup=repairAfterMove(s,me);expireTrades(s);note(s,`${me.name} added ${a.name} and dropped ${athleteById.get(drop)!.name}.`);
 }else if(action==='offer'){
  const other=s.teams.find(t=>t.id===body.to);if(!other||other.vacant||other.id===me.id)throw new SeasonRuleError('Choose another team.');
  const give=String(body.give),receive=String(body.receive);tradePreview(s,me,other,give,receive);
  if(s.trades.some(t=>t.status==='pending'&&t.from===me.id&&t.to===other.id&&t.give===give&&t.receive===receive))throw new SeasonRuleError('This offer is already pending.');
  if(s.trades.filter(t=>t.status==='pending'&&t.from===me.id).length>=10)throw new SeasonRuleError('Resolve an existing offer first.');
  s.trades.unshift({id:crypto.randomUUID(),from:me.id,to:other.id,give,receive,status:'pending',createdAt:new Date().toISOString(),round:s.round});
 }else if(action==='accept'||action==='reject'||action==='cancel'){
  const offer=s.trades.find(t=>t.id===body.tradeId);if(!offer||offer.status!=='pending')throw new SeasonRuleError('This offer is no longer pending.');
  if(action==='cancel'){if(offer.from!==me.id)throw new SeasonRuleError('Only the sender can cancel an offer.');offer.status='cancelled';}
  else{if(offer.to!==me.id)throw new SeasonRuleError('Only the receiving manager can answer this offer.');if(action==='reject')offer.status='rejected';else{
   if(offer.round!==undefined&&offer.round!==s.round)throw new SeasonRuleError('This offer expired when the week ended.');
   const from=s.teams.find(t=>t.id===offer.from)!;
   const [a,b]=tradePreview(s,from,me,offer.give,offer.receive);
   from.roster=a.roster;from.lineup=a.lineup;me.roster=b.roster;me.lineup=b.lineup;
   offer.status='accepted';expireTrades(s);note(s,`${from.name} traded ${athleteById.get(offer.give)!.name} to ${me.name} for ${athleteById.get(offer.receive)!.name}.`);
  }}
 }else if(action==='rotateInvite'){
  commissioner(s,userId);if(s.status==='complete'||typeof body.inviteCode!=='string')throw new SeasonRuleError('Invitations are closed after the season.');s.inviteCode=body.inviteCode;
 }else throw new SeasonRuleError('Unknown league action.');
 return s;
}
/** Public receipt access is presentation-scoped. Canonical draws stay server-side. */
export function publicSeason(input:Season,userId:string):PublicSeason{
 const s=normalizeSeason(input),me=teamFor(s,userId),{ownerId,inviteCode,teams,replayReveals,removedUserIds:_removedUserIds,...rest}=s;
 const revealedRounds=replayReveals?.[me.id]||[],hiddenIds=new Map<string,string>();
 const history=s.history.map(round=>{
  const receiptsHidden=!revealedRounds.includes(round.number);
  const draws=Object.fromEntries(Object.entries(round.draws).map(([teamId,draws])=>[teamId,draws.map((d,i)=>{
   if(!receiptsHidden)return structuredClone(d);
   if(d.performance?.id)hiddenIds.set(d.performance.id,`nflverse:${d.athleteId}:${d.performance.season}_reserved_${round.number}_${i}`);
   return {athleteId:d.athleteId,slot:d.slot,points:d.points,...(d.simulatedBye?{simulatedBye:true as const}:{}),performance:Number.isInteger(d.performance?.season)?{season:d.performance.season}:{}};
  })]));
  const {benchDraws,...record}=round;
  // No bench score, selected year, game ID or receipt escapes before this manager finishes.
  if(receiptsHidden)for(const [teamId,bench] of Object.entries(benchDraws||{}))for(const [i,d] of bench.entries())if(d.performance.id)hiddenIds.set(d.performance.id,`nflverse:${d.athleteId}:bench_reserved_${round.number}_${teamId}_${i}`);
  return {...record,receiptsHidden,draws,...(!receiptsHidden&&benchDraws?{benchDraws:structuredClone(benchDraws)}:{})};
 });
 return {...rest,...(s.status==='draft'?{draftPicks:visibleDraftPicks(s)}:{}),history,revealedRounds,used:s.used.map(id=>hiddenIds.get(id)||id),teams:teams.map(t=>({id:t.id,...(t.vacant?{vacant:true}:{}),name:t.name,roster:t.roster,locked:t.locked,lineup:t.id===me.id?t.lineup:{}})),trades:s.trades.filter(o=>o.status==='accepted'||o.from===me.id||o.to===me.id),myTeamId:me.id,isCommissioner:ownerId===userId,...(ownerId===userId&&s.status!=='complete'?{inviteCode}:{})};
}

export function matchResult(home:string,away:string,homeScore:number,awayScore:number,phase:SeasonRound['phase'],seeds:string[]){const tie=homeScore===awayScore;return {home,away,homeScore,awayScore,winner:tie?(phase==='regular'?null:seeds.indexOf(home)<seeds.indexOf(away)?home:away):homeScore>awayScore?home:away,...(tie&&phase!=='regular'?{tiebreak:'Higher regular-season seed'}:{})};}
