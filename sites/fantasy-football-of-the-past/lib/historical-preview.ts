import source from '../data/historical-preview.json';
/** Discovery metadata only. This module must never feed a draft, draw or scorer. */
export type PreviewPosition='QB'|'RB'|'WR'|'TE'|'K';
export type PreviewProfile={id:string;name:string;position:PreviewPosition;sourcePosition:string;seasons:number[]};
export const PREVIEW_SOURCE={url:source.sourceUrl,label:source.sourceLabel,start:source.coverageStart,end:source.coverageEnd,candidates:source.sourceCandidateCount,excluded:source.excludedIdentityCount};
export const PREVIEW_PROFILES=source.profiles as PreviewProfile[];
export const PREVIEW_POSITIONS:PreviewPosition[]=['QB','RB','WR','TE','K'];
export const PREVIEW_PAGE_SIZE=36;
export const PREVIEW_COUNTS=Object.fromEntries(PREVIEW_POSITIONS.map(p=>[p,PREVIEW_PROFILES.filter(row=>row.position===p).length])) as Record<PreviewPosition,number>;
export function normalizePreviewSearch(text:string){return text.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const searches=new Map(PREVIEW_PROFILES.map(p=>[p.id,normalizePreviewSearch(`${p.name} ${p.id}`)]));
export function filterPreview({search='',position='ALL',era=0}:{search?:string;position?:PreviewPosition|'ALL';era?:number}={}){
 const terms=normalizePreviewSearch(search).split(' ').filter(Boolean);
 return PREVIEW_PROFILES.filter(p=>(position==='ALL'||p.position===position)&&(!era||p.seasons.some(y=>y>=era&&y<=Math.min(era+9,PREVIEW_SOURCE.end)))&&terms.every(term=>searches.get(p.id)!.includes(term)));
}
export function previewSeasons(seasons:number[]){
 const years=[...new Set(seasons)].sort((a,b)=>a-b),ranges:string[]=[];
 for(let i=0;i<years.length;i++){const first=years[i];let last=first;while(years[i+1]===last+1)last=years[++i];ranges.push(first===last?String(first):`${first}–${last}`);}
 return ranges.join(', ');
}
