import {describe,expect,it} from "vitest";
import {assessAmazonVerification, type VerificationCandidate} from "../src/verification";

const candidate=(overrides:Partial<VerificationCandidate>={}):VerificationCandidate=>({
  asin:"B0HG3MQDWP",product_name:"Delta Reign Elite Trainer Box",product_url:"https://www.amazon.com.mx/dp/B0HG3MQDWP",
  watch_category:"delta_reign",language:"english",evidence:"discovered",lifecycle_status:"DISCOVERED",...overrides
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
});
