import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const receipt={schema:1,scope:'generic synthetic browser primitives, not production integration',checks:{},failedStage:null};
let browser,stage='startup';
const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/'){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<!doctype html><main></main><textarea></textarea>');});
const check=async(name,fn)=>{stage=name;await fn();receipt.checks[name]=true;};
const claim=(page,name)=>page.evaluate(name=>new Promise(resolve=>{
 navigator.locks.request(name,{mode:'exclusive',ifAvailable:true},lock=>{
  if(!lock){resolve(false);return;}
  return new Promise(release=>{window.releaseOwner=release;resolve(true);});
 }).catch(()=>resolve(false));
}),name);
const ack=(page,before,prompt)=>page.evaluate(({before,prompt})=>{
 const turns=[...document.querySelectorAll('[data-message-author-role="user"]')];
 return turns.length>before&&turns.at(-1).innerText.trim()===prompt.trim();
},{before,prompt});
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+server.address().port+'/';
 browser=await chromium.launch({channel:'chromium',headless:true});receipt.chromium=browser.version();
 const ctx=await browser.newContext();
 const a=await ctx.newPage(),b=await ctx.newPage(),c=await ctx.newPage();
 await Promise.all([a,b,c].map(p=>p.goto(url)));
 await check('secure-context-and-lock-api',async()=>assert.equal(await a.evaluate(()=>isSecureContext&&!!navigator.locks),true));
 const contenders=await Promise.all([claim(a,'scope-a'),claim(b,'scope-a')]);
 const winner=contenders[0]?a:b,other=contenders[0]?b:a;
 await check('simultaneous-same-scope-exactly-one-owner',async()=>assert.equal(contenders.filter(Boolean).length,1));
 await check('contender-denied-without-queue',async()=>{assert.equal(await claim(other,'scope-a'),false);assert.equal(await other.evaluate(async()=> (await navigator.locks.query()).pending.filter(x=>x.name==='scope-a').length),0);});
 await check('different-scope-independent',async()=>assert.equal(await claim(c,'scope-b'),true));
 await check('cross-tab-disable-observable',async()=>{
  await winner.evaluate(()=>{localStorage.setItem('scope-a','active');window.stopObserved=false;addEventListener('storage',e=>{if(e.key==='scope-a'&&e.newValue==='disabled')window.stopObserved=true;});});
  await other.evaluate(()=>localStorage.setItem('scope-a','disabled'));
  await winner.waitForFunction(()=>window.stopObserved===true,{},{timeout:5000});
  assert.equal(await winner.evaluate(()=>localStorage.getItem('scope-a')),'disabled');
 });
 await check('closing-owner-releases-lock',async()=>{
  await winner.close();await other.waitForFunction(async()=>!(await navigator.locks.query()).held.some(x=>x.name==='scope-a'),{},{timeout:5000});
  assert.equal(await claim(other,'scope-a'),true);
 });
 await check('reload-releases-without-automatic-reacquisition',async()=>{
  await other.reload();await other.waitForFunction(async()=>!(await navigator.locks.query()).held.some(x=>x.name==='scope-a'),{},{timeout:5000});
  assert.equal(await other.evaluate(()=>localStorage.getItem('scope-a')),'disabled');
  assert.equal(await claim(other,'scope-a'),true);await other.evaluate(()=>window.releaseOwner());
 });
 await c.evaluate(()=>window.releaseOwner());
 await other.evaluate(()=>{document.querySelector('main').innerHTML='<div data-message-author-role="user">Next.</div>';});
 await check('cleared-composer-not-ack',async()=>assert.equal(await ack(other,1,'Next.'),false));
 await check('different-new-user-turn-not-ack',async()=>{
  await other.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<div data-message-author-role="user">Different human input</div>'));
  assert.equal(await ack(other,1,'Next.'),false);
 });
 await check('matching-new-rendered-user-turn-ack',async()=>{
  await other.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<div data-message-author-role="user">Next.</div>'));
  assert.equal(await ack(other,1,'Next.'),true);
 });
}catch(e){receipt.failedStage=stage;receipt.errorClass=e.name;process.exitCode=1;}
finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/browser-primitives.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
