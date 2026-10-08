import {seasonIdentity,seasonReply,seasonRow,demoRow} from '@/lib/season-store';
import {publicSeason} from '@/lib/season-engine';
import {demoReply} from '@/lib/demo-draft-engine';
import {draftRankings} from '@/lib/draft-insights';
import {scoringFor,newScoring} from '@/lib/scoring-rules';
/** Read-only, single-snapshot context and full-archive ranks. Never creates a game. */
export async function GET(request:Request){
 const user=seasonIdentity(request);if(!user)return seasonReply({error:'Sign in to view your depth chart.'},401);
 try{
  const id=new URL(request.url).searchParams.get('league');
  if(id){const saved=await seasonRow(id);if(!saved)return seasonReply({error:'League not found.'},404);const league=saved.season;if(!league.teams.some(t=>t.userId===user))return seasonReply({error:'League not found.'},404);const scoring=scoringFor(league);return seasonReply({league:publicSeason(league,user),scoring,rankings:draftRankings([],scoring)});}
  const demo=(await demoRow(user))?.demo??null,scoring=demo?scoringFor(demo):newScoring(1,true,'historical');
  return seasonReply({...demoReply(demo),scoring,rankings:draftRankings([],scoring)});
 }catch{return seasonReply({error:'The depth chart could not load. Your saved game is unchanged.'},503);}
}
