'use client';
import {PLAYBACK_SPEEDS,playbackDelay,type PlaybackSpeed} from '@/lib/replay-playback';
export function ReplaySpeed({speed,onChange,baseMs}:{speed:PlaybackSpeed;onChange:(value:string)=>void;baseMs:number}){
 return <label className="replay-speed"><span>Playback speed</span><select value={speed} onChange={e=>onChange(e.target.value)}>{PLAYBACK_SPEEDS.map(value=><option key={value} value={value}>{value}×{value===0.25?' · Slowest':value===0.5?' · Slow':value===1?' · Normal':' · Fast'}</option>)}</select><small>{(playbackDelay(baseMs,speed)/1000).toFixed(1)}s per highlight</small></label>;
}
