export const ITEMS = [
  {asin:'B0H77VYKSM',name:'30th Ultra-Premium Collection — Day',titlePattern:'30th.*ultra.?premium.*day'},
  {asin:'B0H77XNKKK',name:'30th Ultra-Premium Collection — Night',titlePattern:'30th.*ultra.?premium.*night'},
  {asin:'B0H78BB9TY',name:'30th Elite Trainer Box',titlePattern:'30th.*elite.*trainer'},
  {asin:'B0H783FY5Z',name:'30th Booster Bundle',titlePattern:'30th.*booster.*bundle'},
  {asin:'B0H784PD4X',name:'30th Ultra-Premium Collection — Day or Night',titlePattern:'30th.*ultra.?premium'},
  {asin:'B0H77VZBX4',name:'30th Tech Sticker Collection',titlePattern:'30th.*(?:tech.*sticker|sticker.*tech)'},
  {asin:'B0H77W4411',name:'30th Poster Collection',titlePattern:'30th.*poster'},
  {asin:'B0H77XCW4M',name:'30th Figure Collection — Mew',titlePattern:'30th.*\\bmew\\b'},
  {asin:'B0H7817G9M',name:'30th Sylveon ex Box',titlePattern:'30th.*sylveon'},
  {asin:'B0H7818YHY',name:'30th Binder Collection',titlePattern:'30th.*binder'},
  {asin:'B0H784PJ49',name:'30th Sylveon ex or Greninja ex Tin',titlePattern:'30th(?=.*(?:sylveon|greninja))(?=.*\\btin\\b)'},
  {asin:'B0H786LQ7Z',name:'30th Mini Tin — Pikachu (Night)',titlePattern:'30th.*mini.*tin'},
  {asin:'B0H786RZD9',name:'30th Battle Deck — Umbreon ex',titlePattern:'30th.*umbreon'},
  {asin:'B0H786SFFS',name:'30th Figure Collection — Mewtwo',titlePattern:'30th.*mewtwo'}
].map(item=>({...item,url:`https://www.amazon.com.mx/dp/${item.asin}`}));
export function exact(url,item){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.amazon.com.mx'&&u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase()===item.asin;}catch{return false;}}
export function append(previous,record){
  const entry=previous||{checks:[],total:0,verified:0};
  const verified=['available','sold_out'].includes(record.state);
  return {...entry,total:entry.total+1,verified:entry.verified+(verified?1:0),lastOptionsPresence:typeof record.buyingOptionsShown==='boolean'?record.buyingOptionsShown:entry.lastOptionsPresence,lastVerified:verified?record:entry.lastVerified,checks:[record,...entry.checks].slice(0,2304)};
}
