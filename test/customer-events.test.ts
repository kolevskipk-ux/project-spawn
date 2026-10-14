import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {validateCustomerEventAck,handleCustomerEvents} from "../src/customer-events";

const id="a".repeat(64);
const fixture=JSON.parse(readFileSync(new URL("../fixtures/customer-inventory-events-v1.json",import.meta.url),"utf8"));

describe("customer event acknowledgement contract",()=>{
  it("accepts terminal and retryable outcomes with stable identities",()=>{
    expect(fixture.schema_version).toBe(1);expect(fixture.accepted.map((event:{event_type:string})=>event.event_type)).toEqual(["LISTING_PUBLISHED","BECAME_BUYABLE"]);
    expect(validateCustomerEventAck({event_id:id,status:"DELIVERED"})).toMatchObject({event_id:id,status:"DELIVERED"});
    expect(validateCustomerEventAck({event_id:id,status:"FAILED",error:"Discord 503"})).toMatchObject({status:"FAILED",error:"Discord 503"});
    expect(validateCustomerEventAck({event_id:id,status:"SUPPRESSED"})).toMatchObject({status:"SUPPRESSED"});
  });
  it("fails closed on malformed identities, outcomes, and empty failure evidence",()=>{
    expect(validateCustomerEventAck({event_id:"bad",status:"DELIVERED"})).toBeNull();
    expect(validateCustomerEventAck({event_id:id,status:"UNKNOWN"})).toBeNull();
    expect(validateCustomerEventAck({event_id:id,status:"FAILED"})).toBeNull();
  });
});

it('repairs historical campaign envelope omissions without weakening Catch identity validation',async()=>{
 const campaign='amazon-mx-pokemon-tcg-20260903';
 const source={event_id:id,schema_version:3,event_type:'CAMPAIGN_PUBLISHED',listing_key:'campaign:'+campaign,source_observation_id:campaign,routing_key:'pokemon-main',occurred_at:'2026-09-04T23:10:55Z',payload_json:JSON.stringify({schema_version:3,event_id:id,event_type:'CAMPAIGN_PUBLISHED',campaign_id:campaign,source_owner:'spawn',disposition:'visibility_only',product_count:61,routing_key:'pokemon-main',inventory_url:'https://spawn.example/inventory'})};
 const env={CATCH_INGEST_SECRET:'fixture',SPAWN_DB:{prepare(){return {bind(){return this;},async all(){return {results:[source]};}};}}} as any;
 const url=new URL('https://spawn.test/internal/garfield/customer-events');
 const response=await handleCustomerEvents(new Request(url,{headers:{authorization:'Bearer fixture'}}),url,env);
 const body=await response!.json() as any;
 expect(body.events[0].payload).toMatchObject({listing_key:'campaign:'+campaign,source_observation_id:campaign});
 const {validateCustomerInventoryEvent}=await import('../../catch-em-all/src/worker.js');
 expect(validateCustomerInventoryEvent(body.events[0],Date.parse('2026-10-14T00:00:00Z'))).toBeTruthy();
});

it('routes legacy Ascended Heroes events to the dedicated hunt without changing event identity',async()=>{
 const source={event_id:id,schema_version:2,event_type:'BECAME_BUYABLE',listing_key:'listing',source_observation_id:'observation',routing_key:'pokemon-main',payload_json:JSON.stringify({product_name:'Pokemon Ascended Heroes Booster Bundle',routing_key:'pokemon-main'})};
 const env={CATCH_INGEST_SECRET:'fixture',SPAWN_DB:{prepare(){return {bind(){return this;},async all(){return {results:[source]};}};}}} as any;
 const url=new URL('https://spawn.test/internal/garfield/customer-events');
 const response=await handleCustomerEvents(new Request(url,{headers:{authorization:'Bearer fixture'}}),url,env);
 const body=await response!.json() as any;
 expect(body.events[0]).toMatchObject({event_id:id,routing_key:'ascended-heroes',payload:{routing_key:'ascended-heroes',watch_category:'ascended_heroes'}});
});
