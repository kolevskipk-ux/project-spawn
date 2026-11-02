"""Bounded Scout recovery. No shell commands or service names come from the API."""
import datetime,json,pathlib,subprocess,time,math,re,urllib.request,urllib.error
HOT={'B0H77VYKSM','B0H77XNKKK','B0H78BB9TY','B0H783FY5Z'}
TARGETS=HOT|{'B0HG3MQDWP','B0H7817G9M','B0HG3RVZLW','B0H784PD4X','B0H77VZBX4','B0H77W4411','B0H77XCW4M','B0H7818YHY','B0H784PJ49','B0H786LQ7Z','B0H786RZD9','B0H786SFFS'}
ENDPOINT='https://spawn.aztlan-eng.com/internal/scout-control'
UNIT='scout-amazon.service'
def epoch(value):
 if isinstance(value,(int,float)):return value/1000
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
 except (TypeError,ValueError,AttributeError):return 0

def protected(snapshot,now):
 return snapshot.get('enabled') is not True or snapshot.get('manualPaused') or bool(snapshot.get('stopReason')) or epoch(snapshot.get('cooldownUntil'))>now or epoch(snapshot.get('scheduledPauseUntil'))>now

def budget(state,now):
 restarts=[t for t in state.get('restarts',[]) if 0<=now-t<86400]
 return len(restarts)<2 and not any(now-t<3600 for t in restarts)

def readable(row):
 if row.get('state') in ['available','sold_out','buying_options_shown']:return True
 return row.get('state')=='unknown' and row.get('reason') in ['NO_VERIFIED_FEATURED_OFFER','PRICE_OR_SELLER_UNCONFIRMED','OFFER_UNCONFIRMED','OTHER_SELLER_FEATURED'] and bool(row.get('title'))

def coverage(snapshot,now):
 fresh=0; failing=0; latest_success={}
 for asin in TARGETS:
  rows=snapshot.get('history',{}).get(asin,{}).get('checks',[])
  cadence=240 if asin in HOT else 720
  good=[epoch(r.get('observedAt')) for r in rows if readable(r) and r.get('intake',{}).get('saved') is True and epoch(r.get('observedAt'))<=now]
  latest=max(good,default=0);latest_success[asin]=latest
  if latest and now-latest<=(300 if asin in HOT else 900):fresh+=1
  recent=sorted(rows,key=lambda r:epoch(r.get('observedAt')),reverse=True)[:2]
  # Require repeat browser failures on this product, not mere unavailability or
  # an inconclusive seller. Two expected intervals plus jitter avoid flapping.
  if len(recent)==2 and all(r.get('state')=='error' and r.get('reason')=='PAGE_CHECK_FAILED' and 0<=now-epoch(r.get('observedAt'))<=cadence*3 for r in recent) and (not latest or now-latest>cadence*2+60):failing+=1
 return {'fresh':fresh,'total':len(TARGETS),'failing':failing,'latestSuccess':latest_success}

def decision(snapshot,state,now):
 if snapshot.get('enabled') is not True or snapshot.get('manualPaused'):return 'paused'
 if protected(snapshot,now):return 'protected_stop'
 exported=epoch(snapshot.get('exportedAt'));progress=epoch(snapshot.get('lastProgressAt'))
 if not exported or not progress or exported>now+60 or progress>now+60:return 'insufficient_evidence'
 widespread=0<=now-exported<=300 and coverage(snapshot,now)['failing']>=math.ceil(len(TARGETS)*.75)
 stalled=now-progress>1200 and 0<epoch(snapshot.get('nextRunAt'))<now-600
 if not widespread and not stalled:return 'healthy_or_waiting'
 if now-state.get('recoveryStartedAt',0)<1200:return 'recovery_grace'
 if not budget(state,now):return 'restart_budget_exhausted'
 return 'restart'

def save(path,state):
 temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(state));temporary.chmod(0o600);temporary.replace(path)

def load_snapshot(root):
 snapshot=json.loads((root/'Downloads/scout-server-health.json').read_text())
 try:
  small=json.loads((root/'Downloads/scout-server-watchdog.json').read_text())
  if epoch(small.get('exportedAt'))>epoch(snapshot.get('exportedAt')):snapshot.update(small)
 except (OSError,ValueError):pass
 return snapshot

