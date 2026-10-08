import {LEGACY_SCORING,type ScoringRules} from './scoring-rules';
import { PERFORMANCES, athletesFor, athleteFor, performancePool, score } from './historical-data';
import type { Performance, Position } from './game-model';

export type DraftInsights = {
 scoringSupported?:boolean;
 gameAverage?:number|null;lowScoreCount?:number;lowScoreThreshold?:number;coverage?:'full-loaded-archive';
 scoring:ScoringRules; athleteId:string; count:number; average:number|null; low:number|null; high:number|null;
 seasons:{year:number;count:number;average:number}[];
};

/** Mirrors the draw's equal-year, then equal-game probabilities. */
export function summarizePool(athleteId:string,position:Position,games:Performance[],rules:ScoringRules=LEGACY_SCORING):DraftInsights{
 if(position==='K'&&!rules.kicking)return {scoringSupported:false,scoring:rules,athleteId,count:games.length,average:null,low:null,high:null,seasons:[]};
 const years=new Map<number,{count:number;total:number}>();
 let low=Infinity,high=-Infinity;
 for(const game of games){
  const points=score(game.stats,position,rules);
  const year=years.get(game.season)??{count:0,total:0};
  year.count++;year.total+=points;years.set(game.season,year);
  low=Math.min(low,points);high=Math.max(high,points);
 }
 const seasons=[...years].sort(([a],[b])=>a-b).map(([year,s])=>({year,count:s.count,average:s.total/s.count}));
 return {scoring:rules,athleteId,count:games.length,seasons,
  average:seasons.length?seasons.reduce((sum,s)=>sum+s.average,0)/seasons.length:null,
  low:games.length?low:null,high:games.length?high:null};
}
export function draftInsights(athleteId:string,used:string[],rules:ScoringRules=LEGACY_SCORING){
 const athlete=athleteFor(athleteId,rules);
 if(!athlete)return null;
 // Scouting is a static aggregate of the full loaded archive, independent of saved draws.
 const games=performancePool(athleteId,rules),summary=summarizePool(athleteId,athlete.position,games,rules),points=athlete.position==='K'&&!rules.kicking?[]:games.map(p=>score(p.stats,athlete.position,rules));
 return {...summary,coverage:'full-loaded-archive' as const,gameAverage:points.length?points.reduce((a,b)=>a+b,0)/points.length:null,lowScoreThreshold:5,lowScoreCount:points.filter(n=>n<5).length};
}

/** Compact public ranks contain no hidden future draw or game selection. */
export function draftRankings(used:string[],rules:ScoringRules=LEGACY_SCORING){
 const strictPools=new Map<string,Performance[]>();
 if(rules.mode!=='historical')for(const p of PERFORMANCES){const pool=strictPools.get(p.athleteId)||[];pool.push(p);strictPools.set(p.athleteId,pool);}
 return athletesFor(rules).map(a=>{const r=summarizePool(a.id,a.position,rules.mode==='historical'?performancePool(a.id,rules):strictPools.get(a.id)||[],rules);return {athleteId:a.id,average:r.average,count:r.count};});
}
