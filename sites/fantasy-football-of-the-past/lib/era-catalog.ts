import { CLASSIC_LEGENDS, classicCoverage, type ClassicLegend } from './classic-legends';
import catalogRows from '../data/historical-catalog.json';
import { ATHLETES, athletesFor, athleteFor, DATA_COVERAGE, eligibleForSlot, type Athlete, type Position, type LineupSlot } from './game-model';
import type {ScoringRules} from './scoring-rules';
import {matchesPlayableEra,consumedPerformanceYears} from './player-filters';

export const ERAS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
export const EARLY_ERA = -1;
export const LIBRARY_PAGE_SIZE = 48;
export function filterDraftAthletes({position, era = 0, search = '',rules}: {position: LineupSlot|'ALL'; era?: number; search?: string;rules?:ScoringRules}) {
  const words = normalizeSearch(search).split(' ').filter(Boolean);
  return (rules?athletesFor(rules):ATHLETES).filter(athlete => (position==='ALL'||eligibleForSlot(athlete, position))
    && matchesPlayableEra(athlete,era,[],rules)
    && words.every(word => normalizeSearch(`${athlete.name} ${athlete.club}`).includes(word)));
}
export type HistoricalProfile = {
  id: string;
  name: string;
  position: Exclude<Position, 'DEF'>;
  careerStart: number;
  careerEnd: number;
  clubs: string[];
  description: string;
  sourceUrl: string;
  sourceLabel?: string;
  hallOfFameYear?: number;
  playableId?: string;
  selectionBasis?: string;
  careerVerified?: boolean;
  supportingURLs?: string[];
};
export type LibraryPosition = Position | 'K';
export type LibraryCollection = 'all' | 'editorial' | 'additional' | 'classic';
export type LibraryProfile = {
  collection:'editorial'|'additional'|'defense'|'classic'; id: string; name: string; position: LibraryPosition; clubs: string; firstYear: number;
  lastYear: number; careerVerified: boolean; description: string; sourceUrl: string;
  sourceLabel: string; hallOfFameYear?: number; athlete?: Athlete;
  selectionBasis?: string;
  supportingURLs?: string[];
  classic?: ClassicLegend;
};
const historical = catalogRows as HistoricalProfile[];
function matchesProfile(athlete: Athlete, profile: HistoricalProfile) {
  // A human-reviewed stable ID is required. Shared names alone never link people.
  return athlete.id === profile.playableId && athlete.position === profile.position
    && athlete.seasons.every(year => year >= profile.careerStart && year <= profile.careerEnd);
}
const originalProfiles: LibraryProfile[] = [
  ...historical.map(p => ({
    collection:'editorial' as const, id: p.id, name: p.name, position: p.position, clubs: p.clubs.join(' · '),
    firstYear: p.careerStart, lastYear: p.careerEnd, careerVerified: p.careerVerified !== false,
    description: p.description, sourceUrl: p.sourceUrl,
    sourceLabel: p.sourceLabel || 'Pro Football Hall of Fame', hallOfFameYear: p.hallOfFameYear,
    selectionBasis: p.selectionBasis,
    supportingURLs: p.supportingURLs,
    athlete: ATHLETES.find(a => matchesProfile(a, p)),
  })),
  ...ATHLETES.filter(a => !historical.some(p => matchesProfile(a, p)) && !(a.position==='K'&&CLASSIC_LEGENDS.some(p=>p.playableId===a.id&&!p.existingProfileId))).map(a => ({
    collection:a.position==='DEF'?'defense' as const:'additional' as const, id: a.id, name: a.name, position: a.position, clubs: a.club,
    firstYear: a.seasons[0], lastYear: a.seasons.at(-1)!, careerVerified: false,
    description: a.position === 'DEF' ? 'Choose the franchise. Its year and game are drawn with the same rules as every player.' : 'Real, completed game records are available for this featured player. The years below describe this archive, not necessarily the full career.',
    sourceUrl: a.hallOfFameSource || DATA_COVERAGE.sourceUrl,
    sourceLabel: a.hallOfFameSource ? 'Pro Football Hall of Fame' : 'nflverse data',
    hallOfFameYear: a.hallOfFameYear, athlete: a,
  })),
];

