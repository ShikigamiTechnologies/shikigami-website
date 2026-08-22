import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
const root=resolve("."), types={".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",".js":"text/javascript;charset=utf-8",".woff2":"font/woff2"};
createServer(async(req,res)=>{try{const raw=new URL(req.url,"http://127.0.0.1").pathname,path=resolve(root,raw==="/"?"index.html":raw.slice(1));if(!path.startsWith(root))throw Error("denied");const body=await readFile(path);res.writeHead(200,{"content-type":types[extname(path)]||"application/octet-stream"});res.end(body);}catch{res.writeHead(404);res.end("not found");}}).listen(8787,"127.0.0.1",()=>console.log("cypher test server ready"));
