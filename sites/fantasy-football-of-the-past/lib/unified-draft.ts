import type {DemoDraft} from './demo-draft-model';
import {athletesFor} from './game-model';
import {canCompleteRoster} from './roster-feasibility';
import {newScoring} from './scoring-rules';
import {assignByes,FIRST_BYE_WEEK} from './season-byes';
import {modernRegularWeeks} from './season-model';

/** The one-time product correction applies only before a solo season exists. */
export function unifiedDraftCandidate(saved:DemoDraft|null):saved is DemoDraft{
 if(!saved||saved.unificationReverted||saved.status!=='draft'||saved.season||![10,11].includes(saved.rosterSize??0)||!saved.scoring||!(saved.scoring.version===5&&saved.scoring.mode==='strict'||saved.scoring.version===4&&!saved.scoring.mode))return false;
 const extra=saved as DemoDraft&{history?:unknown[];used?:unknown[];draws?:unknown[]};
 if(extra.history?.length||extra.used?.length||extra.draws?.length)return false;
 const original={...newScoring(saved.scoring.receptionPoints,!!saved.scoring.kicking,'strict')};
 if(saved.scoring.version===4){original.version=4;delete original.mode;}
 if(Object.keys(original).length!==Object.keys(saved.scoring).length||Object.keys(original).some(key=>JSON.stringify(original[key as keyof typeof original])!==JSON.stringify(saved.scoring![key as keyof typeof original])))return false;
 const rules=newScoring(saved.scoring.receptionPoints,!!saved.scoring.kicking,'historical');
 const catalog=athletesFor(rules).filter(a=>a.gameCount>=17&&(saved.rosterSize===11||a.position!=='K'));
 const ids=new Set(catalog.map(a=>a.id)),owned=saved.teams.flatMap(t=>t.roster);
 if(saved.pick!==saved.picks.length||saved.pick!==owned.length||new Set(owned).size!==owned.length||owned.some(id=>!ids.has(id)))return false;
 if(new Set(saved.picks.map(p=>p.athleteId)).size!==saved.picks.length)return false;
 if(saved.teams.some(t=>JSON.stringify([...t.roster].sort())!==JSON.stringify(saved.picks.filter(p=>p.teamId===t.id).map(p=>p.athleteId).sort())))return false;
 const available=catalog.filter(a=>!owned.includes(a.id));
 return saved.teams.every(t=>canCompleteRoster(t.roster,available,saved.rosterSize!,0,saved.rosterSize===11));
}

export function unifyUnscoredDraft(saved:DemoDraft):DemoDraft|null{
 if(!unifiedDraftCandidate(saved))return null;
 const next=structuredClone(saved);
 next.scoring=newScoring(saved.scoring!.receptionPoints,!!saved.scoring!.kicking,'historical');
 const generated=assignByes(saved.id,modernRegularWeeks(saved.teams.length,saved.playoffTeams),FIRST_BYE_WEEK,next.scoring);
 // Existing rest dates stay fixed; the larger pool receives deterministic dates.
 next.byes={...generated,weeks:{...generated.weeks,...saved.byes?.weeks}};
 return next;
}
