import {database} from '@/db';
import {seasonIdentity,seasonReply,checkSeasonOrigin} from '@/lib/season-store';
import {emptyPreferences,updatePreferences,type DraftPreferences} from '@/lib/draft-preferences';
import type {Season} from '@/lib/season-model';
async function allowed(user:string,scope:string){
 if(scope.length>180)return false;const [mode,id,side]=scope.split(':');
 if(!id)return false;
 if(mode==='demo')return !!await database().prepare('SELECT id FROM demo_drafts WHERE owner_id = ? AND id = ?').bind(user,id).first();
 if(mode==='season'){
  const row=await database().prepare('SELECT state FROM season_leagues WHERE id = ?').bind(id).first<{state:string}>();
  return !!row&&(JSON.parse(row.state) as Season).teams.some(t=>t.userId===user);
 }
 if(mode==='quick'&&['0','1'].includes(side)){
  const row=await database().prepare('SELECT state FROM leagues WHERE owner_id = ?').bind(user).first<{state:string}>();
  return !!row&&JSON.parse(row.state).id===id;
 }return false;
}
async function read(user:string,scope:string){const row=await database().prepare('SELECT state FROM draft_preferences WHERE owner_id = ? AND scope = ?').bind(user,scope).first<{state:string}>();return row?JSON.parse(row.state) as DraftPreferences:null;}
export async function GET(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to save your draft queue.'},401);
 try{const scope=new URL(request.url).searchParams.get('scope')||'';if(!await allowed(user,scope))return seasonReply({error:'Draft not found.'},404);return seasonReply({preferences:await read(user,scope)??emptyPreferences()});}
 catch{return seasonReply({error:'Your queue could not load. Your picks are safe.'},503);}
}
export async function POST(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to save your draft queue.'},401);
 try{checkSeasonOrigin(request);}catch{return seasonReply({error:'This request did not come from the draft.'},403);}
 try{
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body||typeof body!=='object'||Array.isArray(body))return seasonReply({error:'Supply a valid queue action.'},400);const scope=String(body.scope??'');
  if(!await allowed(user,scope))return seasonReply({error:'Draft not found.'},404);
  const saved=await read(user,scope),current=saved??emptyPreferences();
  if(body.revision!==current.revision)return seasonReply({error:'Your queue changed in another tab. Review the latest order.',preferences:current},409);
  let next:DraftPreferences;try{next=updatePreferences(current,body);}catch(e){return seasonReply({error:e instanceof Error?e.message:'Invalid queue change.'},400);}
  const result=saved?await database().prepare('UPDATE draft_preferences SET state = ?, revision = ? WHERE owner_id = ? AND scope = ? AND revision = ?').bind(JSON.stringify(next),next.revision,user,scope,current.revision).run():await database().prepare('INSERT INTO draft_preferences (owner_id,scope,state,revision) VALUES (?,?,?,?) ON CONFLICT(owner_id,scope) DO NOTHING').bind(user,scope,JSON.stringify(next),next.revision).run();
  if(!result.meta.changes)return seasonReply({error:'Another queue change was saved first. Review your queue.',preferences:await read(user,scope)},409);
  return seasonReply({preferences:next});
 }catch{return seasonReply({error:'Your queue could not save. Try again; no draft picks were made.'},503);}
}
