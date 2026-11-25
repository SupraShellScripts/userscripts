import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {project,comparePinned,acquisitionDisposition} from './projection.mjs';
const receipt={schema:1,scope:'anonymous public metadata only; no weights downloaded',cases:[]};
const origin='https://huggingface.co';
async function metadata(repo,revision){
 const url=origin+'/api/models/'+repo+(revision?'/revision/'+revision:'')+'?blobs=true';
 const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/json'}});
 if(!res.ok)throw Error('http-'+res.status);
 const reader=res.body.getReader();let n=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>2*1024*1024)throw Error('metadata-size-limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
for(const repo of ['hf-internal-testing/tiny-random-bert','sshleifer/tiny-gpt2']){
 try{
  const first=project(await metadata(repo),repo);
  const pinned=project(await metadata(repo,first.revision),repo);
  comparePinned(first,pinned);
  const fingerprint=createHash('sha256').update(JSON.stringify(pinned)).digest('hex');
  receipt.cases.push({repo,revision:pinned.revision,license:pinned.license,gated:pinned.gated,files:pinned.files.length,knownSize:pinned.files.filter(x=>x.size!==null).length,knownGitBlob:pinned.files.filter(x=>x.gitBlob!==null).length,knownLfsSha:pinned.files.filter(x=>x.lfsSha!==null).length,manifestSha256:fingerprint,acquisitionDisposition:acquisitionDisposition(pinned),pass:true});
 }catch(e){receipt.cases.push({repo,pass:false,errorClass:e.name,category:/^http-[0-9]{3}$/.test(e.message)?e.message:'metadata-or-consistency-error'});process.exitCode=1;}
}
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/model-acquisition.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
