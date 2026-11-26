import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assess} from './evidence.mjs';
const expected={repo:'SupraShellScripts/userscripts',runId:45707342217,attempt:1,jobCount:1,head:'41ef5ec57a892c944daf4cdd98d839ddb3b309ad'};
const prefix='https://api.github.com/repos/'+expected.repo+'/actions/runs/'+expected.runId;
async function read(suffix){
 const r=await fetch(prefix+suffix,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/vnd.github+json','user-agent':'public-evidence-baseline'}});
 if(!r.ok)throw Error('http-'+r.status);
 let bytes=0;const parts=[];const reader=r.body.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024)throw Error('response-budget');parts.push(Buffer.from(value));}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
let receipt={schema:1,scope:'anonymous public run metadata; no artifact download',observedAt:new Date().toISOString(),expected};
try{
 const [run,jobs,artifacts]=await Promise.all([read(''),read('/attempts/1/jobs?per_page=100'),read('/artifacts?per_page=100')]);
 assert.equal(jobs.total_count,jobs.jobs.length);assert.equal(artifacts.total_count,artifacts.artifacts.length);
 receipt.result=assess({expected,run,jobs:jobs.jobs,artifacts:artifacts.artifacts});
 assert.equal(receipt.result.status,'run-metadata-consistent');
}catch(e){receipt.errorClass=e.name;receipt.category=/^http-\d+$/.test(e.message)?e.message:'consistency-or-runtime';process.exitCode=1;}
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/source-hosting-evidence.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
