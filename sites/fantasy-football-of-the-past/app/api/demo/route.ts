import {scoringFor,parseScoringMode} from '@/lib/scoring-rules';
import {database} from '@/db';
import {newDemoDraft,demoDraftAction,demoReply,DemoRuleError} from '@/lib/demo-draft-engine';
import {SeasonRuleError} from '@/lib/season-engine';
import type {DemoDraft} from '@/lib/demo-draft-model';
import {draftInsights,draftRankings} from '@/lib/draft-insights';
import {seasonReply,seasonIdentity,checkSeasonOrigin} from '@/lib/season-store';
import {unifiedDraftCandidate,unifyUnscoredDraft} from '@/lib/unified-draft';
async function read(user:string){const row=await database().prepare('SELECT state FROM demo_drafts WHERE owner_id = ?').bind(user).first<{state:string}>();return row?JSON.parse(row.state) as DemoDraft:null;}
async function savedArchives(user:string){
 const rows=await database().prepare('SELECT id, state, revision, archived_at FROM demo_archives WHERE owner_id = ? ORDER BY archived_at DESC').bind(user).all<{id:string;state:string;revision:number;archived_at:string}>();
 return {generation:Math.max(-1,...rows.results.map(row=>row.revision))+1,archives:rows.results.map(row=>{const saved=JSON.parse(row.state) as DemoDraft;return {id:row.id,name:saved.teams.find(t=>t.id===saved.humanTeamId)?.name||'Previous season',archivedAt:row.archived_at};})};
}
async function reply(user:string,saved:DemoDraft|null,status=200){return seasonReply({...demoReply(saved),...(unifiedDraftCandidate(saved)?{unificationAvailable:true}:{}),...(!saved?await savedArchives(user):{})},status);}
export async function GET(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to open your saved season.',signin:true},401);
 try{const saved=await read(user),params=new URL(request.url).searchParams;if(params.has('rankings'))return seasonReply({rankings:draftRankings(saved?.season?.used??[],scoringFor(saved)),scoring:scoringFor(saved)});const athlete=params.get('athlete');if(athlete){const insights=draftInsights(athlete,saved?.season?.used??[],scoringFor(saved));return insights?seasonReply({insights}):seasonReply({error:'Player not found.'},404);}return await reply(user,saved);}
 catch{return seasonReply({error:'Your saved draft or season could not load. Try again.'},503);}
}
export async function POST(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to start your season.',signin:true},401);
 try{checkSeasonOrigin(request);}catch{return seasonReply({error:'This request did not come from the demo.'},403);}
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||typeof body!=='object'||Array.isArray(body))return seasonReply({error:'Supply a valid draft action.'},400);
 try{
  if(body.scoringMode!==undefined){
   if(body.action!=='create')throw new DemoRuleError('Scoring is fixed when your saved draft starts. Choose a mode when creating a new season.');
   try{parseScoringMode(body.scoringMode);}catch(e){throw new DemoRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
  }
  const current=await read(user);
  if(body.action==='unifyDraft'){
   if(!current)return seasonReply({error:'Your saved draft is unavailable.'},404);
   if(body.seasonId!==current.id||body.revision!==current.revision)return await reply(user,current,409);
   const next=unifyUnscoredDraft(current);
   if(!next)return await reply(user,current);
   const backupTrigger=current.scoring?.version===4?'backup_demo_v4_before_scoring_unification':'backup_demo_before_scoring_unification';
   const backupReady=await database().prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(backupTrigger).first();
   if(!backupReady)return seasonReply({error:'Your draft is safe. Its scoring update is waiting for backup storage to finish.'},503);
   next.revision=current.revision+1;
   // The BEFORE UPDATE trigger captures the exact original DB row atomically.
   // A backup failure aborts this update; a concurrent action invalidates the CAS.
   const result=await database().prepare('UPDATE demo_drafts SET state = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(next),next.revision,new Date().toISOString(),user,current.id,current.revision).run();
   return await reply(user,await read(user),result.meta.changes?200:409);
  }
  if(body.action==='undoUnifiedDraft'){
   if(!current||body.seasonId!==current.id||body.revision!==current.revision)return await reply(user,current,409);
   const backup=await database().prepare('SELECT state, source_revision FROM demo_scoring_backups WHERE owner_id = ? AND draft_id = ? AND source_revision = ? ORDER BY created_at DESC LIMIT 1').bind(user,current.id,current.revision-1).first<{state:string;source_revision:number}>();
   if(!backup)return seasonReply({error:'The original scoring can be restored only before any later draft action.'},400);
   const original=JSON.parse(backup.state) as DemoDraft,expected=unifyUnscoredDraft(original);
   if(!expected)return seasonReply({error:'This backup is not compatible with the current draft.'},400);
   expected.revision=current.revision;
   if(JSON.stringify(expected)!==JSON.stringify(current))return seasonReply({error:'Your draft has progressed. Its current scoring must stay fixed.'},400);
   original.revision=current.revision+1;original.unificationReverted=true;
   const result=await database().prepare('UPDATE demo_drafts SET state = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(original),original.revision,new Date().toISOString(),user,current.id,current.revision).run();
   return seasonReply(demoReply(await read(user)),result.meta.changes?200:409);
  }
  if(body.action==='reset'){
   if(body.confirm!==true||typeof body.seasonId!=='string')return seasonReply({error:'Confirm the reset of this specific solo season.'},400);
   if(!current){const archived=await database().prepare('SELECT id FROM demo_archives WHERE owner_id = ? AND id = ?').bind(user,body.seasonId).first();return archived?await reply(user,null):seasonReply({error:'That season is not available.'},404);}
   if(current.id!==body.seasonId||current.revision!==body.revision)return seasonReply({error:'Your season changed. Review it before confirming reset.',...demoReply(current)},409);
   // The trigger archives the exact deleted row in the same SQLite statement.
   // A failed archive insert aborts deletion; concurrent picks invalidate the revision.
   const reset=await database().prepare('DELETE FROM demo_drafts WHERE owner_id = ? AND id = ? AND revision = ?').bind(user,current.id,current.revision).run();
   if(!reset.meta.changes)return seasonReply({error:'Your season changed before reset. Refresh and review it.',...demoReply(await read(user))},409);
   return await reply(user,null);
  }
  if(body.action==='restore'){
   if(current)return seasonReply({error:'Reset the current season before restoring another.',...demoReply(current)},409);
   if(typeof body.archiveId!=='string')return seasonReply({error:'Choose your saved season backup.'},400);
   const result=await database().prepare(`INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at) SELECT owner_id,id,json_set(state, '$.revision', (SELECT MAX(revision)+1 FROM demo_archives WHERE owner_id = ?)),(SELECT MAX(revision)+1 FROM demo_archives WHERE owner_id = ?),? FROM demo_archives WHERE owner_id = ? AND id = ? ON CONFLICT(owner_id) DO NOTHING`).bind(user,user,new Date().toISOString(),user,body.archiveId).run();
   if(!result.meta.changes)return seasonReply({error:'That backup is unavailable, or a new season has already started.'},409);
   return await reply(user,await read(user));
  }
  if(body.action==='create'){
   // Double-clicks, retries, refreshes and other tabs resume the same saved draft.
   if(current)return seasonReply(demoReply(current));
   const demo=newDemoDraft(body.teamName,body.receptionPoints??1,{modern:true,capacity:body.capacity,names:body.names,playoffTeams:body.playoffTeams,orderMode:body.orderMode,orderIndexes:body.orderIndexes,opening:body.opening===true,kickers:body.kickers===true,scoringMode:body.scoringMode});
   await database().prepare(`INSERT INTO demo_drafts (owner_id,id,state,revision,updated_at)
    SELECT ?,?,json_set(?, '$.revision', COALESCE((SELECT MAX(revision)+1 FROM demo_archives WHERE owner_id = ?),0)),COALESCE((SELECT MAX(revision)+1 FROM demo_archives WHERE owner_id = ?),0),? WHERE true
    ON CONFLICT(owner_id) DO NOTHING`).bind(user,demo.id,JSON.stringify(demo),user,user,new Date().toISOString()).run();
   return seasonReply(demoReply(await read(user)),201);
  }
  if(!current)return seasonReply({error:'Start your draft first.'},404);
  if((body.seasonId!==undefined&&body.seasonId!==current.id)||body.revision!==current.revision)return seasonReply({error:'Your draft changed in another tab. Review the saved picks before choosing again.',...demoReply(current)},409);
  const next=demoDraftAction(current,body);next.revision=current.revision+1;
  const result=await database().prepare('UPDATE demo_drafts SET state = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(next),next.revision,new Date().toISOString(),user,current.id,current.revision).run();
  if(!result.meta.changes)return seasonReply({error:'Another pick was already saved. Review your latest draft.',...demoReply(await read(user))},409);
  return seasonReply(demoReply(next));
 }catch(e){if(e instanceof DemoRuleError||e instanceof SeasonRuleError)return seasonReply({error:e.message},400);return seasonReply({error:'The action could not be saved. Refresh to check your saved draft or season before trying again.'},503);}
}
