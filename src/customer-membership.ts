import type {CustomerEnv} from './customer';
export type CustomerMember={id:string;email:string;status:string;created_at?:string};
type Link={customer_id:string;discord_user_id:string;guild_id:string;membership_status:string;checked_at:string|null;verified_at:string|null;roles_json:string};
const snowflake=(s:unknown)=>typeof s==='string'&&/^\d{17,20}$/.test(s);
const hash=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function membershipRequired(env:CustomerEnv,member:CustomerMember){return env.CUSTOMER_MEMBERSHIP_MODE==='new_accounts'&&(!member.created_at||!env.CUSTOMER_TERMS_REQUIRED_FROM||Date.parse(member.created_at)>=Date.parse(env.CUSTOMER_TERMS_REQUIRED_FROM))||env.CUSTOMER_MEMBERSHIP_MODE==='enforced'||env.CUSTOMER_MEMBERSHIP_MODE==='pilot'&&(env.CUSTOMER_MEMBERSHIP_PILOT_EMAILS??'').split(',').map(s=>s.trim().toLowerCase()).includes(member.email);}
export function discordConfigured(env:CustomerEnv){return snowflake(env.DISCORD_APPLICATION_ID)&&snowflake(env.DISCORD_GUILD_ID)&&Boolean(env.DISCORD_CLIENT_SECRET&&env.DISCORD_BOT_TOKEN)&&/^https:\/\/[^/]+\/app\/discord\/callback$/.test(env.DISCORD_REDIRECT_URI??'');}
export async function startDiscordLink(env:CustomerEnv,member:CustomerMember){
 if(!discordConfigured(env))throw new Error('Discord linking is not configured');
 const state=crypto.randomUUID()+crypto.randomUUID();
 await env.CUSTOMER_DB.prepare('DELETE FROM customer_discord_states WHERE expires_at<?').bind(new Date().toISOString()).run();
 await env.CUSTOMER_DB.prepare('INSERT INTO customer_discord_states(state_hash,customer_id,expires_at) VALUES(?,?,?)').bind(await hash(state),member.id,new Date(Date.now()+600000).toISOString()).run();
 const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID!,redirect_uri:env.DISCORD_REDIRECT_URI!,response_type:'code',scope:'identify',state}).toString();return url.href;
}
export async function finishDiscordLink(env:CustomerEnv,member:CustomerMember,url:URL){
 if(!discordConfigured(env)||!url.searchParams.get('code')||!url.searchParams.get('state'))throw new Error('Invalid Discord callback');
 const claimed=await env.CUSTOMER_DB.prepare('UPDATE customer_discord_states SET consumed_at=? WHERE state_hash=? AND customer_id=? AND consumed_at IS NULL AND expires_at>? RETURNING customer_id').bind(new Date().toISOString(),await hash(url.searchParams.get('state')!),member.id,new Date().toISOString()).first();
 if(!claimed)throw new Error('Discord link expired or already used');
 const response=await fetch('https://discord.com/api/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID!,client_secret:env.DISCORD_CLIENT_SECRET!,grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:env.DISCORD_REDIRECT_URI!})});
 if(!response.ok){const detail=await response.json().catch(()=>({})) as {error?:string};const reason=['invalid_client','invalid_grant','invalid_request'].includes(detail.error??'')?detail.error:'http_'+response.status;throw new Error('discord_token_'+reason);}
 const token=await response.json() as {access_token?:string};if(!token.access_token)throw new Error('Missing Discord authorization');
 try{
  const user=await fetch('https://discord.com/api/v10/users/@me',{headers:{authorization:'Bearer '+token.access_token},redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!user.ok)throw new Error('discord_identity_http_'+user.status);const data=await user.json() as {id?:string};if(!snowflake(data.id))throw new Error('Invalid Discord identity');
  const existing=await env.CUSTOMER_DB.prepare('SELECT discord_user_id FROM customer_discord_links WHERE customer_id=?').bind(member.id).first<{discord_user_id:string}>();
  // Relinking to a different person requires support; do not orphan access roles on the previous identity.
  if(existing&&existing.discord_user_id!==data.id)throw new Error('Contact support to change your linked Discord account');
  await env.CUSTOMER_DB.prepare(`INSERT INTO customer_discord_links(customer_id,discord_user_id,guild_id,linked_at) VALUES(?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET guild_id=excluded.guild_id,checked_at=NULL,verified_at=NULL,membership_status='UNKNOWN'`).bind(member.id,data.id!,env.DISCORD_GUILD_ID!,new Date().toISOString()).run();
 }finally{
  // Tokens are used only to prove identity and are never retained in D1.
  await fetch('https://discord.com/api/oauth2/token/revoke',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID!,client_secret:env.DISCORD_CLIENT_SECRET!,token:token.access_token})}).catch(()=>{});
 }
}
export async function customerEntitlement(env:CustomerEnv,member:CustomerMember,now=new Date()){
 if(member.status!=='ACTIVE')return {allowed:false,reason:'revoked'};
 const link=await env.CUSTOMER_DB.prepare('SELECT * FROM customer_discord_links WHERE customer_id=?').bind(member.id).first<Link>();
 if(!link||link.guild_id!==env.DISCORD_GUILD_ID)return {allowed:false,reason:'link_discord'};
 if(!env.DISCORD_BOT_TOKEN||!snowflake(env.DISCORD_GUILD_ID))return {allowed:false,reason:'configuration'};
 let status=link.membership_status,verified=link.verified_at,roles=JSON.parse(link.roles_json) as string[];
 if(!link.checked_at||now.getTime()-Date.parse(link.checked_at)>=900000){
  try{
   const response=await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${link.discord_user_id}`,{headers:{authorization:'Bot '+env.DISCORD_BOT_TOKEN},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(response.status===404){status='NOT_MEMBER';verified=null;roles=[];}
   else if(response.ok){const body=await response.json() as {roles?:string[];pending?:boolean};if(!Array.isArray(body.roles))throw new Error('Invalid membership');roles=body.roles;status=body.pending?'NOT_MEMBER':'MEMBER';verified=body.pending?null:now.toISOString();}
   else status='ERROR';
  }catch{status='ERROR';}
  await env.CUSTOMER_DB.prepare('UPDATE customer_discord_links SET membership_status=?,checked_at=?,verified_at=?,roles_json=? WHERE customer_id=? AND discord_user_id=?').bind(status,now.toISOString(),verified,JSON.stringify(roles),member.id,link.discord_user_id).run();
 }
 const withinGrace=status==='ERROR'&&verified&&now.getTime()-Date.parse(verified)<=3600000;
 if(status!=='MEMBER'&&!withinGrace)return {allowed:false,reason:status==='NOT_MEMBER'?'join_server':'retry_discord'};
 if(env.DISCORD_FREE_ACCESS_ENABLED!=='true'&&(!env.DISCORD_REQUIRED_ROLE_ID||!roles.includes(env.DISCORD_REQUIRED_ROLE_ID)))return {allowed:false,reason:'required_role'};
 const accepted=env.CUSTOMER_TERMS_VERSION&&await env.CUSTOMER_DB.prepare('SELECT 1 FROM customer_terms_acceptances WHERE customer_id=? AND terms_version=?').bind(member.id,env.CUSTOMER_TERMS_VERSION).first();
 // Existing accounts were invited to review voluntarily; silence is not consent.
 const existingAccount=env.CUSTOMER_MEMBERSHIP_MODE==='new_accounts'&&Number.isFinite(Date.parse(member.created_at??''))&&Number.isFinite(Date.parse(env.CUSTOMER_TERMS_REQUIRED_FROM??''))&&Date.parse(member.created_at!)<Date.parse(env.CUSTOMER_TERMS_REQUIRED_FROM!);
 if(!accepted&&!existingAccount)return {allowed:false,reason:'accept_terms'};
 return {allowed:true,reason:withinGrace?'temporary_grace':'member'};
}
