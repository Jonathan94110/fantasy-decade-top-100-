/** Local audit adapter. No caller in gameplay imports this module. */
import {scoreOffense,type OffensiveScoringStats} from './game-model';
import {newScoring,pointsAllowedScore,type ReceptionPoints} from './scoring-rules';

export const PRIME_RUSHMORE_REVISION='53cf0b14b896f3aa9d5e5e2069b20acb75e74728';
export const CSV_POSITIONS=['QB','RB','WR','TE','K','DEF'] as const;
export type CsvPosition=typeof CSV_POSITIONS[number];
export type CsvRow=Record<string,string>;
export const OFFENSE_COLUMNS={passingYards:'pass_yds',passingTD:'pass_td',interceptions:'pass_int',rushingYards:'rush_yds',rushingTD:'rush_td',receptions:'rec',receivingYards:'rec_yds',receivingTD:'rec_td',returnTD:'ret_td',fumbleRecoveryTD:'fum_rec_td',twoPoint:'two_pt'} as const;
export type OffenseField=keyof typeof OFFENSE_COLUMNS;
export type CsvOffenseStats=Record<OffenseField,number|null> & {fumblesLost:null};
export type CsvTable={headers:string[];rows:CsvRow[]};

/** Quoted cells, escaped quotes and CRLF are parsed before header-name mapping. */
export function parseCsv(text:string):CsvTable{
 const records:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();if(row.length>1||row[0]!=='')records.push(row);row=[];};
 const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quoted){if(char==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=char;continue;}
  if(char==='"'){if(cell!==''||closed)throw new Error('Unexpected CSV quote.');quoted=true;}
  else if(char===',')endCell();
  else if(char==='\n'||char==='\r'){if(char==='\r'&&input[i+1]==='\n')i++;endRow();}
  else{if(closed)throw new Error('Characters after closing CSV quote.');cell+=char;}
 }
 if(quoted)throw new Error('Unclosed CSV quote.');
 if(cell!==''||row.length||closed)endRow();
 const headers=(records.shift()??[]).map(header=>header.trim());
 if(!headers.length||headers.some(header=>!header)||new Set(headers).size!==headers.length)throw new Error('Unique nonempty CSV headers are required.');
 return {headers,rows:records.map((values,index)=>{
  if(values.length!==headers.length)throw new Error(`CSV row ${index+2} has ${values.length} cells; expected ${headers.length}.`);
  return Object.fromEntries(headers.map((header,i)=>[header,values[i]]));
 })};
}
export function numericCell(value:string|undefined):number|null{
 if(value===undefined||value.trim()==='')return null;
 const trimmed=value.trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed))return null;
 const number=Number(trimmed);return Number.isFinite(number)?number:null;
}
function flag(value:string|undefined):boolean|null{return value==='True'?true:value==='False'?false:null;}
function isoDate(value:string|undefined){
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const timestamp=Date.parse(`${value}T00:00:00Z`);
 return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
export function canonicalGameId(row:CsvRow):string|null{
 if(!isoDate(row.date)||!row.team||!row.opp||row.team===row.opp||![row.team,row.opp].every(team=>/^[A-Z0-9]{2,4}$/.test(team)))return null;
 const day=row.date.replaceAll('-','');
 if(row.home_away==='H')return `${day}-${row.opp}-${row.team}`;
 if(row.home_away==='A')return `${day}-${row.team}-${row.opp}`;
 if(row.home_away==='N')return `${day}-${[row.team,row.opp].sort().join('-')}-N`;
 return null;
}
/** Choose exactly one supplied representation; season totals are separate grain. */
export function selectGameLogFiles(files:string[],position:CsvPosition,representation:'decades'|'full'='decades'):string[]{
 const prefix=position.toLowerCase();
 const chosen=files.filter(path=>{
  const name=path.split('/').at(-1)!;
  return representation==='full'?name===`${prefix}_gamelogs.csv`:new RegExp(`^${prefix}_gamelogs_(1950|1960|1970|1980|1990)s\\.csv$`).test(name);
 }).sort();
 if(!chosen.length)throw new Error(`No ${position} ${representation} game-log representation is available.`);
 if(representation==='decades'&&chosen.length!==5)throw new Error(`All five ${position} decade files are required.`);
 if(new Set(chosen.map(path=>path.split('/').at(-1))).size!==chosen.length)throw new Error('Duplicate source file selection.');
 return chosen;
}
export type CsvValidation={
 position:CsvPosition;raw:CsvRow;date:string|null;gameId:string|null;identityKey:string|null;
 regularSeason:boolean;identityValid:boolean;sourceScoringComplete:boolean|null;sourceScoringMissing:string[];sourceComplete:boolean|null;
 offenseStats:CsvOffenseStats|null;missingScoringFields:string[];invalidNumericFields:string[];
 appNumericComplete:boolean;strictScoringComplete:boolean;calculatedPoints:number|null;
 sourceFantasyPoints:{standard:number|null;ppr:number|null;kickerContract:number|null};
 kickingPoints:number|null;kickerContractMatches:boolean|null;
 kickingAggregates:{unsuccessfulFieldGoals:number|null;unsuccessfulExtraPoints:number|null;blockedFieldGoals:null;blockedExtraPoints:null}|null;
 defenseInterceptions:{check:string|null;defenders:number|null;opposingPassers:number|null;selected:number|null}|null;defenseDisputed:boolean;
 blocks:string[];eligibleForGameplay:false;disposition:'local-review-only';
};
/** Report strict current-contract completeness; do not choose an era policy or grant reuse rights. */
export function validateCsvGame(position:CsvPosition,row:CsvRow,ppr:ReceptionPoints=1):CsvValidation{
 const rules=newScoring(ppr),blocks:string[]=[],missing:string[]=[],invalid:string[]=[];
 const read=(column:string,field=column)=>{
  const value=numericCell(row[column]);
  if(value===null){missing.push(field);if(row[column]!==undefined&&row[column].trim()!=='')invalid.push(field);}
  return value;
 };
 const sum=(values:(number|null)[])=>values.every(value=>value!==null)?values.reduce<number>((total,value)=>total+value!,0):null;
 const regular=flag(row.playoff)===false,gameId=canonicalGameId(row),season=numericCell(row.season);
 const player=position==='DEF'?row.team:row.player_id;
 const dateYear=Number(row.date?.slice(0,4)),dateMonth=Number(row.date?.slice(5,7));
 const seasonDateValid=season!==null&&(dateYear===season||(dateYear===season+1&&dateMonth<=3));
 const identityValid=gameId!==null&&row.game_id===gameId&&!!player?.trim()&&Number.isInteger(season)&&season!==null&&season>=1950&&season<=1999&&regular&&seasonDateValid;
 if(!regular)blocks.push(flag(row.playoff)===true?'postseason-excluded':'regular-season-flag-unavailable');
 if(!identityValid)blocks.push('source-game-identity-invalid');
 const sourceScoringComplete=flag(row.scoring_complete),sourceMissing=(row.scoring_missing??'').split(';').filter(Boolean);
 if(sourceScoringComplete!==true||row.scoring_missing===undefined||sourceMissing.length)blocks.push('source-scoring-status-incomplete');
 let offense:CsvOffenseStats|null=null,kickingPoints:number|null=null,kickerContractMatches:boolean|null=null,kickingAggregates:CsvValidation['kickingAggregates']=null,defenseInterceptions:CsvValidation['defenseInterceptions']=null,defenseDisputed=false,points:number|null=null;
 if(position!=='DEF'){
  offense={...Object.fromEntries(Object.entries(OFFENSE_COLUMNS).map(([field,column])=>[field,read(column,field)])),fumblesLost:null} as CsvOffenseStats;
  for(const field of ['passingTD','interceptions','rushingTD','receptions','receivingTD','returnTD','fumbleRecoveryTD','twoPoint'] as const){const value=offense[field];if(value!==null&&(!Number.isInteger(value)||value<0))invalid.push(field);}
  if(position==='K'){
   const short=read('fgm_0_39','fieldGoalsShort'),forty=read('fgm_40_49','fieldGoals40'),fifty=read('fgm_50p','fieldGoals50'),fgm=read('fgm'),fga=read('fga'),failedFG=read('fg_missed','unsuccessfulFieldGoals'),xpm=read('xpm','extraPointsMade'),xpa=read('xpa','extraPointAttempts');
   const made=sum([short,forty,fifty]);
   if([short,forty,fifty,fgm,fga,failedFG,xpm,xpa].every(value=>value!==null)&&made===fgm&&(fga! - fgm!)===failedFG&&xpa! >= xpm!&&[short,forty,fifty,fgm,fga,failedFG,xpm,xpa].every(value=>Number.isInteger(value)&&value! >= 0)){
    // Aggregate unsuccessful counts include blocks once; the raw split stays unknown.
    kickingPoints=short! * 3+forty! * 4+fifty! * 5+xpm! - failedFG! - (xpa! - xpm!);
   }else if(missing.every(field=>!['fieldGoalsShort','fieldGoals40','fieldGoals50','fgm','fga','unsuccessfulFieldGoals','extraPointsMade','extraPointAttempts'].includes(field)))blocks.push('kicking-counts-inconsistent');
   kickingAggregates={unsuccessfulFieldGoals:failedFG,unsuccessfulExtraPoints:xpa!==null&&xpm!==null&&xpa>=xpm?xpa-xpm:null,blockedFieldGoals:null,blockedExtraPoints:null};
   const supplied=numericCell(row.fpts_k_contract);
   if(kickingPoints!==null&&supplied!==null){kickerContractMatches=Math.round(kickingPoints*100)===Math.round(supplied*100);if(!kickerContractMatches)blocks.push('source-kicker-contract-mismatch');}
   if(kickingPoints===null)blocks.push('kicking-scoring-incomplete');
  }
  if(Object.values(offense).filter(value=>value!==null).length===11&&(position!=='K'||kickingPoints!==null))points=scoreOffense(offense as OffensiveScoringStats,rules,kickingPoints??0);
 }else{
  const sacks=read('sacks'),interceptions=read('def_int','defensiveInterceptions'),recoveries=read('fum_rec','fumbleRecoveries'),safeties=read('safeties'),blocked=sum([read('blk_punt','blockedPunts'),read('blk_fg','blockedFieldGoals'),read('blk_xp','blockedExtraPoints')]),td=read('def_td','defensiveTD'),returns=read('ret_td','returnTD'),pa=read('pts_allowed','pointsAllowed');
  const defenders=numericCell(row.def_int_defenders),opposing=numericCell(row.opp_pass_int);
  defenseInterceptions={check:row.int_check||null,defenders,opposingPassers:opposing,selected:interceptions};
  for(const [field,value] of Object.entries({sacks,defensiveInterceptions:interceptions,fumbleRecoveries:recoveries,safeties,blockedKicks:blocked,defensiveTD:td,returnTD:returns,pointsAllowed:pa})){if(value!==null&&(value<0||(field!=='sacks'&&!Number.isInteger(value))))invalid.push(field);}
  defenseDisputed=row.int_check!=='match'||defenders===null||opposing===null||interceptions!==defenders||interceptions!==opposing;
  if(defenseDisputed)blocks.push('defense-interceptions-quarantined');
  if([sacks,interceptions,recoveries,safeties,blocked,td,returns,pa].every(value=>value!==null))points=sacks!*rules.sack+rules.takeaway*(interceptions!+recoveries!+safeties!+blocked!)+rules.touchdown*(td!+returns!)+pointsAllowedScore(pa!,rules);
 }
 const appNumericComplete=points!==null&&invalid.length===0;
 if(missing.length)blocks.push('app-required-scoring-fields-unavailable');
 if(invalid.length)blocks.push('invalid-numeric-scoring-values');
 const strictScoringComplete=identityValid&&appNumericComplete&&sourceScoringComplete===true&&row.scoring_missing!==undefined&&sourceMissing.length===0&&!defenseDisputed&&!blocks.includes('source-kicker-contract-mismatch')&&!blocks.includes('kicking-counts-inconsistent');
 return {position,raw:{...row},date:isoDate(row.date)?row.date:null,gameId,identityKey:gameId&&player?.trim()?`${position==='DEF'?'team':'player'}:${player}:${gameId}`:null,regularSeason:regular,identityValid,sourceScoringComplete,sourceScoringMissing:sourceMissing,sourceComplete:flag(row.complete),offenseStats:offense,missingScoringFields:[...new Set(missing)],invalidNumericFields:[...new Set(invalid)],appNumericComplete,strictScoringComplete,calculatedPoints:strictScoringComplete?points:null,sourceFantasyPoints:{standard:numericCell(row.fpts_std),ppr:numericCell(row.fpts_ppr),kickerContract:numericCell(row.fpts_k_contract)},kickingPoints,kickerContractMatches,kickingAggregates,defenseInterceptions,defenseDisputed,blocks:[...new Set(blocks),'source-quality-and-participation-review-pending','eligibility-and-source-use-decisions-pending'],eligibleForGameplay:false,disposition:'local-review-only'};
}
/** Preserve every duplicate occurrence; never silently resolve conflicting rows. */
export function auditDuplicateKeys(rows:CsvValidation[]){
 const groups=new Map<string,CsvValidation[]>();
 for(const row of rows){if(row.identityKey){const group=groups.get(row.identityKey)??[];group.push(row);groups.set(row.identityKey,group);}}
 const stable=(row:CsvRow)=>JSON.stringify(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)));
 return [...groups.entries()].filter(([,group])=>group.length>1).map(([identityKey,group])=>({identityKey,occurrences:group.length,kind:new Set(group.map(row=>stable(row.raw))).size===1?'exact' as const:'conflicting' as const}));
}
