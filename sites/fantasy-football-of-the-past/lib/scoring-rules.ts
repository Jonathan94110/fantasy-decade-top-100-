/** Saved with new games and every scored round. Missing snapshots are always v1. */
export type ReceptionPoints = 0 | 0.5 | 1;
export type ScoringMode = 'strict' | 'historical';
/** Approved Historical categories are uniform across every team and loaded era. */
export const HISTORICAL_SCORING_READY=true;
export type ScoringRules = Readonly<{
 version: 1 | 2 | 3 | 4 | 5; mode?:ScoringMode; kicking?:Readonly<{extraPoint:number;fieldGoalShort:number;fieldGoal40:number;fieldGoal50:number;unsuccessful:number;fieldGoalFlat?:number;unsuccessfulExtraPoint?:number}>; receptionPoints: ReceptionPoints;
 passingYard: number; passingTD: number; interception: number; scrimmageYard: number;
 touchdown: number; lostFumble: number; twoPoint: number; sack: number; takeaway: number;
 offensiveRecoveryTD?:number;defenseFumbleRecovery?:number;blockedKick?:number;safety?:number;defensiveTouchdown?:number;
 pointsAllowed: readonly number[];
}>;
const base = {passingYard:.04,passingTD:4,interception:-2,scrimmageYard:.1,touchdown:6,lostFumble:-2,twoPoint:2,sack:1,takeaway:2,pointsAllowed:Object.freeze([10,7,4,1,0,-1,-4])};
export const LEGACY_SCORING:ScoringRules=Object.freeze({version:1,receptionPoints:1,...base});
function receptionPoints(value:unknown):ReceptionPoints {
 if(value!==0&&value!==0.5&&value!==1)throw new Error('Choose Standard, Half PPR, or Full PPR scoring.');
 return value;
}
/** New contracts disable individual lost-fumble scoring; raw game stats stay intact. */
export function parseScoringMode(value:unknown):ScoringMode{
 if(value!=='strict'&&value!=='historical')throw new Error('Choose Strict or Historical scoring.');
 return value;
}
export function newScoring(value:unknown=1,kickers=false,mode:unknown='strict'):ScoringRules {
 const selected=parseScoringMode(mode),ppr=receptionPoints(value);
 if(selected==='historical')return Object.freeze({version:5,mode:selected,receptionPoints:ppr,...base,lostFumble:0,twoPoint:0,offensiveRecoveryTD:0,sack:0,takeaway:0,defenseFumbleRecovery:0,blockedKick:0,safety:0,defensiveTouchdown:0,...(kickers?{kicking:Object.freeze({extraPoint:1,fieldGoalShort:3,fieldGoal40:3,fieldGoal50:3,fieldGoalFlat:3,unsuccessful:-1,unsuccessfulExtraPoint:0})}:{})});
 return Object.freeze({version:5,mode:selected,receptionPoints:ppr,...base,lostFumble:0,...(kickers?{kicking:Object.freeze({extraPoint:1,fieldGoalShort:3,fieldGoal40:4,fieldGoal50:5,unsuccessful:-1})}:{})});
}
/** Only newly created v5 setups may change mode, before their engine's start boundary. */
export function withScoringMode(rules:ScoringRules,mode:unknown):ScoringRules{
 if(rules.version!==5||!rules.mode)throw new Error('Existing saved games keep their original scoring contract.');
 return newScoring(rules.receptionPoints,!!rules.kicking,mode);
}
/** Reception edits never replace another part of an already saved contract. */
export function withReceptionPoints(rules:ScoringRules,value:unknown):ScoringRules {
 return Object.freeze({...rules,receptionPoints:receptionPoints(value)});
}
export function scoringFor(state?:{scoring?:ScoringRules}|null):ScoringRules{return state?.scoring??LEGACY_SCORING;}
export function scoringLabel(rules:ScoringRules=LEGACY_SCORING){return rules.receptionPoints===0?'Standard':rules.receptionPoints===.5?'Half PPR':'Full PPR';}
export function pointsAllowedScore(points:number,rules:ScoringRules){return rules.pointsAllowed[points===0?0:points<=6?1:points<=13?2:points<=20?3:points<=27?4:points<=34?5:6];}
export function lostFumbleScoringNote(rules:ScoringRules){return rules.lostFumble===0?'Individual lost-fumble scoring is disabled. Historical lost-fumble stats remain as recorded; unavailable stats are not zero.':`Individual lost fumbles: ${rules.lostFumble} points each under this saved scoring contract.`;}

export function scoringModeLabel(rules:ScoringRules){return rules.version<5||!rules.mode?'Saved rules':rules.mode==='historical'?'All-era scoring':'Saved scoring';}
export function scoringContractLabel(rules:ScoringRules){return `${scoringModeLabel(rules)} · ${scoringLabel(rules)}`;}
export function scoringModeNote(rules:ScoringRules){
 if(rules.version<5||!rules.mode)return 'This game keeps its original saved scoring contract. Completed results are unchanged.';
 if(rules.mode==='strict')return 'These saved rules include every original scoring category, with individual lost-fumble scoring disabled. Required source values must be known. The same saved rules apply to every team.';
 const excluded=[rules.twoPoint===0?'two-point credits':null,rules.offensiveRecoveryTD===0?'offensive recovery touchdowns':null,rules.sack===0?'defense sacks':null,rules.takeaway===0?'defense interceptions':null,rules.defenseFumbleRecovery===0?'defense fumble recoveries':null,rules.blockedKick===0?'blocked kicks':null,rules.safety===0?'safeties':null,rules.defensiveTouchdown===0?'defensive touchdowns':null].filter(Boolean);
 return `All-era scoring uses one fixed saved contract for every team.${excluded.length?` Excluded: ${excluded.join(', ')}.`:''} Individual lost-fumble scoring is disabled. Missing excluded stats remain unknown; included stats must be verified. Verified older and modern game logs share this scoring contract.`;
}
export function kickerScoringNote(rules:ScoringRules){const kicking=rules.kicking;return kicking?.fieldGoalFlat!==undefined?`K: ${kicking.extraPoint>=0?'+':''}${kicking.extraPoint} XP; ${kicking.fieldGoalFlat>=0?'+':''}${kicking.fieldGoalFlat} for every made FG; ${kicking.unsuccessful} for each unsuccessful FG, including blocks once. ${(kicking.unsuccessfulExtraPoint??kicking.unsuccessful)===0?'Unsuccessful XP do not score.':`${kicking.unsuccessfulExtraPoint??kicking.unsuccessful} for each unsuccessful XP.`} Real offensive stats also count when verified.`:KICKER_SCORING_NOTE;}

export const KICKER_SCORING_NOTE='K: +1 XP; FG under 40 / 40–49 / 50+ yards = 3 / 4 / 5; −1 for each unsuccessful FG or XP, including blocks. Real offensive stats also count.';
