// Synthetic-only test: actual Git snapshots, loopback HTTP, upstream VM if admitted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const hash=s=>createHash('sha256').update(s).digest('hex');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-git-update-'));
const repo=path.join(root,'git');
const clients=[];
const receipt={schema:1,mode:process.argv.includes('--policy-only')?'policy-only':'native',checks:{},failedStage:null};
let server,served,origin,stage='setup';
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const meta=v=>`// ==UserScript==\n// @name Synthetic Git Native Update\n// @namespace https://example.invalid/git-native\n// @version ${v}\n// @match https://example.invalid/*\n// @grant none\n// @updateURL ${origin}/script.meta.js\n// @downloadURL ${origin}/script.user.js\n// ==/UserScript==\n`;
const code=(v,b)=>meta(v)+`const syntheticRevision = ${JSON.stringify(b)};\n`;
async function commit(m,c){
 await fs.writeFile(path.join(repo,'script.meta.js'),m);
 await fs.writeFile(path.join(repo,'script.user.js'),c);
 git('add','.');git('commit','-qm','synthetic snapshot');return git('rev-parse','HEAD').trim();
}
async function get(name){const r=await fetch(`${origin}/${name}`);assert.equal(r.status,200);return r.text();}
async function check(name,fn){stage=name;await fn();receipt.checks[name]=true;}
try{
 await fs.mkdir(repo);git('init','-q');git('config','user.name','Synthetic');git('config','user.email','synthetic@example.invalid');git('config','commit.gpgsign','false');
 server=http.createServer((req,res)=>{
  if(req.method!=='GET'||!['/script.meta.js','/script.user.js'].includes(req.url)||!served){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','access-control-allow-origin':'*'});
  res.end(git('show',`${served}:${req.url.slice(1)}`));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 const baseline=code('1.0.0','baseline'), release=code('1.1.0','release'), altered=code('1.1.0','unapproved');
 const v1=await commit(meta('1.0.0'),baseline),v2=await commit(meta('1.1.0'),release),bad=await commit(meta('1.1.0'),altered);
 served=v2;
 let pinned;
 await check('approved-snapshot',async()=>{assert.equal(await get('script.meta.js'),meta('1.1.0'));pinned=await get('script.user.js');assert.equal(hash(pinned),hash(release));});
 served=bad;
 await check('refetch-race-reproduced',async()=>{assert.equal(await get('script.meta.js'),meta('1.1.0'));assert.notEqual(hash(await get('script.user.js')),hash(pinned));});
 await check('pinned-bytes-unchanged',async()=>assert.equal(hash(pinned),hash(release)));
 if(receipt.mode==='native'){
  stage='native-extension-boot';
  const {chromium}=await import('playwright');
  const ext=path.resolve(process.env.VM_EXTENSION_DIR||'.work/violentmonkey');
  async function launch(name){
   const ctx=await chromium.launchPersistentContext(path.join(root,name),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});clients.push(ctx);
   const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:30000});
   const id=new URL(sw.url()).host;assert.match(id,/^[a-p]{32}$/);
   const page=await ctx.newPage();await page.goto(`chrome-extension://${id}/options/index.html#scripts`,{waitUntil:'domcontentloaded',timeout:30000});return page;
  }
  const native=(page,cmd,data)=>page.evaluate(payload=>chrome.runtime.sendMessage(payload),{cmd,data});
  async function install(page,bytes,id){const r=await native(page,'ParseScript',{code:bytes,...(id?{id}:{isNew:true}),message:'',bumpDate:true});assert.ok(Number.isInteger(r?.where?.id)&&r.where.id>0);return r.where.id;}
  async function installed(page){const codes=await page.evaluate(async()=>Object.entries(await chrome.storage.local.get(null)).filter(([k,v])=>k.startsWith('code:')&&typeof v==='string'&&v.includes('Synthetic Git Native Update')).map(([,v])=>v));assert.equal(codes.length,1);return codes[0];}
  async function expectCode(page,expected){for(let i=0;i<40;i++){if(hash(await installed(page))===hash(expected))return;await page.waitForTimeout(120);}assert.fail('installed digest mismatch');}
  served=v1;
  const clean=await launch('clean');const cleanId=await install(clean,baseline);await expectCode(clean,baseline);
  await native(clean,'UpdateScriptInfo',{id:cleanId,config:{shouldUpdate:1}});
  await check('native-noop',async()=>{await native(clean,'CheckUpdate',{auto:true});await expectCode(clean,baseline);});
  served=v2;
  await check('native-auto-check-committed-release',async()=>{await native(clean,'CheckUpdate',{auto:true});await expectCode(clean,release);});
  served=v1;
  const guarded=await launch('guarded');const guardId=await install(guarded,baseline);await expectCode(guarded,baseline);
  await native(guarded,'UpdateScriptInfo',{id:guardId,config:{shouldUpdate:0}});
  served=v2;const approved=await get('script.user.js');assert.equal(hash(approved),hash(release));
  served=bad;
  await check('native-exact-approved-bytes',async()=>{assert.equal(hash(await installed(guarded)),hash(baseline));await install(guarded,approved,guardId);await expectCode(guarded,release);});
 }
}catch(e){receipt.failedStage=stage;receipt.errorClass=e?.name||'Error';process.exitCode=1;}
finally{await Promise.allSettled(clients.map(c=>c.close()));if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
console.log(JSON.stringify(receipt));
