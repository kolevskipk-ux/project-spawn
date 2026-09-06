import {describe,it,expect} from 'vitest';
import {compareReferences,type ComparisonOffer,type ReferenceProduct} from '../src/reference-comparison';
import {customerReferences} from '../src/customer';
const now=new Date('2026-09-06T12:00:00Z');
const product:ReferenceProduct={id:'30-en-booster-bundle',canonical_name:'30th Celebration Booster Bundle',watch_category:'30th_celebration',language:'english',amazon_launch_mxn:1000,amazon_source_url:'https://www.amazon.com.mx/dp/B012345678',amazon_captured_at:'2026-08-01T12:00:00Z',amazon_confidence:'exact',collectr_usd:100,collectr_source_url:'https://app.getcollectr.com/explore/product/bundle',collectr_captured_at:'2026-08-02T12:00:00Z',usd_mxn_rate:17};
const offer:ComparisonOffer={title:product.canonical_name,watch_category:product.watch_category,language:'english',product_id:product.id,price_mxn:1200,price_verification_status:'VERIFIED',pricing_observed_at:'2026-09-06T11:00:00Z'};
describe('Historical reference comparisons',()=>{
 it('compares both sources independently and discloses historical evidence and undated FX',()=>{
  const result=compareReferences(offer,product,now);
  expect(result.references.map(r=>r.deltaPercent)).toEqual([20,-29.4]);
  expect(result.references[0].note).toContain('not verified MSRP');
  expect(result.references[1]).toMatchObject({referenceMxn:1700,capturedAt:'2026-08-02T12:00:00Z'});
  expect(result.references[1].note).toContain('exchange-rate date not recorded');
 });
 it.each([
  [{product_id:null},'Product mapping missing'],
  [{language:'japanese'},'Product identity mismatch'],
  [{watch_category:'ascended_heroes'},'Product identity mismatch'],
  [{title:'30th Celebration Pokémon Center Booster Bundle'},'Variant match needs review'],
  [{title:'Case of 30th Celebration Booster Bundles'},'Variant match needs review'],
  [{title:'2× 30th Celebration Booster Bundle'},'Variant match needs review'],
  [{title:'30th Celebration Elite Trainer Box'},'Variant match needs review'],
  [{price_mxn:0},'Offer price missing'],
  [{price_mxn:null},'Offer price missing'],
  [{price_verification_status:'PENDING'},'Offer price unverified'],
  [{availability_state:'preorder_placeholder'},'Placeholder price'],
  [{pricing_observed_at:'2026-09-01T12:00:00Z'},'Offer price stale or undated'],
  [{pricing_observed_at:'2026-09-07T12:00:00Z'},'Offer price stale or undated'],
  [{pricing_observed_at:null},'Offer price stale or undated'],
 ] as [Partial<ComparisonOffer>,string][])('blocks unsafe offer comparison %j',(patch,status)=>{
  const result=compareReferences({...offer,...patch},product,now);
  expect(result.offerStatus).toBe(status);
  expect(result.references.every(r=>r.deltaPercent===null)).toBe(true);
 });
 it.each([
  {amazon_source_url:'https://amazon.com.mx.attacker.test/dp/B012345678'},
  {amazon_source_url:'javascript:alert(1)'},
  {amazon_captured_at:null},
  {amazon_captured_at:'2027-01-01'},
  {amazon_launch_mxn:-1},
  {amazon_launch_mxn:0.001},
  {amazon_confidence:'strong_proxy'},
 ])('withholds Amazon differences without complete exact evidence %j',patch=>{
  expect(compareReferences(offer,{...product,...patch},now).references[0].deltaPercent).toBeNull();
 });
 it.each([null,0,Infinity,101])('requires a usable Collectr conversion rate %s',usd_mxn_rate=>{
  expect(compareReferences(offer,{...product,usd_mxn_rate},now).references[1].referenceMxn).toBeNull();
 });
 it('renders customer evidence and item-only caveats without recommendation labels',()=>{
  const references=compareReferences({...offer,fulfilment_region_state:'CROSS_BORDER_CONFIRMED'},product,now).references;
  const html=customerReferences({id:'public',title:offer.title,set_name:'30th',retailer:'Demo',language:'english',price_mxn:1200,availability:'available',observed_at:offer.pricing_observed_at!,references});
  expect(html).toContain('+20%');expect(html).toContain('-29.4%');
  expect(html).toContain('delivery/import costs excluded');
  expect(html).not.toContain('Strong Value');expect(html).not.toContain('Above Market');
 });
});
