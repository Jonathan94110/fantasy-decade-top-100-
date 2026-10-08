import kickerRecordRows from '../data/nflverse/kicker-records.json';
import recordRows from '../data/nflverse/records.json';
import historicalRecordRows from '../data/historical-mode/records.json';
import historicalSourceCoverage from '../data/historical-mode/coverage.json';
import { DATA_COVERAGE as coverage, athleteFor, type Stats, type ScoringStats, type Performance, type StrictPerformance } from './game-model';
import {LEGACY_SCORING,type ScoringRules} from './scoring-rules';
export * from './game-model';
const STAT_KEYS:(keyof Stats)[] = ['passingYards','passingTD','interceptions','rushingYards','rushingTD','receptions','receivingYards','receivingTD','fumblesLost','twoPoint','returnTD','sacks','defensiveInterceptions','fumbleRecoveries','defensiveTD','safeties','blockedKicks','pointsAllowed','fumbleRecoveryTD'];
type Row = [string,number,number,string,string,string,string,'REG'|'POST',...number[]];
export const PERFORMANCES:StrictPerformance[] = ([...recordRows,...kickerRecordRows] as Row[]).map(row=>{
 const [athleteId,season,week,gameId,date,teamAtTime,opponent,seasonType,...values]=row;
 const defense=athleteId.startsWith('franchise-');
 const tag=defense?'stats_team':'stats_player';
 const sourceUrl=`https://github.com/nflverse/nflverse-data/releases/download/${tag}/${tag}_week_${season}.csv`;
 const stats=Object.fromEntries(STAT_KEYS.map((key,index)=>[key,values[index]])) as Stats;
 if(values.length>STAT_KEYS.length){const kickingKeys:(keyof Stats)[]=['fieldGoalsShort','fieldGoals40','fieldGoals50','fieldGoalsMissed','fieldGoalsBlocked','extraPointsMade','extraPointsMissed','extraPointsBlocked'];Object.assign(stats,Object.fromEntries(kickingKeys.map((key,i)=>[key,values[STAT_KEYS.length+i]])));}
 return {id:`nflverse:${athleteId}:${gameId}`,athleteId,season,week,gameId,date,teamAtTime,opponent,seasonType,stats,fictional:false,completed:true,entityType:defense?'franchise-defense':'player',sourceUrl,sourceUrls:[sourceUrl,'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',...(defense?[`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`]:[])],licenseReference:coverage.licenseUrl,importedAt:coverage.importedAt};
});

type HistoricalRow=[string,number,number|null,string,string,string,string,'REG',number,number,...(number|null)[]];
const historicalCompactRows=historicalRecordRows as HistoricalRow[];
const historicalRowsByAthlete=new Map<string,HistoricalRow[]>();
for(const row of historicalCompactRows){
 if(row[1]>=1999)continue;
 const pool=historicalRowsByAthlete.get(row[0])??[];pool.push(row);historicalRowsByAthlete.set(row[0],pool);
}
const modernRegularByAthlete=new Map<string,Performance[]>();
for(const performance of PERFORMANCES)if(performance.seasonType==='REG'){
 const pool=modernRegularByAthlete.get(performance.athleteId)??[];pool.push(performance);modernRegularByAthlete.set(performance.athleteId,pool);
}
// Scouting visits every career. A small cache avoids retaining every expanded source row.
const historicalDecodedPools=new Map<string,Performance[]>();
const MAX_DECODED_CAREERS=24;
const HISTORICAL_POOL_RULES:ScoringRules={...LEGACY_SCORING,mode:'historical'};
function decodeHistorical(row:HistoricalRow):Performance{
 const [athleteId,season,sourceWeek,gameId,date,teamAtTime,opponent,seasonType,fileIndex,sourceLine,...values]=row;
 const sourceFiles=historicalSourceCoverage.sourceFiles as unknown as ({path:string}|string)[];
 const sourceFile=typeof sourceFiles[fileIndex]==='string'?sourceFiles[fileIndex] as string:(sourceFiles[fileIndex] as {path:string}).path;
 const sourceRevision=historicalSourceCoverage.sourceRevision;
 const sourceUrl=`https://github.com/Jonathan94110/prime-rushmore/blob/${sourceRevision}/${sourceFile}#L${sourceLine}`;
 const stats=Object.fromEntries((historicalSourceCoverage.statKeys as (keyof ScoringStats)[]).map((key,index)=>[key,values[index]])) as ScoringStats;
 const sourceOrdinal=typeof sourceWeek==='number'&&Number.isInteger(sourceWeek)&&sourceWeek>0?{sourceWeek,sourceGameOrdinal:sourceWeek}:{};
 return {id:`prime-rushmore:${athleteId}:${season}:${gameId}`,athleteId,season,week:null,...sourceOrdinal,gameId,date,teamAtTime,opponent,seasonType,stats,fictional:false,completed:true,entityType:athleteFor(athleteId,HISTORICAL_POOL_RULES)?.position==='DEF'?'franchise-defense':'player',sourceUrl,sourceUrls:[sourceUrl,`https://github.com/Jonathan94110/prime-rushmore/blob/${sourceRevision}/fantasy-legends/VALIDATION_REPORT.md`],licenseReference:'Pinned source snapshot; owner-authorized private demo; upstream license not established',importedAt:historicalSourceCoverage.importedAt,historicalModeOnly:true,sourceRevision,sourceFile,sourceLine};
}
/** Selection never mixes source-only records into a saved Strict contract. */
export function performancePool(athleteId:string,rules:ScoringRules=LEGACY_SCORING):Performance[]{
 if(rules.mode!=='historical')return PERFORMANCES.filter(performance=>performance.athleteId===athleteId);
 if(!athleteFor(athleteId,rules))return [];
 let pool=historicalDecodedPools.get(athleteId);
 if(pool){historicalDecodedPools.delete(athleteId);historicalDecodedPools.set(athleteId,pool);return pool;}
 pool=[...(modernRegularByAthlete.get(athleteId)??[]),...(historicalRowsByAthlete.get(athleteId)??[]).map(decodeHistorical)];
 historicalDecodedPools.set(athleteId,pool);
 if(historicalDecodedPools.size>MAX_DECODED_CAREERS)historicalDecodedPools.delete(historicalDecodedPools.keys().next().value!);
 return pool;
}
