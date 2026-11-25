import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
const receipt={schema:1,scope:'disposable profile explicit extension permission UI; localhost canary only',checks:{},failedStage:null};
let ctx,stage='startup';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-permission-'));
const server=http.createServer((req,res)=>res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<!doctype html><main>Local synthetic test</main>'));
const check=async(name,fn)=>{stage=name;await fn();receipt.checks[name]=true;};
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 const ext=path.resolve(process.env.VM_EXTENSION_DIR||'.work/violentmonkey');
 ctx=await chromium.launchPersistentContext(root,{channel:'chromium',headless:false,args:['--disable-extensions-except='+ext,'--load-extension='+ext,'--lang=en-US']});
 const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:30000});
 const id=new URL(sw.url()).host;
 const detail=await ctx.newPage();
 await detail.goto('chrome://extensions/?id='+id);
 const row=detail.locator('extensions-detail-view').locator('extensions-toggle-row').filter({hasText:/allow user scripts/i});
 const toggle=row.locator('cr-toggle');
 const options=async()=>{const p=await ctx.newPage();await p.goto('chrome-extension://'+id+'/options/index.html#scripts');return p;};
 const api=async()=>{const p=await options();try{return await p.evaluate(()=>typeof chrome.userScripts!=='undefined');}finally{await p.close();}};
 const enabled=async()=>toggle.evaluate(e=>Boolean(e.checked));
 const reloadExtension=async()=>{
  const p=await options();
  await p.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),100);});
  await new Promise(r=>setTimeout(r,1200));
  await p.close().catch(()=>{});
 };
 const testPage=async()=>{const p=await ctx.newPage();try{await p.goto(origin);await p.bringToFront();return await p.waitForFunction(()=>document.documentElement.dataset.vmConsentCanary==='yes',{},{timeout:5000}).then(()=>true,()=>false);}finally{await p.close();}};
 await check('explicit-permission-control-visible',async()=>{await toggle.waitFor({state:'visible',timeout:10000});assert.equal(await toggle.count(),1);});
 await check('default-permission-off',async()=>{assert.equal(await enabled(),false);assert.equal(await api(),false);});
 await check('explicit-consent-via-browser-ui',async()=>{await detail.bringToFront();await toggle.click();assert.equal(await enabled(),true);});
 await check('api-after-context-reload',async()=>{await reloadExtension();assert.equal(await api(),true);});
 await check('native-install-and-execution',async()=>{
  const p=await options();
  const code='// ==UserScript==\n// @name Synthetic consent canary\n// @namespace https://example.invalid/consent\n// @version 1.0.0\n// @match http://127.0.0.1/*\n// @grant none\n// ==/UserScript==\ndocument.documentElement.dataset.vmConsentCanary="yes";\n';
  const result=await p.evaluate(data=>chrome.runtime.sendMessage({cmd:'ParseScript',data}),{code,isNew:true,message:'',bumpDate:true});
  assert.ok(Number.isInteger(result?.where?.id)&&result.where.id>0);await p.close();
  assert.equal(await testPage(),true);
 });
 await check('explicit-permission-revocation',async()=>{await detail.reload();await toggle.waitFor({state:'visible',timeout:10000});assert.equal(await enabled(),true);await detail.bringToFront();await toggle.click();assert.equal(await enabled(),false);});
 await check('revoked-api-and-no-new-injection',async()=>{await reloadExtension();assert.equal(await api(),false);assert.equal(await testPage(),false);});
}catch(e){receipt.failedStage=stage;receipt.errorClass=e.name;process.exitCode=1;}
finally{if(ctx)await ctx.close();if(server.listening)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/native-permission.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
