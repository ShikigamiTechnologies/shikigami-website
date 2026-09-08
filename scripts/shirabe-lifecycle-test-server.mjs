// Loopback-only browser -> actual Worker -> local D1; email transport is synthetic.
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('.');
const compiled=await build({entryPoints:['tests/fixtures/shirabe-lifecycle-entry.mjs'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:*','node:*']});
const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-08-08',compatibilityFlags:['nodejs_compat'],d1Databases:['LEADS'],bindings:{DEPLOYMENT_ENV:'local-test',SHIRABE_ADMIN_TOKEN:'synthetic-admin-only',LEAD_HASH_PEPPER:'synthetic-only'},serviceBindings:{ASSETS:async request=>{
  const pathname=decodeURIComponent(new URL(request.url).pathname);
  const file=resolve(root,pathname.slice(1)+(pathname.endsWith('/')?'index.html':''));
  if (!file.startsWith(root+sep) || !/\.(html|css|js|woff2|svg|png|ico|pdf)$/.test(file)) return new Response('denied',{status:404});
  try {return new Response(await readFile(file),{headers:{'content-type':({'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}});} catch {return new Response('missing',{status:404});}
}}});
const db=await mf.getD1Database('LEADS');
for(const file of (await readdir('migrations')).filter(x=>x.endsWith('.sql')).sort()) {
  const sql=await readFile(resolve('migrations',file),'utf8');
  for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean)) await db.prepare(statement).run();
}
await db.prepare('CREATE TABLE test_notifications(subject TEXT)').run();
const server=createServer(async(req,res)=>{try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>40000)throw Error('too large');chunks.push(chunk);}
  const headers={...req.headers};if(headers.origin)headers.origin='https://shikigamitechnologies.com';
  const response=await mf.dispatchFetch('https://shikigamitechnologies.com'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(500);res.end('local test error');console.error(error.message);}});
server.listen(8891,'127.0.0.1',()=>console.log('SHIRABE local lifecycle ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{server.close();await mf.dispose();process.exit(0);});
