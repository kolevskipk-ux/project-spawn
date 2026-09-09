import {describe,it,expect} from 'vitest';
import {assessProductEvidence} from '../src/product-page-evidence';
const url='https://store.test/products/etb',title='Pokemon Delta Reign Elite Trainer Box';
const product=(offers:unknown,extra={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',url,name:title,offers,...extra})}</script>`;
const offer={ '@type':'Offer',url,availability:'https://schema.org/InStock',priceCurrency:'MXN',price:'1299.00'};
const check=(html:string,status=200)=>assessProductEvidence(status,html,url,title);
describe('attributable product-page evidence',()=>{
 it('accepts exact product offers and distinguishes sold out',()=>{
  expect(check(product(offer))).toMatchObject({outcome:'AVAILABLE',priceMxn:1299});
  expect(check(product({...offer,availability:'https://schema.org/OutOfStock'}))).toMatchObject({outcome:'SOLD_OUT',priceMxn:1299});
 });
 it('does not infer stock or price from cart controls and unrelated amounts',()=>{
  expect(check('<h1>Pokemon</h1><p>Free shipping over $500</p><button>Add to cart</button>').outcome).toBe('UNKNOWN');
  expect(check(product(offer,{url:'https://store.test/products/other'})).outcome).toBe('UNKNOWN');
  expect(check(product(offer,{name:'Magic Hobbit Collector Box'})).outcome).toBe('UNKNOWN');
 });
 it('refuses ambiguous variants, preorder and non-MXN prices',()=>{
  expect(check(product([offer,{...offer,price:'1399.00'}])).outcome).toBe('UNKNOWN');
  expect(check(product({...offer,availability:'https://schema.org/PreOrder'})).outcome).toBe('UNKNOWN');
  expect(check(product({...offer,priceCurrency:'USD'})).priceMxn).toBeNull();
  expect(check(product([{...offer,url:url+'?variant=2'},{...offer,url:url+'?variant=3'}])).outcome).toBe('UNKNOWN');
 });
 it('attributes a sole variant offer on the exact base page but rejects other destinations and queries',()=>{
  expect(check(product({...offer,url:url+'?variant=2'}))).toMatchObject({outcome:'AVAILABLE',priceMxn:1299});
  for(const target of [url+'?variant=2&other=1',url+'?variant=bad','https://elsewhere.test/products/etb?variant=2','https://store.test/products/other?variant=2'])expect(check(product({...offer,url:target})).outcome).toBe('UNKNOWN');
 });
 it('records blocks and HTTP failures without parsing offers',()=>{
  expect(check(product(offer),403).outcome).toBe('BLOCKED');
  expect(check(product(offer),429).outcome).toBe('BLOCKED');
  expect(check(product(offer),500).outcome).toBe('ERROR');
  expect(check(product(offer)+'<title>Robot Check</title>').outcome).toBe('BLOCKED');
 });
});
