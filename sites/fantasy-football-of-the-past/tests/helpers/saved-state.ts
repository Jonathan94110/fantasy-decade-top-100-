import type {DatabaseSync} from 'node:sqlite';
import type {DemoDraft} from '../../lib/demo-draft-model.ts';
import {assembleSeason,type RoundRecord,type StoredSeason} from '../../lib/saved-rounds.ts';

/** The saved online season exactly as the app loads it: its row plus its week rows. */
export async function savedLeague(sql:DatabaseSync,id:string){
 const row=sql.prepare('SELECT state FROM season_leagues WHERE id=?').get(id) as {state:string}|undefined;
 if(!row)return null;const stored=JSON.parse(row.state) as StoredSeason;
 return assembleSeason(stored,sql.prepare('SELECT number, state FROM season_league_rounds WHERE league_id=?').all(stored.id) as RoundRecord[]).season;
}
/** The saved solo draft exactly as the app loads it: its row plus its week rows. */
export async function savedDemo(sql:DatabaseSync,owner:string){
 const row=sql.prepare('SELECT state FROM demo_drafts WHERE owner_id=?').get(owner) as {state:string}|undefined;
 if(!row)return null;const demo=JSON.parse(row.state) as DemoDraft;
 if(demo.season)demo.season=assembleSeason(demo.season as unknown as StoredSeason,sql.prepare('SELECT number, state FROM demo_draft_rounds WHERE draft_id=?').all(demo.id) as RoundRecord[]).season;
 return demo;
}
