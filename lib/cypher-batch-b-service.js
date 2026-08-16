import JSZip from "jszip";

export const LIMITS = Object.freeze({ maxBytes: 4_000_000, maxPages: 4, maxWidth: 2400, maxHeight: 3200, maxDocuments: 300, maxWorkbookRows: 2000, maxWorkbookSheets: 5, maxWorkbookBytes: 2_000_000 });
const formulaPrefix = /^[=+\-@\t\r]/;
export function safeSpreadsheetText(value) { const text=String(value??""); return formulaPrefix.test(text)?`'${text}`:text; }
export function normalizeBilingual(text) { return String(text||"").normalize("NFKC").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
const first=(text,patterns)=>patterns.map(p=>text.match(p)?.[1]).find(Boolean)||null;
const number=(v)=>v==null?null:Number(String(v).replace(/[$,]/g,""));
const dateValue=(v)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;

// Pure parser: its only inputs are OCR text and optional OCR line/bounding evidence.
export function extractDocument(text,evidence=[]) {
  const normalized=normalizeBilingual(text), lines=normalized.split("\n").map(x=>x.trim()).filter(Boolean);
  const document_number=first(normalized,[/(?:No\.?|Number|Numero|Número|#)\s*[:#]?\s*([A-Z]{1,4}-\d{4,6})/i,/\b((?:INV|REC|CM|ST|DEL)-\d{4,6})\b/i]);
  const po_number=first(normalized,[/(?:^|\n)(?:PO(?:\s*\/\s*Orden de compra)?|Orden de compra)\s*[:#]\s*(PO-\d{5})/im,/\b(PO-\d{5})\b/i]);
  const itemPattern=/^(.*?)\s+(\d+)\s*x\s*\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})$/i;
  const line_items=lines.map(line=>line.match(itemPattern)).filter(Boolean).map(m=>({description:m[1].trim(),quantity:Number(m[2]),unit_price:number(m[3]),amount:number(m[4])}));
  const labelled=(labels)=>first(normalized,labels);
  const vendor=lines.find(line=>!/:|\$|\d{4}-\d{2}-\d{2}/.test(line)&&!/invoice|factura|receipt|recibo|statement|estado|delivery|entrega|purchase|orden|memo/i.test(line))||null;
  const result={
    vendor, location:labelled([/(?:Location|Ubicacion|Ubicación)\s*:\s*([A-Z]{3}-\d{2})/i]), document_number, po_number,
    issue_date:dateValue(labelled([/(?:Issue|Fecha)\s*:\s*(\d{4}-\d{2}-\d{2})/i])), due_date:dateValue(labelled([/(?:Due|Vence|Vencimiento)\s*:\s*(\d{4}-\d{2}-\d{2})/i])),
    subtotal:number(labelled([/(?:Subtotal)\s*:\s*\$?([\d,]+\.\d{2})/i])), tax:number(labelled([/(?:Tax|Impuesto)\s*:\s*\$?([\d,]+\.\d{2})/i])), total:number(labelled([/(?:^|\n)(?:Grand Total|TOTAL|Total)\s*:\s*\$?([\d,]+\.\d{2})/im])),
    currency:/\$|USD/i.test(normalized)?"USD":null, line_items, evidence,
  };
  return result;
}
export function validateUpload({bytes,pages=1,width=1,height=1,mime="image/png"}) { if(!Number.isInteger(bytes)||bytes<1||bytes>LIMITS.maxBytes)throw new Error("size_limit"); if(!Number.isInteger(pages)||pages<1||pages>LIMITS.maxPages)throw new Error("page_limit"); if(width>LIMITS.maxWidth||height>LIMITS.maxHeight)throw new Error("dimension_limit"); if(!new Set(["image/png","image/jpeg","application/pdf"]).has(mime))throw new Error("unsupported_media"); }
const dateCell=(v)=>v||null;
const xml=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const col=n=>{let s="";for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const sheetXml=rows=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>v==null?"":typeof v==="number"?`<c r="${col(ci+1)}${ri+1}"><v>${v}</v></c>`:`<c r="${col(ci+1)}${ri+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
export async function createWorkbook(records) {
  if(records.length>LIMITS.maxDocuments)throw new Error("document_limit");
  const definitions={Documents:["id","status","vendor","location","document_number","po_number","issue_date","due_date","subtotal","tax","total","ocr_confidence"],"Line Items":["document_id","description","quantity","unit_price","amount"],Exceptions:["document_id","code","detail"],"Obligations Aging":["document_id","vendor","due_date","amount","days_due","bucket"],Artifacts:["id","artifact","sha256","mime","byte_status"]};
  const sheets=Object.fromEntries(Object.entries(definitions).map(([name,headers])=>[name,[headers]]));
  for(const record of records){const x=record.extracted||{},o=record.ocr||{},id=record.id;
    sheets.Documents.push([id,record.error?"rejected":"extracted",safeSpreadsheetText(x.vendor),x.location,x.document_number,x.po_number,dateCell(x.issue_date),dateCell(x.due_date),x.subtotal,x.tax,x.total,o.confidence??null]);
    for(const item of x.line_items||[])sheets["Line Items"].push([id,safeSpreadsheetText(item.description),item.quantity,item.unit_price,item.amount]);
    if(record.error||o.confidence<75)sheets.Exceptions.push([id,record.error||"low_confidence",safeSpreadsheetText(record.error||"OCR confidence below review threshold")]);
    if(x.due_date&&x.total!=null){const days=Math.floor((Date.parse("2026-08-15")-Date.parse(x.due_date))/86400000);sheets["Obligations Aging"].push([id,safeSpreadsheetText(x.vendor),dateCell(x.due_date),x.total,days,days<=0?"current":days<=30?"1-30":"31+"]);}
    sheets.Artifacts.push([id,record.artifact,record.sha256,record.mime,record.error?"invalid":"parsed"]);
  }
  if(Object.keys(sheets).length>LIMITS.maxWorkbookSheets||Object.values(sheets).reduce((s,w)=>s+w.length,0)>LIMITS.maxWorkbookRows)throw new Error("workbook_limit");
  const zip=new JSZip();zip.file("[Content_Types].xml",`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${Object.keys(sheets).map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);zip.file("_rels/.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);zip.file("xl/workbook.xml",`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${Object.keys(sheets).map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);zip.file("xl/_rels/workbook.xml.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.keys(sheets).map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}</Relationships>`);Object.values(sheets).forEach((rows,i)=>zip.file(`xl/worksheets/sheet${i+1}.xml`,sheetXml(rows)));
  const bytes=Buffer.from(await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}));if(bytes.length>LIMITS.maxWorkbookBytes)throw new Error("workbook_size_limit");return bytes;
}
