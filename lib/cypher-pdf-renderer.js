import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";

// The bundled override currently points at a stale layout; pin its vendored Poppler executable directly.
export const PDFTOPPM = "C:\\Users\\ranto\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe";
function run(args){return new Promise((resolve,reject)=>{const child=spawn(PDFTOPPM,args,{windowsHide:true});let stderr="";child.stderr.on("data",x=>stderr+=x);child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(`pdf_render_failure:${stderr.trim().slice(0,240)}`)));});}
export async function renderPdfBytes(bytes){if(!Buffer.from(bytes).subarray(0,5).toString().startsWith("%PDF-"))throw new Error("pdf_signature");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"cypher-pdf-"));try{const input=path.join(dir,"input.pdf"),prefix=path.join(dir,"page");await fs.writeFile(input,bytes);await run(["-f","1","-singlefile","-r","150","-png",input,prefix]);return await fs.readFile(`${prefix}.png`);}finally{await fs.rm(dir,{recursive:true,force:true});}}
