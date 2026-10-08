import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFetch,JourneyFetchError} from '../lib/journey-fetch.ts';

test('the request deadline aborts a hung POST without sending another request',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0,signal:AbortSignal|undefined;
 t.mock.method(globalThis,'fetch',async(_input:RequestInfo|URL,init?:RequestInit)=>{calls++;signal=init?.signal??undefined;return await new Promise<Response>(()=>{});});
 const pending=journeyFetch('/api/demo',{method:'POST',body:'one explicit action'},15);
 t.mock.timers.tick(15);
 await assert.rejects(pending,error=>error instanceof JourneyFetchError&&error.message.includes('timed out')&&error.status===undefined);
 assert.equal(calls,1);assert.equal(signal?.aborted,true);
});
test('the same deadline covers a hanging body and preserves its known HTTP status',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(new ReadableStream({start(){}}),{status:503});});
 const pending=journeyFetch('/api/demo',{},15);await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(15);
 await assert.rejects(pending,error=>error instanceof JourneyFetchError&&error.status===503&&error.message.includes('timed out'));
 assert.equal(calls,1);
});
test('external abort cancels the request and keeps the cancellation reason',async t=>{
 let signal:AbortSignal|undefined;t.mock.method(globalThis,'fetch',async(_input:RequestInfo|URL,init?:RequestInit)=>{signal=init?.signal??undefined;return await new Promise<Response>(()=>{});});
 const controller=new AbortController(),reason=new DOMException('Scope changed','AbortError');
 const pending=journeyFetch('/api/leagues/old',{signal:controller.signal});controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);assert.equal(signal?.aborted,true);
});
test('HTML and indefinitely streaming 401 responses return status without parsing a body',async t=>{
 let cancelled=0;
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(){},cancel(){cancelled++;}}),{status:401,headers:{'content-type':'text/html'}}));
 const response=await journeyFetch('/api/profile');assert.equal(response.status,401);assert.equal(response.ok,false);assert.equal(cancelled,1);
 assert.equal(await response.text(),'');
});
test('successful bodies and conflict envelopes remain available to caller JSON parsing',async t=>{
 const body={profile:{displayName:'Saved manager',revision:4},error:'Changed in another tab'};
 t.mock.method(globalThis,'fetch',async()=>Response.json(body,{status:409,headers:{'x-fixture':'kept'}}));
 const response=await journeyFetch('/api/profile');assert.equal(response.status,409);assert.equal(response.headers.get('x-fixture'),'kept');assert.deepEqual(await response.json(),body);
});
test('non-JSON errors preserve status with a useful envelope and invalid success is a readable error',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>Unavailable</html>',{status:503}));
 const response=await journeyFetch('/api/demo');assert.equal(response.status,503);assert.match((await response.json() as {error:string}).error,/Refresh saved progress/);
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>Unexpected proxy page</html>',{status:200}));
 await assert.rejects(journeyFetch('/api/profile'),error=>error instanceof JourneyFetchError&&error.status===200&&error.message.includes('could not be read'));
});
