import {describe,expect,it,vi} from 'vitest';
import {runInNewContext} from 'node:vm';
import {validateFulfilmentReview} from '../src/cross-border';
import {renderApprovals} from '../src/dashboard';
import {reviewErrorMessage} from '../src/review-feedback';
import {productApprovalScript} from '../src/product-approval-card';

const data={verification_queue:[],listing_queue:[{candidate_id:'a'.repeat(64),product_name:'Sample',source_url:'https://example.test'}],spawn:{}};
describe('approval feedback',()=>{
  it('uses the action attribute despite a named action control, retains entries and permits retry',async()=>{
    const feedback={textContent:''},button={disabled:false,textContent:'Approve product'},error={textContent:''};
    let submit=async(_event:unknown)=>{};
    const form={action:{value:'approve_product',toString:()=> '[object HTMLInputElement]'},getAttribute:(name:string)=>name==='action'?'/dashboard/verification/B0H27L3TKW':null,dataset:{} as Record<string,string>,elements:{evidence_revision:{value:'old'},product_name:{value:'My corrected product'}},
      addEventListener:(_event:string,handler:typeof submit)=>{submit=handler;},querySelectorAll:()=>[error],
      querySelector:(selector:string)=>({'button[type=submit]':button,'[data-product-feedback]':feedback,'[data-error-for="set_name"]':error}[selector]??null)};
    let result:Record<string,unknown>={ok:false,error:'Confirm the set.',fields:{set_name:'Set is required'},evidenceRevision:'new'};
    const fetch=vi.fn(async()=>({json:async()=>result}));
    runInNewContext(productApprovalScript,{document:{querySelectorAll:()=>[form]},FormData:class {},fetch});
    await submit({preventDefault(){}});
    expect(fetch).toHaveBeenCalledWith('/dashboard/verification/B0H27L3TKW',expect.objectContaining({method:'POST'}));
    expect(form.elements.product_name.value).toBe('My corrected product');expect(form.elements.evidence_revision.value).toBe('new');
    expect(error.textContent).toBe('Set is required');expect(button.disabled).toBe(false);
    result={ok:true,message:'Published to inventory · Catch acknowledgement pending.'};await submit({preventDefault(){}});
    expect(button.disabled).toBe(true);expect(feedback.textContent).toContain('acknowledgement pending');
  });
  it.each([
    ['DISCOVERED','REVIEW_REQUIRED',1,false,false],
    ['DISCOVERED',null,null,false,false],
    ['VERIFIED','REVIEW_REQUIRED',1,false,false],
    ['VERIFIED','VERIFIED',1,true,false],
    ['APPROVED','VERIFIED',1,false,true],
  ])('offers valid Amazon actions for %s / %s', (state,outcome,attempt,approve,publish)=>{
    const html=renderApprovals({...data,listing_queue:[],verification_queue:[{asin:'B0H27L3TKW',product_name:'Pokemon TCG',lifecycle_status:state,verification_outcome:outcome,verification_attempt_id:attempt,unresolved_questions:'language evidence missing'}]} as never,'');
    expect(html).toContain('name="action" value="approve_product"');
    expect(html).toContain('Approve product');
    expect(html).not.toContain('Save identity review');
    expect(html).not.toContain('Publish to Catch');
    expect(html).toContain('name="destination"');
  });
  it('requires international fields only when international delivery is selected',()=>{
    const html=renderApprovals(data as never,'');
    const inputs=Array.from({length:4},()=>({required:false,disabled:false}));
    const select={value:'CROSS_BORDER_UNVERIFIED',addEventListener:(_event:string,fn:()=>void)=>{change=fn;}};
    const retailer={value:'MX'},ship={value:'MX'},approve={disabled:false},note={hidden:false};
    let change=()=>{};
    const card={querySelector:(selector:string)=>({'[data-fulfilment-select]':select,'[data-approve]':approve,'[data-blocking-note]':note,'[name=retailer_country]':retailer,'[name=ship_from_country]':ship}[selector]),querySelectorAll:(selector:string)=>selector==='[data-international-required]'?inputs:[]};
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1],{document:{querySelectorAll:(selector:string)=>selector==='[data-approval-card]'?[card]:[]}});
    expect(approve.disabled).toBe(true);
    select.value='CROSS_BORDER_CONFIRMED';change();
    expect(inputs.every(input=>input.required&&!input.disabled)).toBe(true);
    select.value='DOMESTIC';change();
    expect(inputs.every(input=>!input.required&&input.disabled)).toBe(true);
    expect(approve.disabled).toBe(false);
  });
  it('distinguishes missing evidence from expired evidence',()=>{
    const valid={fulfilment_region_state:'CROSS_BORDER_CONFIRMED',retailer_country:'US',ship_from_country:'US',original_price:'100',original_currency:'USD',destination_checked_at:'2026-09-05T12:00:00Z',destination_fresh_until:'2026-09-06T12:00:00Z'};
    for(const [field,code] of [['original_price','cross_border_requires_price'],['original_currency','cross_border_requires_currency'],['ship_from_country','cross_border_requires_country'],['destination_checked_at','cross_border_requires_dates']]){
      const form=new FormData();for(const [key,value] of Object.entries({...valid,[field]:''}))form.set(key,value);
      const result=validateFulfilmentReview(form,Date.parse('2026-09-05T13:00:00Z'));
      expect(result).toMatchObject({ok:false,error:code});expect(reviewErrorMessage(code)).not.toContain('_');
    }
  });
  it('shows a readable publication confirmation without the internal record ID',()=>{
    const html=renderApprovals({...data,listing_queue:[]} as never,'',{notice:'publish:'+ 'a'.repeat(64)});
    expect(html).toContain('Listing published to inventory.');expect(html).not.toContain('publish:'+ 'a'.repeat(64));expect(html).toContain('role="status"');
  });
});
