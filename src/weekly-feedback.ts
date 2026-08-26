import { feedbackClientNonce } from "./security";
import type { Env } from "./types";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export const weekKey = (date: Date, timezone: string) => {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone:timezone, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
  const d = new Date(`${local}T12:00:00Z`), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear(), start = new Date(Date.UTC(year,0,1));
  return `${year}-W${String(Math.ceil((((d.getTime()-start.getTime())/86400000)+1)/7)).padStart(2,"0")}`;
};

export async function distributeWeeklyFeedback(env: Env, now = new Date()): Promise<boolean> {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone:env.SPAWN_TIMEZONE, weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(now);
  const value = (type:string) => parts.find(p=>p.type===type)?.value;
  if (value("weekday") !== "Fri" || value("hour") !== "10" || Number(value("minute")) > 10) return false;
  const week = weekKey(now, env.SPAWN_TIMEZONE), token = crypto.randomUUID(), createdAt = now.toISOString();
  const inserted = await env.SPAWN_DB.prepare("INSERT OR IGNORE INTO weekly_feedback_campaigns(week_key,token,created_at) VALUES(?,?,?)").bind(week,token,createdAt).run();
  if ((inserted.meta.changes ?? 0) === 0) return false;
  const response = await fetch(`${env.DISCORD_WEBHOOK_URL}?wait=true`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({content:`📋 **Garfield weekly feedback**\nA short anonymous check-in helps prioritize fixes and measure successful purchases.\n${env.PUBLIC_BASE_URL}/weekly-feedback/${token}`,allowed_mentions:{parse:[]}}) });
  if (!response.ok) throw new Error(`Discord weekly feedback ${response.status}`);
  const messageId = ((await response.json()) as {id?:string}).id ?? null;
  await env.SPAWN_DB.prepare("UPDATE weekly_feedback_campaigns SET discord_message_id=? WHERE week_key=?").bind(messageId,week).run();
  return true;
}

const scale = (name:string, max=5) => `<select name="${name}" required>${Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")}</select>`;
const price = (name:string) => `<select name="${name}" required>${["Definitely would pay","Probably would pay","Maybe","Probably would not","Definitely would not"].map(v=>`<option>${v}</option>`).join("")}</select>`;
const page = (token:string) => `<!doctype html><meta name="viewport" content="width=device-width"><title>Garfield weekly feedback</title><style>body{font:16px system-ui;max-width:44rem;margin:3rem auto;padding:1rem;background:#101114;color:#fff}label{display:block;margin:1rem 0}select,textarea{display:block;width:100%;padding:.6rem;margin-top:.3rem}button{padding:.8rem 1rem}</style><h1>Garfield weekly feedback</h1><p>No name or email is requested. Ratings are 1 (poor/low) to 5 (excellent/high), except usefulness (1–10).</p><form method="post"><label>Overall usefulness ${scale("usefulness",10)}</label><label>Alert accuracy ${scale("alert_accuracy")}</label><label>Pricing accuracy ${scale("pricing_accuracy")}</label><label>Vendor quality ${scale("vendor_quality")}</label><label>Alert timing ${scale("alert_timing")}</label><label>Noise / irrelevant alerts (1 low, 5 high) ${scale("noise")}</label><label>Did Garfield help you successfully purchase a product this week?<select name="successful_purchase" required><option value="1">Yes</option><option value="0">No</option></select></label><label>Most useful<textarea name="most_useful" maxlength="1000"></textarea></label><label>What should we fix first?<textarea name="fix_first" maxlength="1000"></textarea></label><label>Suggestions / missing vendors / offerings<textarea name="suggestions" maxlength="1000"></textarea></label>${[99,149,199,299].map(v=>`<label>MX$${v}/month ${price(`price_${v}`)}</label>`).join("")}<label>Value of basic/restock alerts ${scale("basic_value")}</label><label>Value of premium/priority/fast-lane features ${scale("premium_value")}</label><button>Submit feedback</button></form>`;

export async function handleWeeklyFeedback(request: Request, url: URL, env: Env): Promise<Response | null> {
  const match=url.pathname.match(/^\/weekly-feedback\/([^/]+)$/); if(!match) return null;
  const campaign=await env.SPAWN_DB.prepare("SELECT week_key FROM weekly_feedback_campaigns WHERE token=?").bind(match[1]).first<{week_key:string}>();
  if(!campaign) return new Response("Survey not found",{status:404});
  if(request.method==="GET") return new Response(page(esc(match[1])),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex"}});
  if(request.method!=="POST") return new Response("Method not allowed",{status:405});
  const form=await request.formData(), client=feedbackClientNonce(request);
  const integer=(key:string,max=5)=>{const n=Number(form.get(key));return Number.isInteger(n)&&n>=1&&n<=max?n:null};
  const values=[integer("usefulness",10),integer("alert_accuracy"),integer("pricing_accuracy"),integer("vendor_quality"),integer("alert_timing"),integer("noise"),integer("basic_value"),integer("premium_value")];
  if(values.some(v=>v==null)||!["0","1"].includes(String(form.get("successful_purchase")))) return new Response("Invalid response",{status:400});
  const text=(key:string)=>String(form.get(key)??"").trim().slice(0,1000), choice=(key:string)=>String(form.get(key)??"").slice(0,40);
  await env.SPAWN_DB.prepare(`INSERT OR REPLACE INTO weekly_feedback_responses(week_key,client_nonce,submitted_at,usefulness,alert_accuracy,pricing_accuracy,vendor_quality,alert_timing,noise,successful_purchase,most_useful,fix_first,suggestions,price_99,price_149,price_199,price_299,basic_value,premium_value) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(campaign.week_key,client.nonce,new Date().toISOString(),...values.slice(0,6),Number(form.get("successful_purchase")),text("most_useful"),text("fix_first"),text("suggestions"),choice("price_99"),choice("price_149"),choice("price_199"),choice("price_299"),values[6],values[7]).run();
  const headers=new Headers({"content-type":"text/html; charset=utf-8","cache-control":"no-store"}); if(client.isNew) headers.append("set-cookie",`spawn_feedback_id=${client.nonce}; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax`);
  return new Response("<h1>Thank you</h1><p>Your anonymous weekly feedback was recorded.</p>",{headers});
}
