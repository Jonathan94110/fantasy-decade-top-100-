/** Presentation only: never draws, resolves, or writes a game. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 0.5;
export const PLAYBACK_SPEED_KEY = 'fantasy-replay-speed';
export function playbackSpeed(value: unknown): PlaybackSpeed {
 const n = Number(value);
 return PLAYBACK_SPEEDS.includes(n as PlaybackSpeed) ? n as PlaybackSpeed : DEFAULT_PLAYBACK_SPEED;
}
export function playbackDelay(baseMs: number, speed: PlaybackSpeed) { return baseMs / speed; }
/** Cancellation guards even an already queued callback after pause/skip/unmount. */
export function schedulePlaybackTick(callback: () => void, baseMs: number, speed: PlaybackSpeed) {
 let cancelled = false;
 const timer = setTimeout(() => { if (!cancelled) callback(); }, playbackDelay(baseMs, speed));
 return () => { cancelled = true; clearTimeout(timer); };
}
