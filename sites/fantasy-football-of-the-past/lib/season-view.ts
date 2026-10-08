import {playoffCount,type Season} from './season-model';
export function seasonLength(s:Pick<Season,'regularRounds'|'capacity'|'format'|'playoffTeams'>){return s.regularRounds+(playoffCount(s)===6?3:s.capacity>=4?2:1);}

export function requiredGames(s:Pick<Season,'regularRounds'|'capacity'|'round'|'status'|'format'|'playoffTeams'>){return s.status==='lobby'||s.status==='draft'?seasonLength(s):Math.max(1,seasonLength(s)-s.round+(s.status==='review'||s.status==='complete'?0:1));}

export function draftTeam(s:Pick<Season,'pick'|'draftOrder'>){const round=Math.floor(s.pick/s.draftOrder.length),offset=s.pick%s.draftOrder.length;return s.draftOrder[round%2?s.draftOrder.length-1-offset:offset];}

export function standings(s:{teams:{id:string;name:string}[];history:Pick<Season['history'][number],'phase'|'matches'>[]}){
 const rows=s.teams.map(t=>({teamId:t.id,name:t.name,wins:0,losses:0,ties:0,points:0}));
 for(const r of s.history.filter(r=>r.phase==='regular'))for(const m of r.matches){const a=rows.find(t=>t.teamId===m.home)!,b=rows.find(t=>t.teamId===m.away)!;a.points=Math.round((a.points+m.homeScore)*100)/100;b.points=Math.round((b.points+m.awayScore)*100)/100;if(!m.winner){a.ties++;b.ties++;}else{(m.winner===a.teamId?a:b).wins++;(m.winner===a.teamId?b:a).losses++;}}
 return rows.sort((a,b)=>(b.wins+b.ties*.5)-(a.wins+a.ties*.5)||b.points-a.points||s.teams.findIndex(t=>t.id===a.teamId)-s.teams.findIndex(t=>t.id===b.teamId));
}

export function currentPairs(s:Pick<Season,'round'|'regularRounds'|'schedule'|'capacity'|'playoffSeeds'|'format'|'playoffTeams'>&{history:Pick<Season['history'][number],'phase'|'matches'>[]}):[string,string][]{
 if(s.round<=s.regularRounds)return s.schedule[s.round-1]??[];
 if(playoffCount(s)===6){
  if(s.round===s.regularRounds+1)return [[s.playoffSeeds[2],s.playoffSeeds[5]],[s.playoffSeeds[3],s.playoffSeeds[4]]];
  if(s.round===s.regularRounds+2){const winners=s.history.find(r=>r.phase==='quarterfinal')?.matches.map(m=>m.winner!);return winners?[[s.playoffSeeds[0],winners[1]],[s.playoffSeeds[1],winners[0]]]:[];}
 }
 if(playoffCount(s)===4&&s.round===s.regularRounds+1)return [[s.playoffSeeds[0],s.playoffSeeds[3]],[s.playoffSeeds[1],s.playoffSeeds[2]]];
 const finalists=s.capacity>=4?s.history.find(r=>r.phase==='semifinal')!.matches.map(m=>m.winner!):s.playoffSeeds.slice(0,2);
 return [[finalists[0],finalists[1]]];
}

export function seasonPhase(s:Pick<Season,'round'|'regularRounds'|'capacity'|'format'|'playoffTeams'>):Season['history'][number]['phase']{return s.round<=s.regularRounds?'regular':playoffCount(s)===6&&s.round===s.regularRounds+1?'quarterfinal':s.round<seasonLength(s)?'semifinal':'final';}
export function phaseLabel(s:Parameters<typeof seasonPhase>[0]){return {regular:'Regular season',quarterfinal:'Quarterfinals',semifinal:'Semifinals',final:'Championship'}[seasonPhase(s)];}
