import {z} from 'zod';
// Source-aware adapter contract. No scraper, external fetch, or unlicensed data is included.
const stat=z.number().finite().nullable();
export const HistoricalGameSchema=z.object({
 gameId:z.string().min(1),season:z.number().int().min(2020),seasonType:z.enum(['REG','POST','PRE']),week:z.number().int().positive(),date:z.string().date(),completed:z.literal(true),
 entityId:z.string().min(1),entityType:z.enum(['player','franchise-defense']),position:z.enum(['QB','RB','WR','TE','DEF']),teamAtTime:z.string(),opponent:z.string(),
 sourceUrl:z.string().url(),importedAt:z.string().datetime(),licenseReference:z.string().min(1),
 stats:z.object({passingYards:stat,passingTD:stat,interceptions:stat,rushingYards:stat,rushingTD:stat,receptions:stat,receivingYards:stat,receivingTD:stat,fumblesLost:stat,twoPoint:stat,returnTD:stat,sacks:stat,defensiveInterceptions:stat,fumbleRecoveries:stat,defensiveTD:stat,safeties:stat,blockedKicks:stat,pointsAllowed:stat}),
});
export const HistoricalDatasetSchema=z.object({provider:z.string(),permissionReference:z.string().min(1),coveredThrough:z.string().date(),preseasonVerified:z.boolean(),games:z.array(HistoricalGameSchema)}).superRefine((data,ctx)=>{
 const ids=new Set<string>();data.games.forEach((g,i)=>{const key=g.gameId+':'+g.entityId;if(ids.has(key))ctx.addIssue({code:'custom',path:['games',i],message:'Duplicate entity/game performance'});ids.add(key);if(g.date>data.coveredThrough)ctx.addIssue({code:'custom',path:['games',i,'date'],message:'Game falls outside declared completed coverage'});if(g.seasonType==='PRE'&&!data.preseasonVerified)ctx.addIssue({code:'custom',path:['games',i,'seasonType'],message:'Preseason coverage is not verified'});});
});
