import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {assessUpdate,sha256} from './update-preflight.mjs';
const meta=v=>`// ==UserScript==\n// @name Synthetic Static Git\n// @namespace https://example.invalid/static\n// @version ${v}\n// @match https://example.invalid/*\n// @grant none\n// @updateURL https://example.invalid/script.meta.js\n// @downloadURL https://example.invalid/script.user.js\n// ==/UserScript==\n`;
const code=(v,body)=>meta(v)+`const revision = ${JSON.stringify(body)};\n`;
const baseline=code('1.0.0','baseline');
const release=code('1.1.0','release');
const assess=(installed,remoteMeta,remoteCode,approved=release,base=baseline)=>assessUpdate({approvedBaseline:base,installedCode:installed,remoteMeta,remoteCode,approvedRemoteSha256:sha256(approved)});
test('oversized version returns a structured block, not a throw',()=>{
 const huge=code('9007199254740992.0.0','huge');
 const result=assess(baseline,meta('9007199254740992.0.0'),huge,huge);
 assert.equal(result.decision,'block');assert.ok(result.reasons.includes('invalid-version-integer'));
});
test('actual committed Git snapshots served over localhost; static policy proof',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'static-git-'));
 let server;
 t.after(async()=>{if(server)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
 const git=(...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-q');git('config','user.name','Synthetic Test');git('config','user.email','synthetic@example.invalid');git('config','commit.gpgsign','false');
 function commit(m,c){writeFileSync(join(dir,'script.meta.js'),m);writeFileSync(join(dir,'script.user.js'),c);git('add','.');git('commit','-qm','synthetic snapshot');return git('rev-parse','HEAD').trim();}
 const v1=commit(meta('1.0.0'),baseline);const v2=commit(meta('1.1.0'),release);
 const partial=commit(meta('1.2.0'),release);
 const rollback=code('1.2.0','baseline');const v3=commit(meta('1.2.0'),rollback);
 let served=v1;
 server=http.createServer((req,res)=>{
  const allowed=['/script.meta.js','/script.user.js'];
  if(req.method!=='GET'||!allowed.includes(req.url)){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});res.end(git('show',`${served}:${req.url.slice(1)}`));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 async function read(){return Promise.all(['script.meta.js','script.user.js'].map(async name=>{const response=await fetch(`${url}/${name}`);assert.equal(response.status,200);return response.text();}));}
 await t.test('baseline replay no-op',async()=>{const [m,c]=await read();assert.equal(assess(baseline,m,c,baseline).decision,'noop');});
 served=v2;
 await t.test('selected Git commit makes approved bytes available',async()=>{const [m,c]=await read();assert.equal(c,release);assert.equal(assess(baseline,m,c).decision,'allow-update');});
 await t.test('dirty browser source blocked',async()=>{const [m,c]=await read();assert.ok(assess(code('1.0.0','dirty'),m,c).reasons.includes('local-unpublished-edits'));});
 await t.test('unapproved newer bytes rejected',async()=>{const [m,c]=await read();assert.ok(assess(baseline,m,c,baseline).reasons.includes('unapproved-remote-code'));});
 await t.test('same-version different approved bytes blocked',()=>{const changed=code('1.0.0','changed');assert.ok(assess(baseline,meta('1.0.0'),changed,changed).reasons.includes('same-version-different-code'));});
 served=partial;
 await t.test('split metadata/body publication fails closed',async()=>{const [m,c]=await read();assert.ok(assess(baseline,m,c).reasons.includes('metadata-body-version-mismatch'));});
 served=v1;
 await t.test('old immutable version cannot be silently reinstalled',async()=>{const [m,c]=await read();assert.ok(assess(release,m,c,baseline,release).reasons.includes('remote-downgrade'));});
 served=v3;
 await t.test('rollback content at a higher approved version admitted',async()=>{const [m,c]=await read();assert.equal(assess(release,m,c,rollback,release).decision,'allow-update');});
});
