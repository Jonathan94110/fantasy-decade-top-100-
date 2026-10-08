'use client';
import {useSyncExternalStore} from 'react';
import {DEFAULT_PLAYBACK_SPEED,PLAYBACK_SPEED_KEY,playbackSpeed,type PlaybackSpeed} from '@/lib/replay-playback';
const SPEED_CHANGED='fantasy-playback-speed-changed';
let fallback:PlaybackSpeed=DEFAULT_PLAYBACK_SPEED;
let storedValue:string|null|undefined;
function storedSpeed(){try{const value=localStorage.getItem(PLAYBACK_SPEED_KEY);if(value!==storedValue){storedValue=value;fallback=playbackSpeed(value);}}catch{}return fallback;}
function subscribe(onChange:()=>void){window.addEventListener('storage',onChange);window.addEventListener(SPEED_CHANGED,onChange);return()=>{window.removeEventListener('storage',onChange);window.removeEventListener(SPEED_CHANGED,onChange);};}
export function useReplaySpeed(){
 const speed=useSyncExternalStore(subscribe,storedSpeed,()=>DEFAULT_PLAYBACK_SPEED);
 function changeSpeed(value:string){const next=playbackSpeed(value);fallback=next;try{localStorage.setItem(PLAYBACK_SPEED_KEY,String(next));storedValue=String(next);}catch{}window.dispatchEvent(new Event(SPEED_CHANGED));}
 return {speed,changeSpeed};
}
