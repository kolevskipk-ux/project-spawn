import {describe,expect,it} from "vitest";
import {validatePricingReferenceForm} from "../src/pricing";

const form=(values:Record<string,string>)=>{const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result;};
const now=Date.parse("2026-08-31T18:00:00.000Z");

describe("pricing reference evidence",()=>{
  it("accepts complete Amazon and exact-variant Collectr evidence",()=>{
    const checked=validatePricingReferenceForm(form({amazon_launch_mxn:"1999",amazon_confidence:"exact",amazon_source_url:"https://www.amazon.com.mx/dp/B0ABC12345",amazon_captured_at:"2026-08-31T17:00:00Z",collectr_usd:"89.99",collectr_source_url:"https://app.getcollectr.com/explore/product/123/example",collectr_captured_at:"2026-08-31T17:05:00Z",usd_mxn_rate:"18.65",reason:"Exact sealed English variant matched by product identity."}),now);
    expect(checked.ok).toBe(true);
  });
  it("fails closed on partial groups, wrong domains, future evidence, and missing rationale",()=>{
    expect(validatePricingReferenceForm(form({amazon_launch_mxn:"1999",reason:"partial"}),now)).toMatchObject({ok:false,error:"amazon_reference_incomplete"});
    expect(validatePricingReferenceForm(form({collectr_usd:"89",collectr_source_url:"https://example.com/item",collectr_captured_at:"2026-08-31T17:00:00Z",usd_mxn_rate:"18",reason:"wrong domain"}),now)).toMatchObject({ok:false,error:"invalid_reference_value"});
    expect(validatePricingReferenceForm(form({collectr_usd:"89",collectr_source_url:"https://getcollectr.com.evil.example/item",collectr_captured_at:"2026-08-31T17:00:00Z",usd_mxn_rate:"18",reason:"suffix attack"}),now)).toMatchObject({ok:false,error:"invalid_reference_value"});
    expect(validatePricingReferenceForm(form({collectr_usd:"89",collectr_source_url:"https://evilcollectr.com/item",collectr_captured_at:"2026-08-31T17:00:00Z",usd_mxn_rate:"18",reason:"lookalike"}),now)).toMatchObject({ok:false,error:"invalid_reference_value"});
    expect(validatePricingReferenceForm(form({amazon_launch_mxn:"1999",amazon_confidence:"exact",amazon_source_url:"https://www.amazon.com.mx/dp/B0ABC12345",amazon_captured_at:"2026-09-01T17:00:00Z",reason:"future"}),now)).toMatchObject({ok:false,error:"invalid_reference_value"});
    expect(validatePricingReferenceForm(form({}),now)).toMatchObject({ok:false,error:"reason_required"});
  });
});
