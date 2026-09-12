import type {Env} from './types';
import type {BoardRow,CatchHuntSnapshot} from './board';
import {registerInventoryLinks} from './outbound-links';

export async function trackBoardLinks(env:Env,rows:BoardRow[],hunt:CatchHuntSnapshot){
  if(env.INVENTORY_LINK_TRACKING_ENABLED!=='true')return {rows,hunt};
  try{
    const targets=[...rows.map(row=>({url:row.canonical_url,product:row.title.slice(0,180),source:'inventory_page',route:row.watch_category,kind:'PRODUCT_LINK',event_id:row.listing_key})),
      ...hunt.rows.map(row=>({url:row.url,product:row.name.slice(0,180),source:'inventory_page',route:'amazon',kind:'PRODUCT_LINK',event_id:row.id}))];
    const links=await registerInventoryLinks(env,targets);
    return {rows:rows.map((row,i)=>({...row,outbound_url:links[i]})),hunt:{...hunt,rows:hunt.rows.map((row,i)=>({...row,outbound_url:links[rows.length+i]}))}};
  }catch{console.error('Inventory page tracking unavailable; using direct links');return {rows,hunt};}
}
