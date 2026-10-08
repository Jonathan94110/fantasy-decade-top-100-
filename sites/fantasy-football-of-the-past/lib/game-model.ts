import {LEGACY_SCORING,pointsAllowedScore,type ScoringRules} from './scoring-rules';
import kickerAthletes from '../data/nflverse/kicker-athletes.json';
import athleteRows from '../data/nflverse/athletes.json';
import coverage from '../data/nflverse/coverage.json';
import quality from '../data/archive-quality.json';
import historicalCatalogRows from '../data/historical-mode/catalog.json';
import historicalModeCoverage from '../data/historical-mode/mode-coverage.json';
export const DATA_QUALITY = quality;

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K';
export const POSITIONS: Position[] = ['QB','RB','WR','TE','DEF'];
export const ALL_POSITIONS:Position[]=[...POSITIONS,'K'];
export function rosterPositions(state:{lineupVersion?:1|2|3}){return state.lineupVersion===3?ALL_POSITIONS:POSITIONS;}
/** Roster slots are distinct from an athlete's recorded football position. */
export type LineupSlot = Position | 'FLEX';
export const LINEUP_SLOTS: LineupSlot[] = [...POSITIONS, 'FLEX'];
export const FLEX_POSITIONS: Position[] = ['RB','WR','TE'];
export function eligibleForSlot(athlete: Pick<Athlete,'position'> | undefined, slot: LineupSlot) {
 return !!athlete && (slot === 'FLEX' ? FLEX_POSITIONS.includes(athlete.position) : athlete.position === slot);
}
export function lineupSlots(state: {lineupVersion?: 1 | 2 | 3}): LineupSlot[] {
 return state.lineupVersion===3?[...LINEUP_SLOTS,'K']:state.lineupVersion === 2 ? LINEUP_SLOTS : POSITIONS;
}

