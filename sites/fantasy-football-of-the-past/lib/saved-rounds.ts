import type {Season,SeasonRound} from './season-model';

/**
 * Completed weeks live in their own rows, one per week, so a season row stays
 * bounded however long the season runs. A split season row keeps
 * `history: null` (code that predates week rows then fails instead of reading
 * an empty history) plus its recorded week numbers in history order. Week rows
 * are insert-only: a saved week is never rewritten, reordered or removed.
 */
export type StoredSeason=Omit<Season,'history'>&{history:SeasonRound[]|null;historyRecords?:number[]};
export type RoundRecord={number:number;state:string};
export class SavedRoundError extends Error{}

function unique(rounds:{number:number}[]){if(new Set(rounds.map(r=>r.number)).size!==rounds.length)throw new SavedRoundError('A saved week appears twice.');}

/** Read-only count for summaries that do not load weeks. */
export function savedRoundCount(season:{history:readonly unknown[]|null;historyRecords?:number[]}){return season.historyRecords?.length??season.history?.length??0;}

/** Rebuilds the exact season, loading each recorded week from its row. */
export function assembleSeason(stored:StoredSeason,rows:RoundRecord[]):{season:Season;records:RoundRecord[]}{
 const {historyRecords:numbers,...season}=stored;
 if(numbers===undefined){if(!Array.isArray(season.history))throw new SavedRoundError('This season has no saved weeks list.');return {season:season as Season,records:[]};}
 if(season.history!==null)throw new SavedRoundError('A split season cannot also hold weeks in its row.');
 const saved=new Map(rows.map(row=>[Number(row.number),row.state]));
 const records=numbers.map(number=>{const state=saved.get(number);if(state===undefined)throw new SavedRoundError(`Saved week ${number} is unavailable.`);return {number,state};});
 // Assigning the existing key keeps its position, so the season serializes exactly as before.
 season.history=records.map(record=>{const round=JSON.parse(record.state) as SeasonRound;if(round.number!==record.number)throw new SavedRoundError(`Saved week ${record.number} does not match its row.`);return round;});
 unique(season.history);
 return {season:season as Season,records};
}

/** Splits a season for saving. Recorded weeks must lead the history unchanged; each later week becomes one insert. */
export function splitSeason(season:Season,records:RoundRecord[]):{season:Season|StoredSeason;inserts:RoundRecord[]}{
 if('historyRecords' in season||!Array.isArray(season.history))throw new SavedRoundError('Load the full season before saving it.');
 // A season without weeks keeps its original format byte for byte.
 if(!season.history.length&&!records.length)return {season,inserts:[]};
 unique(season.history);
 if(season.history.length<records.length)throw new SavedRoundError('A saved week cannot be removed.');
 records.forEach((record,i)=>{if(season.history[i].number!==record.number||JSON.stringify(season.history[i])!==record.state)throw new SavedRoundError(`Week ${record.number} is already on record and cannot change.`);});
 const inserts=season.history.slice(records.length).map(round=>({number:round.number,state:JSON.stringify(round)}));
 return {season:{...season,history:null,historyRecords:season.history.map(round=>round.number)},inserts};
}
