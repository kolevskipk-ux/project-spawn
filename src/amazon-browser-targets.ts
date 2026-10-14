import {ITEMS as anniversary} from '../collector/amazon-extension/items.js';
export const ITEMS=[...anniversary.map(item=>({...item,category:'30th_celebration',routingKey:'pokemon-30th'})),
 {asin:'B0HG3MQDWP',name:'Delta Reign Elite Trainer Box',titlePattern:'delta.*(?:elite.*trainer|trainer.*box)'},
 {asin:'B0HG3RVZLW',name:'Delta Reign Booster Bundle',titlePattern:'delta.*booster.*bundle'}
].map(item=>'category' in item?item:{...item,url:'https://www.amazon.com.mx/dp/'+item.asin,category:'delta_reign',routingKey:'delta-reign'});
