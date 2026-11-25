import type {Env} from './types';
export async function wakeBrowserDelivery(env:Env,asin:string|undefined,fetchFn:typeof fetch=fetch,testId?:string){
 if(env.AMAZON_BROWSER_IMMEDIATE_ENABLED!=='true'||env.AMAZON_BROWSER_ADVISORIES_ENABLED!=='true'||!env.CATCH_INGEST_SECRET)return;
 // Fixed trusted destination: collector requests cannot choose the delivery host.
 const response=await fetchFn('https://pokemon30th-discord-monitor.phil-kolevski.workers.dev/internal/amazon-browser-deliver',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+env.CATCH_INGEST_SECRET,'content-type':'application/json'},body:JSON.stringify(testId?{testId}:{asin})});
 if(testId)return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 await response.body?.cancel();
 if(!response.ok)throw new Error('Immediate advisory delivery unavailable; scheduled fallback retained');
}
