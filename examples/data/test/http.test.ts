import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpFixture } from '../src/http-app.ts';

test('HTTP JSON boundary accepts only the bounded count contract', async () => {
  const {app}=httpFixture();
  const valid=await app.request('/count',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({count:4})});
  assert.equal(valid.status,201);
  assert.deepEqual(await valid.json(),{accepted:true});
  for (const input of [null,[],{}, {count:'4'}, {count:-1},{count:1001}]) {
    const invalid=await app.request('/count',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    assert.equal(invalid.status,400);
    assert.deepEqual(await invalid.json(),{error:'invalid_input'});
  }
  const malformed=await app.request('/count',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'});
  assert.equal(malformed.status,400);
  assert.deepEqual(await malformed.json(),{error:'malformed_json'});
});