export type Athlete = {id:string;name:string;position:Position;club:string;number:string;style:string;legend?:boolean;color:string;seasons:number[];gameCount:number;gamesBySeason:Record<string,number>;hallOfFameYear?:number;hallOfFameSource?:string};
// `legend` is retained for engine compatibility and means verified Pro Football
// Hall of Fame inductee, never a subjective star-player classification.
export const ATHLETES = [...athleteRows,...kickerAthletes] as Athlete[];
/** Separate mode catalogs keep every saved Strict selection and its counts intact. */
export const HISTORICAL_ATHLETES=historicalCatalogRows as Athlete[];
export const HISTORICAL_MODE_COVERAGE=historicalModeCoverage;
export const ALL_ATHLETES=[...ATHLETES,...HISTORICAL_ATHLETES.filter(row=>!ATHLETES.some(existing=>existing.id===row.id))];
const historicalAthleteIndex=new Map(HISTORICAL_ATHLETES.map(athlete=>[athlete.id,athlete]));
export function athletesFor(rules:ScoringRules=LEGACY_SCORING):Athlete[]{return rules.mode==='historical'?HISTORICAL_ATHLETES:ATHLETES;}
export function athleteFor(id:string,rules:ScoringRules=LEGACY_SCORING):Athlete|undefined{return rules.mode==='historical'?historicalAthleteIndex.get(id):ATHLETES.find(athlete=>athlete.id===id);}
export type Stats = {fieldGoalsShort?:number;fieldGoals40?:number;fieldGoals50?:number;fieldGoalsMissed?:number;fieldGoalsBlocked?:number;extraPointsMade?:number;extraPointsMissed?:number;extraPointsBlocked?:number;passingYards:number;passingTD:number;interceptions:number;rushingYards:number;rushingTD:number;receptions:number;receivingYards:number;receivingTD:number;fumblesLost:number;twoPoint:number;returnTD:number;sacks:number;defensiveInterceptions:number;fumbleRecoveries:number;defensiveTD:number;safeties:number;blockedKicks:number;pointsAllowed:number;fumbleRecoveryTD:number};
/** Aggregate kicking inputs preserve unknown missed/blocked splits in local research. */
export type ScoringStats={[Key in keyof Stats]:Stats[Key]|null} & {fieldGoalsMade?:number|null;fieldGoalsUnsuccessful?:number|null;extraPointsUnsuccessful?:number|null};
export type DefenseScoringStats=Pick<ScoringStats,'sacks'|'defensiveInterceptions'|'fumbleRecoveries'|'safeties'|'blockedKicks'|'defensiveTD'|'returnTD'|'pointsAllowed'>;
/** Review-only offense inputs retain unavailable lost fumbles without defense placeholders. */
export type OffensiveScoringStats=Pick<ScoringStats,'passingYards'|'passingTD'|'interceptions'|'rushingYards'|'rushingTD'|'receptions'|'receivingYards'|'receivingTD'|'twoPoint'|'returnTD'|'fumbleRecoveryTD'> & {fumblesLost:number|null};
export type Performance = {id:string;athleteId:string;season:number;week:number|null;gameId:string;date:string;teamAtTime:string;opponent:string;seasonType:'REG'|'POST';stats:ScoringStats;fictional:false;completed:true;entityType:'player'|'franchise-defense';sourceUrl:string;sourceUrls:string[];licenseReference:string;importedAt:string;sourceWeek?:number;sourceGameOrdinal?:number;historicalModeOnly?:true;sourceRevision?:string;sourceFile?:string;sourceLine?:number};
export type StrictPerformance=Omit<Performance,'stats'|'week'|'historicalModeOnly'>&{stats:Stats;week:number;historicalModeOnly?:never};
export const DATA_COVERAGE = {...coverage,playerCount:coverage.playerCount+kickerAthletes.length,performanceCount:coverage.performanceCount+kickerAthletes.reduce((sum,a)=>sum+a.gameCount,0),kickerCount:kickerAthletes.length};
export const HISTORICAL_YEARS = coverage.seasons;
/** Recover the source-era team label without changing stable franchise IDs. */
export function historicalTeamLabel(performance: Performance, team: string) {
 const aliases: Record<string,string> = quality.franchiseAliasMap;
 return performance.gameId.split('_').slice(2).find(code => (aliases[code] || code) === team) || team;
}
export const SCORING = [
 ['Passing','1 pt / 25 yards · 4 / TD · −2 / interception'],
 ['Rushing & receiving','1 pt / 10 yards · 6 / TD'],
 ['Receptions','1 point per catch (full PPR)'],
 ['Other offense','−2 / lost fumble · 2 / conversion · 6 / special-teams or recovery TD'],
 ['Defense / special teams','1 / sack · 2 / takeaway, safety or block · 6 / TD'],
 ['Points allowed','Opponent’s full final score: 0: +10 · 1–6: +7 · 7–13: +4 · 14–20: +1 · 21–27: 0 · 28–34: −1 · 35+: −4'],
];
function knownScoringValue(value:number|null|undefined,label:string){if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Complete ${label} statistics are required by this scoring contract.`);return value;}
/** Disabled categories are never evaluated or substituted into the raw statistics. */
function term(value:number|null|undefined,rate:number,label:string){return rate===0?0:knownScoringValue(value,label)*rate;}
export function score(s:ScoringStats,position:Position,rules:ScoringRules=LEGACY_SCORING){
 if(position==='DEF')return scoreDefense(s,rules);
 const kicking=position==='K'?kickingScore(s,rules):0;
 return scoreOffense(s,rules,kicking);
}
export function scoreDefense(s:DefenseScoringStats,rules:ScoringRules=LEGACY_SCORING){return term(s.sacks,rules.sack,'sack')+term(s.defensiveInterceptions,rules.takeaway,'defensive interception')+term(s.fumbleRecoveries,rules.defenseFumbleRecovery??rules.takeaway,'defensive fumble recovery')+term(s.safeties,rules.safety??rules.takeaway,'safety')+term(s.blockedKicks,rules.blockedKick??rules.takeaway,'blocked kick')+term(s.defensiveTD,rules.defensiveTouchdown??rules.touchdown,'defensive touchdown')+term(s.returnTD,rules.touchdown,'return touchdown')+pointsAllowedScore(knownScoringValue(s.pointsAllowed,'points allowed'),rules);}

/** Shared arithmetic only; this function never adds review records to gameplay. */
export function scoreOffense(s:OffensiveScoringStats,rules:ScoringRules=LEGACY_SCORING,kicking=0){
 const lostFumblePoints=term(s.fumblesLost,rules.lostFumble,'lost-fumble');
 // Keep the original grouping when rates match so saved strict arithmetic is stable.
 const scrimmage=rules.scrimmageYard===0?0:(knownScoringValue(s.rushingYards,'rushing yard')+knownScoringValue(s.receivingYards,'receiving yard'))*rules.scrimmageYard;
 const recoveryRate=rules.offensiveRecoveryTD??rules.touchdown;
 const touchdowns=recoveryRate===rules.touchdown?(rules.touchdown===0?0:(knownScoringValue(s.rushingTD,'rushing touchdown')+knownScoringValue(s.receivingTD,'receiving touchdown')+knownScoringValue(s.returnTD,'return touchdown')+knownScoringValue(s.fumbleRecoveryTD,'offensive recovery touchdown'))*rules.touchdown):(rules.touchdown===0?0:(knownScoringValue(s.rushingTD,'rushing touchdown')+knownScoringValue(s.receivingTD,'receiving touchdown')+knownScoringValue(s.returnTD,'return touchdown'))*rules.touchdown)+term(s.fumbleRecoveryTD,recoveryRate,'offensive recovery touchdown');
 return Math.round((kicking+term(s.passingYards,rules.passingYard,'passing yard')+term(s.passingTD,rules.passingTD,'passing touchdown')+term(s.interceptions,rules.interception,'interception')+scrimmage+touchdowns+term(s.receptions,rules.receptionPoints,'reception')+lostFumblePoints+term(s.twoPoint,rules.twoPoint,'two-point conversion'))*100)/100;
}

function kickingValues(s:ScoringStats,rules:ScoringRules){
 if(!rules.kicking)throw new Error('Kickers are not enabled in these saved scoring rules.');
 if(rules.kicking.fieldGoalFlat===undefined){const required=[s.fieldGoalsShort,s.fieldGoals40,s.fieldGoals50,s.fieldGoalsMissed,s.fieldGoalsBlocked,s.extraPointsMade,s.extraPointsMissed,s.extraPointsBlocked];if(required.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw new Error('Complete verified kicking statistics are required.');return {short:s.fieldGoalsShort!,forty:s.fieldGoals40!,fifty:s.fieldGoals50!,failedFG:s.fieldGoalsMissed!+s.fieldGoalsBlocked!,failedXP:s.extraPointsMissed!+s.extraPointsBlocked!,xp:s.extraPointsMade!};}
 const failedFG=rules.kicking.unsuccessful===0?0:s.fieldGoalsUnsuccessful??(knownScoringValue(s.fieldGoalsMissed,'unsuccessful field goal')+knownScoringValue(s.fieldGoalsBlocked,'blocked field goal'));
 const failedXP=(rules.kicking.unsuccessfulExtraPoint??rules.kicking.unsuccessful)===0?0:s.extraPointsUnsuccessful??(knownScoringValue(s.extraPointsMissed,'unsuccessful extra point')+knownScoringValue(s.extraPointsBlocked,'blocked extra point'));
 const xp=rules.kicking.extraPoint===0?0:knownScoringValue(s.extraPointsMade,'made extra point');
 if(rules.kicking.fieldGoalFlat!==undefined){const made=rules.kicking.fieldGoalFlat===0?0:s.fieldGoalsMade??(knownScoringValue(s.fieldGoalsShort,'made field goal')+knownScoringValue(s.fieldGoals40,'made field goal')+knownScoringValue(s.fieldGoals50,'made field goal'));return {made:knownScoringValue(made,'made field goal'),failedFG:knownScoringValue(failedFG,'unsuccessful field goal'),failedXP:knownScoringValue(failedXP,'unsuccessful extra point'),xp};}
 throw new Error('Unsupported kicking contract.');
}
function kickingScore(s:ScoringStats,rules:ScoringRules){
 const values=kickingValues(s,rules),k=rules.kicking!;
 const xpFailureRate=k.unsuccessfulExtraPoint??k.unsuccessful;
 const unsuccessful=xpFailureRate===k.unsuccessful?(values.failedFG+values.failedXP)*k.unsuccessful:values.failedFG*k.unsuccessful+values.failedXP*xpFailureRate;
 return ('made' in values?values.made!*k.fieldGoalFlat!:values.short!*k.fieldGoalShort+values.forty!*k.fieldGoal40+values.fifty!*k.fieldGoal50)+values.xp*k.extraPoint+unsuccessful;
}
export type ScoringItem = { label: string; calculation: string; points: number };
/** A readable receipt for the existing scoring rules; never changes a saved score. */
export function scoringBreakdown(s:ScoringStats,position:Position,rules:ScoringRules=LEGACY_SCORING):ScoringItem[]{
 const items:ScoringItem[]=[];
 const add=(label:string,value:number|null|undefined,rate:number,unit:string)=>{
  if(rate===0){if((rules.version<5||rules.mode==='strict')&&typeof value==='number'&&Number.isFinite(value)&&value!==0)items.push({label,calculation:`${value} ${unit} × ${rate}`,points:0});return;}
  const known=knownScoringValue(value,label);
  if(known!==0)items.push({label,calculation:`${known} ${unit} × ${rate}`,points:Math.round(known*rate*100)/100});
 };
 if(position==='DEF'){
  add('Sacks',s.sacks,rules.sack,'sacks');add('Interceptions',s.defensiveInterceptions,rules.takeaway,'INT');
  add('Fumble recoveries',s.fumbleRecoveries,rules.defenseFumbleRecovery??rules.takeaway,'recoveries');add('Safeties',s.safeties,rules.safety??rules.takeaway,'safeties');
  add('Blocked kicks',s.blockedKicks,rules.blockedKick??rules.takeaway,'blocks');add('Defensive touchdowns',s.defensiveTD,rules.defensiveTouchdown??rules.touchdown,'TD');
  add('Special-teams touchdowns',s.returnTD,rules.touchdown,'TD');
  const p=knownScoringValue(s.pointsAllowed,'points allowed');
  items.push({label:'Points allowed',calculation:`${p} opponent points`,points:pointsAllowedScore(p,rules)});
 }else{
  if(position==='K'){const values=kickingValues(s,rules),k=rules.kicking!;if('made' in values)add('Made field goals at any distance',values.made,k.fieldGoalFlat!,'FG');else{add('Field goals under 40 yards',values.short,k.fieldGoalShort,'FG');add('Field goals 40–49 yards',values.forty,k.fieldGoal40,'FG');add('Field goals 50+ yards',values.fifty,k.fieldGoal50,'FG');}add('Extra points',values.xp,k.extraPoint,'XP');add('Unsuccessful field goals, including blocks',values.failedFG,k.unsuccessful,'attempts');add('Unsuccessful extra points, including blocks',values.failedXP,k.unsuccessfulExtraPoint??k.unsuccessful,'attempts');}
  add('Passing yards',s.passingYards,rules.passingYard,'yds');add('Passing touchdowns',s.passingTD,rules.passingTD,'TD');
  add('Interceptions thrown',s.interceptions,rules.interception,'INT');add('Rushing yards',s.rushingYards,rules.scrimmageYard,'yds');
  add('Rushing touchdowns',s.rushingTD,rules.touchdown,'TD');add('Receptions',s.receptions,rules.receptionPoints,'catches');
  add('Receiving yards',s.receivingYards,rules.scrimmageYard,'yds');add('Receiving touchdowns',s.receivingTD,rules.touchdown,'TD');
  if(rules.lostFumble!==0)add('Lost fumbles',s.fumblesLost,rules.lostFumble,'fumbles');add('Two-point conversions',s.twoPoint,rules.twoPoint,'conversions');
  add('Special-teams touchdowns',s.returnTD,rules.touchdown,'TD');add('Fumble-recovery touchdowns',s.fumbleRecoveryTD,rules.offensiveRecoveryTD??rules.touchdown,'TD');
 }
 return items;
}
export function statLine(p:Performance){
 const a=ALL_ATHLETES.find(a=>a.id===p.athleteId)!;const s=p.stats;const parts:string[]=[];
 const add=(value:number|null|undefined,label:string)=>{if(typeof value==='number'&&Number.isFinite(value)&&value!==0)parts.push(`${value} ${label}`);};
 if(a.position==='DEF'){
  add(s.sacks,'sacks');add(s.defensiveInterceptions,'INT');add(s.fumbleRecoveries,'fumble recoveries');
  add(s.defensiveTD,'defensive TD');add(s.returnTD,'special-teams TD');add(s.safeties,'safeties');add(s.blockedKicks,'blocked kicks');
  parts.push(s.pointsAllowed===null?'Points allowed unavailable':`${s.pointsAllowed} points allowed`);
 }else{
  if(a.position==='K'){if(s.fieldGoalsMade!==null&&s.fieldGoalsMade!==undefined&&s.fieldGoalsShort===null)add(s.fieldGoalsMade,'FG made (distance unavailable)');else{add(s.fieldGoalsShort,'FG under 40');add(s.fieldGoals40,'FG 40–49');add(s.fieldGoals50,'FG 50+');}add(s.extraPointsMade,'XP made');add(s.fieldGoalsUnsuccessful??(typeof s.fieldGoalsMissed==='number'&&typeof s.fieldGoalsBlocked==='number'?s.fieldGoalsMissed+s.fieldGoalsBlocked:null),'unsuccessful FG');add(s.extraPointsUnsuccessful??(typeof s.extraPointsMissed==='number'&&typeof s.extraPointsBlocked==='number'?s.extraPointsMissed+s.extraPointsBlocked:null),'unsuccessful XP');}
  add(s.passingYards,'pass yds');add(s.passingTD,'pass TD');add(s.interceptions,'INT thrown');
  add(s.rushingYards,'rush yds');add(s.rushingTD,'rush TD');add(s.receptions,'rec');add(s.receivingYards,'rec yds');add(s.receivingTD,'rec TD');
  if(typeof s.fumblesLost==='number'&&Number.isFinite(s.fumblesLost))add(s.fumblesLost,'lost fumbles');else parts.push('Lost fumbles unavailable');add(s.twoPoint,'2-point conversions');add(s.returnTD,'special-teams TD');add(s.fumbleRecoveryTD,'recovery TD');
 }
 return parts.length?parts.join(' · '):'No scoring statistics';
}
