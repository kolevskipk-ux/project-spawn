import type {CustomerEnv} from './customer';
import {customerEntitlement,type CustomerMember} from './customer-membership';
const decode=(hex:string)=>Uint8Array.from(hex.match(/../g)??[],s=>parseInt(s,16));
export async function discordInteraction(request:Request,env:CustomerEnv){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const signature=request.headers.get('x-signature-ed25519')??'',stamp=request.headers.get('x-signature-timestamp')??'';
 if(!/^[a-f0-9]{64}$/i.test(env.DISCORD_PUBLIC_KEY??'')||!/^[a-f0-9]{128}$/i.test(signature)||!/^\d+$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)return new Response('Invalid signature',{status:401});
 if(Number(request.headers.get('content-length')??0)>32768)return new Response('Too large',{status:413});
 const raw=await request.text();if(raw.length>32768)return new Response('Too large',{status:413});
 const key=await crypto.subtle.importKey('raw',decode(env.DISCORD_PUBLIC_KEY!),{name:'Ed25519'},false,['verify']);
 if(!await crypto.subtle.verify('Ed25519',key,decode(signature),new TextEncoder().encode(stamp+raw)))return new Response('Invalid signature',{status:401});
 let data:{type:number;application_id:string;guild_id?:string;member?:{user?:{id:string}};data?:{name:string}};
 try{data=JSON.parse(raw);}catch{return new Response('Invalid body',{status:400});}
 if(data.application_id!==env.DISCORD_APPLICATION_ID)return new Response('Wrong application',{status:403});
 if(data.type===1)return Response.json({type:1});
 if(data.guild_id!==env.DISCORD_GUILD_ID)return new Response('Wrong server',{status:403});
 if(data.type!==2||!['inventory','access'].includes(data.data?.name??''))return Response.json({type:4,data:{content:'Use /inventory or /access.',flags:64,allowed_mentions:{parse:[]}}});
 const base=env.CUSTOMER_PUBLIC_URL;
 if(!base||!/^https:\/\/[^/]+$/.test(base))return new Response('Not configured',{status:503});
 // Commands are private navigation helpers. The web app always revalidates access.
 return Response.json({type:4,data:{content:data.data?.name==='inventory'?`Open Poke Primos inventory: ${base}/app`:`Link Discord, review your membership and accept the terms: ${base}/app/onboarding\nNeed help? ${base}/app/support`,flags:64,allowed_mentions:{parse:[]}}});
}
export async function syncInventoryRoles(env:CustomerEnv){
 if(env.DISCORD_ROLE_SYNC_ENABLED!=='true')return {enabled:false};
 if(!env.DISCORD_BOT_TOKEN||!/^\d{17,20}$/.test(env.DISCORD_GUILD_ID??'')||!/^\d{17,20}$/.test(env.DISCORD_INVENTORY_ROLE_ID??'')||env.DISCORD_INVENTORY_ROLE_ID===env.DISCORD_REQUIRED_ROLE_ID)throw new Error('Separate inventory role configuration required');
 const api=`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}`,headers={authorization:'Bot '+env.DISCORD_BOT_TOKEN};
 const response=await fetch(api+'/roles',{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)return {enabled:true,error:'role_lookup_'+response.status};
 const roles=await response.json() as {id:string;permissions:string;managed:boolean}[];
 const role=roles.find(r=>r.id===env.DISCORD_INVENTORY_ROLE_ID);
 // A zero-permission marker role can receive channel-specific view permissions.
 // It must never grant server-wide moderation or administrator powers.
 if(!role||role.managed||role.permissions!=='0')throw new Error('Inventory Access must be an unmanaged role with zero server-wide permissions');
 const rows=(await env.CUSTOMER_DB.prepare(`SELECT m.id,m.email,m.status,l.discord_user_id FROM customer_members m JOIN customer_discord_links l ON l.customer_id=m.id LEFT JOIN customer_discord_role_sync s ON s.customer_id=m.id WHERE l.guild_id=? ORDER BY COALESCE(s.last_attempt_at,''),m.id LIMIT 20`).bind(env.DISCORD_GUILD_ID!).all<CustomerMember&{discord_user_id:string}>()).results;
 let processed=0;
 for(const member of rows){
  const entitlement=await customerEntitlement(env,member),at=new Date().toISOString();
  // Re-read admin status immediately before role changes; a revoked account never gains a role.
  const current=await env.CUSTOMER_DB.prepare('SELECT status FROM customer_members WHERE id=?').bind(member.id).first<{status:string}>();
  const desired=entitlement.allowed&&current?.status==='ACTIVE';
  const changed=await fetch(`${api}/members/${member.discord_user_id}/roles/${env.DISCORD_INVENTORY_ROLE_ID}`,{method:desired?'PUT':'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>null);
  const success=Boolean(changed?.ok||!desired&&changed?.status===404),error=success?null:changed?'discord_http_'+changed.status:'discord_unavailable';
  await env.CUSTOMER_DB.prepare(`INSERT INTO customer_discord_role_sync(customer_id,last_attempt_at,last_success_at,desired,last_error) VALUES(?,?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_success_at=COALESCE(excluded.last_success_at,customer_discord_role_sync.last_success_at),desired=excluded.desired,last_error=excluded.last_error`).bind(member.id,at,success?at:null,Number(desired),error).run();
  processed++;if(changed?.status===429)break;
 }
 return {enabled:true,processed};
}
