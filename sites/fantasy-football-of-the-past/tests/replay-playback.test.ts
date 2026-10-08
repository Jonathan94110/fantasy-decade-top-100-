import assert from 'node:assert/strict';
import test from 'node:test';
import {PLAYBACK_SPEEDS,playbackSpeed,playbackDelay,schedulePlaybackTick} from '../lib/replay-playback.ts';
test('validates stored speed, defaults slower, and gives exact quick and season pacing',()=>{
 for(const invalid of [null,undefined,'',0,-1,'garbage',100])assert.equal(playbackSpeed(invalid),0.5);
 assert.deepEqual(PLAYBACK_SPEEDS.map(s=>playbackDelay(1200,s)),[4800,2400,1200,600]);
 assert.deepEqual(PLAYBACK_SPEEDS.map(s=>playbackDelay(2400,s)),[9600,4800,2400,1200]);
 for(const speed of PLAYBACK_SPEEDS)assert.equal(playbackSpeed(String(speed)),speed);
});
test('fake clock: exact threshold, speed changes cancel previous timer, pause and teardown stop all ticks',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let step=0;
 let cancel=schedulePlaybackTick(()=>step++,1200,0.5);
 t.mock.timers.tick(2399);assert.equal(step,0);t.mock.timers.tick(1);assert.equal(step,1);
 cancel();cancel=schedulePlaybackTick(()=>step++,1200,0.25);t.mock.timers.tick(1000);cancel();
 cancel=schedulePlaybackTick(()=>step++,1200,2);t.mock.timers.tick(599);assert.equal(step,1);t.mock.timers.tick(1);assert.equal(step,2);
 cancel();t.mock.timers.tick(10000);assert.equal(step,2);
 cancel=schedulePlaybackTick(()=>step++,1200,1);cancel();cancel();t.mock.timers.tick(10000);assert.equal(step,2);
});
