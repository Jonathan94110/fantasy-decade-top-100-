import type {Metadata} from 'next';
import {GameHeader} from '@/components/game-header';
import {CatalogNavigation} from '@/components/catalog-navigation';
import {HistoricalPreview} from '@/components/historical-preview';
import {PREVIEW_POSITIONS,type PreviewPosition} from '@/lib/historical-preview';
export const metadata:Metadata={title:'Historical player preview · Fantasy Football of the Past',description:'Browse read-only source profiles from 1960–1998. Game verification is pending; preview entries do not enable drafting.'};
type PreviewSearchParams=Record<string,string|string[]|undefined>;
const PREVIEW_ERAS=['0','1960','1970','1980','1990'];
export default async function HistoricalPreviewPage({searchParams}:{searchParams:Promise<PreviewSearchParams>}){
 const params=await searchParams;
 const initialPosition:PreviewPosition|'ALL'=typeof params.position==='string'&&PREVIEW_POSITIONS.includes(params.position as PreviewPosition)?params.position as PreviewPosition:'ALL';
 const initialEra=typeof params.era==='string'&&PREVIEW_ERAS.includes(params.era)?Number(params.era):0;
 const initialSearch=typeof params.search==='string'?params.search.slice(0,100):'';
 return <div className="fantasy-app historical-preview-page"><GameHeader active="legends"/><main className="ff-main"><CatalogNavigation active="preview"/><HistoricalPreview initialPosition={initialPosition} initialEra={initialEra} initialSearch={initialSearch}/></main></div>;
}
