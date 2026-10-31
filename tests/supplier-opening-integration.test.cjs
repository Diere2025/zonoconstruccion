// Reuse the exercised financial-core fixture, then run opening-specific assertions in its transaction.
const fs=require('fs'),Module=require('module'),assert=require('assert/strict');
const fixture=fs.readFileSync('tests/supplier-item-applications.test.cjs','utf8'),marker=" await db.query('rollback');console.log('PASS local PostgreSQL:";
assert.equal(fixture.split(marker).length,2,'The integration fixture exit must remain unique');
const extra=fs.readFileSync('tests/fixtures/supplier-opening-integration.cjs','utf8');
const harness=new Module(__filename,module);harness.filename=__filename;harness.paths=module.paths;harness._compile(fixture.replace(marker,extra+'\n'+marker).replace('console.error(e.message)','console.error(e.message,e.where||e.context||e.stack)'),__filename);
