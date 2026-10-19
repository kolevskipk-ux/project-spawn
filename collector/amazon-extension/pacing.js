const HOT=new Set(['B0H77VYKSM','B0H77XNKKK','B0H78BB9TY','B0H783FY5Z']);
export function cadenceMs(asin){return (HOT.has(asin)?4:12)*60000;}
export function dueProducts(items,due={},now=Date.now(),limit=6){
 return items.filter(i=>!(Number(due[i.asin])>now)).sort((a,b)=>Number(HOT.has(b.asin))-Number(HOT.has(a.asin))||(Number(due[a.asin])||0)-(Number(due[b.asin])||0)).slice(0,limit);
}
export function nextProductDue(record,now=Date.now(),jitter=0){
 return now+cadenceMs(record.asin)+Math.max(0,Math.min(15000,jitter));
}
export function nextWake(items,due={},now=Date.now()){
 return Math.max(now+30000,Math.min(...items.map(i=>Number(due[i.asin])||now+30000)));
}
