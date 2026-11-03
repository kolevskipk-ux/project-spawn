import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('watchdog',pathlib.Path(__file__).resolve().parents[1]/'scripts/scout-watchdog.py');watchdog=importlib.util.module_from_spec(spec);spec.loader.exec_module(watchdog)
class WatchdogTests(unittest.TestCase):
 def setUp(self):self.now=200000;self.s={'enabled':True,'exportedAt':(self.now-1800)*1000,'lastProgressAt':(self.now-1800)*1000,'nextRunAt':(self.now-1700)*1000}
 def test_stalled_enabled_collector(self):self.assertEqual(watchdog.decision(self.s,{},self.now),'restart')
 def test_manual_pause_and_safety_stops(self):
  for patch in [{'enabled':False},{'manualPaused':True},{'stopReason':'CHALLENGE'},{'stopReason':'READ_FAILURES'},{'cooldownUntil':(self.now+1000)*1000},{'scheduledPauseUntil':(self.now+1000)*1000}]:self.assertNotEqual(watchdog.decision({**self.s,**patch},{},self.now),'restart')
 def test_live_heartbeat_does_not_hide_stalled_progress(self):
  self.assertEqual(watchdog.decision({**self.s,'exportedAt':self.now*1000},{},self.now),'restart')
  self.assertNotEqual(watchdog.decision({**self.s,'lastProgressAt':self.now*1000},{},self.now),'restart')
 def test_bounded_recovery_and_unknown_evidence(self):
  self.assertEqual(watchdog.decision(self.s,{'restarts':[self.now-60]},self.now),'restart_budget_exhausted');self.assertEqual(watchdog.decision({}, {},self.now),'paused');self.assertEqual(watchdog.decision({**self.s,'lastProgressAt':None},{},self.now),'insufficient_evidence')


class CoverageRecoveryTests(unittest.TestCase):
 def setUp(self):
  self.now=200000
  self.s={'enabled':True,'exportedAt':self.now*1000,'lastProgressAt':self.now*1000,'nextRunAt':(self.now+30)*1000,'history':{}}
  for asin in watchdog.TARGETS:
   self.s['history'][asin]={'checks':[{'state':'error','reason':'PAGE_CHECK_FAILED','observedAt':(self.now-age)*1000,'intake':{'saved':True}} for age in [10,730]]}
 def test_attempts_do_not_hide_fleet_failure(self):self.assertEqual(watchdog.decision(self.s,{},self.now),'restart')
 def test_one_broken_product_does_not_restart_fleet(self):
  for asin in list(watchdog.TARGETS)[1:]:self.s['history'][asin]['checks']=[{'state':'sold_out','observedAt':(self.now-30)*1000,'intake':{'saved':True}}]
  self.assertEqual(watchdog.decision(self.s,{},self.now),'healthy_or_waiting')
 def test_unconfirmed_stock_is_not_a_browser_failure(self):
  for h in self.s['history'].values():h['checks']=[{'state':'unknown','reason':'OTHER_SELLER_FEATURED','title':'Expected product','observedAt':(self.now-30)*1000,'intake':{'saved':True}}]
  self.assertEqual(watchdog.coverage(self.s,self.now)['fresh'],16)
  self.assertEqual(watchdog.decision(self.s,{},self.now),'healthy_or_waiting')
 def test_recovery_grace_and_shared_budget(self):
  self.assertEqual(watchdog.decision(self.s,{'recoveryStartedAt':self.now-60},self.now),'recovery_grace')
  self.assertEqual(watchdog.perform_restart(self.s,{'restarts':[self.now-60]},self.now,True,True),('blocked','restart_budget_exhausted'))
 def test_remote_respects_pause_challenge_and_inactive_service(self):
  for patch in [{'manualPaused':True},{'stopReason':'CHALLENGE'},{'cooldownUntil':(self.now+600)*1000},{'enabled':False}]:self.assertEqual(watchdog.perform_restart({**self.s,**patch},{},self.now,True,True)[0],'blocked')
  self.assertEqual(watchdog.perform_restart(self.s,{},self.now,False,True),('blocked','service_inactive'))
 def test_stale_or_future_snapshots_cannot_authorize_remote_restart(self):
  for age in [301,-30]:self.assertEqual(watchdog.perform_restart({**self.s,'exportedAt':(self.now-age)*1000},{},self.now,True,True),('blocked','snapshot_unavailable'))
 def test_accepted_errors_and_unsaved_reads_do_not_count_as_coverage(self):
  self.assertEqual(watchdog.coverage(self.s,self.now)['fresh'],0)
  for h in self.s['history'].values():h['checks']=[{'state':'sold_out','observedAt':self.now*1000,'intake':{'saved':False}}]
  self.assertEqual(watchdog.coverage(self.s,self.now)['fresh'],0)
 def test_daily_cap_includes_both_restart_paths(self):
  self.assertFalse(watchdog.budget({'restarts':[self.now-3700,self.now-7500]},self.now))



