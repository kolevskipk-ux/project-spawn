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
});
