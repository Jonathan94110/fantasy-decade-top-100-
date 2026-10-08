import {database} from '@/db';
import {publicSeason} from './season-engine';
import type {Season} from './season-model';
export const seasonReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function seasonIdentity(request:Request){return request.headers.get('oai-authenticated-user-id');}
export function checkSeasonOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('This request did not come from the league.');}
export function makeInviteCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>alphabet[n&31]).join('').match(/.{4}/g)!.join('-');}
export async function inviteHash(code:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code.replace(/[\s-]/g,'').toUpperCase()));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function seasonRow(id:string){return database().prepare('SELECT state, revision FROM season_leagues WHERE id = ?').bind(id).first<{state:string;revision:number}>();}
export async function commitSeason(current:Season,next:Season,userId:string){
 next.revision=current.revision+1;
 const updated=await database().prepare('UPDATE season_leagues SET state = ?, revision = ?, invite_hash = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(next),next.revision,await inviteHash(next.inviteCode),new Date().toISOString(),next.id,current.revision).run();
 if(!updated.meta.changes){const row=await seasonRow(current.id);const saved=row?JSON.parse(row.state) as Season:null;return seasonReply({error:'The league changed while you were acting. Review the latest state and try again.',...(saved?.teams.some(t=>t.userId===userId)?{league:publicSeason(saved,userId)}:{})},409);}
 return seasonReply({league:publicSeason(next,userId)});
}
