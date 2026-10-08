import {athleteFor,type Athlete,type LineupSlot} from './game-model';
import type {ScoringRules} from './scoring-rules';

export const PLAYER_ERAS=[1950,1960,1970,1980,1990,2000,2010,2020] as const;
export type PlayerBrowsePosition=LineupSlot|'ALL';
export const PLAYER_BROWSE_NOTE='Era filters browse verified game years only. Choosing a player still draws from their full eligible game pool; the filter does not choose the year or game.';

/** Source identities can contain colons; remove a complete athlete prefix first. */
export function consumedPerformanceYears(athleteId:string,used:readonly string[]){
 const prefixes=[`nflverse:${athleteId}:`,`prime-rushmore:${athleteId}:`];
 return used.flatMap(id=>{
  const prefix=prefixes.find(prefix=>id.startsWith(prefix));if(!prefix)return [];
  // A January game belongs to the recorded season, which can precede its date.
  const suffix=id.slice(prefix.length),match=/^(\d{4}):\d{8}-/.exec(suffix)??/^(\d{4})(?:_|\d{4}-)/.exec(suffix);
  return [{year:match?Number(match[1]):null}];
 });
}
/** Compact verified game counts only: career/profile years never grant eligibility. */
export function matchesPlayableEra(athlete:Athlete,era=0,used:readonly string[]=[],rules?:ScoringRules){
 const selected=rules?.mode==='historical'?athleteFor(athlete.id,rules):athlete;
 if(!selected)return false;
 const counts={...selected.gamesBySeason};
 for(const {year} of consumedPerformanceYears(selected.id,used))if(year!==null&&year in counts)counts[year]--;
 return selected.seasons.some(year=>counts[year]>0&&(!era||year>=era&&year<=era+9));
}

/** A read-only preview link; never enables a profile in a draft. */
export function historicalPreviewHref(position:LineupSlot|'ALL',era=0,search=''){
 const params=new URLSearchParams();
 if(['QB','RB','WR','TE','K'].includes(position))params.set('position',position);
 if([1960,1970,1980,1990].includes(era))params.set('era',String(era));
 if(search.trim())params.set('search',search.trim().slice(0,100));
 return `/historical-preview${params.size?'?'+params.toString():''}`;
}
