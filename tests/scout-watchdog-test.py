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

if __name__=='__main__':unittest.main()
