import type {Metadata} from 'next';
import {GameHeader} from '@/components/game-header';
import {HistoricalGameReview} from '@/components/historical-game-review';

export const metadata:Metadata={
 title:'Selected historical game review · Fantasy Football of the Past',
 description:'Read-only review of 24 selected quarterback shutouts. This biased sample is excluded from drafts, random draws and seasons.',
};

export default function HistoricalGameReviewPage(){
 return <div className="fantasy-app historical-preview-page"><GameHeader active="legends"/><main className="ff-main"><HistoricalGameReview/></main></div>;
}
