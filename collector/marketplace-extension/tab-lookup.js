// Re-read persisted IDs after worker sleep; never inspect an unrelated tab.
export async function findItemTab(api,group,item,tabs,tabIds){
 let tab=tabs.find(t=>group.exact(t.url,item));
 if(tab)return tab;
 const id=tabIds[item.itemId];
 if(id!=null){
  try{tab=await api.tabs.get(id);}catch{tab=null;}
  if(tab&&(group.exact(tab.url,item)||group.challenge(tab.url)))return tab;
 }
 // IDs can change after Firefox restores a session. A challenge redirect may
 // retain its original URL, but must still match this approved product.
 return tabs.find(t=>{
  if(!group.challenge(t.url))return false;
  try{return group.exact(new URL(t.url).searchParams.get('go_url'),item);}catch{return false;}
 });
}
