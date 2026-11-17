import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { httpFixture } from './http-app.ts';
import type { StartHttpServer } from './types/http-server.ts';

async function bounded(promise:Promise<void>,message:string):Promise<void> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    await Promise.race([promise,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error(message)),5000);})]);
  } finally { clearTimeout(timer); }
}

export async function httpContracts(start:StartHttpServer):Promise<void> {
  const {app,entered,cancelled}=httpFixture();
  const server=await start(request=>app.fetch(request));
  const origin=new URL(server.origin);
  assert.equal(origin.hostname,'127.0.0.1');
  assert.ok(Number(origin.port)>0);
  let closed=false;
  try {
    const post=(body:string)=>fetch(new URL('/count',origin),{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(5000)});
    const valid=await post(JSON.stringify({count:4}));
    assert.equal(valid.status,201);
    assert.deepEqual(await valid.json(),{accepted:true});
    for (const input of [null,[],{},{count:'4'},{count:-1},{count:1001}]) {
      const response=await post(JSON.stringify(input));
      assert.equal(response.status,400);
      assert.deepEqual(await response.json(),{error:'invalid_input'});
    }
    const malformed=await post('{bad');
    assert.equal(malformed.status,400);
    assert.deepEqual(await malformed.json(),{error:'malformed_json'});
    const failed=await fetch(new URL('/fail',origin),{signal:AbortSignal.timeout(5000)});
    assert.equal(failed.status,500);
    assert.equal(await failed.text(),'{"error":"internal_error"}');

    const controller=new AbortController();
    const pending=fetch(new URL('/wait',origin),{signal:controller.signal});
    // Attach rejection handling immediately; abort only after the server registered its signal listener.
    const rejected=assert.rejects(pending,error=>error instanceof Error && error.name==='AbortError');
    try {
      await bounded(entered,'HTTP handler did not receive cancellation test request');
      controller.abort();
      await rejected;
      await bounded(cancelled,'Native server did not observe aborted HTTP request');
    } finally {
      controller.abort();
      await rejected.catch(()=>{});
    }
    await server.close();
    closed=true;
    // A fresh TCP connection bypasses a runtime fetch client's cached keepalive connections.
    // Timeout is not evidence of shutdown: require ECONNREFUSED from the actual closed listener.
    await assert.rejects(new Promise<void>((resolve,reject)=>{
      const socket=connect({host:'127.0.0.1',port:Number(origin.port)});
      socket.once('connect',()=>{socket.destroy();resolve();});
      socket.once('error',reject);
      socket.setTimeout(5000,()=>{socket.destroy();reject(new Error('Closed-listener probe timed out'));});
    }),{code:'ECONNREFUSED'});
    console.log('Real native HTTP Hono contracts passed: validation, redacted errors, propagated disconnect, closed listener',server.origin);
  } finally { if (!closed) await server.close(); }
}
