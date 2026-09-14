import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root=resolve('.');
const allowed=new Set(['/', '/school','/school.html','/es/school','/es/school.html','/privacy','/terms']);
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{try {
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(req.method!=='GET'||(!allowed.has(path)&&!path.startsWith('/assets/')))throw Error('not public');
 const file=resolve(root,path==='/'?'index.html':path.slice(1)+(extname(path)?'':'.html'));
 if(!file.startsWith(root+sep))throw Error('not public');
 const body=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(body);
}catch{res.writeHead(404);res.end('Not found');}}).listen(8791,'127.0.0.1',()=>console.log('School static preview: http://127.0.0.1:8791/school'));
