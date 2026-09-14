export async function sendMercadoLibreObservation(record,token,fetchFn=fetch){
 if(!token)return {...record,saved:false,local:true};
 const response=await fetchFn('https://spawn.aztlan-eng.com/internal/mercadolibre-browser/observe',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(record)
 });
 if(!response.ok)throw new Error(`Spawn rejected the Mercado Libre check (HTTP ${response.status}).`);
 const receipt=await response.json();
 if(receipt.ok!==true||receipt.id!==record.id)throw new Error('Spawn did not confirm this observation.');
 return {...record,saved:true,local:false};
}
