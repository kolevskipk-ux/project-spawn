"""Read-only Scout host telemetry; independent of Firefox and recovery actions."""
import datetime,json,pathlib,subprocess,time,re,os,urllib.request,urllib.error,sys
HOST_ENDPOINT='https://spawn.aztlan-eng.com/internal/scout-host/heartbeat'
HOT={'B0H77VYKSM','B0H77XNKKK','B0H78BB9TY','B0H783FY5Z'}
TARGETS=HOT|{'B0HG3MQDWP','B0H7817G9M','B0HG3RVZLW','B0H784PD4X','B0H77VZBX4','B0H77W4411','B0H77XCW4M','B0H7818YHY','B0H784PJ49','B0H786LQ7Z','B0H786RZD9','B0H786SFFS'}
def epoch(value):
 try:
  if isinstance(value,(int,float)):return value/1000
  return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
 except (TypeError,ValueError,AttributeError):return 0

def iso(value,now):
 t=epoch(value)
 return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z') if 0<t<=now+60 else None

def command(args):
 try:
  r=subprocess.run(args,capture_output=True,text=True,timeout=3)
  return r.stdout.strip() if r.returncode==0 else None
 except (OSError,subprocess.TimeoutExpired):return None

def desktop_state():
 # Only count a local, active graphical user session, never an SSH session or greeter.
 sessions=command(['loginctl','show-user',str(os.getuid()),'--property=Sessions','--value'])
 if sessions is None:
  listing=command(['loginctl','list-sessions','--no-legend','--no-pager'])
  if listing is None:return 'unknown'
  sessions=' '.join(parts[0] for line in listing.splitlines() if len(parts:=line.split())>=2 and parts[1]==str(os.getuid()))
 unknown=False
 for session in sessions.split()[:16]:
  if not re.fullmatch(r'[a-zA-Z0-9_-]{1,32}',session):unknown=True;continue
  value=command(['loginctl','show-session',session,'--property=Type','--property=Class','--property=Active','--property=Remote'])
  if value is None:unknown=True;continue
  p=dict(line.split('=',1) for line in value.splitlines() if '=' in line)
  if not all(k in p for k in ['Type','Class','Active','Remote']):unknown=True;continue
  if p.get('Type') in ['wayland','x11'] and p.get('Class')=='user' and p.get('Active')=='yes' and p.get('Remote')=='no':return 'active'
 return 'unknown' if unknown else 'inactive'

def service_state(unit,now):
 value=command(['systemctl','--user','show',unit,'--property=ActiveState,ActiveEnterTimestampMonotonic'])
 if value is None:return 'unknown',None
 p=dict(line.split('=',1) for line in value.splitlines() if '=' in line)
 state=p.get('ActiveState');state=state if state in ['active','inactive','failed'] else 'unknown'
 try:
  started=float(p.get('ActiveEnterTimestampMonotonic','0'))/1e6
  at=now-time.monotonic()+started
  stamp=iso(at*1000,now) if started>0 and state=='active' else None
 except ValueError:stamp=None
 return state,stamp

def readable(row):
 return row.get('state') in ['available','sold_out','buying_options_shown'] or row.get('state')=='unknown' and row.get('reason') in ['NO_VERIFIED_FEATURED_OFFER','OTHER_SELLER_FEATURED','PRICE_OR_SELLER_UNCONFIRMED','OFFER_UNCONFIRMED'] and bool(row.get('title'))

