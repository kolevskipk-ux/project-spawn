import {describe,it,expect} from 'vitest';
import {wakeBrowserDelivery} from '../src/amazon-browser-dispatch';
describe('immediate browser delivery',()=>{
 it('is gated and sends only a scoped authenticated wakeup to the fixed backend',async()=>{
 const calls:any[]=[];const fetchFn=async(url:any,init:any)=>{calls.push({url,init});return new Response('{}');};
 const env:any={AMAZON_BROWSER_IMMEDIATE_ENABLED:'true',AMAZON_BROWSER_ADVISORIES_ENABLED:'true',CATCH_INGEST_SECRET:'fixture'};
 await wakeBrowserDelivery({...env,AMAZON_BROWSER_IMMEDIATE_ENABLED:'false'},'B0H77VYKSM',fetchFn as any);expect(calls).toHaveLength(0);
 await wakeBrowserDelivery(env,'B0H77VYKSM',fetchFn as any);expect(calls).toHaveLength(1);expect(calls[0].url).toBe('https://pokemon30th-discord-monitor.phil-kolevski.workers.dev/internal/amazon-browser-deliver');expect(JSON.parse(calls[0].init.body)).toEqual({asin:'B0H77VYKSM'});expect(calls[0].init.redirect).toBe('manual');expect(calls[0].init.headers.authorization).toBe('Bearer fixture');
 });
 it('reports failed delivery so the persisted observation remains eligible for scheduled fallback',async()=>{await expect(wakeBrowserDelivery({AMAZON_BROWSER_IMMEDIATE_ENABLED:'true',AMAZON_BROWSER_ADVISORIES_ENABLED:'true',CATCH_INGEST_SECRET:'fixture'} as any,'B0H77VYKSM',(async()=>new Response('',{status:503})) as any)).rejects.toThrow('scheduled fallback');});
});