def api(token,body=None):
 data=json.dumps(body).encode() if body is not None else None
 request=urllib.request.Request(ENDPOINT,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST' if data else 'GET')
 # Reject redirects: the collector credential must only reach this fixed origin.
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 with urllib.request.build_opener(NoRedirect).open(request,timeout=8) as response:return json.load(response)

def perform_restart(snapshot,state,now,active,manual=False):
 if snapshot.get('manualPaused') or snapshot.get('enabled') is not True:return 'blocked','manual_pause'
 if protected(snapshot,now):return 'blocked','protected_stop'
 if not active:return 'blocked','service_inactive'
 if manual and not 0<=now-epoch(snapshot.get('exportedAt'))<=300:return 'blocked','snapshot_unavailable'
 if not budget(state,now):return 'blocked','restart_budget_exhausted'
 return 'restarted','restart_started'

def main():
 import fcntl
 root=pathlib.Path.home()/'.local/share/scout-firefox-test';state_path=root/'watchdog-state.json'
 # Serialize timers/manual invocations and persist intent before restarting.
 with (root/'watchdog.lock').open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  try:snapshot=load_snapshot(pathlib.Path.home())
  except (OSError,ValueError):print('Scout watchdog: snapshot unavailable; no restart');return
  try:state=json.loads(state_path.read_text())
  except (OSError,ValueError):state={}
  now=time.time();c=coverage(snapshot,now)
  active=subprocess.run(['systemctl','--user','is-active','--quiet',UNIT]).returncode==0
  action=decision(snapshot,state,now);command=None;token=None
  try:
   match=re.search(r"AMAZON_COLLECTOR_TOKEN\s*=\s*(['\"])([^'\"]+)\1",(root/'server/private-config.js').read_text())
   token=match.group(2) if match else None
   if token:command=api(token).get('command')
  except Exception:print('Scout remote control unavailable; local recovery retained')
  if command and epoch(command.get('expiresAt'))>now and re.fullmatch(r'[a-f0-9-]{36}',command.get('id','')):
   try:
    if api(token,{'action':'claim','id':command['id']}).get('ok'):
     status,reason=perform_restart(snapshot,state,now,active,manual=True)
     if command['id'] in state.get('processedCommands',[]):status,reason='blocked','already_processed'
     state['processedCommands']=(state.get('processedCommands',[])+[command['id']])[-100:]
     state['pendingResult']={'action':'result','id':command['id'],'status':status,'reason':reason};save(state_path,state)
     action='restart' if status=='restarted' else reason
   except Exception:command=None;print('Scout restart claim unavailable; no remote action')
  if action=='restart':
   # Recheck pauses after network I/O, immediately before recording a restart.
   try:snapshot=load_snapshot(pathlib.Path.home())
   except (OSError,ValueError):snapshot={}
   active=subprocess.run(['systemctl','--user','is-active','--quiet',UNIT]).returncode==0
   status,reason=perform_restart(snapshot,state,now,active)
   if status=='restarted':
    state['restarts']=[t for t in state.get('restarts',[]) if now-t<86400]+[now]
    state.update(recoveryStartedAt=now,healthySamples=0)
    save(state_path,state)
    # Preserve evidence without deleting or rewriting the browser profile.
    evidence={k:snapshot.get(k) for k in ['exportedAt','enabled','manualPaused','stopReason','lastProgressAt','lastRun']}
    save(root/'last-recovery-evidence.json',evidence)
    try:
     result=subprocess.run(['systemctl','--user','restart',UNIT],timeout=45)
     if result.returncode:action='restart_failed'
    except (OSError,subprocess.TimeoutExpired):action='restart_failed'
   else:action=reason
   if state.get('pendingResult'):
    state['pendingResult'].update(status='failed' if action=='restart_failed' else status,reason='restart_failed' if action=='restart_failed' else reason)
  started=state.get('recoveryStartedAt',0)
  healthy=c['fresh']==len(TARGETS) and (not started or all(t>started for t in c['latestSuccess'].values()))
  exported=epoch(snapshot.get('exportedAt'))
  consecutive=0<now-state.get('checkedAt',0)<=240
  if healthy and 0<=now-exported<=300 and exported>state.get('lastHealthyExport',0):
   state['healthySamples']=min(2,state.get('healthySamples',0)+1) if consecutive else 1
   state['lastHealthyExport']=exported
  elif not healthy or now-exported>300:state['healthySamples']=0
  verified=state['healthySamples']>=2
  recovering=bool(started and not verified and now-started<1200)
  attention=action in ['restart_failed','restart_budget_exhausted'] or bool(started and not verified and now-started>=1200)
  report_state='protected' if protected(snapshot,now) else 'attention_required' if attention else 'healthy' if verified else 'recovering' if recovering else 'degraded' if c['fresh']<len(TARGETS) else 'unknown'
  state.update(checkedAt=now,action=action,coverageFresh=c['fresh'],recoveryVerified=verified)
  save(state_path,state)
  if token:
   try:
    if state.get('pendingResult'):
     if api(token,state['pendingResult']).get('ok'):state.pop('pendingResult');save(state_path,state)
    api(token,{'action':'report','fresh':c['fresh'],'total':len(TARGETS),'protected':bool(protected(snapshot,now) or not active),'restartAvailable':budget(state,now),'state':report_state})
   except Exception:print('Scout recovery report unavailable; result retained locally')
  print('Scout watchdog: '+action+'; coverage '+str(c['fresh'])+'/16; '+report_state)
if __name__=='__main__':main()
