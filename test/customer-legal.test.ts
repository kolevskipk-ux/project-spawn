import {it,expect} from 'vitest';
import {customerFetch,type CustomerEnv} from '../src/customer';
import {customerLegal,legalReady,LEGAL_CONTENT,TERMS_VERSION,PRIVACY_VERSION} from '../src/customer-legal';
const configured={CUSTOMER_LEGAL_PUBLISHED:'true',CUSTOMER_OPERATOR_NAME:'Aztlan Engineering',CUSTOMER_OPERATOR_ADDRESS:'Sabadonas 53 PA, La Concordia, Naucalpan, Edo Mex, 53126',CUSTOMER_PRIVACY_EMAIL:'sales@aztlan-eng.com',CUSTOMER_TERMS_VERSION:TERMS_VERSION,CUSTOMER_TERMS_EFFECTIVE_DATE:'2026-09-09'};
it('publishes the approved matching release but rejects disabled or mismatched configuration',()=>{
 expect(legalReady(configured)).toBe(true);
 expect(legalReady({...configured,CUSTOMER_LEGAL_PUBLISHED:'false'})).toBe(false);
 for(const language of ['es','en']){
  const html=customerLegal(configured,false,language);
  expect(html).toContain(TERMS_VERSION);expect(html).not.toContain('{{');
  expect(html).toContain('sales@aztlan-eng.com');
 }
 expect(legalReady({...configured,CUSTOMER_TERMS_VERSION:'unrelated'})).toBe(false);
});
it('has paired Spanish/English content with distinct terms and privacy versions',()=>{
 expect(TERMS_VERSION).not.toBe(PRIVACY_VERSION);
 for(const kind of ['terms','privacy'] as const){
  for(const language of ['es','en'] as const){
   expect(LEGAL_CONTENT[kind][language]).toContain('sales@aztlan-eng.com');
   expect(LEGAL_CONTENT[kind][language]).not.toContain('sales@aztlaneng.com');
   expect(LEGAL_CONTENT[kind][language]).not.toContain('phil.kolevski@gmail.com');
  }
 }
});
it('routes legal language publicly and restricts document language to es/en',async()=>{
 for(const [query,language,heading] of [['en','en','Platform and community terms'],['es','es','Términos de plataforma y comunidad'],['invalid','es','Términos de plataforma y comunidad']]){
  const response=await customerFetch(new Request(`https://customers.example.test/terms?lang=${query}`),configured as CustomerEnv);
  const html=await response.text();expect(response.status).toBe(200);
  expect(html).toContain(`<html lang="${language}">`);expect(html).toContain(heading);
  expect(html).not.toContain('{{EMAIL_PROCESSING_ARRANGEMENT}}');
 }
});
