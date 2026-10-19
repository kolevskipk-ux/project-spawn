import {exact} from './items.js';

// Keep a product's tab identity across same-origin shopping-gate redirects.
// A closed tab is replaced once, within the caller's existing product deadline.
export async function productTab(item){
 if(!exact(item.url,item))throw Error('Invalid configured product URL');
 const tabs=await browser.tabs.query({url:'https://www.amazon.com.mx/*'});
 const {serverProductTabIds={}}=await browser.storage.local.get('serverProductTabIds');
 let tab=tabs.find(t=>exact(t.url,item));
 if(!tab){
  let mapped=tabs.find(t=>t.id===serverProductTabIds[item.asin]);
  if(!mapped&&Number.isInteger(serverProductTabIds[item.asin])){
   try{mapped=await browser.tabs.get(serverProductTabIds[item.asin]);}catch{/* Closed tab. */}
   if(mapped&&new URL(mapped.url).origin!=='https://www.amazon.com.mx')return null;
  }
  // Do not repurpose a tab now displaying another product.
  if(mapped&&!/\/(?:dp|gp\/product)\//i.test(new URL(mapped.url).pathname))tab=mapped;
 }
 if(!tab){
  // An unassigned challenge/sign-in tab cannot safely be attributed to a SKU.
  // Preserve the global challenge stop rather than open around it.
  if(tabs.some(t=>/\/(?:errors\/validateCaptcha|ap\/(?:signin|cvf))(?:\/|$)/i.test(new URL(t.url).pathname)))return null;
  tab=await browser.tabs.create({url:item.url,active:false});
 }
 if(serverProductTabIds[item.asin]!==tab.id){
  await browser.storage.local.set({serverProductTabIds:{...serverProductTabIds,[item.asin]:tab.id}});
 }
 return tab;
}
