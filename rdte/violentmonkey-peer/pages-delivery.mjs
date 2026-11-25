import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='https://suprashellscripts.github.io/userscripts/scripts/totalphase-batch-downloader/';
const id='totalphase-batch-downloader';
const version='1.1.1';
const expected=[
 {role:'stable-metadata',path:`${id}.meta.js`,sha:'d5e4b1fcb8865324f1213954d30ce670d707cc55851035f7663a883dc7de00eb'},
 {role:'stable-body',path:`${id}.user.js`,sha:'22cef0ba5a949b2ed92605fc80740a33848754df60996dd3e2ec61840d976b36'},
 {role:'immutable-body',path:`versions/${version}/${id}.user.js`,sha:'22cef0ba5a949b2ed92605fc80740a33848754df60996dd3e2ec61840d976b36'},
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:1,sourceCommit:'d576c541e5fff95b5a08b574efbc62f3200116c2',version,observedAt:new Date().toISOString(),results:[],headerCoherent:false};
const bodies=new Map();
for(const item of expected){
 const row={role:item.role,httpStatus:null,sha256:null,bytes:0,match:false,error:null};
 try{
  const response=await fetch(new URL(item.path,base),{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});
  row.httpStatus=response.status;assert.equal(response.status,200);
  const parts=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error('body-limit');parts.push(chunk);}
  const bytes=Buffer.concat(parts);row.bytes=bytes.length;row.sha256=hash(bytes);row.match=row.sha256===item.sha;
  if(!row.match)throw Error('digest-mismatch');
  bodies.set(item.role,bytes.toString('utf8'));
 }catch(e){row.error=e.message==='body-limit'||e.message==='digest-mismatch'?e.message:e.name==='TimeoutError'?'timeout':'http-or-network';process.exitCode=1;}
 report.results.push(row);
}
function header(text){const lines=text.split(/\r?\n/);const end=lines.indexOf('// ==/UserScript==');assert.equal(lines[0],'// ==UserScript==');assert.ok(end>0);return lines.slice(0,end+1).join('\n');}
try{const m=header(bodies.get('stable-metadata'));const b=header(bodies.get('stable-body'));assert.equal(m,b);assert.equal(bodies.get('stable-body'),bodies.get('immutable-body'));assert.match(m,/^\/\/ @version\s+1\.1\.1\s*$/m);report.headerCoherent=true;}catch{process.exitCode=1;}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/pages-delivery.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
