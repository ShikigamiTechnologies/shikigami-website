import http from "node:http";
import { extractDocument, normalizeBilingual, createWorkbook } from "../lib/cypher-batch-b-service.js";

const host = "127.0.0.1", port = Number(process.env.CYPHER_BATCH_B_PORT || 4319), maxBody = 1_000_000;
async function body(request) { const chunks=[]; let size=0; for await(const chunk of request){size+=chunk.length;if(size>maxBody)throw new Error("request_limit");chunks.push(chunk);} return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
const server=http.createServer(async(request,response)=>{ try {
  if(request.method==="GET"&&request.url==="/health"){response.writeHead(200,{"content-type":"application/json"});return response.end(JSON.stringify({ok:true,network:"loopback-only",cost_usd:0}));}
  if(request.method==="POST"&&request.url==="/v1/ocr/review"){const input=await body(request);const text=normalizeBilingual(input.text);response.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});return response.end(JSON.stringify({extracted:extractDocument(text),text,evidence:Array.isArray(input.evidence)?input.evidence.slice(0,100):[],instructions_executed:false}));}
  if(request.method==="POST"&&request.url==="/v1/xlsx/export"){const input=await body(request);if(!Array.isArray(input.records)||input.records.length>300)throw new Error("document_limit");const bytes=await createWorkbook(input.records);response.writeHead(200,{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":"attachment; filename=cypher-export.xlsx","content-length":bytes.byteLength});return response.end(Buffer.from(bytes));}
  response.writeHead(404,{"content-type":"application/json"});response.end(JSON.stringify({error:"not_found"}));
}catch(error){response.writeHead(error.message?.includes("limit")?413:400,{"content-type":"application/json"});response.end(JSON.stringify({error:String(error.message||error)}));}});
server.listen(port,host,()=>console.log(`Cypher Batch B local service http://${host}:${port}`));
