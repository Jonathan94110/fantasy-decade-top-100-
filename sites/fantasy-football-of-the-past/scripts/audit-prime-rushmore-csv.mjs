import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import path from 'node:path';

registerHooks({
 resolve(specifier,context,nextResolve){try{return nextResolve(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(`${specifier}.ts`,context);throw error;}},
 load(url,context,nextLoad){if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default ${readFileSync(new URL(url),'utf8')}`};return nextLoad(url,context);},
});
const {PRIME_RUSHMORE_REVISION,CSV_POSITIONS,parseCsv,selectGameLogFiles,validateCsvGame,auditDuplicateKeys}=await import('../lib/prime-rushmore-csv.ts');
const [sourceRoot,reportPath]=process.argv.slice(2);
if(!sourceRoot||!reportPath)throw new Error('Usage: node --experimental-strip-types scripts/audit-prime-rushmore-csv.mjs SOURCE_ROOT REPORT_JSON');
const root=path.resolve(sourceRoot),manifest=JSON.parse(readFileSync(path.join(root,'source-manifest.json'),'utf8'));
if(manifest.sourceRevision!==PRIME_RUSHMORE_REVISION)throw new Error('A matching pinned source manifest is required.');
const files=new Map();
for(const file of manifest.files){
 const absolute=path.resolve(root,file.path);
 if(!absolute.startsWith(`${root}${path.sep}`))throw new Error('Source manifest path leaves its snapshot.');
 const bytes=readFileSync(absolute),sha256=createHash('sha256').update(bytes).digest('hex'),blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
 if(bytes.length!==file.sizeBytes||sha256!==file.sha256||blob!==file.gitBlobSHA1)throw new Error(`Pinned bytes changed: ${file.path}`);
 files.set(file.path,{...file,text:bytes.toString('utf8')});
}
const countBy=(rows,selector)=>Object.fromEntries([...rows.reduce((counts,row)=>{for(const item of selector(row)){counts.set(item,(counts.get(item)||0)+1);}return counts;},new Map())].sort(([a],[b])=>a.localeCompare(b)));
const positions={};let montana=null;
for(const position of CSV_POSITIONS){
 const selected=selectGameLogFiles([...files.keys()],position,'decades'),sourceFiles=[],all=[];
 for(const filePath of selected){
  const file=files.get(filePath),table=parseCsv(file.text);
  sourceFiles.push({path:filePath,sha256:file.sha256,headers:table.headers,rowCount:table.rows.length});
  for(const raw of table.rows){
   const result=validateCsvGame(position,raw);all.push(result);
   if(position==='QB'&&raw.game_id==='19890910-SFO-IND'&&raw.name==='Joe Montana')montana={sourceFile:filePath,sourceSHA256:file.sha256,...result};
  }
 }
 const regular=all.filter(row=>row.regularSeason),duplicates=auditDuplicateKeys(all);
 positions[position]={allRows:all.length,regularRows:regular.length,postseasonRows:all.filter(row=>row.raw.playoff==='True').length,unrecognizedPlayoffFlags:all.filter(row=>!['True','False'].includes(row.raw.playoff)).length,regularSourceScoringComplete:regular.filter(row=>row.sourceScoringComplete===true&&row.sourceScoringMissing.length===0).length,regularSourceComplete:regular.filter(row=>row.sourceComplete===true).length,regularAppNumericComplete:regular.filter(row=>row.appNumericComplete).length,regularStrictScoringComplete:regular.filter(row=>row.strictScoringComplete).length,regularIdentityFailures:regular.filter(row=>!row.identityValid).length,duplicateKeys:duplicates,missingScoringFields:countBy(regular,row=>row.missingScoringFields),invalidNumericFields:countBy(regular,row=>row.invalidNumericFields),defenseQuarantinedAll:all.filter(row=>row.defenseDisputed).length,defenseQuarantinedRegular:regular.filter(row=>row.defenseDisputed).length,kickerContractMismatches:regular.filter(row=>row.kickerContractMatches===false).map(row=>({identityKey:row.identityKey,name:row.raw.name,date:row.date,reported:row.sourceFantasyPoints.kickerContract,calculatedKickingComponent:row.kickingPoints,unsuccessfulExtraPoints:row.kickingAggregates.unsuccessfulExtraPoints})),sourceFiles};
}
const report={sourceRevision:PRIME_RUSHMORE_REVISION,representation:'decade files only',normalGameplayImports:0,publicationHeld:true,eligibilityPolicyDecision:'pending',sourceUseDecision:'pending',sourceQualityAndParticipationDecision:'pending',positions,montana,note:'Numeric/scoring completeness is a local diagnostic, not permission, verified participation, representative career coverage or gameplay eligibility. Unknown cells remain null; source fantasy totals are provider assertions.'};
writeFileSync(path.resolve(reportPath),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({report:path.resolve(reportPath),sourceRevision:report.sourceRevision,normalGameplayImports:0,publicationHeld:true,counts:Object.fromEntries(Object.entries(positions).map(([position,summary])=>[position,{regular:summary.regularRows,sourceScoringComplete:summary.regularSourceScoringComplete,appNumericComplete:summary.regularAppNumericComplete,strictScoringComplete:summary.regularStrictScoringComplete,identityFailures:summary.regularIdentityFailures}]))}));
