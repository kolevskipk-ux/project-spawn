import {describe,expect,it} from "vitest";
import {validateCampaignPublicationForm} from "../src/seed-campaign-review";

describe("aggregate seed campaign review",()=>{
  it("accepts only an explicit bounded visibility publication",()=>{
    const form=new FormData();form.set("action","publish_visibility");form.set("expected_count","61");form.set("reason","Browser-verified direct Amazon identities");
    expect(validateCampaignPublicationForm(form)).toEqual({ok:true,value:{expectedCount:61,reason:"Browser-verified direct Amazon identities"}});
  });
  it("fails closed on missing rationale, stale counts, and monitoring actions",()=>{
    for(const values of [{action:"publish_visibility",expected_count:"0",reason:"x"},{action:"publish_visibility",expected_count:"61",reason:""},{action:"publish_to_catch",expected_count:"61",reason:"x"}]){const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,value);expect(validateCampaignPublicationForm(form)).toMatchObject({ok:false});}
  });
});
