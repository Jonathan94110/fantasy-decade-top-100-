import recordRows from '../data/historical-import/records.json';
import athleteRows from '../data/historical-import/athletes.json';
import identityRows from '../data/historical-import/identity-map.json';
import reviewedSource from '../data/historical-import/reviewed-source.json';
import {scoreOffense,type OffensiveScoringStats,type ScoringItem} from './game-model';
import {newScoring,type ReceptionPoints} from './scoring-rules';

/** These records have their own review model and never enter a gameplay pool. */
export type CompletedFinalZeroEvidence={
 url:string;completed:true;date:string;team:string;opponent:string;
 finalScore:[0,number];week:number|null;homeAway:'H'|'A';sourceRoundLabel:string|null;
};
export type ReviewRecord={
 reviewOnly:true;id:string;athleteId:string;season:number;week:number|null;sourceWeek:number;
 gameId:string;date:string;teamAtTime:string;opponent:string;seasonType:'REG'|'POST';roundLabel?:string;
 stats:{[Key in keyof OffensiveScoringStats]:Key extends 'fumblesLost'?null:number};fictional:false;completed:true;entityType:'player';
 sourceUrl:string;sourceUrls:string[];licenseReference:string;importedAt:string;minimumScoringVersion:4;
 provenance:{
  sourcePlayerId:string;originalArchiveSHA256:string;
  rawMissingScoringStats:{fumblesLost:null;twoPoint:null;fumbleRecoveryTD:null};
  derivations:{twoPoint:CompletedFinalZeroEvidence;fumbleRecoveryTD:CompletedFinalZeroEvidence};
  quality:string;historicalFranchiseId:string|null;
 };
};
export type ReviewPlayer={
 id:string;athleteId:string;profileId:string;classicId:string|null;name:string;position:'QB';club:string;
 gameCount:number;count:number;seasons:number[];gamesBySeason:Record<string,number>;
 hallOfFameYear:number;hallOfFameSource:string;
};

export const REVIEW_SELECTION_NOTE='These 24 games were deliberately selected because their teams finished with 0 points. This low-scoring sample is not representative of career performances. It is for read-only review and scoring checks, and is excluded from all normal drafts, random draws and seasons.';
export const REVIEW_SOURCE={
 provider:reviewedSource.provider,
 qualityDisposition:reviewedSource.qualityDisposition,
 reviewOnly:true as const,
 normalGameplayImports:0 as const,
};

const sourceStats={
 passingYards:'passing_yards',passingTD:'passing_touchdowns',interceptions:'passing_interceptions',
 rushingYards:'rushing_yards',rushingTD:'rushing_touchdowns',receptions:'receiving_receptions',
 receivingYards:'receiving_yards',receivingTD:'receiving_touchdowns',
} as const;
const activeFields=[...Object.keys(sourceStats),'returnTD','twoPoint','fumbleRecoveryTD'] as (keyof OffensiveScoringStats)[];
const statFields=new Set([...activeFields,'fumblesLost']);
function requireFact(condition:unknown,message:string):asserts condition{
 if(!condition)throw new Error(`Historical review evidence: ${message}`);
}
function finite(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value);}
function explicitNumber(row:Record<string,unknown>,key:string){
 const value=row[key];
 requireFact(finite(value),`explicit numeric source field required: ${key}`);
 return value;
}
function checkStats(stats:OffensiveScoringStats){
 for(const field of activeFields)requireFact(finite(stats[field]),`unavailable active scoring field: ${field}`);
 requireFact(stats.fumblesLost===null,'unavailable lost fumbles must remain null');
 for(const field of Object.keys(stats))requireFact(statFields.has(field as keyof OffensiveScoringStats),`unexpected scoring field: ${field}`);
}
function checkZeroEvidence(proof:CompletedFinalZeroEvidence,record:ReviewRecord){
 requireFact(proof.completed===true&&proof.date===record.date&&proof.team===record.teamAtTime&&proof.opponent===record.opponent,'completed final result identity');
 requireFact(Array.isArray(proof.finalScore)&&proof.finalScore.length===2&&proof.finalScore[0]===0&&finite(proof.finalScore[1])&&proof.finalScore[1]>=0,'completed team zero final score');
 requireFact(proof.week===record.week,'official week remains separate from source ordinal');
 requireFact(proof.homeAway==='H'||proof.homeAway==='A','recorded game location');
 requireFact(typeof proof.url==='string'&&record.sourceUrls.includes(proof.url),'final result source URL');
}

