import {database} from '@/db';
import {seasonIdentity,seasonReply} from '@/lib/season-store';
import {publicSeason} from '@/lib/season-engine';
import {demoReply} from '@/lib/demo-draft-engine';
import {draftRankings} from '@/lib/draft-insights';
import {scoringFor,newScoring} from '@/lib/scoring-rules';
import type {Season} from '@/lib/season-model';
import type {DemoDraft} from '@/lib/demo-draft-model';
/** Read-only, single-snapshot context and full-archive ranks. Never creates a game. */
export async function GET(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to view your depth chart.'},401);
 try{
  const id=new URL(request.url).searchParams.get('league');
  if(id){const row=await database().prepare('SELECT state FROM season_leagues WHERE id = ?').bind(id).first<{state:string}>();if(!row)return seasonReply({error:'League not found.'},404);const league=JSON.parse(row.state) as Season;if(!league.teams.some(t=>t.userId===user))return seasonReply({error:'League not found.'},404);const scoring=scoringFor(league);return seasonReply({league:publicSeason(league,user),scoring,rankings:draftRankings([],scoring)});}
  const row=await database().prepare('SELECT state FROM demo_drafts WHERE owner_id = ?').bind(user).first<{state:string}>(),demo=row?JSON.parse(row.state) as DemoDraft:null,scoring=demo?scoringFor(demo):newScoring(1,true,'historical');
  return seasonReply({...demoReply(demo),scoring,rankings:draftRankings([],scoring)});
 }catch{return seasonReply({error:'The depth chart could not load. Your saved game is unchanged.'},503);}
}
