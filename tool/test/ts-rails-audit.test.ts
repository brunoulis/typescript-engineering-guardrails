import type { TestContext } from 'node:test';
import type { Finding } from '../src/types/report.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getTS, scan } from '../src/index.js';
test('AST risk signals without matching strings',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ts-rails-'));
 try{
 fs.writeFileSync(path.join(root,'sample.ts'),`const literal='Promise.all(xs.map(x=>x))';const x:any=1; const y=obj!;try{run()}catch(e){};await Promise.all(rows.map(r=>save(r)));const options={disableCSRFCheck:true};`);
 const results=scan(root,getTS(root)),codes=results.map((r: Finding)=>r.code);
 for(const c of ['EXPLICIT_ANY','NON_NULL_ASSERTION','EMPTY_CATCH','POTENTIALLY_UNBOUNDED_CONCURRENCY','AUTH_SECURITY_DISABLED'])assert.ok(codes.includes(c),c);
 assert.equal(codes.filter(x=>x==='POTENTIALLY_UNBOUNDED_CONCURRENCY').length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
