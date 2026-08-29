import {describe,expect,it} from "vitest";
import {renderDashboard} from "../src/dashboard";

describe("listing review controls",()=>{
  it("renders independent explicit publish and reject forms",()=>{
    const html=renderDashboard({verification_queue:[],listing_queue:[{candidate_id:"a".repeat(64),product_name:"Test listing",vendor:"Test vendor",product_family:"Delta Reign",language:"english",availability_state:"available",observed_price_mxn:1000,discovered_at:"2026-08-29T00:00:00Z",source_url:"https://example.test/item"}],catalog_version:{value:"3"},publication_version:{value:"1"},spawn:{},catch_em_all:null,vendors:[],discovery_ingestion:[],weekly_feedback:[],generated_at:"now"} as never,"token",{error:"invalid_review"});
    expect(html.match(/<form /g)).toHaveLength(2);
    expect(html).toContain('name="action" value="publish"');
    expect(html).toContain('name="action" value="reject"');
    expect(html).toContain("Action failed:");
    expect(html).toContain("Required: why this listing is approved");
  });
});
