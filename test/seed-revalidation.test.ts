import {describe,expect,it} from "vitest";
import {MAX_SEED_ITEMS_PER_BATCH,seedRoutingKey,seedWatchCategory,validateSeedBatch,validateSeedItem} from "../src/seed-intake";
import {assessDirectListing,nextRevalidationTime} from "../src/revalidation";

const now=new Date("2026-08-31T16:00:00.000Z");
const item={source_id:"amazon-b0abc12345",url:"https://www.amazon.com.mx/dp/B0ABC12345?utm_source=test",retailer:"Amazon México",retailer_identifier:"B0ABC12345",product_name:"Pokémon TCG Booster Box",product_family:"Pokémon TCG",print_series:"Example Set",product_type:"booster_box",language:"english",region:"MX",observed_price_mxn:2199,seller:"Amazon México",fulfilled_by:"Amazon México",observed_at:"2026-08-31T15:45:00.000Z",evidence:"Direct Amazon México product page was visible in public search evidence."};

describe("bulk seed intake contract",()=>{
  it("accepts bounded one-off Codex batches and canonical direct ASIN evidence",()=>{
    const batch=validateSeedBatch({schema_version:1,campaign_id:"pokemon-mx-2026-08-31",batch_id:"batch-001",source:"codex_one_off",submitted_at:now.toISOString(),items:[item]});
    expect(batch.ok).toBe(true);
    const checked=validateSeedItem(item,now);
    expect(checked.ok).toBe(true);
    if(checked.ok){expect(checked.value.canonicalUrl).toBe("https://www.amazon.com.mx/dp/B0ABC12345");expect(checked.value.retailerIdentifier).toBe("B0ABC12345");}
  });

  it("maps only recognized high-demand families to their existing verification categories",()=>{
    expect(seedWatchCategory({productFamily:"Pokémon 30th",printSeries:"30th Celebration"})).toBe("30th_celebration");
    expect(seedWatchCategory({productFamily:"Pokémon",printSeries:"Delta Reign"})).toBe("delta_reign");
    expect(seedWatchCategory({productFamily:"Pokémon",printSeries:"Older expansion"})).toBe("pokemon_tcg");
    expect(seedRoutingKey({productFamily:"Pokémon",printSeries:"Older expansion"})).toBe("pokemon-main");
  });

  it("fails closed on guessed/mismatched ASINs, unsafe URLs, stale evidence, and oversized batches",()=>{
    expect(validateSeedItem({...item,retailer_identifier:"B0WRONG123",url:"https://www.amazon.com.mx/dp/B0ABC12345"},now)).toMatchObject({ok:false,reason:"identifier_url_mismatch"});
    expect(validateSeedItem({...item,url:"http://localhost/product"},now)).toMatchObject({ok:false,reason:"unsafe_url"});
    expect(validateSeedItem({...item,observed_at:"2026-01-01T00:00:00Z"},now)).toMatchObject({ok:false,reason:"invalid_observed_at"});
    expect(validateSeedBatch({schema_version:1,campaign_id:"campaign",batch_id:"batch",source:"codex_one_off",submitted_at:now.toISOString(),items:Array(MAX_SEED_ITEMS_PER_BATCH+1).fill(item)})).toMatchObject({ok:false,error:"invalid_item_count"});
    expect(validateSeedBatch({schema_version:1,campaign_id:"campaign",batch_id:"batch",source:"codex_one_off",submitted_at:now.toISOString(),items:[item,{...item}]})).toMatchObject({ok:false,error:"duplicate_source_id_in_batch"});
  });
});

describe("bounded direct-listing revalidation",()=>{
  it("classifies trustworthy buyable and sold-out evidence conservatively",()=>{
    expect(assessDirectListing(200,"<title>Pokémon TCG Booster Box</title><button>Agregar al carrito</button><span>MX$ 2,199.00</span>")).toMatchObject({outcome:"AVAILABLE",priceMxn:2199});
    expect(assessDirectListing(200,"Pokémon TCG Elite Trainer Box — Agotado")).toMatchObject({outcome:"SOLD_OUT"});
    expect(assessDirectListing(200,"Pokémon TCG — Agotado — Agregar al carrito")).toMatchObject({outcome:"UNKNOWN"});
  });

  it("never turns blocks, transport-like HTTP failures, or missing identity into sold out",()=>{
    expect(assessDirectListing(429,"Pokemon TCG").outcome).toBe("BLOCKED");
    expect(assessDirectListing(503,"Pokemon TCG").outcome).toBe("ERROR");
    expect(assessDirectListing(200,"Agotado").outcome).toBe("UNKNOWN");
  });

  it("uses a 24-hour trustworthy objective and bounded exponential retry",()=>{
    expect(nextRevalidationTime("AVAILABLE",now,0)).toBe("2026-09-01T16:00:00.000Z");
    expect(nextRevalidationTime("BLOCKED",now,0)).toBe("2026-08-31T18:00:00.000Z");
    expect(nextRevalidationTime("ERROR",now,9)).toBe("2026-09-01T08:00:00.000Z");
  });
});