type SourceRecord={id:string;gameId:string;seasonType:'REG'|'POST';week:number|null;rawSourceRow:Record<string,unknown>;completedFinalZeroEvidence:CompletedFinalZeroEvidence;historicalFranchiseId:string|null};
const source=reviewedSource as unknown as {reviewOnly:true;normalGameplayImports:0;records:SourceRecord[]};
const records=recordRows as unknown as ReviewRecord[];
requireFact(source.reviewOnly===true&&source.normalGameplayImports===0,'review-only source scope');
requireFact(records.length===24&&source.records.length===24,'review selection inventory');
const sourceById=new Map(source.records.map(row=>[row.id,row]));
requireFact(sourceById.size===source.records.length,'duplicate source identity');
const seen=new Set<string>();
for(const record of records){
 requireFact(!seen.has(record.id),'duplicate player-game identity');seen.add(record.id);
 const evidence=sourceById.get(record.id);
 requireFact(evidence,'original source row missing');
 const raw=evidence.rawSourceRow;
 requireFact(record.reviewOnly===true&&record.completed===true&&record.fictional===false&&record.entityType==='player'&&record.minimumScoringVersion===4,'read-only completed offense record');
 requireFact(record.id===`kaggle:${record.provenance.sourcePlayerId}:${record.gameId}`&&record.athleteId===`kaggle-${record.provenance.sourcePlayerId}`,'stable source player-game identity');
 requireFact(String(raw.player_id)===record.provenance.sourcePlayerId&&Number(raw.year)===record.season&&raw.date===record.date&&raw.team===record.teamAtTime&&raw.opponent===record.opponent,'raw source game identity');
 requireFact(record.gameId===evidence.gameId&&record.seasonType===evidence.seasonType&&record.week===evidence.week,'reviewed competition and official week');
 requireFact(record.sourceWeek===Number(raw.game_number)&&Number.isInteger(record.sourceWeek)&&record.sourceWeek>0,'source game ordinal');
 requireFact(record.seasonType==='POST'?record.week===null&&typeof record.roundLabel==='string':Number.isInteger(record.week)&&record.week!>0,'postseason round is not an invented numeric week');
 // The provider swapped these two raw labels. Keep its original cells intact;
 // use the reviewed interpretation only to verify actual participation.
 const completions=explicitNumber(raw,'passing_attempts'),attempts=explicitNumber(raw,'passing_completions');
 requireFact(Number.isInteger(attempts)&&attempts>0&&Number.isInteger(completions)&&completions>=0&&completions<=attempts,'corrected passing participation');
 checkStats(record.stats);
 for(const [field,key] of Object.entries(sourceStats))requireFact(record.stats[field as keyof OffensiveScoringStats]===explicitNumber(raw,key),`raw numeric fidelity: ${field}`);
 requireFact(record.stats.returnTD===explicitNumber(raw,'kick_return_touchdowns')+explicitNumber(raw,'punt_return_touchdowns'),'raw return touchdown fidelity');
 const missing=record.provenance.rawMissingScoringStats;
 requireFact(missing.fumblesLost===null&&missing.twoPoint===null&&missing.fumbleRecoveryTD===null,'original missing statistics preserved');
 requireFact(!Object.hasOwn(raw,'fumblesLost')&&!Object.hasOwn(raw,'twoPoint')&&!Object.hasOwn(raw,'fumbleRecoveryTD'),'derived statistics cannot replace raw evidence');
 requireFact(record.provenance.originalArchiveSHA256===reviewedSource.provider.archiveSHA256,'pinned archive identity');
 requireFact(record.stats.twoPoint===0&&record.stats.fumbleRecoveryTD===0,'only reviewed zero derivations');
 for(const proof of Object.values(record.provenance.derivations)){
  checkZeroEvidence(proof,record);
  requireFact(JSON.stringify(proof)===JSON.stringify(evidence.completedFinalZeroEvidence),'original final-score evidence preserved');
 }
 requireFact(Number(raw.player_team_score)===0&&Number(raw.opponent_score)===evidence.completedFinalZeroEvidence.finalScore[1]&&raw.game_location===evidence.completedFinalZeroEvidence.homeAway,'raw and official final result agree');
 requireFact(record.provenance.historicalFranchiseId===evidence.historicalFranchiseId,'historical franchise identity');
}

