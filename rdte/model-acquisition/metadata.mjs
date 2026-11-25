import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
function project(m,repo){
 assert.equal(m.id||m.modelId,repo);assert.match(m.sha,/^[0-9a-f]{40}$/);
 assert.equal(m.private,false);assert.ok(Array.isArray(m.siblings)&&m.siblings.length>0);
 const seen=new Set();
 const files=m.siblings.map(x=>{
  const p=x.rfilename;
  assert.ok(typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(z=>z==='..'||z==='.'||z===''));
  assert.ok(!seen.has(p));seen.add(p);
  const size=Number.isSafeInteger(x.size)&&x.size>=0?x.size:null;
  const gitBlob=typeof x.blobId==='string'&&/^[0-9a-f]{40}$/.test(x.blobId)?x.blobId:null;
  const lfsSha=typeof x.lfs?.sha256==='string'&&/^[0-9a-f]{64}$/.test(x.lfs.sha256)?x.lfs.sha256:null;
  return {path:p,size,gitBlob,lfsSha};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {repo,revision:m.sha,gated:m.gated??null,license:typeof m.cardData?.license==='string'?m.cardData.license:null,files};
}
for(const repo of ['hf-internal-testing/tiny-random-bert','sshleifer/tiny-gpt2']){
 try{
  const first=project(await metadata(repo),repo);
  const pinned=project(await metadata(repo,first.revision),repo);
  assert.equal(pinned.revision,first.revision);
  assert.deepEqual(pinned.files,first.files);
  const fingerprint=createHash('sha256').update(JSON.stringify(pinned)).digest('hex');
  receipt.cases.push({repo,revision:pinned.revision,license:pinned.license,gated:pinned.gated,files:pinned.files.length,knownSize:pinned.files.filter(x=>x.size!==null).length,knownGitBlob:pinned.files.filter(x=>x.gitBlob!==null).length,knownLfsSha:pinned.files.filter(x=>x.lfsSha!==null).length,manifestSha256:fingerprint,pass:true});
 }catch(e){receipt.cases.push({repo,pass:false,errorClass:e.name,category:/^http-[0-9]{3}$/.test(e.message)?e.message:'metadata-or-consistency-error'});process.exitCode=1;}
}
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/model-acquisition.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
