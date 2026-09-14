// This function is serialized into an isolated world. No credential enters the page.
export function readWalmartOffer() {
 const url=new URL(location.href), itemId=url.pathname.split('/').pop();
 if(url.protocol!=='https:'||url.hostname!=='www.walmart.com.mx'||!['00019621415869','00019621415836'].includes(itemId)||!url.pathname.startsWith('/ip/'))return {error:'Open the approved UPC or Ditto product tab first. If Walmart redirected to a challenge, resolve it manually before checking.'};
 const title=(document.querySelector('#main-title')?.textContent||'').trim().slice(0,400);
 const body=document.body.innerText||'';
 const blank={itemId,url:url.origin+url.pathname,title,priceMxn:null,seller:null,postcode:null,purchaseEnabled:false};
 if(/verifica tu identidad|confirma.*no eres un robot|robot or human/i.test(body))return {...blank,state:'blocked',offerText:'Identity challenge'};
 if(!/30th/i.test(title)||!(itemId==='00019621415869'?/ultra.*premium.*day.*night/i:/ditto.*premium/i).test(title))return {error:'The exact product title is not ready or does not match. Wait for the page to finish loading.'};
 const visible=el=>el.getClientRects().length>0;
 const candidates=[...document.querySelectorAll('div,section,aside')].filter(el=>visible(el)&&el.innerText.length<2000&&/Precio actual/i.test(el.innerText)&&/Vendido y enviado por\s+Walmart/i.test(el.innerText)&&!el.querySelector('h1,h2,h3'));
 const root=candidates.sort((a,b)=>a.innerText.length-b.innerText.length)[0];
 if(!root)return {...blank,state:'unknown',offerText:'No unambiguous primary Walmart offer area found'};
 const text=root.innerText;
 const price=text.match(/Precio actual\s*\$\s*([\d,]+(?:\.\d{2})?)/i);
 const priceMxn=price?Number(price[1].replaceAll(',','')):null;
 const postcode=/\b53100\b/.test(text)?'53100':null;
 const purchaseEnabled=[...root.querySelectorAll('button,input[type="submit"]')].some(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&/agregar al carrito|comprar ahora/i.test(`${el.innerText||''} ${el.value||''} ${el.getAttribute('aria-label')||''}`));
 const soldOut=/\bagotado\b/i.test(text), deliveryUnavailable=/env[ií]o no disponible/i.test(text);
 const state=!postcode?'unknown':soldOut?'sold_out':purchaseEnabled&&priceMxn&&!deliveryUnavailable?'available':'unknown';
 // Send normalized offer facts only, not arbitrary account/address text from the page.
 const offerText=[soldOut?'Agotado':null,deliveryUnavailable?'Envío no disponible':null,postcode?'Postcode 53100':null,priceMxn?`Precio actual $${priceMxn}`:null,'Vendido y enviado por Walmart',purchaseEnabled?'Enabled target purchase control':null].filter(Boolean).join('; ');
 return {...blank,priceMxn,postcode,seller:'Walmart',purchaseEnabled,state,offerText};
}
