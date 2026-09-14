// Recovered from Catch's original MERCADOLIBRE_KNOWN_ITEMS, not current search results.
// Null seller IDs intentionally prevent verified availability until seller review.
export const MERCADOLIBRE_ITEMS=[
 {itemId:'MLM5984325176',name:'Poster Collection',titleTerms:['poster|p[oó]ster']},
 {itemId:'MLM5983271312',name:'Ditto Premium',titleTerms:['ditto','premium']},
 {itemId:'MLM5984323768',catalogId:'MLM75624347',catalogUrl:'https://www.mercadolibre.com.mx/pokemon-tcg-30th-celebration-booster-bundle-6pk-en-ingles/p/MLM75624347?pdp_filters=official_store%3A1214#wid=MLM5984323768',name:'Booster Bundle (6-pack)',titleTerms:['booster|sobres','bundle|paquete|6']},
 {itemId:'MLM5984325128',name:'Binder Collection',titleTerms:['binder|carpeta']},
 {itemId:'MLM5983272222',catalogId:'MLM75656814',catalogUrl:'https://www.mercadolibre.com.mx/pokemon-tcg-30th-celebration-elite-trainer-box-en-ingles/p/MLM75656814',name:'Elite Trainer Box',titleTerms:['elite|[eé]lite','trainer|entrenador']}
].map(item=>({...item,retailer:'mercadolibre',expectedSellerId:null,url:`https://articulo.mercadolibre.com.mx/MLM-${item.itemId.slice(3)}-_JM`}));
export const ML_HOSTS=['www.mercadolibre.com.mx','articulo.mercadolibre.com.mx'];
export function mercadoLibreItemId(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||!ML_HOSTS.includes(u.hostname)||u.username||u.password||u.port)return null;
  return u.pathname.match(/^\/MLM-(\d{8,14})(?:-|$)/i)?.[1]?'MLM'+u.pathname.match(/^\/MLM-(\d{8,14})(?:-|$)/i)[1]:null;
 }catch{return null;}
}
// Catalog URLs authorize inspection only. Offer identity is checked independently
// from the page; URL wid/official_store values are never seller or stock evidence.
export function exactMercadoLibreItem(url,item){
 if(mercadoLibreItemId(url)===item.itemId)return true;
 try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.mercadolibre.com.mx'&&!u.username&&!u.password&&!u.port&&!!item.catalogId&&u.pathname.match(/\/p\/(MLM\d+)\/?$/)?.[1]===item.catalogId;}catch{return false;}
}
export function mercadoLibreChallenge(url){try{const u=new URL(url);return ML_HOSTS.includes(u.hostname)&&/^\/(gz\/account-verification|jms\/|login|auth|security|challenge)/.test(u.pathname);}catch{return false;}}
