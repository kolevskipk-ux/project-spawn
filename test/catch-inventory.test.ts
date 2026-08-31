import { describe,expect,it } from "vitest";
import { parseCatchInventoryObservation } from "../src/catch-inventory";

const observation=()=>({observation_id:"catch-inventory-"+"a".repeat(40),source_product_id:"amazon-delta-reign-three-booster-blister",canonical_product_id:"delta-reign-en-three-booster-blister",product_name:"Delta Reign Three Booster Blister",asin:"B0HG3JBNBN",product_url:"https://www.amazon.com.mx/dp/B0HG3JBNBN",watch_category:"delta_reign",routing_key:"delta-reign",observed_state:"BUYABLE",price_mxn:799,seller:"Murrassic Collectibles",fulfilled_by:"Murrassic Collectibles",observed_at:"2026-08-31T20:00:00.000Z",evidence_type:"buying_options"});

describe("authenticated Catch inventory observations",()=>{
  it("accepts a verified secondary Amazon buying option",()=>expect(parseCatchInventoryObservation(observation())).toMatchObject({asin:"B0HG3JBNBN",observed_state:"BUYABLE",price_mxn:799,evidence_type:"buying_options"}));
  it("accepts a price-free sold-out baseline",()=>expect(parseCatchInventoryObservation({...observation(),observed_state:"SOLD_OUT",price_mxn:null,seller:null,fulfilled_by:null,evidence_type:"direct_page"})).toMatchObject({observed_state:"SOLD_OUT",price_mxn:null}));
  it("rejects unpriced buyability and unsafe identities",()=>{expect(parseCatchInventoryObservation({...observation(),price_mxn:null})).toBeNull();expect(parseCatchInventoryObservation({...observation(),product_url:"https://example.com/dp/B0HG3JBNBN"})).toBeNull();expect(parseCatchInventoryObservation({...observation(),routing_key:"pokemon-main"})).toBeNull();});
});
