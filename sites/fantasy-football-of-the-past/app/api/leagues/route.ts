import {database} from '@/db';
import {parseScoringMode,newScoring} from '@/lib/scoring-rules';
import {newSeason,joinSeason,publicSeason,SeasonRuleError} from '@/lib/season-engine';
import {seasonReply,seasonIdentity,checkSeasonOrigin,makeInviteCode,inviteHash,commitSeason,seasonByInvite} from '@/lib/season-store';
import type {Season,SeasonSummary} from '@/lib/season-model';
export async function GET(request:Request){
 const id=seasonIdentity(request);if(!id)return seasonReply({error:'Sign in to create or join a league.',signin:true},401);
 try{const rows=await database().prepare("SELECT state FROM season_leagues WHERE EXISTS (SELECT 1 FROM json_each(season_leagues.state, '$.teams') WHERE json_extract(value, '$.userId') = ?) ORDER BY updated_at DESC").bind(id).all<{state:string}>();
 const leagues:SeasonSummary[]=rows.results.map(row=>{const s=JSON.parse(row.state) as Season;return {id:s.id,name:s.name,status:s.status,teamName:s.teams.find(t=>t.userId===id)!.name,members:s.teams.filter(t=>!t.vacant).length,capacity:s.capacity,round:s.round};});return seasonReply({leagues});
 }catch{console.error('league-list-failed');return seasonReply({error:'Your leagues could not load. Try again.'},503);}
}
export async function POST(request:Request){
 const id=seasonIdentity(request);if(!id)return seasonReply({error:'Sign in to create or join a league.',signin:true},401);
 try{checkSeasonOrigin(request);}catch{return seasonReply({error:'This request did not come from the league.'},403);}
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body||typeof body!=='object'||Array.isArray(body))return seasonReply({error:'Supply valid league details.'},400);
 try{
  if(body.scoringMode!==undefined){
   if(body.action!=='create')throw new SeasonRuleError('Choose scoring when creating the league or in its lobby settings.');
   try{parseScoringMode(body.scoringMode);}catch(e){throw new SeasonRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
  }
  if(body.action==='create'){
   // Validate the whole proposed contract before generating an invitation or any IDs.
   try{newScoring(body.receptionPoints??1,body.kickers===true,body.scoringMode);}catch(e){throw new SeasonRuleError(e instanceof Error?e.message:'Choose valid scoring rules.');}
   const s=newSeason(id,{...(body.regularRounds===undefined?{format:'seventeen'}:{}),...body},makeInviteCode());await database().prepare('INSERT INTO season_leagues (id, owner_id, invite_hash, state, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(s.id,id,await inviteHash(s.inviteCode),JSON.stringify(s),0,new Date().toISOString()).run();return seasonReply({league:publicSeason(s,id)},201);
  }
  if(body.action==='join'||body.action==='inspectInvite'){
   const now=Date.now();await database().prepare('INSERT INTO season_join_attempts (user_id, window_at, attempts) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET attempts = CASE WHEN window_at < ? THEN 1 ELSE attempts + 1 END, window_at = CASE WHEN window_at < ? THEN excluded.window_at ELSE window_at END').bind(id,now,now-60000,now-60000).run();
   const attempts=await database().prepare('SELECT attempts FROM season_join_attempts WHERE user_id = ?').bind(id).first<{attempts:number}>();if(attempts&&attempts.attempts>8)return seasonReply({error:'Too many join attempts. Wait a minute and try again.'},429);
   if(typeof body.code!=='string'||body.code.length>40)return seasonReply({error:'Enter the invitation code from your commissioner.'},400);
   const saved=await seasonByInvite(await inviteHash(body.code));if(!saved)return seasonReply({error:'That invitation code is not available. Check it with the commissioner.'},404);
   const s=saved.season;
   if(s.removedUserIds?.includes(id))return seasonReply({error:'Your membership in this league was removed.'},403);
   if(body.action==='inspectInvite')return seasonReply({invitation:{name:s.name,status:s.status,vacancies:s.teams.filter(t=>t.vacant).map(t=>({id:t.id,name:t.name,locked:t.locked})),canJoin:s.status==='lobby'&&s.teams.length<s.capacity}});
   const next=joinSeason(s,id,body.teamName,body.teamId);if(s.teams.some(t=>t.userId===id))return seasonReply({league:publicSeason(s,id)});return await commitSeason(s,next,id,saved.records);
  }
  return seasonReply({error:'Choose create or join.'},400);
 }catch(e){if(e instanceof SeasonRuleError)return seasonReply({error:e.message},400);return seasonReply({error:'The league could not be saved. Try again.'},503);}
}
