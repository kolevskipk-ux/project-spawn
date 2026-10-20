// Serialized into the tab's isolated world. Collect offer facts, never page HTML or account data.
export function readAmazon(item,traceId=null,deadlineAt=Date.now()+15000,step='main'){
  const trace=stage=>{if(!traceId)return;try{globalThis.browser?.runtime?.sendMessage({action:'page-trace',traceId,stage,readyState:document.readyState,visibility:document.visibilityState})?.catch(()=>{});}catch{}};
  trace('entered');
  if(Date.now()>=deadlineAt)return {asin:item.asin,url:item.url,state:'error',reason:'EXTRACTION_EXPIRED'};
  try{
  const blank={asin:item.asin,url:item.url,title:'',state:'unknown',reason:'OFFER_UNCONFIRMED',priceMxn:null,seller:null,fulfilledBy:null,purchaseEnabled:false,buyingOptionsShown:null};
  const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const text=el=>visible(el)?(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim():'';
  trace('identity');
  const u=new URL(location.href);
  if(u.hostname!=='www.amazon.com.mx'||u.protocol!=='https:')return {...blank,reason:'WRONG_SITE'};
  if(document.querySelector('#captchacharacters')||/\/ap\/(signin|cvf)/.test(u.pathname))return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN'};
  // Amazon's continue-shopping interstitial can omit all CAPTCHA wording.
  const pageText=text(document.body);
  if(/robot check|not a robot|automated access|verify (?:that )?you are human|verifica (?:que eres humano|tu identidad)|enter the characters|introduce los caracteres|escribe los caracteres|no eres un robot/i.test(pageText))return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN',gateType:'captcha'};
  const continueControl=[...document.querySelectorAll('button,input[type="submit"]')].find(el=>{
    if(!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true'||! /^(?:continuar a compras|continuar comprando|continue shopping)$/i.test((text(el)||el.value||'').trim()))return false;
    const form=el.form;if(!form||(form.method||'get').toLowerCase()!=='get')return false;
    try{const action=new URL(el.hasAttribute('formaction')?el.formAction:form.action,location.href);return action.origin===u.origin&&/^\/errors(?:_page)?\/validateCaptcha$/i.test(action.pathname)&&(!el.hasAttribute('formmethod')||el.formMethod.toLowerCase()==='get');}catch{return false;}
  });
  const shoppingGate=!document.querySelector('#productTitle')&&continueControl&&/haz clic en el bot[oó]n de abajo para continuar comprando|click the button below to continue shopping/i.test(pageText);
  if(shoppingGate){
    if(step==='continue'&&Date.now()<deadlineAt){continueControl.click();return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN',gateType:'continue_shopping',continuationAttempted:true};}
    return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN',gateType:'continue_shopping'};
  }
  if(document.querySelector('form[action*="validateCaptcha"]')||/\/errors\/validateCaptcha/.test(u.pathname))return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN'};
  trace('title');
  const title=step==='panel'?(document.querySelector('#productTitle')?.textContent||'').replace(/\s+/g,' ').trim():text(document.querySelector('#productTitle'));
  blank.title=title.slice(0,300);
  // Only a recognizable Amazon homepage can request bounded URL recovery.
  // Challenge and ordinary-shopping-gate classification above takes precedence.
  if(step==='main'&&u.pathname==='/'&&!title&&!document.querySelector('input#ASIN,input[name="ASIN"]')&&document.querySelector('#twotabsearchtextbox')&&/^Amazon\.com\.mx\s*:/i.test(document.title))return {...blank,reason:'HOMEPAGE_REDIRECT',homepageRecoveryAllowed:true};
  const pathAsin=u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
  trace('asin');
  const ids=[...document.querySelectorAll('input#ASIN,input[name="ASIN"]')].map(el=>el.value.toUpperCase()).filter(Boolean);
  if(pathAsin!==item.asin||!ids.includes(item.asin)||!new RegExp(item.titlePattern,'i').test(title))return {...blank,reason:'PRODUCT_IDENTITY_UNCONFIRMED'};
  const amazonMx=value=>/^amazon m[eé]xico$/i.test((value||'').trim());
  if(step==='panel'){
    const fallback={...blank,buyingOptionsShown:true,state:'buying_options_shown',reason:'BUYING_OPTIONS_CONTROL_VISIBLE',priority:'normal',panelStatus:'unverified'};
      const panel=document.querySelector('#all-offers-display');
      // Amazon can hide the title while its offer rows remain visible.
      // This title is identity metadata, not evidence that an offer is purchasable.
      const panelTitle=(document.querySelector('#aod-asin-title-text')?.textContent||'').replace(/\s+/g,' ').trim();
      const rows=panel?[...panel.querySelectorAll('[id="aod-offer"],#aod-pinned-offer')].filter(visible):[];
      fallback.panelDiagnostics={panelPresent:!!panel,panelVisible:visible(panel),visibleRows:rows.length,titleMatches:new RegExp(item.titlePattern,'i').test(panelTitle)};
      if(fallback.panelDiagnostics.panelVisible&&rows.length&&fallback.panelDiagnostics.titleMatches){
        trace('panel_reading');
        const offers=rows.map(row=>{
          const soldBy=row.querySelector('[id="aod-offer-soldBy"]');
          const seller=text(soldBy?.querySelector('a'))||text(soldBy).replace(/^(?:Vendedor|Vendido por|Sold by)\s*/i,'');
          // Only exclude an explicitly empty featured-offer message, never an unread offer.
          if(!seller&&row.id==='aod-pinned-offer'&&/no hay ofertas destacadas disponibles|no featured offers available/i.test(text(row))&&!row.querySelector('[id^="aod-price-"],[id="aod-offer-price"],input[name="submit.addToCart"],button'))return null;
          if(!amazonMx(seller))return {seller:seller.slice(0,120)||null,amazonMexico:false,detailsSkipped:true};
          const priceText=text(row.querySelector('[id^="aod-price-"]'))||text(row.querySelector('[id="aod-offer-price"]'));
          const match=priceText.match(/(?:\$|MXN)\s*([\d,]+(?:\.\d{1,2})?)/i);
          const priceMxn=match?Number(match[1].replaceAll(',','')):null;
          const control=[...row.querySelectorAll('input[name="submit.addToCart"],button')].find(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('.a-button-disabled')&&/carrito|add to cart|pre.?order|preventa|reserva/i.test((el.value||'')+' '+(el.getAttribute('aria-label')||'')+' '+text(el.parentElement)));
          const identity=[...row.querySelectorAll('input[name="items[0.base][asin]"]')].some(el=>el.value===item.asin);
          const label=text(control?.parentElement);
          const delivery=text(row.querySelector('[id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"]'));
          return {seller:seller.slice(0,120),priceMxn,purchaseEnabled:!!control&&identity,fulfilledBy:text(row.querySelector('[id="aod-offer-shipsFrom"]')).replace(/^(?:Enviado por|Envío por|Ships from)\s*/i,'').slice(0,120),purchaseType:/preventa|pre.?order|reserva/i.test(label)?'preorder':'purchase',deliveryBlocked:/no (?:se puede|podemos) enviar|cannot be shipped/i.test(delivery)};
        }).filter(Boolean);
        fallback.panelDiagnostics.ignoredPlaceholderRows=rows.length-offers.length;
        const mx=offers.filter(o=>amazonMx(o.seller)&&o.priceMxn>0&&o.purchaseEnabled&&!o.deliveryBlocked).sort((a,b)=>a.priceMxn-b.priceMxn)[0];
        if(mx)return {...blank,buyingOptionsShown:true,...mx,state:'available',reason:'AMAZON_MX_PANEL',priority:'high',offerSource:'panel',panelStatus:'amazon_mx_found'};
        const expected=Number(text(document.querySelector('#aod-filter-offer-count-string')).match(/\d+/)?.[0]);
        return {...fallback,panelStatus:!expected||expected>offers.length||offers.some(o=>!o.seller||(amazonMx(o.seller)&&(!o.priceMxn||!o.purchaseEnabled)))?'unverified':'inspected',offers};
      }

    return fallback;
  }
  trace('buybox');
  const roots=[...document.querySelectorAll('#desktop_buybox,#buybox,#rightCol')].filter(visible);
  const root=roots[0];if(!root)return blank;
  // Only the explicit open step may click this product-matched options control.
  trace('options');
  const optionsControl=[...root.querySelectorAll('a,button,input[type="button"]')].find(el=>{
    if(!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true'||el.closest('.a-button-disabled'))return false;
    const label=`${text(el)} ${el.getAttribute('aria-label')||''} ${el.value||''}`.trim();
    if(!/^(?:ver (?:todas )?(?:las )?opciones de compra|opciones de compra|see (?:all )?buying options|buying options)(?:\s|$)/i.test(label))return false;
    const href=el.getAttribute('href');if(!href)return el.tagName==='BUTTON';
    try{const link=new URL(href,location.href);const linkedAsin=link.pathname.match(/\/(?:dp|gp\/offer-listing)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();return link.origin===location.origin&&Boolean(linkedAsin===item.asin||(link.pathname===u.pathname&&link.hash));}catch{return false;}
  });
  const buyingOptionsShown=Boolean(optionsControl);
  const first=(selector)=>[...root.querySelectorAll(selector)].find(visible);
  trace('availability');
  const availability=text(first('#availability,#outOfStock,#availabilityInsideBuyBox_feature_div'));
  trace('purchase');
  const purchase=[...root.querySelectorAll('#add-to-cart-button,#buy-now-button,input[name="submit.add-to-cart"]')].some(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('.a-button-disabled'));
  trace('seller');
  const seller=text(first('#sellerProfileTriggerId'))||text(first('#merchantInfoFeature_feature_div .offer-display-feature-text-message'));
  trace('price');
  const priceText=amazonMx(seller)?(text(first('.a-price:not(.a-text-price) .a-offscreen'))||text(first('.a-price:not(.a-text-price)'))):'';
  const m=priceText.match(/(?:\$|MXN)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const price=m?Number(m[1].replaceAll(',','')):null;
  const fulfilled=text(first('#fulfillerInfoFeature_feature_div .offer-display-feature-text-message'))||(/Remitente\s*\/\s*Vendedor|Ships from\s*\/\s*Sold by/i.test(text(first('#merchantInfoFeature_feature_div')))?seller:'');
  const sold=/temporalmente agotado|no disponible por el momento|actualmente no disponible|currently unavailable|out of stock/i.test(availability);
  trace('delivery');
  const delivery=text(first('#deliveryBlockMessage,#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE,#deliveryMessageMirId'));
  const deliveryBlocked=/no (?:se puede|podemos) enviar|cannot be shipped|no disponible.*(?:direcci[oó]n|ubicaci[oó]n)/i.test(delivery);
  trace('classify');
  const details={...blank,priceMxn:price,seller:seller.slice(0,120)||null,fulfilledBy:fulfilled.slice(0,120)||null,purchaseEnabled:purchase,buyingOptionsShown};
  const purchaseType=/preventa|pre.?order|reserva/i.test(text(root))?'preorder':'purchase';
  if(purchase&&price>0&&amazonMx(seller)&&!sold&&!deliveryBlocked)return {...details,state:'available',reason:'AMAZON_MX_FEATURED',priority:'high',offerSource:'featured',purchaseType,panelStatus:'not_needed'};
  if(buyingOptionsShown){
    const fallback={...blank,buyingOptionsShown:true,state:'buying_options_shown',reason:'BUYING_OPTIONS_CONTROL_VISIBLE',priority:'normal',panelStatus:'unverified'};
    if(step==='open'){
      if(Date.now()>=deadlineAt)return fallback;
      trace('panel_opening');optionsControl.click();
      return {...fallback,panelStatus:'opening'};
    }
    return {...fallback,panelStatus:'pending'};
  }
  if(sold&&purchase)return {...details,reason:'CONTRADICTORY_OFFER'};
  // Absence of a featured offer never proves every seller is sold out.
  if(sold&&!purchase)return {...details,state:'sold_out',reason:'EXPLICIT_PRODUCT_UNAVAILABLE'};
  if(deliveryBlocked)return {...details,reason:'DELIVERY_UNAVAILABLE'};
  if(purchase&&seller&&!amazonMx(seller))return {...details,reason:'OTHER_SELLER_FEATURED',priority:'none'};
  return {...details,reason:purchase?'PRICE_OR_SELLER_UNCONFIRMED':'NO_VERIFIED_FEATURED_OFFER'};
  }finally{trace('returned');}
}
