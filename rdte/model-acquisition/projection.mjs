import assert from 'node:assert/strict';
export function project(m,repo){
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
export function comparePinned(first,pinned){
 assert.deepEqual(pinned,first,'revision or metadata changed');
}
export function acquisitionDisposition(manifest){
 if(manifest.gated!==false)return 'access-review-required';
 if(typeof manifest.license!=='string'||!manifest.license.trim())return 'license-review-required';
 if(manifest.files.some(f=>f.size===null||(!f.gitBlob&&!f.lfsSha)))return 'identity-review-required';
 return 'metadata-complete-review-required';
}
