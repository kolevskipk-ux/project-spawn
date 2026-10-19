// Reading an inconclusive offer must not imply stock or stop the collector.
const readableUnknown=new Set(['OTHER_SELLER_FEATURED','NO_VERIFIED_FEATURED_OFFER','OFFER_UNCONFIRMED','PRICE_OR_SELLER_UNCONFIRMED']);
export function readHealth(results){
 const errors=results.filter(r=>r.state==='error'||r.state==='unknown'&&!readableUnknown.has(r.reason)).length;
 const challenges=results.filter(r=>r.state==='blocked').length;
 const inconclusive=results.filter(r=>readableUnknown.has(r.reason)||r.panelStatus==='unverified').length;
 // Read failures remain visible in health/intake and retry at the existing
 // per-product cadence. A small due batch must not disable every other target.
 // Real challenges still stop the sweep and retain the existing cooldown policy.
 return {errors,challenges,inconclusive,stopReason:challenges?'CHALLENGE':null};
}
