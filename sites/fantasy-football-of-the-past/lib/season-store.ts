import {database} from '@/db';
import {publicSeason} from './season-engine';
import type {Season} from './season-model';
import type {DemoDraft} from './demo-draft-model';
import {assembleSeason,splitSeason,SavedRoundError,type RoundRecord,type StoredSeason} from './saved-rounds';
export const seasonReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function seasonIdentity(request:Request){return request.headers.get('oai-authenticated-user-id');}
export function checkSeasonOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('This request did not come from the league.');}
export function makeInviteCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>alphabet[n&31]).join('').match(/.{4}/g)!.join('-');}
export async function inviteHash(code:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code.replace(/[\s-]/g,'').toUpperCase()));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
/** A loaded season is always complete; `records` holds the weeks already saved in their own rows. */
export type SavedSeason={season:Season;records:RoundRecord[]};
export type SavedDemo={demo:DemoDraft;records:RoundRecord[]};
async function savedRounds(table:'season_league_rounds'|'demo_draft_rounds',key:string,stored:StoredSeason){
 if(!stored.historyRecords?.length)return [];
 return (await database().prepare(table==='season_league_rounds'?'SELECT number, state FROM season_league_rounds WHERE league_id = ?':'SELECT number, state FROM demo_draft_rounds WHERE draft_id = ?').bind(key).all<RoundRecord>()).results;
}
async function savedSeason(row:{state:string}|null):Promise<SavedSeason|null>{
 if(!row)return null;const stored=JSON.parse(row.state) as StoredSeason;
 return assembleSeason(stored,await savedRounds('season_league_rounds',stored.id,stored));
}
export async function seasonRow(id:string){return savedSeason(await database().prepare('SELECT state FROM season_leagues WHERE id = ?').bind(id).first<{state:string}>());}
export async function seasonByInvite(hash:string){return savedSeason(await database().prepare('SELECT state FROM season_leagues WHERE invite_hash = ?').bind(hash).first<{state:string}>());}
export async function demoRow(owner:string):Promise<SavedDemo|null>{
 const row=await database().prepare('SELECT state FROM demo_drafts WHERE owner_id = ?').bind(owner).first<{state:string}>();
 if(!row)return null;const demo=JSON.parse(row.state) as DemoDraft;
 if(!demo.season)return {demo,records:[]};
 const stored=demo.season as unknown as StoredSeason,{season,records}=assembleSeason(stored,await savedRounds('demo_draft_rounds',demo.id,stored));
 demo.season=season;return {demo,records};
}
/** New week rows are written only if the guarded season row is still the one that was read. */
function roundInserts(table:'season_league_rounds'|'demo_draft_rounds',key:string,inserts:RoundRecord[],guard:string,guardValues:unknown[],now:string){
 const column=table==='season_league_rounds'?'league_id':'draft_id';
 return inserts.map(round=>database().prepare(`INSERT INTO ${table} (${column}, number, state, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (${guard})`).bind(key,round.number,round.state,now,...guardValues));
}
// One D1 batch is one transaction: the week rows and the season row are saved together or not at all.
async function saveAll(statements:D1PreparedStatement[]){return statements.length===1?statements[0].run():(await database().batch(statements)).at(-1)!;}
export async function commitSeason(current:Season,next:Season,userId:string,records:RoundRecord[]){
 next.revision=current.revision+1;
 const now=new Date().toISOString(),{season:stored,inserts}=splitSeason(next,records);
 const updated=await saveAll([
  ...roundInserts('season_league_rounds',next.id,inserts,'SELECT 1 FROM season_leagues WHERE id = ? AND revision = ?',[current.id,current.revision],now),
  database().prepare('UPDATE season_leagues SET state = ?, revision = ?, invite_hash = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(stored),next.revision,await inviteHash(next.inviteCode),now,current.id,current.revision),
 ]);
 if(!updated.meta.changes){const saved=(await seasonRow(current.id))?.season;return seasonReply({error:'The league changed while you were acting. Review the latest state and try again.',...(saved?.teams.some(t=>t.userId===userId)?{league:publicSeason(saved,userId)}:{})},409);}
 return seasonReply({league:publicSeason(next,userId)});
}
/** Saves a solo draft or season under the same revision guard as before; returns the rows changed. */
export async function commitDemo(owner:string,current:DemoDraft,next:DemoDraft,records:RoundRecord[]){
 const now=new Date().toISOString();let state:string,inserts:RoundRecord[]=[];
 if(next.season){const split=splitSeason(next.season,records);inserts=split.inserts;state=JSON.stringify({...next,season:split.season});}
 else if(records.length)throw new SavedRoundError('A saved week cannot be removed.');
 else state=JSON.stringify(next);
 const updated=await saveAll([
  ...roundInserts('demo_draft_rounds',current.id,inserts,'SELECT 1 FROM demo_drafts WHERE owner_id = ? AND id = ? AND revision = ?',[owner,current.id,current.revision],now),
  database().prepare('UPDATE demo_drafts SET state = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?').bind(state,next.revision,now,owner,current.id,current.revision),
 ]);
 return updated.meta.changes;
}
