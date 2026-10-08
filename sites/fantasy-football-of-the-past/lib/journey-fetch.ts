/** One deadline covers API headers and body; interrupted writes are never retried here. */
export class JourneyFetchError extends Error {
 readonly status?:number;
 constructor(message:string,status?:number){super(message);this.name='JourneyFetchError';this.status=status;}
}
export async function journeyFetch(input:RequestInfo|URL,init:RequestInit={},timeoutMs=15000):Promise<Response>{
 const controller=new AbortController(),external=init.signal??(input instanceof Request?input.signal:undefined);
 let response:Response|undefined,rejectDeadline:(reason:unknown)=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{rejectDeadline=reject;});
 const abort=()=>{rejectDeadline(external?.reason??new DOMException('Request cancelled.','AbortError'));controller.abort(external?.reason);};
 if(external?.aborted)throw external.reason??new DOMException('Request cancelled.','AbortError');
 external?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{rejectDeadline(new JourneyFetchError('The request timed out. Refresh to check saved progress before trying again.',response?.status));controller.abort();},timeoutMs);
 try{
  response=await Promise.race([fetch(input,{...init,signal:controller.signal}),deadline]);
  // Account expiry must work for HTML, empty, or indefinitely streaming 401 responses.
  if(response.status===401){void response.body?.cancel().catch(()=>{});return new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers});}
  const body=await Promise.race([response.text(),deadline]);
  if(body){try{JSON.parse(body);}catch{if(response.ok)throw new JourneyFetchError('Saved progress could not be read. Refresh before trying another change.',response.status);const headers=new Headers(response.headers);headers.set('content-type','application/json');return new Response(JSON.stringify({error:'The service could not complete this request. Refresh saved progress before trying again.'}),{status:response.status,statusText:response.statusText,headers});}}
  return new Response(body||null,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(error){
  void response?.body?.cancel().catch(()=>{});
  if(external?.aborted)throw external.reason??new DOMException('Request cancelled.','AbortError');
  if(error instanceof JourneyFetchError)throw error;
  throw new JourneyFetchError(error instanceof Error?error.message:'The request was interrupted.',response?.status);
 }finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
