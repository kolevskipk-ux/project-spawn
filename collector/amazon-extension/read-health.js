// Reading an inconclusive offer must not imply stock or stop the collector.
const readableUnknown=new Set(['OTHER_SELLER_FEATURED','NO_VERIFIED_FEATURED_OFFER','OFFER_UNCONFIRMED','PRICE_OR_SELLER_UNCONFIRMED']);
export function readHealth(results){
 const errors=results.filter(r=>r.state==='error'||r.state==='unknown'&&!readableUnknown.has(r.reason)).length;
 const challenges=results.filter(r=>r.state==='blocked').length;
 const inconclusive=results.filter(r=>readableUnknown.has(r.reason)||r.panelStatus==='unverified').length;
 return {errors,challenges,inconclusive,stopReason:challenges?'CHALLENGE':errors/Math.max(1,results.length)>.2?'READ_FAILURES':null};
}
