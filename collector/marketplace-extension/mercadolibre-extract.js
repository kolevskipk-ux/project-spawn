// Serialized into the isolated page world. The argument contains public policy only.
export function readMercadoLibreOffer(target){
 const u=new URL(location.href),visible=el=>!!el&&el.getClientRects().length>0;
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const blank={itemId:target.itemId,url:target.url,title:'',state:'unknown',priceMxn:null,seller:null,sellerId:null,postcode:null,purchaseEnabled:false,visibleItemId:null,reason:'UNCONFIRMED'};
 if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.mercadolibre.com.mx','articulo.mercadolibre.com.mx'].includes(u.hostname))return {...blank,reason:'WRONG_HOST'};
 const body=document.body?.innerText||'';
 if(/account-verification|\/login|\/challenge/.test(u.pathname)||/verifica (?:que eres humano|tu identidad)|confirma que no eres un robot|para continuar, ingresa a/i.test(body))return {...blank,state:'blocked',reason:'ACCOUNT_VERIFICATION'};
 const pathId=u.pathname.match(/^\/MLM-(\d{8,14})(?:-|$)/i)?.[1];
 const catalogMatch=u.hostname==='www.mercadolibre.com.mx'&&!!target.catalogId&&u.pathname.match(/\/p\/(MLM\d+)\/?$/)?.[1]===target.catalogId;
 if((!pathId||'MLM'+pathId!==target.itemId)&&!catalogMatch)return {...blank,reason:'ITEM_REDIRECTED_OR_CHANGED'};
 const title=clean(document.querySelector('h1.ui-pdp-title')?.textContent).slice(0,400);
 blank.title=title;
 if(!/pok[eé]mon/i.test(title)||!/30th|30\s*(?:aniversario|anniversary|a[nñ]os)|celebration|celebraci[oó]n/i.test(title)||!target.titleTerms.every(pattern=>new RegExp(pattern,'i').test(title)))return {...blank,reason:'TITLE_UNCONFIRMED'};
 const excluded=el=>!!el.closest('.ui-pdp-recommendations,.ui-recommendations,.ui-pdp-ads,[data-testid="recommendations"]');
 // Sold-out catalog pages may omit the entire offer. Retain this as page-level
 // evidence only: it cannot verify the original listing or replace its last good state.
 let pageSoldOut=false,scope=document.querySelector('h1.ui-pdp-title')?.parentElement;
 for(let depth=0;scope&&scope!==document.body&&depth<4;depth++,scope=scope.parentElement){
  if(clean(scope.innerText).length>4000)break;
  const nodes=[...scope.querySelectorAll('*')].filter(el=>visible(el)&&!excluded(el));
  const soldOut=nodes.some(el=>/^producto agotado[.!]?$/i.test(clean(el.innerText)));
  const buy=nodes.some(el=>el.matches('button,input[type="submit"],a[role="button"]')&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&/^(comprar ahora|agregar al carrito)$/i.test(clean(el.innerText||el.value)));
  if(soldOut&&!buy){pageSoldOut=true;break;}
 }
 const unavailable=reason=>({...blank,reason:pageSoldOut?'PAGE_SOLD_OUT_SELLER_UNCONFIRMED':reason,...(pageSoldOut?{pageAvailability:'sold_out'}:{})});
 const root=[...document.querySelectorAll('.ui-pdp-buybox,.ui-pdp-container__col--right')].find(visible);
 if(!root)return unavailable('PRIMARY_OFFER_MISSING');
 const ids=[...root.querySelectorAll('input[name="item_id"],input[name="itemId"],[data-item-id]')].filter(el=>!excluded(el)).map(el=>clean(el.value||el.getAttribute('data-item-id')).replace(/^MLM-?/i,'MLM'));
 const distinct=[...new Set(ids.filter(Boolean))];
 if(distinct.length!==1||distinct[0]!==target.itemId)return unavailable('OFFER_ID_UNCONFIRMED');
 blank.visibleItemId=distinct[0];
 const sellers=[...root.querySelectorAll('input[name="seller_id"],[data-seller-id]')].filter(el=>!excluded(el)).map(el=>clean(el.value||el.getAttribute('data-seller-id'))).filter(v=>/^\d{1,20}$/.test(v));
 const sellerIds=[...new Set(sellers)];
 const sellerId=sellerIds.length===1?sellerIds[0]:null;
 const sellerElement=root.querySelector('.ui-pdp-seller__link-trigger,.ui-pdp-seller__header__title,.ui-pdp-seller__name');
 const seller=visible(sellerElement)?clean(sellerElement.textContent).slice(0,160):null;
 const priceRoot=root.querySelector('.ui-pdp-price__second-line');
 const fraction=priceRoot?.querySelector('.andes-money-amount__fraction'),cents=priceRoot?.querySelector('.andes-money-amount__cents');
 const symbol=clean(priceRoot?.querySelector('.andes-money-amount__currency-symbol')?.textContent);
 const priceMxn=visible(fraction)&&['$','MX$','MXN'].includes(symbol)?Number(clean(fraction.textContent).replace(/,/g,''))+(cents?Number(clean(cents.textContent))/100:0):null;
 const purchaseEnabled=[...root.querySelectorAll('.ui-pdp-actions button,.ui-pdp-actions input[type="submit"]')].some(el=>visible(el)&&!excluded(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&/^(comprar ahora|agregar al carrito)$/i.test(clean(el.innerText||el.value||el.getAttribute('aria-label'))));
 const text=clean([...root.querySelectorAll('.ui-pdp-stock-information,.ui-pdp-buybox__quantity,.ui-pdp-message,.ui-pdp-shipping,.ui-pdp-delivery')].filter(el=>visible(el)&&!excluded(el)).map(el=>el.innerText).join(' '));
 const postalText=text+' '+[...document.querySelectorAll('.nav-menu-cp,.ui-pdp-shipping')].filter(visible).map(el=>el.innerText).join(' ');
 const postcode=/\b53100\b/.test(postalText)?'53100':null;
 const soldOut=/sin stock|agotad[oa]|publicaci[oó]n (?:pausada|finalizada)/i.test(text);
 const deliveryUnavailable=/no (?:hacemos |hay )?env[ií]os|no (?:se puede|podemos) enviar|no disponible (?:para|en) (?:tu|esta)/i.test(text);
 const result={...blank,priceMxn:Number.isFinite(priceMxn)&&priceMxn>0?priceMxn:null,seller,sellerId,postcode,purchaseEnabled};
 if(!target.expectedSellerId||sellerId!==target.expectedSellerId)return {...result,reason:target.expectedSellerId?'SELLER_MISMATCH':'SELLER_REVIEW_REQUIRED'};
 if(!seller||!postcode)return {...result,reason:!seller?'SELLER_UNCONFIRMED':'DELIVERY_LOCATION_UNCONFIRMED'};
 if(soldOut&&purchaseEnabled)return {...result,reason:'CONTRADICTORY_OFFER'};
 if(soldOut)return {...result,state:'sold_out',reason:'EXPLICIT_SOLD_OUT'};
 if(deliveryUnavailable)return {...result,reason:'DELIVERY_UNAVAILABLE'};
 if(purchaseEnabled&&result.priceMxn)return {...result,state:'available',reason:'VERIFIED_PURCHASE_CONTROL'};
 return {...result,reason:'PURCHASE_UNCONFIRMED'};
}
