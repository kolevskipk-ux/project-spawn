"""Local SQLite work comparison, not Cloudflare billed-row measurements."""
import json, pathlib, re, sqlite3, subprocess

root = pathlib.Path(__file__).resolve().parents[1]
old = subprocess.check_output(['git', 'show', '1a1a93218062a9b4d291111229ba9c50974c68e1:src/store-catalog.ts'], cwd=root, text=True)
new = (root / 'src/store-catalog.ts').read_text()

def database(indexes):
    db = sqlite3.connect(':memory:')
    for path in sorted((root / 'migrations').glob('*.sql')):
        if indexes or not path.name.startswith('0044_'):
            db.executescript(path.read_text(encoding='utf-8-sig'))
    db.execute("INSERT INTO store_acquisitions(id,origin,retailer,vendor_key,created_at) VALUES('s','https://cards.example','Cards','cards','now')")
    db.execute("INSERT INTO store_catalog_runs(id,store_id,status,started_at,started_by) VALUES('r','s','RUNNING','now','test')")
    db.executemany("INSERT INTO store_catalog_pages(run_id,url,kind) VALUES('r',?,'PAGE')", [(f'https://cards.example/products/{i:05}',) for i in range(10000)])
    db.executemany("INSERT INTO monitoring_candidates(candidate_id,source,source_listing_key,source_url,vendor,vendor_key,product_name,product_family,print_series,language,discovered_at,status) VALUES(?,'test',?,?,'Cards','cards','Test','pokemon_tcg','test','english',?,'ACCEPTED')", [(str(i),f'listing-{i%100}',f'https://cards.example/products/{i:05}',str(i)) for i in range(10000)])
    db.executemany("INSERT INTO store_discovery_handoffs VALUES(?,'s',?,'now')", [(str(i),f'https://cards.example/products/{i:05}') for i in range(100)])
    return db

def measure(db, work):
    ticks = 0
    def progress():
        nonlocal ticks
        ticks += 1
        return 0
    db.set_progress_handler(progress, 1)
    work()
    db.set_progress_handler(None, 0)
    return ticks

baseline, repaired = database(False), database(True)
urls = [f'https://cards.example/products/{i:05}' for i in range(500)]
old_insert = re.search(r'prepare\(`(INSERT OR IGNORE INTO store_catalog_pages.*?)`\)', old, re.S).group(1)
new_insert = re.search(r'prepare\(`(WITH capacity AS MATERIALIZED.*?)`\)', new, re.S).group(1)
old_page = re.search(r'prepare\("(SELECT url,kind FROM store_catalog_pages.*?)"\)', old).group(1)
new_pages = [
    (re.search(r'prepare\("(SELECT url,kind FROM store_catalog_pages.*?)"\)', new).group(1), ('r',)),
    (re.search(r'prepare\(`(SELECT p.url,p.kind FROM store_discovery_handoffs.*?)`\)', new, re.S).group(1), ('r','s')),
    (re.search(r'prepare\(`(SELECT url,kind FROM store_catalog_pages.*?)`\)', new, re.S).group(1), ('r',))]
lookup = "SELECT candidate_id FROM monitoring_candidates WHERE source_listing_key=? AND status='ACCEPTED' ORDER BY discovered_at DESC LIMIT 1"
results = {}
results['duplicate_frontier_500_urls'] = [measure(baseline, lambda: [baseline.execute(old_insert,('r',u,'PAGE','r',25000)).fetchall() for u in urls]), measure(repaired, lambda: repaired.execute(new_insert,(25000,'r',json.dumps(urls),'r','r','PAGE')).fetchall())]
results['next_page'] = [measure(baseline, lambda: baseline.execute(old_page,('r',)).fetchall()), measure(repaired, lambda: [repaired.execute(sql,args).fetchall() for sql,args in new_pages])]
results['latest_candidate_100_listings'] = [measure(db, lambda: [db.execute(lookup,(f'listing-{i}',)).fetchall() for i in range(100)]) for db in (baseline,repaired)]
print(json.dumps({'metric':'Approximate SQLite VM instructions; synthetic fixture, not billed rows', 'results':{name:{'before':values[0],'after':values[1],'reduction_percent':round(100*(1-values[1]/values[0]),2)} for name,values in results.items()}},indent=2))
