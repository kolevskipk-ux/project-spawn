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
});
