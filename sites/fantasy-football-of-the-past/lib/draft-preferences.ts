import {ALL_ATHLETES} from './game-model';
export type DraftPreferences={queue:string[];timerSeconds:0|60|90|120;revision:number};
export const emptyPreferences=():DraftPreferences=>({queue:[],timerSeconds:0,revision:0});
export function updatePreferences(current:DraftPreferences,body:Record<string,unknown>):DraftPreferences{
 const next=structuredClone(current),id=String(body.athleteId??'');
 if(body.action==='timer'){
  if(![0,60,90,120].includes(body.seconds as number))throw new Error('Choose an available soft timer.');
  next.timerSeconds=body.seconds as DraftPreferences['timerSeconds'];
 }else{
  if(!ALL_ATHLETES.some(a=>a.id===id))throw new Error('Choose a verified playable player.');
  const index=next.queue.indexOf(id);
  if(body.action==='toggle'){
   if(index>=0)next.queue.splice(index,1);
   else{if(next.queue.length>=50)throw new Error('Your queue holds up to 50 players.');next.queue.push(id);}
  }else if(body.action==='move'){
   if(index<0||![1,-1].includes(body.direction as number))throw new Error('Choose a queued player to move.');
   const to=index+Number(body.direction);if(to>=0&&to<next.queue.length)[next.queue[index],next.queue[to]]=[next.queue[to],next.queue[index]];
  }else throw new Error('Choose a queue or timer action.');
 }
 next.revision++;return next;
}
