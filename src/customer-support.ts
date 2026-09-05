export const supportKinds:Record<string,string>={access:'Account access',account_removal:'Account removal',general:'General question'};
export interface SupportEnv {CUSTOMER_DB:D1Database;CUSTOMER_SUPPORT_WEBHOOK_URL?:string}
export type SupportTicket={id:string;customer_id:string;kind:string;message:string;created_at:string;delivery_status:string;last_error:string|null};

// Only a Discord webhook can receive customer messages; the URL never enters HTML or logs.
export function supportWebhook(value:string|undefined):string|null {
  if(!value)return null;
  try {const url=new URL(value);return url.protocol==='https:'&&url.hostname==='discord.com'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)?url.href:null;}catch{return null;}
}

export async function deliverSupport(env:SupportEnv,id:string,actor:string):Promise<void> {
  const now=new Date().toISOString(),token=crypto.randomUUID(),stale=new Date(Date.now()-60000).toISOString();
  const ticket=await env.CUSTOMER_DB.prepare(`UPDATE customer_support SET delivery_status='SENDING',delivery_token=?,last_attempt_at=?,attempted_by=? WHERE id=? AND (delivery_status IN ('PENDING','FAILED') OR (delivery_status='SENDING' AND last_attempt_at<?)) RETURNING *`).bind(token,now,actor,id,stale).first<SupportTicket>();
  if(!ticket)return;
  let error:string|null=null;
  const webhook=supportWebhook(env.CUSTOMER_SUPPORT_WEBHOOK_URL);
  if(!webhook)error='Support channel is not connected';
  else {
    try {
      const response=await fetch(webhook+'?wait=true',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},embeds:[{title:`Garfield support: ${supportKinds[ticket.kind]}`,description:ticket.message,fields:[{name:'Request',value:ticket.id},{name:'Customer ID',value:ticket.customer_id}],timestamp:ticket.created_at}]})});
      if(!response.ok)error=`Discord delivery failed (${response.status})`;
      await response.body?.cancel();
    }catch{error='Delivery could not be confirmed';}
  }
  await env.CUSTOMER_DB.prepare(`UPDATE customer_support SET delivery_status=?,delivered_at=?,last_error=?,delivery_token=NULL WHERE id=? AND delivery_token=?`).bind(error?'FAILED':'SENT',error?null:new Date().toISOString(),error,id,token).run();
}

export async function saveSupport(env:SupportEnv,customerId:string,kind:string,message:string):Promise<string|null> {
  const id=crypto.randomUUID(),now=new Date().toISOString(),cutoff=new Date(Date.now()-3600000).toISOString();
  // The quota and insertion share a statement, including concurrent submissions.
  const inserted=await env.CUSTOMER_DB.prepare(`INSERT INTO customer_support(id,customer_id,kind,message,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM customer_support WHERE customer_id=? AND created_at>=?)<5 RETURNING id`).bind(id,customerId,kind,message,now,customerId,cutoff).first<{id:string}>();
  if(!inserted)return null;
  // Persist first. A delivery or status-write failure must never lose the request.
  try {await deliverSupport(env,id,'customer');}catch{}
  return id;
}
