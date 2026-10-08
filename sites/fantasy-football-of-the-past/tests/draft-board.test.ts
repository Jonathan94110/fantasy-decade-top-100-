import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({load(url,c,n){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return n(url,c);},resolve(id,c,n){try{return n(id,c);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return n(`${id}.ts`,c);throw e;}}});
const {visibleDraftPicks}=await import('../lib/draft-board');
const {newSeason,joinSeason,seasonAction,publicSeason}=await import('../lib/season-engine');
const {draftTeam}=await import('../lib/season-view');
const {ATHLETES}=await import('../lib/game-model');
test('sixteen-team live legacy board reconstructs every human and commissioner pick in snake order across reloads',()=>{
 const teams=Array.from({length:16},(_,i)=>({id:`team-${i}`,name:`Team ${i}`,roster:Array.from({length:10},(_,r)=>`player-${i}-${r}`)})),state={status:'draft',pick:159,draftOrder:teams.map(t=>t.id),teams};
 const picks=visibleDraftPicks(state);assert.equal(picks.length,159);for(const p of picks){const index=p.number-1,r=Math.floor(index/16),offset=index%16,t=r%2?15-offset:offset;assert.equal(p.teamId,`team-${t}`);assert.equal(p.athleteId,`player-${t}-${r}`);assert.equal(p.round,r+1);}assert.deepEqual(visibleDraftPicks(JSON.parse(JSON.stringify(state))),picks);assert.deepEqual(visibleDraftPicks({...state,status:'active'}),[]);assert.deepEqual(visibleDraftPicks({...state,status:'active',draftPicks:picks}),picks);
});
test('new online drafts persist public pick identities for every team and retain them after roster changes',()=>{
 let s=newSeason('owner',{name:'Pick board',teamName:'Owner',capacity:2,format:'seventeen'},'CODE');s=joinSeason(s,'other','Other');s=seasonAction(s,'owner',{action:'startDraft',orderMode:'manual',orderIndexes:[0,1]});
 while(s.status==='draft'){const next=draftTeam(s),actor=s.teams.find(t=>t.id===next)!;if(s.pick===0){const athlete=ATHLETES.find(a=>a.position==='QB'&&a.gameCount>=17)!;s=seasonAction(s,actor.userId,{action:'draft',athleteId:athlete.id});}else s=seasonAction(s,'owner',{action:'autopick'});assert.equal(s.draftPicks!.length,s.pick);const pub=publicSeason(s,'other');assert.deepEqual(pub.draftPicks,s.draftPicks);assert.ok(pub.draftPicks!.every(p=>Object.keys(p).sort().join()==='athleteId,number,round,teamId'));assert.deepEqual(pub.used,[]);}
 const ledger=structuredClone(s.draftPicks);assert.equal(ledger!.length,20);s.teams[0].roster.reverse();assert.deepEqual(visibleDraftPicks(s),ledger);assert.deepEqual(publicSeason(JSON.parse(JSON.stringify(s)),'owner').draftPicks,ledger);
});
test('partially completed legacy online draft gains an exact ledger before its next pick',()=>{
 let s=newSeason('owner',{name:'Legacy picks',teamName:'Owner',capacity:2,format:'seventeen'},'CODE');s=joinSeason(s,'other','Other');s=seasonAction(s,'owner',{action:'startDraft'});for(let i=0;i<7;i++)s=seasonAction(s,'owner',{action:'autopick'});const expected=structuredClone(s.draftPicks);delete s.draftPicks;const before=JSON.stringify(s);assert.deepEqual(publicSeason(s,'other').draftPicks,expected);assert.equal(JSON.stringify(s),before);s=seasonAction(s,'owner',{action:'autopick'});assert.deepEqual(s.draftPicks!.slice(0,7),expected);assert.equal(s.draftPicks!.length,8);
});
