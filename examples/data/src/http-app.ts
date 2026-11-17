import { Hono } from 'hono';

function barrier() {
  let resolve = () => {};
  const promise = new Promise<void>(complete => {resolve=complete;});
  return {promise,resolve};
}

export function httpFixture() {
  const app = new Hono();
  const entered=barrier();
  const cancelled=barrier();
  app.onError((_error,context)=>context.json({error:'internal_error'},500));
  app.post('/count',async context => {
    let body:unknown;
    try { body=await context.req.json(); }
    catch { return context.json({error:'malformed_json'},400); }
    if (!body || typeof body!=='object' || Array.isArray(body) || !('count' in body)
      || typeof body.count!=='number' || !Number.isInteger(body.count) || body.count<0 || body.count>1000) {
      return context.json({error:'invalid_input'},400);
    }
    return context.json({accepted:true},201);
  });
  app.get('/fail',()=>{throw new Error('private database password=never-expose-this');});
  app.get('/wait',async context=>{
    const signal=context.req.raw.signal;
    await new Promise<void>((resolve,reject)=>{
      const stop=()=>{clearTimeout(deadline);cancelled.resolve();resolve();};
      const deadline=setTimeout(()=>{
        signal.removeEventListener('abort',stop);
        reject(new Error('Client disconnect was not propagated before fixture deadline'));
      },3000);
      if (signal.aborted) stop();
      else signal.addEventListener('abort',stop,{once:true});
      entered.resolve();
    });
    return new Response(null,{status:499});
  });
  return {app,entered:entered.promise,cancelled:cancelled.promise};
}
