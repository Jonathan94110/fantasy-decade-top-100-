import {ALL_ATHLETES,POSITIONS,ALL_POSITIONS,FLEX_POSITIONS} from './game-model';
const byId=new Map(ALL_ATHLETES.map(a=>[a.id,a]));
/** Reserve all base starters, a distinct FLEX, and enough legal bench room. */
export function canCompleteRoster(roster:string[],available:typeof ALL_ATHLETES,size=10,_legacyHallCap=0,kickers=false){
 if(!kickers&&roster.some(id=>byId.get(id)?.position==='K'))return false;
 if(roster.length>size||new Set(roster).size!==roster.length||roster.some(id=>!byId.has(id)))return false;
 let choices=[{picks:0,hall:0,flex:0}],room=0;
 for(const p of kickers?ALL_POSITIONS:POSITIONS){
  const existing=roster.map(id=>byId.get(id)!).filter(a=>a.position===p),limit=p==='DEF'||p==='K'?2:3;
  if(existing.length>limit)return false;
  const pool=available.filter(a=>a.position===p);
  room+=Math.min(limit-existing.length,pool.length);
  const variants:{picks:number;hall:number;flex:number}[]=[];
  for(const need of FLEX_POSITIONS.includes(p)?[1,2]:[1])for(let hall=0;hall<=need;hall++){
   const plain=Math.max(0,need-hall-existing.filter(a=>!a.legend).length),marked=Math.max(0,hall-existing.filter(a=>a.legend).length);
   if(plain<=pool.filter(a=>!a.legend).length&&marked<=pool.filter(a=>a.legend).length&&existing.length+plain+marked<=limit)variants.push({picks:plain+marked,hall,flex:need-1});
  }
  choices=choices.flatMap(a=>variants.map(b=>({picks:a.picks+b.picks,hall:a.hall+b.hall,flex:a.flex+b.flex}))).filter(a=>a.picks<=size-roster.length&&a.flex<=1);
 }
 return room>=size-roster.length&&choices.some(a=>a.flex===1);
}
