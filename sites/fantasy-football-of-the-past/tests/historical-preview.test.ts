import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
registerHooks({load(url,c,n){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return n(url,c);},resolve(id,c,n){try{return n(id,c);}catch(e){if(id.startsWith('.')&&!/\.[a-z]+$/i.test(id))return n(`${id}.ts`,c);throw e;}}});
const {PREVIEW_PROFILES,PREVIEW_SOURCE,PREVIEW_COUNTS,PREVIEW_PAGE_SIZE,filterPreview,previewSeasons,normalizePreviewSearch}=await import('../lib/historical-preview');
const suspect=['1860','2600','3588','6251','7743','11322','11346','13509','15039','16234','20554','22006'];
test('identity-only preview excludes all conflicted IDs and reconciles counts without game records',()=>{
 assert.equal(PREVIEW_PROFILES.length,3913);assert.equal(PREVIEW_SOURCE.candidates,3925);assert.equal(PREVIEW_SOURCE.excluded,12);assert.equal(new Set(PREVIEW_PROFILES.map(p=>p.id)).size,3913);assert.deepEqual(PREVIEW_COUNTS,{QB:521,RB:1486,WR:1125,TE:572,K:209});
 for(const p of PREVIEW_PROFILES){assert.ok(!suspect.includes(p.id));assert.deepEqual(Object.keys(p).sort(),['id','name','position','seasons','sourcePosition']);assert.equal(p.name.trim(),p.name);assert.ok(p.seasons.length);assert.equal(new Set(p.seasons).size,p.seasons.length);assert.ok(p.seasons.every(y=>Number.isInteger(y)&&y>=1960&&y<=1998));assert.ok(['QB','RB','WR','TE','K'].includes(p.position));assert.ok(['QB','RB','FB','HB','WR','TE','K'].includes(p.sourcePosition));}
});
test('name, ID, position and era filters intersect, preserve distinct same-name identities, and handle empty results',()=>{
 assert.equal(filterPreview({search:'barry SANDERS'})[0].id,'19437');assert.equal(filterPreview({search:'15597'})[0].name,'Joe Montana');assert.equal(filterPreview({search:'Walter Payton',position:'QB'}).length,0);assert.equal(filterPreview({search:'not-a-real-player-xyz'}).length,0);
 for(const era of [1960,1970,1980,1990])for(const position of ['QB','RB','WR','TE','K'] as const){const rows=filterPreview({era,position});assert.ok(rows.length);assert.ok(rows.every(p=>p.position===position&&p.seasons.some(y=>y>=era&&y<=Math.min(era+9,1998))));}
 const duplicates=PREVIEW_PROFILES.filter(p=>p.name==='John Williams');if(duplicates.length>1)assert.equal(filterPreview({search:'John Williams'}).filter(p=>p.name==='John Williams').length,duplicates.length);
 assert.equal(normalizePreviewSearch(" O’Brien–Jr. "),'o brien jr');assert.equal(previewSeasons([1970,1968,1969,1973,1973]),'1968–1970, 1973');
});
test('bounded rendering and repeat searches remain deterministic without mutating metadata',()=>{
 assert.equal(PREVIEW_PAGE_SIZE,36);const before=JSON.stringify(PREVIEW_PROFILES),start=performance.now();for(let i=0;i<200;i++)filterPreview({search:i%2?'Joe':'',position:i%3?'ALL':'QB',era:i%2?1980:0});assert.ok(performance.now()-start<3000);assert.equal(JSON.stringify(PREVIEW_PROFILES),before);
});
test('preview metadata is unreachable from game models, scoring, APIs and draft engines',()=>{
 for(const file of ['lib/game-model.ts','lib/historical-data.ts','lib/demo-draft-engine.ts','lib/demo-draft-model.ts','lib/season-engine.ts','lib/scoring-rules.ts','lib/era-catalog.ts'])assert.ok(!readFileSync(new URL('../'+file,import.meta.url),'utf8').includes('historical-preview'),file);
 const ui=readFileSync(new URL('../components/historical-preview.tsx',import.meta.url),'utf8');assert.ok(!ui.includes('fetch('));assert.ok(!ui.includes('onDraft'));assert.ok(ui.includes('Preview entry · no draft action'));assert.ok(ui.includes('Source profile · no game data'));assert.ok(ui.includes('Draft eligibility comes from verified game records and the saved scoring rules.'));
});

test('no preview source ID is eligible in the existing player pool',async()=>{const {ATHLETES}=await import('../lib/game-model');const playable=new Set(ATHLETES.map(a=>a.id));assert.ok(PREVIEW_PROFILES.every(p=>!playable.has(p.id)));});
