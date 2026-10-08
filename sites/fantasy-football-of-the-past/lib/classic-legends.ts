import rows from '../data/classic-legends.json';
import { ATHLETES } from './game-model';

/** Recognition and career metadata only. Never a source of scored performances. */
export type CatalogPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K';
export type ClassicLegend = {
  id: string;
  name: string;
  aliases: string[];
  position: CatalogPosition;
  eligiblePositions: CatalogPosition[];
  officialPositions: string[];
  careerSeasons: number[];
  classicSeasons: number[];
  existingProfileId?: string;
  playableId?: string;
  hallOfFameYear?: number;
  hallOfFameSource?: string;
  nfl100Source?: string;
  nfl100Position?: string;
  sources: {label: string; url: string}[];
  scopeNote?: string;
  providerIds: Record<string, string>;
};
const kickerLinks:Record<string,string>={'hof:adam-vinatieri':'00-0016919','hof:morten-andersen':'00-0000282'};
export const CLASSIC_LEGENDS = (rows as ClassicLegend[]).map(p=>kickerLinks[p.id]?{...p,playableId:kickerLinks[p.id]}:p);
export const CLASSIC_RANGE = {start: 1960, end: 2010} as const;
export const CLASSIC_POSITIONS: CatalogPosition[] = ['QB', 'RB', 'WR', 'TE', 'K'];

/** Exact discrete seasons, including gaps. A career range is not loaded coverage. */
export function formatSeasons(seasons: number[]) {
  const years = [...new Set(seasons)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < years.length; index++) {
    const start = years[index];
    let end = start;
    while (years[index + 1] === end + 1) end = years[++index];
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  }
  return ranges.join(', ') || 'None loaded';
}
export function classicCoverage(legend: ClassicLegend) {
  // A verified source identifier and an existing compatible game entity are both required.
  const athlete = legend.playableId
    ? ATHLETES.find(a => a.id === legend.playableId && a.position === legend.position) : undefined;
  const seasons = athlete?.seasons.filter(year => legend.classicSeasons.includes(year)) ?? [];
  const gameCount = seasons.reduce((sum, year) => sum + (athlete?.gamesBySeason[year] ?? 0), 0);
  return {seasons, gameCount, athlete};
}
export const CLASSIC_SUMMARY = {
  total: CLASSIC_LEGENDS.length,
  hallOfFame: CLASSIC_LEGENDS.filter(p => p.hallOfFameYear).length,
  nfl100: CLASSIC_LEGENDS.filter(p => p.nfl100Source).length,
  withGameLogs: CLASSIC_LEGENDS.filter(p => classicCoverage(p).gameCount > 0).length,
  byPosition: Object.fromEntries(CLASSIC_POSITIONS.map(position => [position, CLASSIC_LEGENDS.filter(p => p.position === position).length])) as Record<CatalogPosition, number>,
};
