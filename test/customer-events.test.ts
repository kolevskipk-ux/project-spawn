import {describe,expect,it} from "vitest";
// @ts-expect-error Vitest reads the shared contract fixture in Node; Worker runtime code does not import Node builtins.
import {readFileSync} from "node:fs";
import {validateCustomerEventAck} from "../src/customer-events";

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