def summarize(snapshot,now):
 result={'snapshotAt':iso(snapshot.get('exportedAt'),now),'lastAttemptAt':None,'lastReadAt':None,'localFresh':0,'acceptedFresh':0,'runtimeErrors':0,'blockedReads':0,'identityErrors':0,'intakeFailures':0,'manualPaused':None,'enabled':None,'stopReason':None}
 if result['snapshotAt']:
  for k in ['manualPaused','enabled']:
   if isinstance(snapshot.get(k),bool):result[k]=snapshot[k]
  reason=snapshot.get('stopReason');result['stopReason']=reason if reason in [None,'CHALLENGE','READ_FAILURES','RUN_FAILED','RELOADED'] else 'OTHER'
 attempts=[];successes=[]
 for asin in TARGETS:
  rows=snapshot.get('history',{}).get(asin,{}).get('checks',[])
  local=[];accepted=[]
  for r in rows:
   t=epoch(r.get('observedAt'))
   if not 0<t<=now:continue
   attempts.append(t)
   if readable(r):
    local.append(t);successes.append(t)
    if r.get('intake',{}).get('saved') is True:accepted.append(t)
   if now-t<=900:
    if r.get('state')=='error' and r.get('reason')=='PAGE_CHECK_FAILED':result['runtimeErrors']+=1
    if r.get('state')=='blocked':result['blockedReads']+=1
    if r.get('reason')=='PRODUCT_IDENTITY_UNCONFIRMED':result['identityErrors']+=1
    if r.get('intake',{}).get('mode')=='spawn' and r.get('intake',{}).get('saved') is False:result['intakeFailures']+=1
  limit=300 if asin in HOT else 900
  if local and now-max(local)<=limit:result['localFresh']+=1
  if accepted and now-max(accepted)<=limit:result['acceptedFresh']+=1
 result['lastAttemptAt']=iso(max(attempts)*1000,now) if attempts else None
 result['lastReadAt']=iso(max(successes)*1000,now) if successes else None
 for key in ['runtimeErrors','blockedReads','identityErrors','intakeFailures']:result[key]=min(1000,result[key])
 return result

def collect(home=None,now=None):
 home=home or pathlib.Path.home();now=now or time.time()
 amazon,started=service_state('scout-amazon.service',now);market,_=service_state('scout-marketplace.service',now)
 try:
  uptime=float(pathlib.Path('/proc/uptime').read_text().split()[0]);booted=iso((now-uptime)*1000,now)
 except (OSError,ValueError,IndexError):booted=None
 snapshot={}
 try:
  path=home/'Downloads/scout-server-health.json'
  if path.stat().st_size<=64*1024*1024:snapshot=json.loads(path.read_text())
  if not isinstance(snapshot,dict):snapshot={}
 except (OSError,ValueError):pass
 try:summary=summarize(snapshot,now)
 except (TypeError,ValueError,AttributeError):summary=summarize({},now)
 return {'schemaVersion':1,'observedAt':iso(now*1000,now),'bootedAt':booted,'desktop':desktop_state(),'amazonService':amazon,'marketplaceService':market,'serviceStartedAt':started,**summary}

def send(report,token):
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 request=urllib.request.Request(HOST_ENDPOINT,data=json.dumps(report).encode(),method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','User-Agent':'Garfield-Scout-Host/1.0','Accept':'application/json'})
 with urllib.request.build_opener(NoRedirect).open(request,timeout=8) as response:
  response.read(1024);return response.status

def main():
 # System service runs as main without a desktop. Never start a user manager or service.
 uid=os.getuid();os.environ.setdefault('XDG_RUNTIME_DIR','/run/user/'+str(uid));os.environ.setdefault('DBUS_SESSION_BUS_ADDRESS','unix:path=/run/user/'+str(uid)+'/bus')
 report=collect()
 if '--probe' in sys.argv:print(json.dumps(report));return
 try:
  config=(pathlib.Path.home()/'.local/share/scout-firefox-test/server/private-config.js').read_text()
  match=re.search(r"AMAZON_COLLECTOR_TOKEN\s*=\s*(['\"])([^'\"]+)\1",config)
  if not match:print('Scout host heartbeat: credential unavailable');return
  print('Scout host heartbeat: HTTP '+str(send(report,match.group(2))))
 except urllib.error.HTTPError as e:print('Scout host heartbeat: HTTP '+str(e.code))
 except Exception:print('Scout host heartbeat: reporting unavailable')
if __name__=='__main__':main()
