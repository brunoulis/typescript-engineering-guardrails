const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {getTS,scan}=require('./ts-rails-audit.cjs');
test('AST risk signals without matching strings',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ts-rails-'));
 try{
 fs.writeFileSync(path.join(root,'sample.ts'),`const literal='Promise.all(xs.map(x=>x))';const x:any=1; const y=obj!;try{run()}catch(e){};await Promise.all(rows.map(r=>save(r)));const options={disableCSRFCheck:true};`);
 const results=scan(root,getTS(root)),codes=results.map(r=>r.code);
 for(const c of ['EXPLICIT_ANY','NON_NULL_ASSERTION','EMPTY_CATCH','POTENTIALLY_UNBOUNDED_CONCURRENCY','AUTH_SECURITY_DISABLED'])assert.ok(codes.includes(c),c);
 assert.equal(codes.filter(x=>x==='POTENTIALLY_UNBOUNDED_CONCURRENCY').length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
