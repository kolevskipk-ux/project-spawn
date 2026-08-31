import {describe,expect,it} from "vitest";
import {boardHeaders} from "../src/board";
import {renderDashboard} from "../src/dashboard";

describe("listing review controls",()=>{
  it("renders independent explicit publish and reject forms",()=>{
    const html=renderDashboard({verification_queue:[],listing_queue:[{candidate_id:"a".repeat(64),product_name:"Test listing",vendor:"Test vendor",product_family:"Delta Reign",language:"english",availability_state:"available",observed_price_mxn:1000,discovered_at:"2026-08-29T00:00:00Z",source_url:"https://example.test/item"}],catalog_version:{value:"3"},publication_version:{value:"1"},spawn:{},catch_em_all:null,vendors:[],discovery_ingestion:[],weekly_feedback:[],generated_at:"now"} as never,"token",{error:"invalid_review"});
    expect(html.match(/<form /g)).toHaveLength(2);
    expect(html).toContain('name="action" value="publish"');
    expect(html).toContain('name="action" value="reject"');
    expect(html).toContain("Action failed:");
    expect(html).toContain("Required: why this listing is approved");
    expect(html).toContain("Not tracked — awaiting approval");
    expect(html).toContain("Customer visibility only (no Catch monitoring)");
    expect(new Headers(boardHeaders()).get("content-security-policy")).toContain("form-action 'self'");
  });

  it("shows published catalog coverage reported by Catch",()=>{
    const html=renderDashboard({verification_queue:[],listing_queue:[],published_catalog:[{asin:"B0H78BB9TY",product_name:"30th ETB",lane:"normal",poll_interval_minutes:5}],pricing_catalog:[{id:"30-en-etb",canonical_name:"30th ETB",amazon_launch_mxn:1999,amazon_confidence:"exact",amazon_source_url:"https://amazon.test",amazon_captured_at:"2026-08-30",collectr_usd:null,collectr_source_url:null,collectr_captured_at:null,usd_mxn_rate:null,mapped_offers:2}],catalog_version:{value:"3"},publication_version:{value:"1"},spawn:{},catch_em_all:{rows:[{asin:"B0H78BB9TY",cadenceClass:"hot",cadenceMinutes:5,lastAttemptAt:"2026-08-30T13:00:00Z"}]},vendors:[],discovery_ingestion:[],weekly_feedback:[],generated_at:"now"} as never,"token");
    expect(html).toContain("1/1");
    expect(html).toContain("✅ Tracked");
    expect(html).toContain("hot");
    expect(html).toContain("Amazon launch: <b>1/1</b>");
    expect(html).toContain("Collectr exact variant: <b>0/1</b>");
    expect(html).toContain("Save pricing evidence");
  });
});
