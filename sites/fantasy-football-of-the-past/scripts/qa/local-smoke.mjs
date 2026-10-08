/** Local-only HTTP/D1 smoke: never uses the deployed Site or the owner's account. */
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const child=spawn('npm',['run','dev','--','--port','5173','--hostname','127.0.0.1'],{stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
const root='http://127.0.0.1:5173';
try{
 let ready=false;for(let i=0;i<90;i++){if(output.includes('Local:')){ready=true;break;}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'local preview starts');
 for(const [route,marker] of [['/','Build your team. Make history.'],['/demo','Build your team. Make history.'],['/league','Online leagues']]){const r=await fetch(root+route);assert.equal(r.status,200);assert.ok((await r.text()).includes(marker),route+' renders');}
 const signed=await fetch(root+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});assert.ok(signed.status>=300&&signed.status<400);const cookie=signed.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
 const headers={'Cookie':cookie,'Content-Type':'application/json','Origin':root};
 const get=async(path)=>{const r=await fetch(root+path,{headers});assert.equal(r.status,200,path);return r.json();};
 const post=async(path,body)=>{const r=await fetch(root+path,{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 let league=(await get('/api/game')).league;
 if(league.status==='reveal')league=(await post('/api/game',{action:'next',revision:league.revision})).data.league;
 const athletes=JSON.parse(fs.readFileSync('data/nflverse/athletes.json','utf8'));const lineup={};
 for(const p of ['QB','RB','WR','TE','DEF','FLEX'])lineup[p]=athletes.find(a=>(p==='FLEX'?['RB','WR','TE'].includes(a.position):a.position===p)&&!a.legend&&!Object.values(lineup).includes(a.id)&&a.gameCount>50).id;
 const before=structuredClone(league);
 if(league.turn===0){const home=await post('/api/game',{action:'lock',revision:league.revision,turn:0,lineup});assert.equal(home.status,200);league=home.data.league;assert.equal(league.turn,1);assert.deepEqual(league.lineups,[{},{}]);assert.deepEqual(league.used,before.used);assert.deepEqual(league.history,before.history);}
 const away=await post('/api/game',{action:'lock',revision:league.revision,turn:1,lineup});assert.equal(away.status,200);const completed=away.data.league;assert.equal(completed.status,'reveal');assert.equal(completed.used.length,before.used.length+12);assert.equal(new Set(completed.used).size,completed.used.length);assert.equal(completed.history.length,before.history.length+1);
 assert.deepEqual((await get('/api/game')).league,completed);const retry=await post('/api/game',{action:'lock',revision:league.revision,turn:1,lineup});assert.equal(retry.status,409);assert.deepEqual(retry.data.league,completed);
 const rankings=await get('/api/game?rankings=1');assert.equal(rankings.rankings.length,395);
 const created=await post('/api/demo',{action:'create',teamName:'Cloud QA test',receptionPoints:.5});assert.ok([200,201].includes(created.status));const demo=created.data.demo;const picks=JSON.stringify(demo.picks);assert.equal((await post('/api/demo',{action:'create',teamName:'Never overwrite',receptionPoints:0})).data.demo.id,demo.id);
 const scope=`demo:${demo.id}`;let preferences=(await get('/api/draft-preferences?scope='+encodeURIComponent(scope))).preferences;
 const queue=await post('/api/draft-preferences',{scope,action:'toggle',athleteId:athletes[0].id,revision:preferences.revision});assert.equal(queue.status,200);preferences=queue.data.preferences;assert.deepEqual((await get('/api/draft-preferences?scope='+encodeURIComponent(scope))).preferences,preferences);
 const timer=await post('/api/draft-preferences',{scope,action:'timer',seconds:60,revision:preferences.revision});assert.equal(timer.status,200);assert.equal(timer.data.preferences.timerSeconds,60);assert.equal(JSON.stringify((await get('/api/demo')).demo.picks),picks);
 const next=await post('/api/game',{action:'next',revision:completed.revision});assert.equal(next.status,200);assert.deepEqual(next.data.league.used,completed.used);assert.deepEqual(next.data.league.history,completed.history);
 console.log(JSON.stringify({passed:true,checks:['all three server-rendered routes','local test sign-in','actual local D1 persistence','first lock hides lineup and draws nothing','both locks save twelve unique real performances','refresh and retry preserve results','scoring-aware ranks','idempotent demo resume','durable private queue','soft timer settings never change picks','next round retains history and used pool'],completedRound:completed.round,renderedBrowserQA:false}));
}catch(e){process.exitCode=1;console.error(output);throw e;}finally{child.kill('SIGTERM');setTimeout(()=>process.exit(process.exitCode||0),1000);}
