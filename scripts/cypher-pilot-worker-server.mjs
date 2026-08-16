import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,resolve} from "node:path";
import {execSync} from "node:child_process";
import worker from "../worker.js";
const status=JSON.parse(execSync("npx supabase status --output json",{encoding:"utf8"})),root=resolve("."),types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8"};
const env={CYPHER_SUPABASE_ENABLED:"true",CYPHER_MAX_UPLOAD_BYTES:"15728640",SUPABASE_URL:status.API_URL,SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,ASSETS:{async fetch(request){const raw=new URL(request.url).pathname,path=resolve(root,raw==="/"?"index.html":raw.slice(1));if(!path.startsWith(root))return new Response("denied",{status:403});try{return new Response(await readFile(path),{headers:{"content-type":types[extname(path)]||"application/octet-stream"}})}catch{return new Response("not found",{status:404})}}}};
createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(`http://127.0.0.1:8787${req.url}`,{method:req.method,headers:req.headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks),duplex:"half"});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}).listen(8787,"127.0.0.1",()=>console.log("real Cypher Worker/Supabase adapter ready"));
