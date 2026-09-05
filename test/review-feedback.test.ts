import {describe,expect,it} from 'vitest';
import {runInNewContext} from 'node:vm';
import {validateFulfilmentReview} from '../src/cross-border';
import {renderApprovals} from '../src/dashboard';
import {reviewErrorMessage} from '../src/review-feedback';

const data={verification_queue:[],listing_queue:[{candidate_id:'a'.repeat(64),product_name:'Sample',source_url:'https://example.test'}],spawn:{}};
describe('approval feedback',()=>{
  it('requires international fields only when international delivery is selected',()=>{
    const html=renderApprovals(data as never,'');
    const inputs=Array.from({length:4},()=>({required:false,disabled:false}));
    const select={value:'CROSS_BORDER_UNVERIFIED',addEventListener:(_event:string,fn:()=>void)=>{change=fn;}};
    const retailer={value:'MX'},ship={value:'MX'},approve={disabled:false},note={hidden:false};
    let change=()=>{};
    const card={querySelector:(selector:string)=>({'[data-fulfilment-select]':select,'[data-approve]':approve,'[data-blocking-note]':note,'[name=retailer_country]':retailer,'[name=ship_from_country]':ship}[selector]),querySelectorAll:(selector:string)=>selector==='[data-international-required]'?inputs:[]};
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1],{document:{querySelectorAll:()=>[card]}});
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
