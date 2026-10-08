import { athletesFor, athleteFor, eligibleForSlot, lineupSlots } from './game-model';
import {scoringFor} from './scoring-rules';
import { poolAvailability } from './era-catalog';
import type { League, Lineup } from './game-engine';

/** This only chooses athletes. Historical games remain server-only until both locks. */
export function fillOpenSlots(league: League, current: Lineup, random = Math.random): Lineup {
 const next = {...current};
 for(const slot of lineupSlots(league)) {
  if(next[slot]) continue;
  const candidates = athletesFor(scoringFor(league)).filter(a => eligibleForSlot(a,slot) && !Object.values(next).includes(a.id)
   && poolAvailability(a,league.used,scoringFor(league)).count >= (league.turn===1 ? 2 : 1));
  if(!candidates.length) throw new Error(`No eligible ${slot} remains. Choose a different lineup.`);
  const chosen = candidates[Math.min(candidates.length-1,Math.max(0,Math.floor(random()*candidates.length)))];
  next[slot]=chosen.id;
 }
 return next;
}
export function draftStorageKey(league:League){return `ffpast:draft:v1:${league.id}:${league.round}:${league.turn}`;}
export function readStagedDraft(league:League):Lineup {
 if(league.status!=='draft')return {};
 try {
  const saved=JSON.parse(localStorage.getItem(draftStorageKey(league)) || '{}') as Lineup;
  const result:Lineup={};
  for(const slot of lineupSlots(league)) {
   const athlete=athleteFor(saved?.[slot],scoringFor(league));
   if(athlete && eligibleForSlot(athlete,slot) && !Object.values(result).includes(athlete.id) && poolAvailability(athlete,league.used,scoringFor(league)).count) result[slot]=athlete.id;
  }
  return result;
 }catch{return {};}
}
