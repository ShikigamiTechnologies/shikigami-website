// Read-only public GET sampling. This is not intake/D1/email transaction latency.
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
const rows=[];
for(let i=0;i<20;i++){
  const language=i%2?'es':'en',path=language==='es'?'/es/servicios/shirabe/':'/services/shirabe/';
  const start=performance.now();
  try{
    const response=await fetch('https://shikigamitechnologies.com'+path,{signal:AbortSignal.timeout(10000),redirect:'error'});
    let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1000000)throw Error('body_limit');}
    rows.push({language,status:response.status,ms:Math.round(performance.now()-start),bytes});
  }catch(error){rows.push({language,error:error.name,ms:Math.round(performance.now()-start)});}
}
const times=rows.filter(r=>r.status===200).map(r=>r.ms).sort((a,b)=>a-b);
const result={observed_at:new Date().toISOString(),scope:'20 sequential public page GETs from one operator machine; not customer transaction latency',thresholds:{p95_ms:3000,maximum_errors:0},rows,p50_ms:times[Math.ceil(times.length*.5)-1]??null,p95_ms:times[Math.ceil(times.length*.95)-1]??null,errors:rows.filter(r=>r.status!==200).length,actual_cost_usd:null,cost_status:'not attributable from GET receipts; no zero-cost assertion'};
result.passed=result.errors===0 && result.p95_ms!==null && result.p95_ms<=3000;
await writeFile('reports/shirabe/public-get-sample-2026-09-08.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