type PlayerMetadata={id:string;name:string;position:'QB';club:string;gameCount:number;seasons:number[];gamesBySeason:Record<string,number>;hallOfFameYear:number;hallOfFameSource:string;performanceIdsBySeason:Record<string,string[]>};
const identities=new Map(identityRows.map(identity=>[identity.athleteId,identity]));
const players=(athleteRows as unknown as PlayerMetadata[]).map(player=>{
 const identity=identities.get(player.id);
 requireFact(identity?.reviewed===true&&identity.name===player.name&&identity.position===player.position,'reviewed player profile identity');
 const games=records.filter(record=>record.athleteId===player.id);
 requireFact(games.length===player.gameCount&&games.length>0,'player review game count');
 const seasons=[...new Set(games.map(record=>record.season))].sort((a,b)=>a-b);
 requireFact(JSON.stringify(seasons)===JSON.stringify(player.seasons),'player review season inventory');
 requireFact(Object.keys(player.gamesBySeason).length===seasons.length&&Object.keys(player.performanceIdsBySeason).length===seasons.length,'player review season counts');
 for(const season of seasons){
  const ids=games.filter(record=>record.season===season).map(record=>record.id).sort();
  requireFact(player.gamesBySeason[season]===ids.length&&JSON.stringify([...player.performanceIdsBySeason[season]].sort())===JSON.stringify(ids),'player review game inventory');
 }
 return {id:player.id,athleteId:player.id,profileId:identity.profileId,classicId:identity.classicId,
  name:player.name,position:player.position,club:player.club,gameCount:player.gameCount,count:player.gameCount,
  seasons:[...player.seasons],gamesBySeason:{...player.gamesBySeason},hallOfFameYear:player.hallOfFameYear,hallOfFameSource:player.hallOfFameSource} satisfies ReviewPlayer;
});
requireFact(players.length===7&&new Set(players.map(player=>player.id)).size===7&&players.reduce((count,player)=>count+player.gameCount,0)===records.length,'seven-player review inventory');
export const REVIEW_PERFORMANCES:readonly ReviewRecord[]=records;
export const REVIEW_PLAYERS:readonly ReviewPlayer[]=players;

/** Review calculations always create their own v4 contract, never edit a saved game. */
export function reviewScore(record:ReviewRecord,ppr:ReceptionPoints=1):number{
 checkStats(record.stats);
 return scoreOffense(record.stats,newScoring(ppr));
}
export function reviewReceipt(record:ReviewRecord,ppr:ReceptionPoints=1):ScoringItem[]{
 checkStats(record.stats);
 const rules=newScoring(ppr),stats=record.stats,items:ScoringItem[]=[];
 const add=(label:string,value:number,rate:number,unit:string)=>{
  if(value!==0)items.push({label,calculation:`${value} ${unit} × ${rate}`,points:Math.round(value*rate*100)/100});
 };
 add('Passing yards',stats.passingYards,rules.passingYard,'yds');
 add('Passing touchdowns',stats.passingTD,rules.passingTD,'TD');
 add('Interceptions thrown',stats.interceptions,rules.interception,'INT');
 add('Rushing yards',stats.rushingYards,rules.scrimmageYard,'yds');
 add('Rushing touchdowns',stats.rushingTD,rules.touchdown,'TD');
 add('Receptions',stats.receptions,rules.receptionPoints,'catches');
 add('Receiving yards',stats.receivingYards,rules.scrimmageYard,'yds');
 add('Receiving touchdowns',stats.receivingTD,rules.touchdown,'TD');
 add('Two-point conversions',stats.twoPoint,rules.twoPoint,'conversions');
 add('Special-teams touchdowns',stats.returnTD,rules.touchdown,'TD');
 add('Fumble-recovery touchdowns',stats.fumbleRecoveryTD,rules.touchdown,'TD');
 return items;
}
