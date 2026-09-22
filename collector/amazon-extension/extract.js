// Serialized into the tab's isolated world. Collect offer facts, never page HTML or account data.
export function readAmazon(item){
  const blank={asin:item.asin,url:item.url,title:'',state:'unknown',reason:'OFFER_UNCONFIRMED',priceMxn:null,seller:null,fulfilledBy:null,purchaseEnabled:false,buyingOptionsShown:null};
  const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const text=el=>visible(el)?(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim():'';
  const u=new URL(location.href);
  if(u.hostname!=='www.amazon.com.mx'||u.protocol!=='https:')return {...blank,reason:'WRONG_SITE'};
  if(document.querySelector('#captchacharacters,form[action*="validateCaptcha"]')||/\/ap\/(signin|cvf)|\/errors\/validateCaptcha/.test(u.pathname))return {...blank,state:'blocked',reason:'CHALLENGE_OR_SIGN_IN'};
  const title=text(document.querySelector('#productTitle'));
  blank.title=title.slice(0,300);
  const pathAsin=u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
  const ids=[...document.querySelectorAll('input#ASIN,input[name="ASIN"]')].map(el=>el.value.toUpperCase()).filter(Boolean);
  if(pathAsin!==item.asin||!ids.includes(item.asin)||!new RegExp(item.titlePattern,'i').test(title))return {...blank,reason:'PRODUCT_IDENTITY_UNCONFIRMED'};
  const roots=[...document.querySelectorAll('#desktop_buybox,#buybox,#rightCol')].filter(visible);
  const root=roots[0];if(!root)return blank;
  // Detect an enabled offer-panel control in the product buybox. Never click it.
  const buyingOptionsShown=[...root.querySelectorAll('a,button,input[type="button"]')].some(el=>{
    if(!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true'||el.closest('.a-button-disabled'))return false;
    const label=`${text(el)} ${el.getAttribute('aria-label')||''} ${el.value||''}`.trim();
    if(!/^(?:ver (?:todas )?(?:las )?opciones de compra|opciones de compra|see (?:all )?buying options|buying options)(?:\s|$)/i.test(label))return false;
    const href=el.getAttribute('href');if(!href)return el.tagName==='BUTTON';
    try{const link=new URL(href,location.href);const linkedAsin=link.pathname.match(/\/(?:dp|gp\/offer-listing)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();return link.origin===location.origin&&Boolean(linkedAsin===item.asin||(link.pathname===u.pathname&&link.hash));}catch{return false;}
  });
  const first=(selector)=>[...root.querySelectorAll(selector)].find(visible);
  const availability=text(first('#availability,#outOfStock,#availabilityInsideBuyBox_feature_div'));
  const purchase=[...root.querySelectorAll('#add-to-cart-button,#buy-now-button,input[name="submit.add-to-cart"]')].some(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('.a-button-disabled'));
  const priceText=text(first('.a-price:not(.a-text-price) .a-offscreen'))||text(first('.a-price:not(.a-text-price)'));
  const m=priceText.match(/(?:\$|MXN)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const price=m?Number(m[1].replaceAll(',','')):null;
  const seller=text(first('#sellerProfileTriggerId'))||text(first('#merchantInfoFeature_feature_div .offer-display-feature-text-message'));
  const fulfilled=text(first('#fulfillerInfoFeature_feature_div .offer-display-feature-text-message'));
  const sold=/temporalmente agotado|no disponible por el momento|actualmente no disponible|currently unavailable|out of stock/i.test(availability);
  const delivery=text(first('#deliveryBlockMessage,#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE,#deliveryMessageMirId'));
  const deliveryBlocked=/no (?:se puede|podemos) enviar|cannot be shipped|no disponible.*(?:direcci[oó]n|ubicaci[oó]n)/i.test(delivery);
  const details={...blank,priceMxn:price,seller:seller.slice(0,120)||null,fulfilledBy:fulfilled.slice(0,120)||null,purchaseEnabled:purchase,buyingOptionsShown};
  if(buyingOptionsShown)return {...details,state:'buying_options_shown',reason:'BUYING_OPTIONS_CONTROL_VISIBLE',priceMxn:null,seller:null,fulfilledBy:null,purchaseEnabled:false};
  if(sold&&purchase)return {...details,reason:'CONTRADICTORY_OFFER'};
  // Absence of a featured offer never proves every seller is sold out.
  if(sold&&!purchase)return {...details,state:'sold_out',reason:'EXPLICIT_PRODUCT_UNAVAILABLE'};
  if(deliveryBlocked)return {...details,reason:'DELIVERY_UNAVAILABLE'};
  if(purchase&&price>0&&seller)return {...details,state:'available',reason:'VERIFIED_FEATURED_OFFER'};
  return {...details,reason:purchase?'PRICE_OR_SELLER_UNCONFIRMED':'NO_VERIFIED_FEATURED_OFFER'};
}
