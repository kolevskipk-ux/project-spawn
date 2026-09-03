import {describe,expect,it} from "vitest";
// @ts-expect-error Vitest runs this regression in Node; Worker production code does not import Node builtins.
import {readFileSync} from "node:fs";

describe("decision schema alignment",()=>{
  it("keeps runtime decision column names aligned with migration 0013",()=>{
    const migration=readFileSync(new URL("../migrations/0013_amazon_verification_bridge.sql",import.meta.url),"utf8");
    const runtime=readFileSync(new URL("../src/verification.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/dashboard.ts",import.meta.url),"utf8");
    for(const column of ["decided_by","resulting_catalog_version"]) { expect(migration).toContain(column); expect(runtime).toContain(column); }
    expect(runtime).not.toMatch(/\bd\.actor\b|SET catalog_version=/);
  });

  it("keeps seed and revalidation runtime tables aligned with migration 0018",()=>{
    const migration=readFileSync(new URL("../migrations/0018_seed_campaigns_and_revalidation.sql",import.meta.url),"utf8");
    const runtime=readFileSync(new URL("../src/seed-intake.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/revalidation.ts",import.meta.url),"utf8");
    for(const table of ["seed_campaigns","seed_batches","seed_candidate_evidence","inventory_revalidation_state","inventory_revalidation_attempts","revalidation_domain_state","inventory_removal_reviews","customer_inventory_events"]){expect(migration).toContain(table);expect(runtime).toContain(table);}
    const production=readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"),development=readFileSync(new URL("../wrangler.dev.jsonc",import.meta.url),"utf8");
    expect(production).toContain('"INVENTORY_REVALIDATION_ENABLED": "false"');
    expect(production).toContain('"SEED_VERIFICATION_ENABLED": "false"');
    expect(development).toContain('"INVENTORY_REVALIDATION_ENABLED": "true"');
    expect(development).toContain('"crons": []');
  });
  it("keeps pricing reference decisions evidence-bound and auditable",()=>{
    const migration=readFileSync(new URL("../migrations/0019_pricing_reference_audit.sql",import.meta.url),"utf8"),runtime=readFileSync(new URL("../src/pricing.ts",import.meta.url),"utf8");
    expect(migration).toContain("pricing_reference_decisions");expect(runtime).toContain("pricing_reference_decisions");expect(runtime).toContain("amazon\\.com\\.mx");expect(runtime).toContain("getcollectr");expect(runtime).toContain("collectr");
  });
  it("keeps every published Amazon canonical identity in the pricing catalog",()=>{
    const published=readFileSync(new URL("../migrations/0012_published_amazon_catalog.sql",import.meta.url),"utf8");
    const originalProducts=readFileSync(new URL("../migrations/0007_product_identity.sql",import.meta.url),"utf8")+readFileSync(new URL("../migrations/0010_mtg_hobbit_pilot.sql",import.meta.url),"utf8");
    const completion=readFileSync(new URL("../migrations/0020_complete_pricing_catalog.sql",import.meta.url),"utf8");
    const ids=[...published.matchAll(/'((?:30-en|delta-reign-en|mtg-hobbit-en)-[a-z0-9-]+)'/g)].map(match=>match[1]);
    expect(new Set(ids).size).toBe(19);
    for(const id of new Set(ids))expect(originalProducts+completion).toContain(`'${id}'`);
  });
  it("keeps the availability/enrichment boundary migration aligned with runtime",()=>{
    const migration=readFileSync(new URL("../migrations/0022_availability_enrichment_boundary.sql",import.meta.url),"utf8");
    const runtime=readFileSync(new URL("../src/catch-inventory.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/board.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/amazon-enrichment.ts",import.meta.url),"utf8");
    for(const token of ["amazon_enrichment_queue","transition_id","price_verification_status","availability_freshness_status"]){expect(migration).toContain(token);expect(runtime).toContain(token);}
  });
  it("keeps cross-border evidence fields aligned across storage and customer presentation",()=>{
    const migration=readFileSync(new URL("../migrations/0023_cross_border_inventory.sql",import.meta.url),"utf8");
    const runtime=readFileSync(new URL("../src/cross-border.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/board.ts",import.meta.url),"utf8")+readFileSync(new URL("../src/revalidation.ts",import.meta.url),"utf8");
    for(const token of ["fulfilment_region_state","retailer_country","ship_from_country","destination_fresh_until","import_cost_status"]){expect(migration).toContain(token);expect(runtime).toContain(token);}
    expect(runtime).toContain("fulfilment_region_state IN ('DOMESTIC','CROSS_BORDER_CONFIRMED')");
  });
});
