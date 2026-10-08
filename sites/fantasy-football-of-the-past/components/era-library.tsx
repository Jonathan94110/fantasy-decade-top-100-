'use client';

import { useMemo, useState } from 'react';
import { BookOpen, LockKeyhole, Search, Shield, Trophy, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DATA_COVERAGE, DATA_QUALITY, type Athlete } from '@/lib/game-model';
import { EARLY_ERA, ERAS, LIBRARY_PAGE_SIZE, PLAYER_PROFILES, POSITION_COUNTS, PROFILES, filterProfiles, inEra, poolAvailability, type LibraryProfile, type LibraryPosition, type LibraryCollection } from '@/lib/era-catalog';

import { CLASSIC_POSITIONS, CLASSIC_SUMMARY, classicCoverage, formatSeasons } from '@/lib/classic-legends';

const eraTitles: Record<number, string> = {
  [EARLY_ERA]: 'The 1950–1980 collection',
  1950: 'The early greats', 1960: 'A new generation', 1970: 'Sunday icons',
  1980: 'The passing revolution', 1990: 'An all-time roster', 2000: 'A new millennium',
  2010: 'The modern playbook', 2020: 'Today’s game',
};
const positionNames: Record<LibraryPosition, string> = {QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', K: 'Kickers', DEF: 'Franchise defenses'};
const eraCounts = Object.fromEntries([EARLY_ERA, ...ERAS].map(year => [year, PROFILES.filter(p => inEra(p, year)).length]));
const profileOnlyCount = PLAYER_PROFILES.filter(p => !p.athlete).length;

export function EraLibrary({ used, canDraft, onDraft, initialEra = 0, initialPosition = 'ALL', initialCollection = 'all' }: {used: string[]; canDraft: boolean; onDraft: (athlete: Athlete) => void; initialEra?: number; initialPosition?: LibraryPosition | 'ALL'; initialCollection?: LibraryCollection}) {
  const [era, setEra] = useState(initialEra);
  const [position, setPosition] = useState<LibraryPosition | 'ALL'>(initialPosition);
  const [status, setStatus] = useState<'all' | 'playable' | 'profiles'>('all');
  const [collection,setCollection]=useState<LibraryCollection>(initialCollection);
  const [recognition, setRecognition] = useState<'all' | 'hof' | 'nfl100'>('all');
  const classicView = collection === 'classic';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LibraryProfile | null>(null);
  const filtered = useMemo(() => filterProfiles({era, position, status, search, collection, recognition}), [era, position, status, search, collection, recognition]);
  const pages = Math.ceil(filtered.length / LIBRARY_PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pages - 1));
  const pageRows = filtered.slice(safePage * LIBRARY_PAGE_SIZE, (safePage + 1) * LIBRARY_PAGE_SIZE);
  const unavailableDefenseEra = position === 'DEF' && (era === EARLY_ERA || (era > 0 && era + 9 < 1999));
  const selectedAvailability = selected?.athlete ? poolAvailability(selected.athlete, used) : null;
  const pagination = pages > 1 ? <nav className="library-pagination" aria-label="Profile pages">
    <button className="secondary-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
    <span>Page {safePage + 1} of {pages}</span>
    <button className="secondary-button" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Next</button>
  </nav> : null;
  function changeEra(year: number) {setEra(year); setPage(0);}
  return <>
    <div className="section-heading library-heading"><div><div className="eyebrow">THE ALL-TIME COLLECTION</div><h1>{classicView ? 'Classic Legends' : 'All-time players'}</h1><p>{classicView ? 'Hall of Fame-first offense, 1960–2010. Explore careers, recognition and real game coverage.' : 'Explore the Classic Legends catalog, the original all-time collection, and today’s loaded game archive.'}</p></div><div className="library-year-stamp" aria-label={classicView ? '1960 through 2010 collection' : '1950 through 2026 collection'}>{classicView ? '1960' : '1950'}<span>{classicView ? '2010' : '2026'}</span></div></div>
    <div className="archive-summary">
      <div><strong>{CLASSIC_SUMMARY.total}</strong><span>Classic Legends · 1960–2010</span></div>
      <div><strong>{CLASSIC_SUMMARY.hallOfFame}</strong><span>Classic Hall of Famers · {CLASSIC_SUMMARY.nfl100} NFL 100 selections</span></div>
      <div><strong>{classicView ? CLASSIC_SUMMARY.withGameLogs : `${PLAYER_PROFILES.length} + ${DATA_COVERAGE.defenseCount}`}</strong><span>{classicView ? 'profiles with some 1999–2010 game logs' : 'unique player profiles + franchise defenses'}</span></div>
    </div>
    {!classicView && <div className="library-explainer"><BookOpen size={20}/><p><b>Greatness and game coverage are different.</b> {profileOnlyCount} players are profile-only. “Playable” means verified game records are loaded. Classic career eligibility is 1960–2010. The archive starts in 1999; earlier games are not loaded. <a href="/archive-coverage.json" target="_blank" rel="noreferrer">Game coverage</a></p></div>}
    {!classicView && <div className="classic-catalog-intro"><div><span className="eyebrow">CLASSIC LEGENDS · 1960–2010</span><h2>Hall of Fame first. Real games only.</h2><p>{CLASSIC_SUMMARY.hallOfFame} verified Hall of Famers, with NFL 100 All-Time recognition shown separately. Fullbacks count as RB; kickers with verified loaded games can play in new 11-player seasons. Individual defensive players and offensive linemen are outside this catalog.</p></div><button className={classicView ? 'primary-button' : 'secondary-button'} aria-pressed={classicView} onClick={() => {setCollection('classic'); setEra(0); setPosition('ALL'); setStatus('all'); setRecognition('all'); setSearch(''); setPage(0);}}>Browse Classic Legends</button></div>}
    {classicView && <div className="classic-coverage-notice"><b>Catalog ready · Classic competition not enabled</b><p>1960–1998 game logs and a balanced era-wide pool are still missing. These profiles do not enable a Classic draft. Your existing leagues keep their current game pools. <a href="/classic-legends-sources.json" target="_blank" rel="noreferrer">Verified source ledger</a></p></div>}
    <details className="selection-notes"><summary>How these collections are verified</summary><p>The Classic catalog uses official Pro Football Hall of Fame player pages and the announced 2026 class. The NFL 100 All-Time Team is a separate distinction, not a Hall of Fame induction. Only verified career seasons intersecting 1960–2010 count as Classic eligible years. Dual-role players appear once. This catalog does not restrict leagues to Hall of Famers.</p><p>The original four 100-player collections are editorial selections, not official rankings. Hall of Fame recognition, era significance, sustained production and positional breadth shape each collection. Existing featured players stay included so saved games remain compatible. Names are presented without a #1–100 rank; modern raw totals are not treated as a fair comparison across eras.</p><p>The additional collection now includes 30 more players and 3,285 verified game records, including Nick Foles, Kevin Faulk, Troy Brown and Santonio Holmes. <a href="/verified-player-addition.json" target="_blank" rel="noreferrer">New players and loaded seasons</a></p><p>Fullbacks are grouped with running backs. Historical ends are assigned to the best-supported modern receiving role. Early players with incomplete game logs remain profile-only. Each profile links to its evidence. <a href="/roster-selection.json" target="_blank" rel="noreferrer">Selection criteria and source ledger</a></p></details>
    <div className="collection-positions" role="group" aria-label="Choose player position">
      <button className={position === 'ALL' ? 'active' : ''} aria-pressed={position === 'ALL'} onClick={() => {setPosition('ALL'); setPage(0);}}>All positions<span>{classicView ? CLASSIC_SUMMARY.total : PROFILES.length} profiles</span></button>
      {[...CLASSIC_POSITIONS, ...(!classicView ? ['DEF' as const] : [])].map(p => <button key={p} className={position === p ? 'active' : ''} aria-pressed={position === p} onClick={() => {setPosition(p); setPage(0);}}>{p === 'DEF' ? 'Franchise DEF' : positionNames[p]}<span>{classicView && p !== 'DEF' ? CLASSIC_SUMMARY.byPosition[p] : POSITION_COUNTS[p]} {p === 'DEF' ? 'franchises' : 'primary'}</span></button>)}
    </div>
    {position === 'DEF' && <div className="defense-coverage-note"><Shield size={22}/><div><b>Franchise defense target: 1950–2026</b><p>Verified playable defense records currently cover {DATA_COVERAGE.defenseSeasons[0]}–{DATA_COVERAGE.defenseSeasons.at(-1)}. The earlier seasons are not loaded. Pick a franchise; the game draws its year and performance. Franchise continuity and complete scoring must be verified before older years can enter the pool.</p></div></div>}
    <div className="era-selector" role="group" aria-label="Browse era">
      <button className={!era ? 'active' : ''} aria-pressed={!era} onClick={() => changeEra(0)}><span>All eras</span><small>{classicView ? '1960–2010' : '1950–2026'}</small></button>
      {!classicView && <button className={era === EARLY_ERA ? 'active' : ''} aria-pressed={era === EARLY_ERA} onClick={() => changeEra(EARLY_ERA)}><span>1950–1980</span><small>{eraCounts[EARLY_ERA]} profiles</small></button>}
      {ERAS.filter(year => !classicView || year >= 1960 && year <= 2010).map(year => <button key={year} className={era === year ? 'active' : ''} aria-pressed={era === year} onClick={() => changeEra(year)}><span>{classicView && year === 2010 ? '2010' : `${year}s`}</span><small>{classicView ? filterProfiles({collection:'classic', era:year}).length : eraCounts[year]} profiles</small></button>)}
    </div>
    <section className="library-toolbar" aria-label="Library filters">
      <label className="search-field"><Search size={18}/><input value={search} onChange={e => {setSearch(e.target.value); setPage(0);}} placeholder="Search a player or team" aria-label="Search the era library"/>{search && <button aria-label="Clear library search" onClick={() => {setSearch(''); setPage(0);}}><X size={16}/></button>}</label>
      <label>Collection<select aria-label="Player collection" value={collection} onChange={e=>{const next = e.target.value as typeof collection; setCollection(next); if (next === 'classic') {if (position === 'DEF') setPosition('ALL'); if (era < 1960 || era > 2010) setEra(0);} setPage(0);}}><option value="all">All players & defenses</option><option value="classic">Classic Legends · 1960–2010</option><option value="editorial">Original all-time 400</option><option value="additional">Additional playable players</option></select></label><label>Availability<select aria-label="Profile availability" value={status} onChange={e => {setStatus(e.target.value as typeof status); setPage(0);}}><option value="all">All profiles</option><option value="playable">{classicView ? 'With Classic game logs' : 'Playable now'}</option><option value="profiles">Profile-only players</option></select></label>
      <label>Recognition<select aria-label="Player recognition" value={recognition} onChange={e => {setRecognition(e.target.value as typeof recognition); setPage(0);}}><option value="all">All recognition</option><option value="hof">Hall of Fame</option><option value="nfl100">NFL 100 All-Time Team</option></select></label>
    </section>
    <div className="library-results-heading"><div><h2>{classicView ? 'Classic Legends' : era ? eraTitles[era] : position === 'ALL' ? 'Your all-time collection' : positionNames[position]}</h2><p>{classicView ? 'Exact eligible seasons and loaded game logs are shown separately. Position counts use each player’s primary role; K also finds verified dual-role kickers.' : era ? 'Career or loaded-game years overlap the selected era.' : 'The original collection and verified additions, deduplicated. Franchise defenses are counted separately.'}</p></div><span aria-live="polite">{filtered.length ? `${safePage * LIBRARY_PAGE_SIZE + 1}–${Math.min((safePage + 1) * LIBRARY_PAGE_SIZE, filtered.length)} of ` : ''}{filtered.length} profiles</span></div>
    {pagination}
    <section className="ff-panel ff-archive-table" aria-label="All-time player collection"><Table><TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Pos</TableHead><TableHead className="ff-profile-years">{classicView ? 'Classic eligible years' : 'Career / source years'}</TableHead><TableHead>Availability</TableHead><TableHead className="ff-number">{classicView ? 'Classic games' : 'Games left'}</TableHead><TableHead><span className="sr-only">Action</span></TableHead></TableRow></TableHeader><TableBody>
      {pageRows.map(profile => {
        const remaining = profile.athlete ? poolAvailability(profile.athlete, used).count : 0;
        const classic = profile.classic ? classicCoverage(profile.classic) : null;
        const years = classicView && profile.classic ? formatSeasons(profile.classic.classicSeasons) : `${profile.firstYear}–${profile.lastYear}`;
        return <TableRow key={profile.id}><TableCell><button className="ff-profile-name" onClick={() => setSelected(profile)}><b>{profile.name}{profile.hallOfFameYear && <span className="hof-badge">HOF</span>}{profile.classic?.nfl100Source && <span className="nfl100-badge">NFL 100{profile.classic.nfl100Position === 'RS' ? ' · RS' : ''}</span>}</b><small>{profile.clubs}{profile.collection === 'additional' ? ' · Playable addition' : ''}</small><span className="ff-mobile-years">{years}</span></button></TableCell><TableCell><span className="ff-position">{profile.position}</span></TableCell><TableCell className="ff-profile-years">{years}</TableCell><TableCell><span className={`archive-badge ${classicView ? classic?.gameCount ? 'playable' : '' : profile.athlete ? 'playable' : ''}`}>{classicView ? classic?.gameCount ? 'Game logs loaded' : 'Profile only' : profile.athlete ? 'Playable' : 'Profile only'}</span>{classicView && classic && <small className="catalog-loaded-years">{classic.gameCount ? `Loaded: ${formatSeasons(classic.seasons)}` : profile.position === 'K' ? 'Kicker game logs not loaded' : 'Game logs not loaded'}</small>}</TableCell><TableCell className="ff-number">{classicView ? classic?.gameCount ? classic.gameCount.toLocaleString() : '—' : profile.athlete ? remaining.toLocaleString() : '—'}</TableCell><TableCell>{!classicView && profile.athlete && profile.position!=='K' && canDraft ? <button className="ff-archive-add" disabled={!remaining} onClick={() => onDraft(profile.athlete!)} aria-label={`Add ${profile.name} to lineup`} title={remaining ? 'Add to lineup' : 'No unused games remain'}>{remaining ? 'Add' : 'Used'}</button> : <button className="ff-archive-view" onClick={() => setSelected(profile)} aria-label={`View ${profile.name} profile`}>View</button>}</TableCell></TableRow>;
      })}
    </TableBody></Table></section>
    {pagination}
    {!filtered.length && <div className="empty-library"><Search size={28}/><h3>{unavailableDefenseEra ? 'No defense games loaded for this era' : 'No profiles with these filters'}</h3><p>{unavailableDefenseEra ? 'The defense archive starts in 1999. Earlier years will stay unavailable until their scoring records are verified.' : 'Try a different era, position, or name.'}</p><button className="secondary-button" onClick={() => {setEra(0); setPosition('ALL'); setStatus('all');setCollection(initialCollection); setRecognition('all'); setSearch(''); setPage(0);}}>Reset filters</button></div>}
    <div className="archive-quality-note"><b>Source limits:</b> {DATA_QUALITY.earlySeasonWarning} {DATA_QUALITY.excludedGameCount} known invalid or incomplete games are excluded from the entire pool.</div><div className="archive-footnote"><LockKeyhole size={16}/><p>Era filters help you discover players. In current game modes, a draft pick uses every eligible loaded year for that player, including years after 2010. Classic browsing does not change that pool. You never select the year or the game.</p></div>
    <Dialog open={!!selected} onOpenChange={open => {if (!open) setSelected(null);}}><DialogContent className="profile-modal">
      {selected && <>
        <span className="eyebrow">{selected.position} · {classicView ? 'CLASSIC LEGENDS PROFILE' : selected.athlete ? 'PLAYABLE ARCHIVE' : 'PROFILE ONLY'}</span>
        <DialogTitle>{selected.name}</DialogTitle>
        <DialogDescription>{selected.clubs} · {selected.careerVerified ? 'Career' : selected.collection==='additional'?'Loaded seasons':'Source seasons'} {selected.classic ? formatSeasons(selected.classic.careerSeasons) : `${selected.firstYear}–${selected.lastYear}`}</DialogDescription>
        <p className="profile-description">{selected.description}</p>
        {!selected.careerVerified && selected.position !== 'DEF' && <p className="profile-selection">{selected.collection==='additional'?'These are the verified loaded game years, not a claim of complete career coverage.':'The years shown are a provider metadata window, not an independently verified full-career range.'}</p>}
        {selected.selectionBasis && <p className="profile-selection"><b>Why included:</b> {selected.selectionBasis}</p>}
        {selected.hallOfFameYear && <p className="profile-hof"><Trophy size={17}/> Hall of Fame · Class of {selected.hallOfFameYear}</p>}
        {selected.classic?.nfl100Source && <p className="profile-hof"><Trophy size={17}/> NFL 100 All-Time Team · {selected.classic.nfl100Position === 'RS' ? 'Return specialist · ' : ''}2019 selection</p>}
        {selected.classic && <section className="profile-coverage classic-profile-coverage"><h3>Classic eligibility · 1960–2010</h3><strong>{formatSeasons(selected.classic.classicSeasons)}</strong><p>Official position: {selected.classic.officialPositions.join(' / ')}. {selected.classic.scopeNote}</p><p><b>{classicCoverage(selected.classic).gameCount.toLocaleString()} verified Classic game records loaded</b><br/>Loaded seasons: {formatSeasons(classicCoverage(selected.classic).seasons)}.</p><p>{selected.position === 'K' ? 'Kickers with verified game logs can be drafted in new 11-player seasons. Older saved seasons and quick matchups retain their original slots.' : 'Classic competition is not enabled. The 1960–1998 archive and a balanced era-wide player pool still need verified game logs.'}</p>{selected.classic.aliases.length > 0 && <p>Also listed as: {selected.classic.aliases.join(' · ')}</p>}</section>}
        {!classicView && <section className="profile-coverage"><h3>{selected.athlete ? 'What can be drawn' : 'Game-log coverage'}</h3>
          {selected.athlete && selectedAvailability ? <><strong>{selectedAvailability.count.toLocaleString()} unused performances</strong><p>Loaded seasons: {formatSeasons(selected.athlete.seasons)}. {selected.athlete.gameCount.toLocaleString()} original records. Regular season and playoffs only. Known source gaps are excluded.</p><div className="season-pills">{selected.athlete.seasons.map(year => <span key={year} className={selectedAvailability.seasons.includes(year) ? '' : 'exhausted'}>{year}</span>)}</div><p>Every remaining year has the same chance; then one unused game in that year is selected. An early career may be only partially covered.</p></> : <><strong>Profile only</strong><p>This player belongs to the all-time collection. Verified, complete scoring records have not been loaded, so this profile cannot enter a scored matchup.</p></>}
          {selected.position === 'DEF' && <p>1950–1998 defense games are not loaded. A franchise’s history may be longer than its playable archive.</p>}
        </section>}
        <a className="profile-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">Read the source: {selected.sourceLabel}</a>
        {selected.classic?.sources.filter(source => source.url !== selected.sourceUrl).map(source => <a key={source.url} className="profile-source" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
        {selected.supportingURLs?.filter(url => url !== selected.sourceUrl).slice(0, 2).map(url => <a key={url} className="profile-source" href={url} target="_blank" rel="noreferrer">Additional career evidence</a>)}
        {!classicView&&selected.position==='K'&&selected.athlete&&<p className="profile-selection">Draft this kicker from a new 11-player season’s K pool. Existing season and quick-matchup slots are unchanged.</p>}{!classicView && selected.athlete && selected.position!=='K' && <button className="primary-button" disabled={!canDraft || !selectedAvailability?.count} onClick={() => {onDraft(selected.athlete!); setSelected(null);}}>{!canDraft ? 'Start or open a draft to select' : !selectedAvailability?.count ? 'No unused games remain' : `Add ${selected.name} to lineup`}</button>}
      </>}
    </DialogContent></Dialog>
  </>;
}
