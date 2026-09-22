export function intakeRecord(record){
  return {schemaVersion:1,source:'amazon_edge',id:record.id,asin:record.asin,url:record.url,observedAt:record.observedAt,title:record.title||'',state:record.state,reason:record.reason,buyingOptionsShown:typeof record.buyingOptionsShown==='boolean'?record.buyingOptionsShown:null};
}
export async function sendObservation(record,token,fetchFn=fetch){
  if(!token)return {mode:'local',saved:false};
  const response=await fetchFn('https://spawn.aztlan-eng.com/internal/amazon-browser/observe',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(intakeRecord(record))});
  if(!response.ok)throw new Error(`Intake HTTP ${response.status}`);
  const receipt=await response.json();
  if(receipt.ok!==true||receipt.id!==record.id||receipt.inventoryUpdated!==false||receipt.customerAlertSent!==false)throw new Error('Intake did not confirm the observation');
  return {mode:'spawn',saved:true};
}
