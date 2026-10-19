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
if __name__=='__main__':unittest.main()
