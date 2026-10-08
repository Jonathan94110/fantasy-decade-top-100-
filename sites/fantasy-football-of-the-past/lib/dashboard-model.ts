import type {DemoDraft} from './demo-draft-model';
import type {League} from './game-engine';
import type {Season} from './season-model';

export type SavedProgress = {
 id:string; name:string; stage:string; detail:string; action:string; href:string;
 updatedAt:string; completedRounds:number; rosterCount?:number; rosterSize?:number;
};
export type DashboardOverview = {solo:SavedProgress|null; leagues:SavedProgress[]; quick:SavedProgress|null; archivedSoloCount:number};

function location(path:string,view:string,replay?:number){
 const query=new URLSearchParams({view});if(replay!==undefined)query.set('replay',String(replay));
 return `${path}${path.includes('?')?'&':'?'}${query}`;
}
/** Summaries read saved state only. Opening the dashboard never draws, reveals or repairs a game. */
export function soloProgress(draft:DemoDraft,updatedAt:string):SavedProgress{
 const me=draft.teams.find(team=>team.id===draft.humanTeamId);
 const common={id:draft.id,name:me?.name||'My season',updatedAt,rosterCount:me?.roster.length??0,rosterSize:draft.rosterSize??6};
 if(draft.season){
  const season=draft.season,current=season.teams.find(team=>team.id===draft.humanTeamId);
  if(season.status==='complete')return {...common,stage:'Season complete',detail:'Your final results and every saved matchup are ready to revisit.',action:'View final results',href:location('/demo','results'),completedRounds:season.history.length};
  if(season.status==='review')return {...common,stage:`Week ${season.round} · Saved result`,detail:'The historical draw is saved. Watch the replay when you are ready.',action:`Watch Week ${season.round}`,href:location('/demo','results',season.round),completedRounds:season.history.length};
  return {...common,stage:`Week ${season.round} · ${current?.locked?'Lineup locked':'Lineup open'}`,detail:current?.locked?'Your lineup is saved. Check the current week and league progress.':'Choose your starters, review any byes, then lock your lineup.',action:current?.locked?'Open current week':'Set my lineup',href:location('/demo',current?.locked?'overview':'roster'),completedRounds:season.history.length};
 }
 if(draft.status==='complete')return {...common,stage:'Draft complete',detail:'Your roster is saved. Review your team before starting Week 1.',action:'Review my team',href:'/demo?desk=draft',completedRounds:0};
 return {...common,stage:draft.orderRevealPending?'Draft order saved':`Draft round ${Math.floor(draft.pick/Math.max(1,draft.teams.length))+1}`,detail:draft.orderRevealPending?'Your draft order is waiting. Continue without a new lottery.':`${draft.picks.length} total picks saved. Continue from your place in the draft.`,action:'Continue my draft',href:'/demo?desk=draft',completedRounds:0};
}
export function onlineProgress(season:Season,userId:string,updatedAt:string):SavedProgress{
 const me=season.teams.find(team=>team.userId===userId);
 const path=`/league?league=${encodeURIComponent(season.id)}`;
 const common={id:season.id,name:season.name,updatedAt,completedRounds:season.history.length};
 if(season.status==='lobby')return {...common,stage:'League lobby',detail:`${season.teams.filter(team=>!team.vacant).length} of ${season.capacity} managers · ${me?.name||'Your team'}`,action:'Open league lobby',href:path};
 if(season.status==='draft')return {...common,stage:'Draft in progress',detail:`${season.pick} picks saved · ${me?.name||'Your team'}`,action:'Open draft room',href:location(path,'draft')};
 if(season.status==='complete')return {...common,stage:'Season complete',detail:`${me?.name||'Your team'} · Final results stay on record.`,action:'View final results',href:location(path,'results')};
 if(season.status==='review')return {...common,stage:`Week ${season.round} · Saved result`,detail:`${me?.name||'Your team'} · Watch your saved matchup.`,action:`Watch Week ${season.round}`,href:location(path,'results',season.round)};
 return {...common,stage:`Week ${season.round} · ${me?.locked?'Lineup locked':'Lineup open'}`,detail:`${me?.name||'Your team'} · ${me?.locked?'Your lineup is saved. Follow the league progress.':'Set your starters before your matchup.'}`,action:me?.locked?'Open current week':'Set my lineup',href:location(path,me?.locked?'overview':'roster')};
}
export function quickProgress(league:League,updatedAt:string):SavedProgress{
 return {id:league.id,name:'Quick matchup',stage:`Round ${league.round} · ${league.status==='reveal'?'Saved result':league.turn===1?'Home locked':'Lineups open'}`,detail:league.status==='reveal'?'Both lineups and the historical draw are saved.':league.turn===1?'Home is locked. Away can finish the second lineup.':'Build both teams on one device for a head-to-head round.',action:league.status==='reveal'?'View saved matchup':'Continue matchup',href:location('/matchup',league.status==='reveal'?'matchup':'team'),updatedAt,completedRounds:league.history.length};
}
