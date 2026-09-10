// Local synthetic rehearsal only. No network, credentials or production database.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('customer-migrations').filter(f=>f.endsWith('.sql')).sort())
 db.exec(readFileSync(`customer-migrations/${file}`,'utf8'));
const stamp='2026-09-09T00:00:00.000Z';
for(const id of ['closing','unrelated']){
 db.prepare('INSERT INTO customer_members(id,email,created_at) VALUES(?,?,?)').run(id,`${id}@example.test`,stamp);
 db.prepare('INSERT INTO customer_rate_limits VALUES(?,?,?)').run(`${id}@example.test`,Math.floor(Date.now()/60000),1);
 db.prepare('INSERT INTO customer_discord_links(customer_id,discord_user_id,guild_id,linked_at) VALUES(?,?,?,?)').run(id,`discord-${id}`,'test-guild',stamp);
 db.prepare('INSERT INTO customer_discord_states(state_hash,customer_id,expires_at) VALUES(?,?,?)').run(`hash-${id}`,id,stamp);
 db.prepare('INSERT INTO customer_discord_role_sync(customer_id) VALUES(?)').run(id);
 db.prepare('INSERT INTO customer_terms_acceptances VALUES(?,?,?,1)').run(id,'test-version',stamp);
 db.prepare('INSERT INTO customer_support(id,customer_id,kind,message,created_at,consent_version,consent_at) VALUES(?,?,?,?,?,?,?)').run(`ticket-${id}`,id,'account_removal','Synthetic fixture',stamp,'PP-SUPPORT-TRANSFER-0.3.3',stamp);
}
db.prepare('INSERT INTO customer_listings VALUES(?,?,?,?,?,?,?,?,?)').run('shared','Shared fixture','set','store','en',10,'unknown',stamp,'PUBLISHED');

const tables=['customer_support','customer_discord_states','customer_discord_role_sync','customer_discord_links','customer_terms_acceptances','customer_access_decisions'];
function closeFixture(id,email){
 db.exec('BEGIN');
 try{
  const account=db.prepare('SELECT id,email FROM customer_members WHERE id=? AND email=?').get(id,email);
  assert.ok(account,'Exact account and email must match');
  db.prepare("UPDATE customer_members SET status='REVOKED',version=version+1,updated_at=?,updated_by='fixture-operator',change_reason='Synthetic closure rehearsal' WHERE id=?").run(stamp,id);
  assert.equal(db.prepare('SELECT count(*) n FROM customer_access_decisions WHERE customer_id=?').get(id).n,1);
  // In production, stop/serialize deliveries and remove controlled Discord copies
  // first. This rehearsal proves only SQL ordering, isolation and restoration replay.
  for(const table of tables)db.prepare(`DELETE FROM ${table} WHERE customer_id=?`).run(id);
  db.prepare('DELETE FROM customer_rate_limits WHERE subject=?').run(email);
  db.prepare('DELETE FROM customer_members WHERE id=? AND email=?').run(id,email);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
assert.throws(()=>closeFixture('closing','unrelated@example.test'));
assert.equal(db.prepare('SELECT count(*) n FROM customer_members').get().n,2);
closeFixture('closing','closing@example.test');
for(const table of tables)assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE customer_id='closing'`).get().n,0);
assert.equal(db.prepare("SELECT count(*) n FROM customer_rate_limits WHERE subject='closing@example.test'").get().n,0);
assert.equal(db.prepare("SELECT count(*) n FROM customer_members WHERE id='unrelated'").get().n,1);
assert.equal(db.prepare("SELECT count(*) n FROM customer_support WHERE customer_id='unrelated'").get().n,1);
assert.equal(db.prepare('SELECT count(*) n FROM customer_listings').get().n,1);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
// Model recovery of a previously removed account; replay the restricted closure
// record before reopening the recovered database to customers or retry workers.
db.prepare('INSERT INTO customer_members(id,email,created_at) VALUES(?,?,?)').run('closing','closing@example.test',stamp);
db.prepare('INSERT INTO customer_support(id,customer_id,kind,message,created_at) VALUES(?,?,?,?,?)').run('restored-ticket','closing','general','Restored fixture',stamp);
closeFixture('closing','closing@example.test');
assert.equal(db.prepare("SELECT count(*) n FROM customer_support WHERE customer_id='closing'").get().n,0);
assert.equal(db.prepare('SELECT count(*) n FROM customer_listings').get().n,1);
db.close();
console.log('PASS: exact-account guard, atomic closure, FK-safe ordering, unrelated-account/inventory preservation, and restoration replay.');
console.log('Not verified here: live Discord message/role removal, mailbox copies, provider backups, or concurrent in-flight delivery coordination.');
