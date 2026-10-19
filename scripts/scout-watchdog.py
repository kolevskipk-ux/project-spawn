"""Local read-only health checks; bounded restart only for an enabled, stalled collector."""
import datetime,json,pathlib,subprocess,time
def epoch(value):
 if isinstance(value,(int,float)):return value/1000
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
 except (TypeError,ValueError,AttributeError):return 0
def decision(snapshot,state,now):
 if snapshot.get('enabled') is not True or snapshot.get('manualPaused'):return 'paused'
 if snapshot.get('stopReason') or epoch(snapshot.get('cooldownUntil'))>now or epoch(snapshot.get('scheduledPauseUntil'))>now:return 'protected_stop'
 exported=epoch(snapshot.get('exportedAt'));progress=epoch(snapshot.get('lastProgressAt'))
 if not exported or not progress:return 'insufficient_evidence'
 if now-progress<=1200:return 'healthy_or_waiting'
 due=epoch(snapshot.get('nextRunAt'))
 if not due or due>now-600:return 'not_overdue'
 restarts=[t for t in state.get('restarts',[]) if now-t<86400]
 if len(restarts)>=2 or any(now-t<3600 for t in restarts):return 'restart_budget_exhausted'
 return 'restart'
def main():
 root=pathlib.Path.home()/'.local/share/scout-firefox-test'
 state_path=root/'watchdog-state.json';snapshot_path=pathlib.Path.home()/'Downloads/scout-server-watchdog.json'
 try:snapshot=json.loads(snapshot_path.read_text())
 except (OSError,ValueError):print('Scout watchdog: snapshot unavailable; no restart');return
 try:state=json.loads(state_path.read_text())
 except (OSError,ValueError):state={}
 now=time.time();action=decision(snapshot,state,now)
 active=subprocess.run(['systemctl','--user','is-active','--quiet','scout-amazon.service']).returncode==0
 if action=='restart' and not active:action='service_inactive_operator_review'
 if action=='restart':
  state['restarts']=[t for t in state.get('restarts',[]) if now-t<86400]+[now]
 state.update(checkedAt=now,action=action);state_path.write_text(json.dumps(state));state_path.chmod(0o600)
 print('Scout watchdog: '+action)
 if action=='restart':subprocess.run(['systemctl','--user','restart','scout-amazon.service'],check=True)
if __name__=='__main__':main()
