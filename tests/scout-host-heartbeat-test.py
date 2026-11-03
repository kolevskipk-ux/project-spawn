import importlib.util,pathlib,unittest,tempfile,json,io
from unittest.mock import patch,MagicMock
spec=importlib.util.spec_from_file_location('host',pathlib.Path(__file__).resolve().parents[1]/'scripts/scout-host-heartbeat.py');host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
class HostHeartbeatTests(unittest.TestCase):
 def setUp(self):self.now=200000
 def test_missing_export_still_produces_host_heartbeat(self):
  with tempfile.TemporaryDirectory() as temp,patch.object(host,'service_state',return_value=('inactive',None)),patch.object(host,'desktop_state',return_value='inactive'):
   report=host.collect(pathlib.Path(temp),self.now)
  self.assertEqual(report['desktop'],'inactive');self.assertEqual(report['amazonService'],'inactive');self.assertIsNone(report['snapshotAt']);self.assertEqual(report['acceptedFresh'],0)
 def test_corrupt_or_malformed_export_does_not_stop_host_reporting(self):
  for content in ['not json',json.dumps({'history':[]}),json.dumps({'history':{next(iter(host.TARGETS)):{'checks':[None]}}})]:
   with tempfile.TemporaryDirectory() as temp,patch.object(host,'service_state',return_value=('unknown',None)),patch.object(host,'desktop_state',return_value='unknown'):
    root=pathlib.Path(temp);(root/'Downloads').mkdir();(root/'Downloads/scout-server-health.json').write_text(content)
    report=host.collect(root,self.now);self.assertEqual(report['schemaVersion'],1);self.assertEqual(report['acceptedFresh'],0)
 def test_desktop_probe_excludes_ssh_and_greeter(self):
  with patch.object(host,'command',side_effect=['1 2','Type=tty\nClass=user\nActive=yes\nRemote=yes','Type=wayland\nClass=greeter\nActive=yes\nRemote=no']):self.assertEqual(host.desktop_state(),'inactive')
  with patch.object(host,'command',side_effect=['1','Type=wayland\nClass=user\nActive=yes\nRemote=no']):self.assertEqual(host.desktop_state(),'active')
  with patch.object(host,'command',return_value=None):self.assertEqual(host.desktop_state(),'unknown')
 def test_service_probe_is_read_only_and_survives_missing_user_bus(self):
  with patch.object(host,'command',return_value=None) as command:
   self.assertEqual(host.service_state('scout-amazon.service',self.now),('unknown',None));self.assertEqual(command.call_args.args[0][:3],['systemctl','--user','show'])
 def test_local_read_and_accepted_receipt_are_separate(self):
  checks={'history':{asin:{'checks':[{'observedAt':(self.now-10)*1000,'state':'sold_out','intake':{'mode':'spawn','saved':False}}]} for asin in host.TARGETS},'exportedAt':self.now*1000,'enabled':True,'manualPaused':False}
  report=host.summarize(checks,self.now);self.assertEqual(report['localFresh'],16);self.assertEqual(report['acceptedFresh'],0);self.assertEqual(report['intakeFailures'],16)
 def test_errors_never_become_coverage_and_old_errors_expire(self):
  asin=next(iter(host.TARGETS));rows=[{'observedAt':(self.now-10)*1000,'state':'error','reason':'PAGE_CHECK_FAILED'},{'observedAt':(self.now-901)*1000,'state':'blocked'}]
  report=host.summarize({'history':{asin:{'checks':rows}}},self.now)
  self.assertEqual(report['runtimeErrors'],1);self.assertEqual(report['blockedReads'],0);self.assertEqual(report['localFresh'],0)
 def test_future_observation_is_not_readable_evidence(self):
  asin=next(iter(host.TARGETS));report=host.summarize({'history':{asin:{'checks':[{'observedAt':(self.now+20)*1000,'state':'sold_out','intake':{'saved':True}}]}}},self.now)
  self.assertEqual(report['localFresh'],0);self.assertIsNone(report['lastAttemptAt'])
 def test_stale_export_keeps_its_original_timestamp(self):
  report=host.summarize({'exportedAt':(self.now-600)*1000,'enabled':True},self.now)
  self.assertEqual(host.epoch(report['snapshotAt']),self.now-600)
 def test_service_timeout_is_unknown_without_attempting_repair(self):
  with patch.object(host.subprocess,'run',side_effect=host.subprocess.TimeoutExpired('test',3)) as run:self.assertIsNone(host.command(['loginctl','show-user','1000']));self.assertEqual(run.call_count,1)
 def test_network_client_is_fixed_authenticated_and_refuses_redirects(self):
  response=MagicMock();response.status=200;opener=MagicMock();opener.open.return_value.__enter__.return_value=response
  with patch.object(host.urllib.request,'build_opener',return_value=opener) as build:self.assertEqual(host.send({'schemaVersion':1},'fixture'),200)
  request=opener.open.call_args.args[0];self.assertEqual(request.full_url,host.HOST_ENDPOINT);self.assertEqual(request.get_header('User-agent'),'Garfield-Scout-Host/1.0');self.assertEqual(request.get_header('Authorization'),'Bearer fixture')
  self.assertIsNone(build.call_args.args[0].redirect_request(None,None,302,'redirect',{},'https://other.test'))


class AdditionalSessionTests(unittest.TestCase):
 def test_missing_user_manager_can_still_report_no_graphical_login(self):
  with patch.object(host,'command',side_effect=[None,'']):self.assertEqual(host.desktop_state(),'inactive')
 def test_empty_session_details_are_unknown_not_a_confirmed_logout(self):
  with patch.object(host,'command',side_effect=['6','']):self.assertEqual(host.desktop_state(),'unknown')
 def test_loginctl_properties_are_requested_individually(self):
  with patch.object(host,'command',side_effect=['6','Type=wayland\nClass=user\nActive=yes\nRemote=no']) as command:
   self.assertEqual(host.desktop_state(),'active')
  args=command.call_args.args[0];self.assertIn('--property=Type',args);self.assertIn('--property=Remote',args);self.assertNotIn('--property=Type,Class,Active,Remote',args)



class DynamicHostTests(unittest.TestCase):
 def test_reports_enrolled_catalog_and_its_version(self):
  ids=list(host.TARGETS)+['B0HG3JBNBN','B0HG47DGH4','B0GXC89N66']
  result=host.summarize({'collectorCatalog':{'version':'b'*64,'items':[{'asin':i} for i in ids]}},200000)
  self.assertEqual(result['targetCount'],19);self.assertEqual(result['catalogVersion'],'b'*64);self.assertEqual(result['acceptedFresh'],0)
 def test_malformed_catalog_does_not_become_legacy_healthy_coverage(self):
  result=host.summarize({'collectorCatalog':{'version':'b'*64,'items':[{'asin':{}}]}},200000)
  self.assertEqual(result['targetCount'],0);self.assertEqual(result['localFresh'],0)
if __name__=='__main__':unittest.main()
