// Upsert only Poke Primos' two commands; preserve any unrelated guild commands.
const {DISCORD_APPLICATION_ID:app,DISCORD_BOT_TOKEN:token}=process.env;
const guild=process.env.DISCORD_GUILD_ID||'1537592665535942709';
const commands=[{name:'inventory',description:'Open Poke Primos tracked inventory',type:1},{name:'access',description:'Link Discord and check Poke Primos inventory access',type:1}];
if(!process.argv.includes('--apply')){console.log(JSON.stringify({guild,commands,apply:'Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN securely, then use --apply.'},null,2));}
else {
 if(!/^\d{17,20}$/.test(app||'')||!/^\d{17,20}$/.test(guild)||!token)throw new Error('Application ID, server ID and bot token are required');
 for(const command of commands){
  const response=await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bot '+token,'content-type':'application/json'},body:JSON.stringify(command)});
  if(!response.ok)throw new Error(`Command registration failed: HTTP ${response.status}`);
  const result=await response.json();console.log(JSON.stringify({name:result.name,id:result.id,guild_id:result.guild_id}));
 }
}
