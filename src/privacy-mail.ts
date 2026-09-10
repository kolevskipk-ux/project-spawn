import {supportWebhook} from './customer-support';
type MailEnv={SPAWN_DB:D1Database;OPS_DISCORD_WEBHOOK_URL?:string;PRIVACY_MAIL_ENABLED?:string;PRIVACY_MAIL_FORWARD_TO?:string};
type IncomingMail={to:string;forward:(destination:string)=>Promise<unknown>;setReject:(reason:string)=>void};

export async function privacyMail(message:IncomingMail,env:MailEnv,ctx:Pick<ExecutionContext,'waitUntil'>) {
 if(env.PRIVACY_MAIL_ENABLED!=='true'||message.to.toLowerCase()!=='sales@aztlan-eng.com'){
  message.setReject('This recipient is not configured.');return;
 }
 const destination=env.PRIVACY_MAIL_FORWARD_TO;
 if(!destination||destination.toLowerCase()===message.to.toLowerCase())throw new Error('Privacy forwarding destination is not configured');
 // Persist only an opaque alert ID and time, never email content or sender details.
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await env.SPAWN_DB.prepare('INSERT INTO privacy_mail_alerts(id,received_at) VALUES(?,?)').bind(id,now).run();
 // Do not let Discord availability prevent forwarding. Forward failures propagate
 // to Email Routing rather than incorrectly reporting successful mail handling.
 try {await message.forward(destination);}
 finally {ctx.waitUntil(deliverPrivacyMailAlerts(env).catch(()=>console.error('Privacy mail alert pending retry')));}
}

export async function deliverPrivacyMailAlerts(env:MailEnv,fetchFn:typeof fetch=fetch,now=new Date()) {
 if(env.PRIVACY_MAIL_ENABLED!=='true')return;
 const webhook=supportWebhook(env.OPS_DISCORD_WEBHOOK_URL);
 if(!webhook)return;
 const time=now.toISOString(),lease=new Date(now.getTime()+120000).toISOString();
 const pending=await env.SPAWN_DB.prepare('SELECT id FROM privacy_mail_alerts WHERE delivered_at IS NULL AND (lease_until IS NULL OR lease_until<=?) ORDER BY received_at LIMIT 5').bind(time).all<{id:string}>();
 for(const {id} of pending.results){
  const row=await env.SPAWN_DB.prepare('UPDATE privacy_mail_alerts SET lease_until=?,attempts=attempts+1 WHERE id=? AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<=?) RETURNING received_at').bind(lease,id,time).first<{received_at:string}>();
  if(!row)continue;
  try {
   const response=await fetchFn(webhook+'?wait=true',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({username:'Poke Primos Ops',allowed_mentions:{parse:[]},content:`📬 New support/privacy email received at sales@aztlan-eng.com. Philip: review your Gmail inbox; check Cloudflare routing if it is missing.\nReceived: ${row.received_at}\nReference: ${id}\nEmail content and sender details stay out of Discord.`})});
   if(!response.ok){await response.body?.cancel();continue;}
   await response.body?.cancel();
   await env.SPAWN_DB.prepare('UPDATE privacy_mail_alerts SET delivered_at=?,lease_until=NULL WHERE id=? AND lease_until=?').bind(time,id,lease).run();
  }catch{/* The durable row is eligible for retry after its lease expires. */}
 }
 await env.SPAWN_DB.prepare('DELETE FROM privacy_mail_alerts WHERE delivered_at IS NOT NULL AND delivered_at<?').bind(new Date(now.getTime()-7*86400000).toISOString()).run();
}
