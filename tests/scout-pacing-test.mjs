import assert from 'node:assert/strict';
import {cadenceMs,dueProducts,nextProductDue,nextWake} from '../collector/amazon-extension/pacing.js';
import {preparedReads} from '../collector/amazon-extension/pipeline.js';
const items=[{asin:'warm'},{asin:'B0H77VYKSM'},{asin:'B0H77XNKKK'}],now=1000000;
assert.equal(cadenceMs('warm'),720000);assert.equal(cadenceMs(items[1].asin),240000);
assert.deepEqual(dueProducts(items,{},now,2).map(i=>i.asin),['B0H77VYKSM','B0H77XNKKK']);
assert.equal(dueProducts(items,Object.fromEntries(items.map(i=>[i.asin,now+1000])),now).length,0);
assert.equal(nextProductDue({asin:'warm'},now,90000),now+735000);assert.equal(nextWake(items,{},now),now+30000);
const delay=ms=>new Promise(r=>setTimeout(r,ms));const samples=[];
for(const concurrency of [1,2]){
 let preparing=0,maxPreparing=0,reading=0,maxReading=0,open=0,maxOpen=0;const started=performance.now();
 const results=await preparedReads([1,2,3,4],{concurrency,prepare:async item=>{open++;maxOpen=Math.max(open,maxOpen);preparing++;maxPreparing=Math.max(preparing,maxPreparing);await delay(25);preparing--;return item;},read:async(item,page)=>{reading++;maxReading=Math.max(reading,maxReading);assert.equal(item,page);await delay(10);reading--;open--;return item;}});
 assert.deepEqual(results,[1,2,3,4]);assert.equal(maxReading,1);assert(maxPreparing<=concurrency);assert(maxOpen<=concurrency);samples.push({concurrency,elapsedMs:Math.round(performance.now()-started),foregroundReaders:maxReading,maximumPreparedPages:maxOpen});
}
let stop=false,reads=0;await preparedReads([1,2,3,4],{concurrency:2,prepare:async n=>n,read:async n=>{reads++;stop=true;return n;},stop:()=>stop});assert.equal(reads,1);
console.log(JSON.stringify({experiment:'local synthetic preparation delays; no retailer requests, not a production speed estimate',samples,productionConcurrency:1}));
