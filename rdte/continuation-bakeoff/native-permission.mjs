import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
const receipt={schema:1,scope:'disposable profile explicit extension permission UI; localhost canary only',checks:{},failedStage:null};
let ctx,stage='startup';
receipt.apiObservations={};
const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-permission-'));
const server=http.createServer((req,res)=>res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<!doctype html><main>Local synthetic test</main>'));
const check=async(name,fn)=>{stage=name;await fn();receipt.checks[name]=true;};
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 const ext=path.resolve(process.env.VM_EXTENSION_DIR||'.work/violentmonkey');
 ctx=await chromium.launchPersistentContext(root,{channel:'chromium',headless:false,args:['--disable-extensions-except='+ext,'--load-extension='+ext,'--lang=en-US']});
 const worker=async()=>ctx.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'))||await ctx.waitForEvent('serviceworker',{timeout:30000});
 const id=new URL((await worker()).url()).host;
 let detail=await ctx.newPage();
 await detail.goto('chrome://extensions/?id='+id);
 const toggle=()=>detail.locator('extensions-detail-view').locator('extensions-toggle-row').filter({hasText:/allow user scripts/i}).locator('cr-toggle');
 const options=async()=>{const p=await ctx.newPage();await p.goto('chrome-extension://'+id+'/options/index.html#scripts');return p;};
 const api=async()=>{const p=await options();try{return await p.evaluate(()=>typeof chrome.userScripts!=='undefined');}finally{await p.close();}};
 const enabled=async()=>toggle().evaluate(e=>Boolean(e.checked));
 const restartProfile=async()=>{
  await ctx.close();ctx=null;
  ctx=await chromium.launchPersistentContext(root,{channel:'chromium',headless:false,args:['--disable-extensions-except='+ext,'--load-extension='+ext,'--lang=en-US']});
  assert.equal(new URL((await worker()).url()).host,id);
  detail=await ctx.newPage();await detail.goto('chrome://extensions/?id='+id);
  await toggle().waitFor({state:'visible',timeout:10000});
 };
 const testPage=async()=>{const p=await ctx.newPage();try{await p.goto(origin);await p.bringToFront();return await p.waitForFunction(()=>document.documentElement.dataset.vmConsentCanary==='yes',{},{timeout:5000}).then(()=>true,()=>false);}finally{await p.close();}};
 await check('explicit-permission-control-visible',async()=>{await toggle().waitFor({state:'visible',timeout:10000});assert.equal(await toggle().count(),1);});
 await check('default-permission-off',async()=>{assert.equal(await enabled(),false);assert.equal(await api(),false);});
 await check('explicit-consent-via-browser-ui',async()=>{await detail.bringToFront();await toggle().click();assert.equal(await enabled(),true);});
 await check('api-after-consent',async()=>{receipt.apiObservations.afterToggle=await api();if(!receipt.apiObservations.afterToggle){await restartProfile();assert.equal(await enabled(),true);}receipt.apiObservations.afterReopen=await api();assert.equal(receipt.apiObservations.afterReopen,true);});
 await check('native-install-and-execution',async()=>{
  const p=await options();
  const code='// ==UserScript==\n// @name Synthetic consent canary\n// @namespace https://example.invalid/consent\n// @version 1.0.0\n// @match http://127.0.0.1/*\n// @grant none\n// ==/UserScript==\ndocument.documentElement.dataset.vmConsentCanary="yes";\n';
  const result=await p.evaluate(data=>chrome.runtime.sendMessage({cmd:'ParseScript',data}),{code,isNew:true,message:'',bumpDate:true});
  assert.ok(Number.isInteger(result?.where?.id)&&result.where.id>0);await p.close();
  assert.equal(await testPage(),true);
 });
 await check('native-granted-script-guard-fixture',async()=>{
  const p=await options();
  const code="// ==UserScript==\n// @name Synthetic guarded action qualification\n// @namespace https://example.invalid/guarded-action\n// @version 1.0.0\n// @match http://127.0.0.1/*\n// @grant GM_addStyle\n// ==/UserScript==\n(() => {\n const root=document.createElement('section');root.id='guard-fixture';root.dataset.owner='idle';root.dataset.outcome='idle';root.dataset.count='0';\n let release=null,revision=null;\n const key='synthetic-stop-revision';\n function read(){return localStorage.getItem(key);}\n function button(id,fn){const b=document.createElement('button');b.id=id;b.textContent=id;b.addEventListener('click',fn);root.append(b);}\n button('claim',()=>{if(release)return;const initial=read();root.dataset.owner='pending';void navigator.locks.request('synthetic-guarded-action',{ifAvailable:true},async lock=>{if(!lock||read()!==initial){root.dataset.owner='denied';return;}revision=initial;root.dataset.owner='owned';await new Promise(r=>{release=r;});release=null;root.dataset.owner='released';});});\n button('stop',()=>{localStorage.setItem(key,crypto.randomUUID());root.dataset.outcome='stop-recorded';});\n button('act',()=>{if(!release)return;root.dataset.outcome='waiting';setTimeout(()=>{if(!release||read()!==revision){root.dataset.outcome='cancelled';return;}root.dataset.count=String(Number(root.dataset.count)+1);root.dataset.outcome='committed';},600);});\n button('release',()=>{if(release)release();});\n GM_addStyle('#guard-fixture button{margin:4px}');document.body.append(root);\n})();";
  const result=await p.evaluate(data=>chrome.runtime.sendMessage({cmd:'ParseScript',data}),{code,isNew:true,message:'',bumpDate:true});
  assert.ok(Number.isInteger(result?.where?.id)&&result.where.id>0);await p.close();
  const a=await ctx.newPage(),b=await ctx.newPage();
  const expectState=async(page,field,value)=>page.waitForFunction(({field,value})=>document.querySelector('#guard-fixture')?.dataset[field]===value,{field,value},{timeout:8000});
  try{
   await Promise.all([a.goto(origin),b.goto(origin)]);
   await Promise.all([expectState(a,'owner','idle'),expectState(b,'owner','idle')]);
   await a.locator('#claim').click();await expectState(a,'owner','owned');
   await b.locator('#claim').click();await expectState(b,'owner','denied');
   receipt.checks['native-same-scope-contender-denied']=true;
   await a.locator('#act').click();await expectState(a,'outcome','committed');await expectState(a,'count','1');
   receipt.checks['native-authorized-synthetic-action']=true;
   await a.locator('#act').click();await expectState(a,'outcome','waiting');await b.locator('#stop').click();
   await expectState(a,'outcome','cancelled');await expectState(a,'count','1');
   receipt.checks['native-cross-tab-stop-fences-delayed-action']=true;
   await a.close();await b.locator('#claim').click();await expectState(b,'owner','owned');
   receipt.checks['native-explicit-reacquisition-after-owner-close']=true;
   await b.reload();await expectState(b,'owner','idle');await expectState(b,'count','0');
   receipt.checks['native-reload-requires-explicit-claim']=true;
  }finally{await a.close().catch(()=>{});await b.close().catch(()=>{});}
 });
 await check('explicit-permission-revocation',async()=>{await detail.reload();await toggle().waitFor({state:'visible',timeout:10000});assert.equal(await enabled(),true);await detail.bringToFront();await toggle().click();assert.equal(await enabled(),false);});
 await check('revoked-api-and-no-new-injection',async()=>{receipt.apiObservations.afterRevoke=await api();if(receipt.apiObservations.afterRevoke){await restartProfile();assert.equal(await enabled(),false);}assert.equal(await api(),false);assert.equal(await testPage(),false);});
}catch(e){receipt.failedStage=stage;receipt.errorClass=e.name;receipt.errorKind=/Target page|Target closed|closed/.test(e.message)?'context-closed':/Timeout/.test(e.message)?'timeout':e.name==='AssertionError'?'assertion':'other';process.exitCode=1;}
finally{if(ctx)await ctx.close();if(server.listening)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/native-permission.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
