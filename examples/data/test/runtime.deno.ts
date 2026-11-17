import { runtimeContracts } from '../src/runtime-suite.ts';
import { httpContracts } from '../src/http-contracts.ts';
Deno.test('Deno npm postgres.js real databases, transactions and Timescale reference contracts', runtimeContracts);
Deno.test('Deno native HTTP Hono validation, errors, disconnect and lifecycle',async()=>{
  await httpContracts(async handler=>{
    const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen(){}},handler);
    return {origin:`http://127.0.0.1:${server.addr.port}`,async close(){await server.shutdown();await server.finished;}};
  });
});
