import { serve } from 'bun';
import { httpContracts } from './http-contracts.ts';

export async function bunHttpContracts():Promise<void> {
  await httpContracts(async handler=>{
    const server=serve({hostname:'127.0.0.1',port:0,fetch:handler,development:false});
    if (!server.port) {await server.stop(true);throw new Error('Bun did not allocate an ephemeral TCP port');}
    return {origin:`http://127.0.0.1:${server.port}`,async close(){await server.stop(true);}};
  });
}
