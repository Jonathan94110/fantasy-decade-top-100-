import {scoringFor} from '@/lib/scoring-rules';
import {database} from '@/db';
import {newLeague,normalizeLeague,lockLineup,nextRound,publicLeague,updateLeagueRules,type League} from '@/lib/game-engine';
import {draftInsights,draftRankings} from '@/lib/draft-insights';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function owner(request:Request){return request.headers.get('oai-authenticated-user-id');}
async function load(id:string){return database().prepare('SELECT state, revision FROM leagues WHERE owner_id = ?').bind(id).first<{state:string;revision:number}>();}
export async function GET(request:Request){try{const id=owner(request);if(!id)return reply({error:'Sign in to save and play your private league.',signin:true},401);let row=await load(id);if(!row){const league=newLeague(crypto.randomUUID());await database().prepare('INSERT OR IGNORE INTO leagues (owner_id,state,revision,updated_at) VALUES (?,?,?,?)').bind(id,JSON.stringify(league),0,new Date().toISOString()).run();row=await load(id);}const saved=JSON.parse(row!.state) as League;const params=new URL(request.url).searchParams;if(params.has('rankings'))return reply({rankings:draftRankings(saved.used,scoringFor(saved)),scoring:scoringFor(saved),revision:row!.revision});const athleteId=params.get('athlete');if(athleteId){const insights=draftInsights(athleteId,saved.used,scoringFor(saved));return insights?reply({insights,revision:row!.revision}):reply({error:'Player not found in the playable archive.'},404);}return reply({league:publicLeague(saved)});}catch(e){console.error('game-load',e);return reply({error:'Your league could not load. Try again; your saved rounds are safe.'},503);}}
export async function POST(request:Request){try{
 const id=owner(request);if(!id)return reply({error:'Sign in to play.',signin:true},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'This request did not come from the game.'},403);
 const body=await request.json() as {action:string;revision:number;turn:number;lineup:Record<string,string>;cap?:number;receptionPoints?:unknown;scoringMode?:unknown};
 if(body.scoringMode!==undefined&&body.action!=='rules')throw new Error('Choose scoring before the first lineup locks. Scoring cannot change during play.');
 const row=await load(id);if(!row)return reply({error:'Load your league first.'},409);const current=normalizeLeague(JSON.parse(row.state) as League);
 if(body.revision!==row.revision)return reply({error:'Your league changed in another tab. The saved state has been restored.',league:publicLeague(current)},409);
 let next:League;if(body.action==='lock')next=lockLineup(current,body.lineup,body.turn);else if(body.action==='next')next=nextRound(current);else if(body.action==='rules')next=updateLeagueRules(current,body);else throw new Error('Unknown game action.');
 next.revision=row.revision+1;
 const result=await database().prepare('UPDATE leagues SET state = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(next),next.revision,new Date().toISOString(),id,row.revision).run();
 if(!result.meta.changes){const saved=await load(id);return reply({error:'Another action completed first. Your saved round is unchanged.',league:publicLeague(JSON.parse(saved!.state))},409);}
 return reply({league:publicLeague(next)});
 }catch(e){console.error('game-action',e);return reply({error:e instanceof Error?e.message:'The action could not be saved. Please try again.'},400);}}
