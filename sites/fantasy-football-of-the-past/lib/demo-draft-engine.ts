import {FIRST_BYE_WEEK,assignByes,normalizeByes,onBye} from './season-byes';
import {modernRegularWeeks} from './season-model';
import {newScoring,scoringFor,type ScoringRules} from './scoring-rules';
import {ALL_ATHLETES,PERFORMANCES,athletesFor,performancePool,lineupSlots,eligibleForSlot} from './historical-data';
import {summarizePool} from './draft-insights';
import {DEMO_CAPACITY,demoRosterSize,DEMO_STRATEGIES,demoCurrentTeam,demoPickReason,type DemoDraft,type DemoTeam} from './demo-draft-model';
import {newSeason,seasonAction,schedule,repairLineup,publicSeason,remainingGames,tradePreview} from './season-engine';
import {TEAM_COUNTS} from './season-model';
import {currentPairs,requiredGames} from './season-view';
export class DemoRuleError extends Error {}
const byId=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
const strictPools=new Map<string,(typeof PERFORMANCES)[number][]>();
for(const p of PERFORMANCES){const pool=strictPools.get(p.athleteId)||[];pool.push(p);strictPools.set(p.athleteId,pool);}
const ratingCache=new Map<string,Map<string,ReturnType<typeof summarizePool>>>();
function ratingsFor(rules:ScoringRules){let values=ratingCache.get(JSON.stringify(rules));if(!values){values=new Map(athletesFor(rules).map(a=>[a.id,summarizePool(a.id,a.position,rules.mode==='historical'?performancePool(a.id,rules):strictPools.get(a.id)||[],rules)]));ratingCache.set(JSON.stringify(rules),values);}return values;}
function rating(team:DemoTeam,id:string,rules:ScoringRules){
 const ratings=ratingsFor(rules),a=byId.get(id)!,r=ratings.get(id)!,average=r.average??0;
 const unfilled=!team.roster.some(id=>byId.get(id)!.position===a.position);
 switch(team.strategy){
  case 1:return average*.75+(r.high??0)*.25;
  case 2:return average*.85+(r.low??0)*.15;
  case 3:return average+(a.position==='RB'?5:0)+(unfilled?1:0);
  case 4:return average+(a.position==='WR'?5:0)+(unfilled?1:0);
  case 5:return average/Math.max(1,...athletesFor(rules).filter(b=>b.position===a.position).map(b=>ratings.get(b.id)?.average??0))*25+(unfilled?2:0);
  case 6:return average+(unfilled?1:0);
  default:return average+(unfilled?2:0);
 }
}
function addPick(s:DemoDraft,team:DemoTeam,id:string){
 const reason=demoPickReason(s,team.id,id);if(reason)throw new DemoRuleError(reason);
 const a=byId.get(id)!;
 team.roster.push(id);s.pick++;
 s.picks.push({number:s.pick,round:Math.floor((s.pick-1)/s.teams.length)+1,teamId:team.id,athleteId:id,control:team.control,at:new Date().toISOString(),reason:team.control==='human'?'Your selection':`${DEMO_STRATEGIES[team.strategy!].name}: ${DEMO_STRATEGIES[team.strategy!].description} ${a.position} fits the remaining roster.`});
 if(s.pick===s.teams.length*demoRosterSize(s))s.status='complete';
}
function runComputers(s:DemoDraft){
 while(s.status==='draft'){
  const team=s.teams.find(t=>t.id===demoCurrentTeam(s))!;if(team.control==='human')break;
  const options=athletesFor(scoringFor(s)).filter(a=>a.gameCount>0&&!s.teams.some(t=>t.roster.includes(a.id))).sort((a,b)=>rating(team,b.id,scoringFor(s))-rating(team,a.id,scoringFor(s))||a.id.localeCompare(b.id));
  const chosen=options.find(a=>!demoPickReason(s,team.id,a.id));if(!chosen)throw new DemoRuleError('The computer teams could not find a legal pick. Your saved draft has not changed.');
  addPick(s,team,chosen.id);
 }
 return s;
}
export function newDemoDraft(teamName:unknown,receptionPoints:unknown=1,options:{modern?:boolean;capacity?:unknown;names?:unknown;playoffTeams?:unknown;orderMode?:unknown;orderIndexes?:unknown;opening?:boolean;kickers?:boolean;scoringMode?:unknown}={}):DemoDraft{
 let scoring:ScoringRules;try{scoring=newScoring(receptionPoints,options.kickers===true,options.scoringMode===undefined?'historical':options.scoringMode);}catch(e){throw new DemoRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
 if(![0,.5,1].includes(receptionPoints as number))throw new DemoRuleError('Choose Standard, Half PPR, or Full PPR.');
 if(typeof teamName!=='string'||!teamName.trim()||teamName.trim().length>50)throw new DemoRuleError('Use 1–50 characters for your team name.');
 const capacity=options.modern?Number(options.capacity??8):DEMO_CAPACITY,qualifiers=Number(options.playoffTeams??(capacity>=6?6:4));
 if(!TEAM_COUNTS.includes(capacity)||(![4,6].includes(qualifiers))||(capacity>=4&&qualifiers>capacity))throw new DemoRuleError('Choose a supported league size and four or six playoff teams.');
 const names=options.names===undefined?Array.from({length:capacity-1},(_,i)=>`Computer ${i+1}`):options.names;
 if(!Array.isArray(names)||names.length!==capacity-1||names.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>50))throw new DemoRuleError('Give each computer team a name of 1–50 characters.');
 if(new Set([...names,teamName].map(n=>String(n).trim().toLowerCase())).size!==capacity)throw new DemoRuleError('Use a different name for every team.');
 const teams:DemoTeam[]=Array.from({length:capacity-1},(_,i)=>({id:crypto.randomUUID(),name:options.modern?String(names[i]).trim():`Computer ${i+1} · ${DEMO_STRATEGIES[i].name}`,control:'computer',strategy:i%7,roster:[]}));
 const human:DemoTeam={id:crypto.randomUUID(),name:teamName.trim(),control:'human',strategy:null,roster:[]};teams.push(human);
 const mode=options.orderMode??'random';if(!['random','manual'].includes(String(mode)))throw new DemoRuleError('Choose Random lottery or Set the order.');
 const indexes=options.orderIndexes;
 if(mode==='manual'&&(!Array.isArray(indexes)||indexes.length!==capacity||indexes.some(i=>!Number.isInteger(i)||i<0||i>=capacity)||new Set(indexes).size!==capacity))throw new DemoRuleError('Give every team exactly one draft position.');
 const setupTeams=[human,...teams.filter(t=>t.control==='computer')];
 const order=mode==='manual'?(indexes as number[]).map(i=>setupTeams[i].id):teams.map(t=>t.id);if(options.modern&&mode==='random')for(let i=order.length-1;i>0;i--){const max=2**32,limit=max-max%(i+1);let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%(i+1);[order[i],order[j]]=[order[j],order[i]];}
 const id=crypto.randomUUID();
 const draft:DemoDraft={orderMode:mode as 'random'|'manual',...(options.opening?{orderRevealPending:true}:{}),byes:assignByes(id,modernRegularWeeks(capacity,qualifiers),FIRST_BYE_WEEK,scoring),...options.modern?{rosterSize:options.kickers?11 as const:10 as const,playoffTeams:qualifiers as 4|6}:{},scoring,id,revision:0,createdAt:new Date().toISOString(),status:'draft',teams,order,pick:0,picks:[],humanTeamId:human.id};
 return options.opening?draft:runComputers(draft);
}
function readyComputer(input:NonNullable<DemoDraft['season']>,teamId:string){
 let season=normalizeByes(input);
 for(let attempt=0;attempt<=10;attempt++){
  const team=season.teams.find(t=>t.id===teamId)!;
  try{return {season,lineup:repairLineup(season,team,true)};}catch{
   const exhausted=team.roster.filter(id=>remainingGames(season,id)===0||onBye(season,id));
   let replacement:typeof season|undefined;
   for(const drop of exhausted){
    const options=athletesFor(scoringFor(season)).filter(a=>a.position===byId.get(drop)!.position&&!onBye(season,a.id)&&!season.teams.some(t=>t.roster.includes(a.id))&&remainingGames(season,a.id)>=requiredGames(season)&&(scoringFor(season).mode!=='historical'||a.gameCount>=17));
    for(const add of options){try{replacement=seasonAction(season,teamId,{action:'swap',drop,add:add.id});break;}catch{}}
    if(replacement)break;
   }
   if(!replacement)return {season,lineup:repairLineup(season,team)};
   season=replacement;
  }
 }
 throw new DemoRuleError('The computer roster needs attention. No result was saved.');
}
/** Public full-archive averages only: no remaining-game scores or future draws. */
export function cpuTradeDecision(season:NonNullable<DemoDraft['season']>,teamId:string,give:string,receive:string){
 const team=season.teams.find(t=>t.id===teamId)!;
 const ratings=ratingsFor(scoringFor(season));
 const value=(id:string)=>ratings.get(id)?.average??0;
 function rosterValue(roster:string[]){
  let best=-Infinity;
  function visit(i:number,selected:string[],total:number){
   const slots=lineupSlots(season);
   if(i===slots.length){best=Math.max(best,total+roster.filter(id=>!selected.includes(id)).reduce((n,id)=>n+value(id)*.25,0));return;}
   for(const id of roster)if(!selected.includes(id)&&eligibleForSlot(byId.get(id),slots[i]))visit(i+1,[...selected,id],total+value(id));
  }
  visit(0,[],0);return best;
 }
 const before=rosterValue(team.roster),after=rosterValue(team.roster.map(id=>id===receive?give:id));
 const fair=value(give)+.001>=value(receive)*.9,improves=after+.001>=before;
 return {accepted:fair&&improves,reason:fair&&improves?'Accepted: this keeps or improves our best legal lineup and bench value.':!fair?'Declined: your offered player’s historical average is below 90% of the requested player’s.':'Declined: this would reduce our best legal lineup and bench value.'};
}
function normalizeDemoByes(s:DemoDraft):DemoDraft{
 if(s.season){const normalized=normalizeByes(s.season),season={...normalized,draftPicks:normalized.draftPicks??s.picks.map(({number,round,teamId,athleteId})=>({number,round,teamId,athleteId}))};return {...s,season,byes:season.byes};}
 const byes=normalizeByes({id:s.id,status:'draft' as const,round:1,regularRounds:modernRegularWeeks(s.teams.length,s.playoffTeams),byes:s.byes,scoring:s.scoring,teams:s.teams.map(t=>({...t,userId:t.id,lineup:{},locked:false})),history:[]}).byes;
 return {...s,byes};
}
export function demoDraftAction(input:DemoDraft,body:Record<string,unknown>){
 if(body.scoringMode!==undefined)throw new DemoRuleError('Scoring is fixed when your saved draft starts. Choose a mode when creating a new season.');
 const s=normalizeDemoByes(structuredClone(input));
 if(body.action==='beginDraft'){
  if(!s.orderRevealPending)return s;
  if(s.pick!==0||s.picks.length||s.season)throw new DemoRuleError('This draft has already started.');
  s.orderRevealPending=false;return runComputers(s);
 }
 if(s.orderRevealPending)throw new DemoRuleError('Finish the saved draft-order reveal, then enter the draft room.');
 if(!s.byes&&!s.season)s.byes=assignByes(s.id,modernRegularWeeks(s.teams.length,s.playoffTeams),FIRST_BYE_WEEK,scoringFor(s));
 if(body.action==='completeBench'){
  if(s.season||s.status!=='complete'||s.rosterSize)throw new DemoRuleError('Your saved bench draft is already open or complete.');
  s.rosterSize=10;s.playoffTeams=body.playoffTeams===4?4:6;s.byes=assignByes(s.id,modernRegularWeeks(s.teams.length,s.playoffTeams),FIRST_BYE_WEEK,scoringFor(s));s.status='draft';return runComputers(s);
 }
 if(body.action==='startSeason'){
  if(s.season)return s;
  if(s.status!=='complete'||![10,11].includes(s.rosterSize??0))throw new DemoRuleError(s.rosterSize===11?'Complete all eleven roster picks first.':'Complete all ten roster picks first.');
  const human=s.teams.find(t=>t.id===s.humanTeamId)!;
  const league=newSeason(human.id,{name:`${human.name}’s season`,teamName:human.name,capacity:s.teams.length,format:'seventeen',playoffTeams:s.playoffTeams,receptionPoints:scoringFor(s).receptionPoints,kickers:s.rosterSize===11,scoringMode:scoringFor(s).mode},'SOLO');
  league.scoring=structuredClone(scoringFor(s));
  league.id=s.id;league.byes=s.byes||assignByes(s.id,league.regularRounds,FIRST_BYE_WEEK,scoringFor(s));league.teams=s.teams.map(t=>({id:t.id,userId:t.id,name:t.name,roster:[...t.roster],lineup:{},locked:false}));
  league.draftOrder=[...s.order];league.draftPicks=s.picks.map(({number,round,teamId,athleteId})=>({number,round,teamId,athleteId}));league.schedule=schedule(s.order,league.regularRounds);league.pick=s.pick;league.status='active';
  for(const t of league.teams)t.lineup=repairLineup(league,t);
  s.season=league;return s;
 }
 if(s.season){
  const action=String(body.action);if(!['lineup','lock','swap','next','simulate','revealReplay','offer','cancel'].includes(action))throw new DemoRuleError('Choose a supported season action.');
  if(action==='offer'){
   const target=s.teams.find(t=>t.id===body.to&&t.control==='computer');if(!target)throw new DemoRuleError('Choose a computer team.');
   const human=s.season.teams.find(t=>t.id===s.humanTeamId)!,other=s.season.teams.find(t=>t.id===target.id)!;
   tradePreview(s.season,human,other,String(body.give),String(body.receive));
   const decision=cpuTradeDecision(s.season,other.id,String(body.give),String(body.receive));
   s.season=seasonAction(s.season,s.humanTeamId,body);
   const offer=s.season.trades[0];
   s.season=seasonAction(s.season,other.userId,{action:decision.accepted?'accept':'reject',tradeId:offer.id});
   s.season.trades[0].reason=decision.reason;
   return s;
  }
  if(action==='simulate'){if(currentPairs(s.season).flat().includes(s.humanTeamId))throw new DemoRuleError('Set and lock your own starters first.');for(const id of currentPairs(s.season).flat()){const ready=readyComputer(s.season,id);s.season=ready.season;s.season.teams.find(t=>t.id===id)!.lineup=ready.lineup;}s.season=seasonAction(s.season,s.humanTeamId,{action:'closeRound'});}
  else {s.season=seasonAction(s.season,s.humanTeamId,body);
   if(action==='lock'&&s.season.status==='active')for(const id of currentPairs(s.season).flat().filter(id=>id!==s.humanTeamId)){const ready=readyComputer(s.season,id);s.season=seasonAction(ready.season,id,{action:'lock',lineup:ready.lineup,acceptBye:true});}
  }
  return s;
 }
 if(body.action!=='draft')throw new DemoRuleError('Choose a player on your turn. This saved demo cannot be restarted or overwritten.');
 if(s.status!=='draft'||demoCurrentTeam(s)!==s.humanTeamId)throw new DemoRuleError('Wait for your draft turn.');
 const team=s.teams.find(t=>t.id===s.humanTeamId)!;addPick(s,team,String(body.athleteId));
 return runComputers(s);
}

export function demoReply(saved:DemoDraft|null){if(!saved)return {demo:null};saved=normalizeDemoByes(saved);const {season,...demo}=saved;if(season)demo.byes=normalizeByes(season).byes;if(!demo.byes)demo.byes=season?normalizeByes(season).byes:assignByes(demo.id,modernRegularWeeks(demo.teams.length,demo.playoffTeams),FIRST_BYE_WEEK,scoringFor(demo));return {demo,...(season?{league:{...publicSeason(season,saved.humanTeamId),revision:saved.revision}}:{})};}
