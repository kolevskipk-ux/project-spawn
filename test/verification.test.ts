import {describe,expect,it} from "vitest";
import {assessAmazonVerification, deliverApprovalRequest, deliverDiscoveryApprovalRequest, eligibleForOperatorReview, retryDiscoveryApprovalRequests, type VerificationCandidate} from "../src/verification";

const candidate=(overrides:Partial<VerificationCandidate>={}):VerificationCandidate=>({
  asin:"B0HG3MQDWP",product_name:"Delta Reign Elite Trainer Box",product_url:"https://www.amazon.com.mx/dp/B0HG3MQDWP",
  watch_category:"delta_reign",language:"english",evidence:"discovered",lifecycle_status:"DISCOVERED",...overrides
});

describe("discovery approval notification",()=>{
  it("keeps bulk Codex seeds in the dashboard queue without per-item Discord retries",async()=>{
    let selection="";
    const env={SPAWN_DB:{prepare:(sql:string)=>{selection=sql;return{bind:()=>({all:async()=>({results:[]})})};}}} as never;
    await retryDiscoveryApprovalRequests(env);
    expect(selection).toContain("c.source!='codex_seed'");
  });

  it("delivers a backlog review request only to the operations route",async()=>{
    const updates:string[]=[],calls:string[]=[];
    const env={OPS_DISCORD_WEBHOOK_URL:"https://discord.test/ops",PUBLIC_BASE_URL:"https://spawn.test",SPAWN_DB:{prepare:(sql:string)=>({bind:(...args:unknown[])=>({
      first:async()=>sql.includes("discovery_approval_notifications")?{candidate_id:"a".repeat(64),product_name:"Delta Reign ETB",vendor:"Example",product_family:"Delta Reign",language:"english",observed_price_mxn:1499,availability_state:"available",source_url:"https://example.test/item"}:null,
      run:async()=>{updates.push(`${sql}:${JSON.stringify(args)}`);return {};}
    })})}} as never;
    const result=await deliverDiscoveryApprovalRequest(env,"a".repeat(64),async(url,init)=>{calls.push(String(url));expect(String(init?.body)).toContain("NEW LISTING APPROVAL REQUESTED");return new Response(null,{status:204});});
    expect(result.status).toBe("delivered");expect(calls).toEqual(["https://discord.test/ops"]);expect(updates.join()).toContain("DELIVERED");
  });
});

describe("operator approval notification",()=>{
  const env=(webhook?:string)=>{
    const updates:string[]=[];
    return {updates,env:{OPS_DISCORD_WEBHOOK_URL:webhook,APPROVAL_DISCORD_ROLE_ID:"123456789012345678",PUBLIC_BASE_URL:"https://spawn.test",SPAWN_DB:{prepare:(sql:string)=>({bind:(...args:unknown[])=>({
      first:async()=>sql.includes("FROM approval_notifications")?{evidence_revision:"rev",asin:"B0HG3MQDWP",verification_attempt_id:1,product_name:"Delta Reign ETB",product_url:"https://www.amazon.com.mx/dp/B0HG3MQDWP",confidence:"HIGH",unresolved_questions:null}:null,
      run:async()=>{updates.push(`${sql}:${JSON.stringify(args)}`);return {}}
    })})}} as never};
  };
  it("fails closed and preserves a pending request when the operator route is absent",async()=>{
    const fixture=env(); expect((await deliverApprovalRequest(fixture.env,"rev")).status).toBe("pending-missing-route"); expect(fixture.updates.join()).toContain("PENDING_MISSING_ROUTE");
  });
  it("pings only the configured admin role and records delivery",async()=>{
    const fixture=env("https://discord.test/ops"), bodies:unknown[]=[];
    const result=await deliverApprovalRequest(fixture.env,"rev",async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(null,{status:204});});
    expect(result.status).toBe("delivered"); expect(JSON.stringify(bodies)).toContain("123456789012345678"); expect(fixture.updates.join()).toContain("DELIVERED");
  });
});

describe("independent Amazon verification gates",()=>{
  it("records a qualifying page as VERIFIED without claiming availability",()=>{
    const result=assessAmazonVerification(candidate(),{status:200,url:"https://www.amazon.com.mx/dp/B0HG3MQDWP",html:"<title>Amazon Delta Reign</title> B0HG3MQDWP"});
    expect(result.outcome).toBe("VERIFIED"); expect(result.canonicalProductId).toBe("delta-reign-en-etb"); expect(result.observedAvailability).toBe("unknown");
  });
  it("keeps robot blocks and unknown identity out of VERIFIED",()=>{
    expect(assessAmazonVerification(candidate(),{status:503,url:candidate().product_url,html:"Amazon Robot Check B0HG3MQDWP"}).outcome).toBe("REVIEW_REQUIRED");
    expect(assessAmazonVerification(candidate({product_name:"Delta Reign mystery item"}),{status:200,url:candidate().product_url,html:"Amazon B0HG3MQDWP"}).outcome).toBe("REVIEW_REQUIRED");
  });
  it("rejects a redirected non-direct identity",()=>{
    expect(assessAmazonVerification(candidate(),{status:200,url:"https://www.amazon.com.mx/s?k=delta",html:"Amazon B0HG3MQDWP"}).outcome).toBe("REJECTED");
  });

  it("queues valid unresolved identities for operator review but fails closed on blocks and redirects",()=>{
    const unresolved=assessAmazonVerification(candidate({product_name:"Pokémon TCG unknown sealed product",language:"unknown"}),{status:200,url:candidate().product_url,html:"<title>Amazon Pokémon TCG</title> B0HG3MQDWP Agregar al carrito"});
    const blocked=assessAmazonVerification(candidate(),{status:503,url:candidate().product_url,html:"Amazon Robot Check B0HG3MQDWP"});
    const redirected=assessAmazonVerification(candidate(),{status:200,url:"https://www.amazon.com.mx/s?k=delta",html:"Amazon B0HG3MQDWP"});
    expect(unresolved.outcome).toBe("REVIEW_REQUIRED");
    expect(eligibleForOperatorReview(unresolved)).toBe(true);
    expect(eligibleForOperatorReview(blocked)).toBe(false);
    expect(eligibleForOperatorReview(redirected)).toBe(false);
  });
});
