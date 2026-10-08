'use client';
import {scoringContractLabel,scoringModeNote,type ScoringRules} from '@/lib/scoring-rules';

/** Every active view and result describes its own saved snapshot. */
export function ScoringContractSummary({rules,lockNotice}:{rules:ScoringRules;lockNotice?:string}){
 return <div className="scoring-contract-summary" aria-label="Saved scoring contract"><p className="season-pool-note"><b>{scoringContractLabel(rules)}</b>{lockNotice?` · ${lockNotice}`:''}</p><p className="season-pool-note">{scoringModeNote(rules)}</p></div>;
}
