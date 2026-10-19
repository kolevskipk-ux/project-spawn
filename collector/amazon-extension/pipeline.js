// Controlled experiment only: overlap preparation, serialize all foreground reads.
// A caller must keep retailer request cadence fixed and stop on challenges.
export async function preparedReads(items,{prepare,read,concurrency=1,stop=()=>false}){
 if(![1,2].includes(concurrency))throw Error('Preparation concurrency must be one or two');
 const pending=new Map(),results=[];let next=0;
 function fill(){while(next<items.length&&pending.size<concurrency&&!stop()){
  const index=next++;pending.set(index,Promise.resolve().then(()=>prepare(items[index])).then(value=>({value}),error=>({error})));
 }}
 fill();
 try{for(let index=0;index<items.length;index++){
  if(stop()||!pending.has(index))break;
  const prepared=await pending.get(index);
  if(prepared.error)throw prepared.error;
  results.push(await read(items[index],prepared.value));pending.delete(index);fill();
 }}finally{await Promise.all(pending.values());}
 return results;
}
