import type {ByeSchedule} from './season-byes';
import type {ScoringRules} from './scoring-rules';
import type { Lineup, Draw } from './game-engine';
export const ROSTER_SIZE=10;
export function seasonRosterSize(s:{lineupVersion?:1|2|3}){return s.lineupVersion===3?11:10;}
export function regularRoundOptions(capacity:number){return capacity===2?[6,10,14]:[2*(capacity-1),4*(capacity-1)];}
export type SeasonTeam={vacant?:boolean;id:string;userId:string;name:string;roster:string[];lineup:Lineup;locked:boolean};
export type Trade={round?:number;reason?:string;id:string;from:string;to:string;give:string;receive:string;status:'pending'|'accepted'|'rejected'|'cancelled'|'expired';createdAt:string};
export type Match={home:string;away:string;homeScore:number;awayScore:number;winner:string|null;tiebreak?:string};
export type SeasonDraw=Omit<Draw,'performance'>&{simulatedBye?:true;performance:Partial<Draw['performance']>};
export type BenchDraw=Omit<SeasonDraw,'points'>&{points:number|null;unavailable?:'exhausted'};
export type SeasonRound={scoring?:ScoringRules;lineupVersion?:1|2|3;benchDraws?:Record<string,BenchDraw[]>;rosterSnapshots?:Record<string,string[]>;number:number;phase:'regular'|'quarterfinal'|'semifinal'|'final';matches:Match[];draws:Record<string,SeasonDraw[]>;resolvedAt:string};
export type Season={
 draftPicks?:import('./draft-board').DraftBoardPick[];removedUserIds?:string[];orderMode?:'random'|'manual';
 byes?:ByeSchedule;
 format?:'seventeen';
 playoffTeams?:4|6;
 scoring?:ScoringRules;
 lineupVersion?:1|2|3;
 replayReveals?:Record<string,number[]>;
 id:string;name:string;ownerId:string;inviteCode:string;revision:number;createdAt:string;
 capacity:number;regularRounds:number;hallCap:number;status:'lobby'|'draft'|'active'|'review'|'complete';
 teams:SeasonTeam[];draftOrder:string[];pick:number;round:number;used:string[];history:SeasonRound[];
 trades:Trade[];schedule:[string,string][][];playoffSeeds:string[];champion:string|null;
 activity:{id:string;text:string;at:string}[];
};
export type PublicDraw=Omit<SeasonDraw,'performance'>&{performance:Partial<Draw['performance']>};
export type PublicSeasonRound=Omit<SeasonRound,'draws'>&{receiptsHidden:boolean;draws:Record<string,PublicDraw[]>};
export type PublicSeason=Omit<Season,'ownerId'|'teams'|'inviteCode'|'history'|'replayReveals'|'removedUserIds'> & {
 history:PublicSeasonRound[];revealedRounds:number[];
 teams:Omit<SeasonTeam,'userId'>[];inviteCode?:string;myTeamId:string;isCommissioner:boolean;
};
export type SeasonSummary={id:string;name:string;status:Season['status'];teamName:string;members:number;capacity:number;round:number};

export const TEAM_COUNTS=[2,4,6,8,10,12,14,16];
export function modernRegularWeeks(capacity:number,qualifiers=capacity>=6?6:4){return capacity===2?16:qualifiers===6?14:15;}
export function playoffCount(s:Pick<Season,'capacity'|'format'|'playoffTeams'>){return s.format==='seventeen'&&s.capacity>=6?(s.playoffTeams??6):s.capacity>=4?4:2;}