// Merge only reviewed stable identities. Original profile IDs, collection membership,
// athlete objects and game records are preserved for all existing saved selections.
function enrichClassic(profile: LibraryProfile, classic: ClassicLegend): LibraryProfile {
  return {...profile, athlete:profile.athlete??classicCoverage(classic).athlete,name: classic.name, firstYear: classic.careerSeasons[0],
    lastYear: classic.careerSeasons.at(-1)!, careerVerified: true, classic,
    hallOfFameYear: classic.hallOfFameYear ?? profile.hallOfFameYear,
    sourceUrl: classic.hallOfFameSource || classic.sources[0].url,
    sourceLabel: classic.hallOfFameSource ? 'Pro Football Hall of Fame' : classic.sources[0].label};
}
export const PROFILES: LibraryProfile[] = [
  ...originalProfiles.map(profile => {
    const classic = CLASSIC_LEGENDS.find(p => p.existingProfileId === profile.id);
    return classic ? enrichClassic(profile, classic) : profile;
  }),
  ...CLASSIC_LEGENDS.filter(p => !p.existingProfileId).map(classic => enrichClassic({
    collection: 'classic', id: classic.id, name: classic.name, position: classic.position,
    clubs: classic.officialPositions.join(' · '), firstYear: classic.careerSeasons[0],
    lastYear: classic.careerSeasons.at(-1)!, careerVerified: true,
    description: classic.hallOfFameYear ? `Pro Football Hall of Fame, Class of ${classic.hallOfFameYear}.` : 'Selected to the NFL 100 All-Time Team.',
    sourceUrl: classic.sources[0].url, sourceLabel: classic.sources[0].label,
  }, classic)),
];
export const PLAYER_PROFILES = PROFILES.filter(p => p.position !== 'DEF');
/** Keep all decades discoverable, independent of loaded game-year coverage. */
export const DRAFT_ERAS = ERAS.map(era => ({
  era,
  loadedSeasons: DATA_COVERAGE.seasons.filter(year => year >= era && year <= era + 9),
  playableCount: ATHLETES.filter(athlete => matchesPlayableEra(athlete,era)).length,
}));
export const POSITION_COUNTS = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(position =>
  [position, PROFILES.filter(p => p.position === position).length])) as Record<LibraryPosition, number>;

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const searchIndex = new Map(PROFILES.map(p => [p.id, normalizeSearch(`${p.name} ${p.clubs} ${p.classic?.aliases.join(' ') ?? ''}`)]));
export function filterProfiles({era = 0, position = 'ALL', status = 'all', search = '', collection='all', recognition='all'}: {
  era?: number; position?: LibraryPosition | 'ALL'; status?: 'all' | 'playable' | 'profiles'; search?: string; collection?: LibraryCollection; recognition?: 'all' | 'hof' | 'nfl100';
} = {}) {
  const words = normalizeSearch(search).split(' ').filter(Boolean);
  return PROFILES.filter(p => inEra(p, era)
    && (collection==='all'||(collection==='classic' ? !!p.classic : p.collection===collection))
    && (collection!=='classic'||!era||p.classic?.classicSeasons.some(year => era===EARLY_ERA ? year>=1950&&year<=1980 : year>=era&&year<=era+9))
    && (position === 'ALL' || p.position === position || (collection==='classic' && p.classic?.eligiblePositions.some(value => value===position)))
    && (recognition === 'all' || (recognition === 'hof' ? !!p.hallOfFameYear : !!p.classic?.nfl100Source))
    && (status === 'all' || (collection === 'classic' && p.classic
      ? status === 'playable' ? classicCoverage(p.classic).gameCount > 0 : classicCoverage(p.classic).gameCount === 0
      : status === 'playable' ? !!p.athlete : !p.athlete))
    && words.every(word => searchIndex.get(p.id)!.includes(word)));
}

export function inEra(profile: LibraryProfile, era: number) {
  if (era === EARLY_ERA) return profile.firstYear <= 1980 && profile.lastYear >= 1950;
  return !era || (profile.firstYear <= Math.min(era + 9, 2026) && profile.lastYear >= era);
}
export function poolAvailability(athlete: Athlete, used: readonly string[],rules?:ScoringRules) {
  const selected=rules?.mode==='historical'?athleteFor(athlete.id,rules):athlete;
  if(!selected)return {count:0,seasons:[] as number[]};
  const consumed=consumedPerformanceYears(selected.id,used);
  const byYear = Object.fromEntries(selected.seasons.map(year => [year, selected.gamesBySeason[year]]));
  for (const {year} of consumed)if(year!==null&&year in byYear)byYear[year]--;
  return { count: Math.max(0, selected.gameCount - consumed.length), seasons: selected.seasons.filter(year => byYear[year] > 0) };
}
