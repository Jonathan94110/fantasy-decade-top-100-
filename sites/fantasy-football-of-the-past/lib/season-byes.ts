import {ALL_ATHLETES,athletesFor,ALL_POSITIONS} from './game-model';
import {LEGACY_SCORING,scoringFor,type ScoringRules} from './scoring-rules';
import type {Season} from './season-model';
export type ByeSchedule={version:1|2|3;weeks:Record<string,number>;firstWeek:number;lastWeek:number;legacyDeferred?:boolean;repairedCrowdedWindow?:boolean;repairedRosterCollision?:boolean;repairedWeekOne?:boolean;repairedEarlyWeeks?:boolean};
export const FIRST_BYE_WEEK=5;
const MIN_BYE_WEEKS=4;
function hash(text:string){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
/** Stable athlete identities include franchise defenses. No historical schedule is consulted. */
export function assignByes(id:string,regularRounds:number,firstWeek=FIRST_BYE_WEEK,rules:ScoringRules=LEGACY_SCORING):ByeSchedule{
 firstWeek=Math.max(FIRST_BYE_WEEK,Number.isFinite(firstWeek)?Math.ceil(firstWeek):FIRST_BYE_WEEK);
 const lastWeek=regularRounds-1,weeks:Record<string,number>={};
 // Never squeeze an existing season's entire player pool into its last week(s).
 if(lastWeek-firstWeek+1<MIN_BYE_WEEKS)return {version:3,weeks,firstWeek,lastWeek,legacyDeferred:true};
 const count=lastWeek-firstWeek+1;
 for(const position of ALL_POSITIONS){
  const athletes=athletesFor(rules).filter(a=>a.position===position).sort((a,b)=>hash(`${id}:${a.id}`)-hash(`${id}:${b.id}`)||a.id.localeCompare(b.id));
  athletes.forEach((a,i)=>{weeks[a.id]=firstWeek+(i+hash(`${id}:${position}`))%count;});
 }
 return {version:3,weeks,firstWeek,lastWeek};
}
type ByeState=Pick<Season,'id'|'status'|'round'|'regularRounds'|'byes'>&Partial<Pick<Season,'teams'|'history'|'scoring'>>;
/** Only unplayed early rests move; receipts and elapsed rests never get a second bye. */
function repairEarlyWeeks<T extends ByeState>(s:T):T{
 if(!s.byes||s.status==='complete')return s;
 const recorded=new Set(s.history?.map(round=>round.number)||[]),rested=new Set<string>();
 for(const round of s.history||[]){
  const draws=[...Object.values(round.draws).flat(),...Object.values(round.benchDraws||{}).flat()];
  for(const draw of draws)if(draw.simulatedBye)rested.add(draw.athleteId);
 }
 const pending=Object.keys(s.byes.weeks).filter(id=>{
  const week=s.byes!.weeks[id];
  return week<FIRST_BYE_WEEK&&!rested.has(id)&&!recorded.has(week)
   &&(['lobby','draft'].includes(s.status)||week>s.round||week===s.round&&s.status==='active');
 });
 if(!pending.length)return s;
 // No performance is selected at a lineup lock. An unresolved early current
 // week may therefore move while every saved player selection and lock stays.
 const lastWeek=s.regularRounds-1,firstWeek=Math.max(FIRST_BYE_WEEK,s.round);
 const candidates=Array.from({length:Math.max(0,lastWeek-firstWeek+1)},(_,i)=>firstWeek+i).filter(week=>!recorded.has(week));
 const weeks={...s.byes.weeks},weekOne=pending.some(id=>weeks[id]===1);
 if(candidates.length<MIN_BYE_WEEKS){
  for(const id of pending)delete weeks[id];
  return {...s,byes:{...s.byes,weeks,firstWeek,lastWeek,legacyDeferred:true,repairedEarlyWeeks:true,...(weekOne?{repairedWeekOne:true}:{})}};
 }
 const owners=new Map<string,string[]>(),positions=new Map(ALL_ATHLETES.map(a=>[a.id,a.position]));
 for(const team of s.teams||[])for(const id of team.roster)owners.set(id,team.roster);
 pending.sort((a,b)=>Number(owners.has(b))-Number(owners.has(a))||hash(`${s.id}:early-weeks:${a}`)-hash(`${s.id}:early-weeks:${b}`)||a.localeCompare(b));
 const positionCounts=new Map<string,number>(),totals=new Map<number,number>();
 for(const [id,week] of Object.entries(weeks)){
  const key=`${positions.get(id)}:${week}`;positionCounts.set(key,(positionCounts.get(key)||0)+1);totals.set(week,(totals.get(week)||0)+1);
 }
 for(const id of pending){
  const roster=owners.get(id)||[],position=positions.get(id),start=hash(`${s.id}:early-weeks:${id}`)%candidates.length;
  const count=(week:number,samePosition=false)=>roster.filter(other=>weeks[other]===week&&(!samePosition||positions.get(other)===position)).length;
  const chosen=[...candidates].sort((a,b)=>count(a)-count(b)||count(a,true)-count(b,true)
   ||(positionCounts.get(`${position}:${a}`)||0)-(positionCounts.get(`${position}:${b}`)||0)
   ||(totals.get(a)||0)-(totals.get(b)||0)
   ||((a-firstWeek-start+candidates.length)%candidates.length)-((b-firstWeek-start+candidates.length)%candidates.length))[0];
  weeks[id]=chosen;const key=`${position}:${chosen}`;positionCounts.set(key,(positionCounts.get(key)||0)+1);totals.set(chosen,(totals.get(chosen)||0)+1);
 }
 return {...s,byes:{...s.byes,weeks,firstWeek,lastWeek,repairedEarlyWeeks:true,...(weekOne?{repairedWeekOne:true}:{})}};
}
function currentByeVersion<T extends ByeState>(s:T):T{
 if(!s.byes||s.byes.version===3&&s.byes.firstWeek>=FIRST_BYE_WEEK)return s;
 return {...s,byes:{...s.byes,version:3,firstWeek:Math.max(FIRST_BYE_WEEK,s.byes.firstWeek)}};
}
export function normalizeByes<T extends ByeState>(s:T):T{
 if(s.status==='complete'&&s.byes)return s;
 s=repairEarlyWeeks(s);
 if(s.byes){
  if(s.byes.version!==1||s.byes.legacyDeferred||['lobby','draft'].includes(s.status))return currentByeVersion(s);
  const currentFrozen=s.status!=='active'||s.teams?.some(t=>t.locked)||s.history?.some(r=>r.number===s.round);
  const firstEditable=s.round+Number(!!currentFrozen);
  const recorded=new Set(s.history?.map(r=>r.number)||[]);
  const candidateWeeks=Array.from({length:Math.max(0,s.byes.lastWeek-Math.max(FIRST_BYE_WEEK,firstEditable,s.byes.firstWeek)+1)},(_,i)=>Math.max(FIRST_BYE_WEEK,firstEditable,s.byes!.firstWeek)+i).filter(w=>!recorded.has(w));
  const crowdedWindow=s.byes.lastWeek-Math.max(FIRST_BYE_WEEK,s.byes.firstWeek)+1<MIN_BYE_WEEKS;
  const collisionTeams=(s.teams||[]).filter(t=>t.roster.length>=6&&candidateWeeks.some(w=>t.roster.filter(id=>s.byes!.weeks[id]===w).length>=t.roster.length-1));
  if(!crowdedWindow&&!collisionTeams.length)return {...s,byes:{...s.byes,version:3,firstWeek:Math.max(FIRST_BYE_WEEK,s.byes.firstWeek)}};
  const weeks={...s.byes.weeks};
  if(crowdedWindow||candidateWeeks.length<MIN_BYE_WEEKS){
   // Only affected, editable assignments are deferred. Historical and locked
   // assignments remain exactly as recorded; ordinary schedules never reroll.
   const affected=crowdedWindow?Object.keys(weeks):collisionTeams.flatMap(t=>t.roster);
   for(const id of affected)if(weeks[id]>=firstEditable&&!recorded.has(weeks[id]))delete weeks[id];
   return {...s,byes:{...s.byes,version:3,firstWeek:Math.max(FIRST_BYE_WEEK,s.byes.firstWeek),weeks,legacyDeferred:true,repairedCrowdedWindow:true}};
  }
  for(const team of collisionTeams){
   const movable=team.roster.filter(id=>candidateWeeks.includes(weeks[id])).sort((a,b)=>hash(`${s.id}:${a}`)-hash(`${s.id}:${b}`)||a.localeCompare(b));
   const limit=Math.max(2,Math.ceil(team.roster.length/candidateWeeks.length));
   for(const id of movable){
    const original=weeks[id],position=ALL_ATHLETES.find(a=>a.id===id)!.position;
    if(team.roster.filter(other=>weeks[other]===original).length<=limit)continue;
    const choices=candidateWeeks.filter(w=>team.roster.filter(other=>weeks[other]===w).length<limit);
    choices.sort((a,b)=>team.roster.filter(other=>weeks[other]===a&&ALL_ATHLETES.find(p=>p.id===other)?.position===position).length-team.roster.filter(other=>weeks[other]===b&&ALL_ATHLETES.find(p=>p.id===other)?.position===position).length||team.roster.filter(other=>weeks[other]===a).length-team.roster.filter(other=>weeks[other]===b).length||a-b);
    if(choices.length)weeks[id]=choices[0];
   }
  }
  return {...s,byes:{...s.byes,version:3,firstWeek:Math.max(FIRST_BYE_WEEK,s.byes.firstWeek),weeks,repairedRosterCollision:true}};
 }
 const firstWeek=['lobby','draft'].includes(s.status)?FIRST_BYE_WEEK:Math.max(FIRST_BYE_WEEK,s.round+1);
 return {...s,byes:assignByes(s.id,s.regularRounds,firstWeek,scoringFor(s))};
}
export function onBye(s:Pick<Season,'byes'|'round'|'regularRounds'>,id:string){return s.round>=FIRST_BYE_WEEK&&s.round<=s.regularRounds&&s.byes?.weeks[id]===s.round;}
export function byeLabel(s:{byes?:ByeSchedule;round?:number;status?:Season['status']},id:string){
 const week=s.byes?.weeks[id];if(!week)return '';
 if(s.round!==undefined&&s.round>=FIRST_BYE_WEEK&&s.status==='active'&&week===s.round)return `BYE this week · Fantasy Week ${week}`;
 const completed=s.round!==undefined&&(week<s.round||(week===s.round&&(s.status==='review'||s.status==='complete')));
 return completed?`Rest week completed: ${week}`:week>=FIRST_BYE_WEEK?`Scheduled rest week: ${week}`:'';
}

/** Draft planning only: warn without changing fixed assignments or blocking picks. */
export function crowdedByeWeeks(s:{byes?:ByeSchedule},roster:string[]){
 const counts=new Map<number,number>();for(const id of roster){const week=s.byes?.weeks[id];if(week)counts.set(week,(counts.get(week)||0)+1);}
 return [...counts].filter(([,count])=>count>=3).sort(([a],[b])=>a-b).map(([week,count])=>`Week ${week}: ${count} players`);
}

/** Display-only status. A coming rest week never makes the player unavailable now. */
export function byeStatus(s:{byes?:ByeSchedule;round?:number;regularRounds?:number;status?:Season['status']},id:string):'current'|'next'|'ready'{
 const round=s.round??1,regular=s.regularRounds??(s.byes?.lastWeek??0)+1,week=s.byes?.weeks[id];
 if(s.status==='active'&&round>=FIRST_BYE_WEEK&&round<=regular&&week===round)return 'current';
 if((s.status!=='complete'||s.round===undefined)&&round+1>=FIRST_BYE_WEEK&&round+1<=regular&&week===round+1)return 'next';
 return 'ready';
}
export function byeStatusLabel(s:Parameters<typeof byeStatus>[0],id:string){const status=byeStatus(s,id);return status==='current'?'BYE THIS WEEK':status==='next'?'Available · Bye next week':'Available';}
