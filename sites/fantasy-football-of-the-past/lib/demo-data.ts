export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF';
export const POSITIONS: Position[] = ['QB','RB','WR','TE','DEF'];
export type Athlete = {id:string; name:string; position:Position; club:string; number:string; style:string; legend?:boolean; color:string};
export const ATHLETES: Athlete[] = [
{id:'q1',name:'Jalen Cross',position:'QB',club:'Metro',number:'07',style:'Dual-threat playmaker',color:'#b6f34d'},
{id:'q2',name:'Miles Archer',position:'QB',club:'Harbor',number:'12',style:'Deep-ball specialist',legend:true,color:'#82a9ff'},
{id:'q3',name:'Theo Banks',position:'QB',club:'Summit',number:'09',style:'Pocket technician',color:'#f0b57c'},
{id:'q4',name:'Dante Cole',position:'QB',club:'Valley',number:'01',style:'High-risk gunslinger',color:'#bc9eff'},
{id:'r1',name:'Kai Maddox',position:'RB',club:'Harbor',number:'22',style:'Every-down engine',color:'#82a9ff'},
{id:'r2',name:'Andre Knox',position:'RB',club:'Metro',number:'28',style:'Goal-line force',legend:true,color:'#b6f34d'},
{id:'r3',name:'Roman Hayes',position:'RB',club:'Valley',number:'24',style:'Open-field accelerator',color:'#bc9eff'},
{id:'r4',name:'Eli Carter',position:'RB',club:'Summit',number:'32',style:'Receiving back',color:'#f0b57c'},
{id:'w1',name:'Zion Reed',position:'WR',club:'Valley',number:'11',style:'Big-play vertical threat',legend:true,color:'#bc9eff'},
{id:'w2',name:'Noah Sterling',position:'WR',club:'Summit',number:'18',style:'Route-running technician',color:'#f0b57c'},
{id:'w3',name:'Darius West',position:'WR',club:'Metro',number:'03',style:'Catch-and-run creator',color:'#b6f34d'},
{id:'w4',name:'Leo Voss',position:'WR',club:'Harbor',number:'10',style:'Red-zone target',color:'#82a9ff'},
{id:'t1',name:'Luca Stone',position:'TE',club:'Summit',number:'88',style:'Middle-of-field mismatch',legend:true,color:'#f0b57c'},
{id:'t2',name:'Marcus Vale',position:'TE',club:'Metro',number:'84',style:'Reliable chain mover',color:'#b6f34d'},
{id:'t3',name:'Owen Ford',position:'TE',club:'Harbor',number:'86',style:'End-zone specialist',color:'#82a9ff'},
{id:'t4',name:'Ezra Wells',position:'TE',club:'Valley',number:'81',style:'Vertical seam threat',color:'#bc9eff'},
{id:'d1',name:'Metro Defense',position:'DEF',club:'Metro',number:'M',style:'Pressure & takeaways',color:'#b6f34d'},
{id:'d2',name:'Harbor Defense',position:'DEF',club:'Harbor',number:'H',style:'Ball-hawking secondary',color:'#82a9ff'},
{id:'d3',name:'Summit Defense',position:'DEF',club:'Summit',number:'S',style:'Shutdown front seven',color:'#f0b57c'},
{id:'d4',name:'Valley Defense',position:'DEF',club:'Valley',number:'V',style:'High-pressure scheme',color:'#bc9eff'},
];
export type Stats = {passingYards:number;passingTD:number;interceptions:number;rushingYards:number;rushingTD:number;receptions:number;receivingYards:number;receivingTD:number;fumblesLost:number;twoPoint:number;returnTD:number;sacks:number;defensiveInterceptions:number;fumbleRecoveries:number;defensiveTD:number;safeties:number;blockedKicks:number;pointsAllowed:number};
export type Performance = {id:string;athleteId:string;season:number;week:number;opponent:string;stats:Stats;fictional:true};
export const DEMO_YEARS = [2020,2021,2022,2023,2024,2025,2026];
// Deterministic fictional fixtures. These values never represent a real player or game.
export const PERFORMANCES: Performance[] = ATHLETES.flatMap((a,index)=>DEMO_YEARS.flatMap((season)=>Array.from({length:8},(_,j)=>{
 const k=(index*19+(season-2020)*13+j*17)%101;
 const s:Stats={passingYards:0,passingTD:0,interceptions:0,rushingYards:0,rushingTD:0,receptions:0,receivingYards:0,receivingTD:0,fumblesLost:k%23===0?1:0,twoPoint:0,returnTD:0,sacks:0,defensiveInterceptions:0,fumbleRecoveries:0,defensiveTD:0,safeties:0,blockedKicks:0,pointsAllowed:0};
 if(a.position==='QB'){s.passingYards=118+k*3;s.passingTD=k%5;s.interceptions=k%3;s.rushingYards=k%69;s.rushingTD=k%7===0?1:0;}
 if(a.position==='RB'){s.rushingYards=12+k*1.5;s.rushingTD=k%3;s.receptions=k%6;s.receivingYards=s.receptions*9;s.receivingTD=k%17===0?1:0;}
 if(a.position==='WR'||a.position==='TE'){s.receptions=1+k%(a.position==='WR'?11:8);s.receivingYards=s.receptions*(7+k%13);s.receivingTD=k%4;s.rushingYards=a.position==='WR'?k%14:0;}
 if(a.position==='DEF'){s.sacks=k%7;s.defensiveInterceptions=k%4;s.fumbleRecoveries=k%3;s.defensiveTD=k%17===0?1:0;s.pointsAllowed=k%43;s.fumblesLost=0;}
 return {id:`demo-${a.id}-${season}-${j+1}`,athleteId:a.id,season,week:j+1,opponent:['Coastal','Northside','Canyon','Lakeside'][(index+j)%4],stats:s,fictional:true as const};
})));
export const SCORING = [
 ['Passing','1 pt / 25 yards · 4 / TD · −2 / interception'],
 ['Rushing & receiving','1 pt / 10 yards · 6 / TD'],
 ['Receptions','1 point per catch (full PPR)'],
 ['Other offense','−2 / fumble lost · 2 / conversion · 6 / return TD'],
 ['Defense','1 / sack · 2 / takeaway, safety or block · 6 / TD'],
 ['Points allowed','0: +10 · 1–6: +7 · 7–13: +4 · 14–20: +1 · 21–27: 0 · 28–34: −1 · 35+: −4'],
];
export function score(s:Stats,position:Position){
 if(position==='DEF'){const p=s.pointsAllowed;return s.sacks+2*(s.defensiveInterceptions+s.fumbleRecoveries+s.safeties+s.blockedKicks)+6*(s.defensiveTD+s.returnTD)+(p===0?10:p<=6?7:p<=13?4:p<=20?1:p<=27?0:p<=34?-1:-4);}
 return Math.round((s.passingYards*.04+s.passingTD*4-s.interceptions*2+(s.rushingYards+s.receivingYards)*.1+(s.rushingTD+s.receivingTD+s.returnTD)*6+s.receptions-s.fumblesLost*2+s.twoPoint*2)*100)/100;
}
export function statLine(p:Performance){const a=ATHLETES.find(a=>a.id===p.athleteId)!;const s=p.stats;
 return a.position==='DEF'?`${s.sacks} sacks · ${s.defensiveInterceptions+s.fumbleRecoveries} takeaways · ${s.pointsAllowed} PA`:a.position==='QB'?`${s.passingYards} pass yds · ${s.passingTD} TD · ${s.interceptions} INT · ${s.rushingYards} rush yds`:a.position==='RB'?`${s.rushingYards} rush yds · ${s.rushingTD} rush TD · ${s.receptions} rec · ${s.receivingYards} rec yds`:`${s.receptions} rec · ${s.receivingYards} yards · ${s.receivingTD} TD`;
}
