import {database} from '@/db';
import {seasonIdentity,seasonReply} from '@/lib/season-store';
import {soloProgress,onlineProgress,quickProgress} from '@/lib/dashboard-model';
import type {DemoDraft} from '@/lib/demo-draft-model';
import type {Season} from '@/lib/season-model';
import type {League} from '@/lib/game-engine';

type SavedRow={state:string;updated_at:string};
/** Read-only account overview. No inserts, automatic corrections, reveals or random draws. */
export async function GET(request:Request){
 const user=seasonIdentity(request);
 if(!user)return seasonReply({error:'Sign in with ChatGPT to open your dashboard.',signin:true},401);
 try{
  const db=database();
  const [solo,online,quick,archives]=await Promise.all([
   db.prepare('SELECT state, updated_at FROM demo_drafts WHERE owner_id = ?').bind(user).first<SavedRow>(),
   db.prepare("SELECT state, updated_at FROM season_leagues WHERE EXISTS (SELECT 1 FROM json_each(season_leagues.state, '$.teams') WHERE json_extract(value, '$.userId') = ?) ORDER BY updated_at DESC").bind(user).all<SavedRow>(),
   db.prepare('SELECT state, updated_at FROM leagues WHERE owner_id = ?').bind(user).first<SavedRow>(),
   db.prepare('SELECT COUNT(*) AS count FROM demo_archives WHERE owner_id = ?').bind(user).first<{count:number}>(),
  ]);
  return seasonReply({overview:{solo:solo?soloProgress(JSON.parse(solo.state) as DemoDraft,solo.updated_at):null,leagues:online.results.map(row=>onlineProgress(JSON.parse(row.state) as Season,user,row.updated_at)),quick:quick?quickProgress(JSON.parse(quick.state) as League,quick.updated_at):null,archivedSoloCount:archives?.count??0}});
 }catch{return seasonReply({error:'Your saved progress could not load. Refresh to try again; no game action was taken.'},503);}
}