class AgentIntegrationTests(unittest.TestCase):
 def setUp(self):CoverageRecoveryTests.setUp(self)
 def run_agent(self,final_snapshot=None,command=None):
  import tempfile,json,types
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as temp:
   home=pathlib.Path(temp);root=home/'.local/share/scout-firefox-test';(root/'server').mkdir(parents=True)
   (root/'server/private-config.js').write_text("export const AMAZON_COLLECTOR_TOKEN='fixture';")
   calls=[];reports=[]
   def api(token,body=None):
    if body:reports.append(body);return {'ok':True}
    return {'command':command}
   def run(args,**kwargs):calls.append(args);return types.SimpleNamespace(returncode=0)
   with patch.object(watchdog.pathlib.Path,'home',return_value=home),patch.object(watchdog.time,'time',return_value=self.now),patch.object(watchdog,'load_snapshot',side_effect=[self.s,final_snapshot or self.s]),patch.object(watchdog,'api',side_effect=api),patch.object(watchdog.subprocess,'run',side_effect=run):
    watchdog.main()
   state=json.loads((root/'watchdog-state.json').read_text())
   return calls,reports,state
 def test_real_main_uses_fixed_service_and_persists_shared_budget(self):
  calls,reports,state=self.run_agent()
  self.assertEqual([c for c in calls if 'restart' in c],[['systemctl','--user','restart','scout-amazon.service']])
  self.assertEqual(state['restarts'],[self.now]);self.assertFalse(state['recoveryVerified'])
  self.assertEqual(reports[-1]['state'],'recovering');self.assertFalse(reports[-1]['restartAvailable'])
 def test_pause_arriving_during_network_io_prevents_restart(self):
  calls,reports,state=self.run_agent({**self.s,'manualPaused':True})
  self.assertFalse(any('restart' in c for c in calls));self.assertEqual(state['action'],'manual_pause')
 def test_owner_command_is_claimed_before_fixed_restart(self):
  calls,reports,state=self.run_agent(command={'id':'12345678-1234-1234-1234-123456789abc','expiresAt':(self.now+600)*1000})
  self.assertEqual(reports[0]['action'],'claim');self.assertEqual(reports[1]['action'],'result')
  self.assertEqual(reports[1]['status'],'restarted');self.assertEqual(len(state['processedCommands']),1)



class ApiClientTests(unittest.TestCase):
 def test_client_identifies_itself_without_changing_destination_or_auth(self):
  import io
  from unittest.mock import patch,MagicMock
  opener=MagicMock();opener.open.return_value.__enter__.return_value=io.StringIO('{"command":null}')
  with patch.object(watchdog.urllib.request,'build_opener',return_value=opener):
   self.assertEqual(watchdog.api('fixture'),{'command':None})
  request=opener.open.call_args.args[0]
  self.assertEqual(request.full_url,watchdog.ENDPOINT)
  self.assertEqual(request.get_header('User-agent'),'Garfield-Scout-Recovery/1.0')
  self.assertEqual(request.get_header('Authorization'),'Bearer fixture')
 def test_redirects_remain_disabled(self):
  import io
  from unittest.mock import patch,MagicMock
  opener=MagicMock();opener.open.return_value.__enter__.return_value=io.StringIO('{}')
  with patch.object(watchdog.urllib.request,'build_opener',return_value=opener) as build:watchdog.api('fixture')
  self.assertIsNone(build.call_args.args[0].redirect_request(None,None,302,'redirect',{},'https://other.test'))



class DynamicCoverageTests(unittest.TestCase):
 def test_loaded_catalog_controls_coverage_denominator(self):
  ids=list(watchdog.TARGETS)+['B0HG3JBNBN','B0HG47DGH4','B0GXC89N66'];now=200000
  s={'collectorCatalog':{'version':'a'*64,'items':[{'asin':i} for i in ids]},'history':{i:{'checks':[{'state':'sold_out','observedAt':(now-10)*1000,'intake':{'saved':True}}]} for i in watchdog.TARGETS}}
  c=watchdog.coverage(s,now);self.assertEqual(c['total'],19);self.assertEqual(c['fresh'],16)
 def test_invalid_catalog_cannot_authorize_recovery(self):
  now=200000;s={'enabled':True,'exportedAt':now*1000,'lastProgressAt':now*1000,'collectorCatalog':{'version':'a'*64,'items':[{'asin':{}}]}}
  self.assertEqual(watchdog.decision(s,{},now),'insufficient_evidence')
if __name__=='__main__':unittest.main()
