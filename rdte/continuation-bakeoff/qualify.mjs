import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const file=process.env.CANDIDATE_FILE;
const blob='e8f714426fd6377d451ea78195fca7b3d995ac96';
assert.equal(execFileSync('git',['hash-object',file],{encoding:'utf8'}).trim(),blob);
const original=await fs.readFile(file,'utf8');
assert.ok(!/GM_xmlhttpRequest|XMLHttpRequest|fetch\s*\(|WebSocket|@require|@connect|eval\s*\(|new Function/.test(original));
const code=original.replace(/^\/\/ @match\s+.*$/gm,'// @match http://127.0.0.1/*');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'continuation-fixture-'));
const cases=[
 {id:'completed-no-control',button:false,expected:0},
 {id:'native-truncated',button:true,expected:1},
 {id:'duplicate-ambiguous',button:true,duplicate:true,expected:0},
 {id:'human-draft',button:true,draft:true,expected:0},
 {id:'generating',button:true,generating:true,expected:0},
 {id:'authorization-dialog',button:true,approval:true,expected:0},
 {id:'quota-block',button:true,quota:true,expected:0},
 {id:'replaced-control-same-response',button:true,replace:true,expected:1},
];
let active;
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'||req.url!=='/fixture'){res.writeHead(404).end();return;}
 const c=active;
 const button='<button class="continue" aria-label="Continue generating">Continue generating</button>';
 const html='<!doctype html><html><head><meta charset="utf-8"></head><body><main style="margin-top:300px"><section data-message-author-role="assistant"><p>Deterministic synthetic response.</p>'+(c.button?button:'')+(c.duplicate?button:'')+'</section></main><textarea id="prompt-textarea">'+(c.draft?'Unsent human draft':'')+'</textarea>'+(c.generating?'<button data-testid="stop-button">Stop generating</button>':'')+(c.approval?'<div role="dialog">Authorization required <button>Allow</button></div>':'')+(c.quota?'<div role="alert">Usage limit reached</div>':'')+'<script>window.receipt={clicks:0,approvalClicks:0};document.addEventListener("click",e=>{if(e.target.matches(".continue")){window.receipt.clicks++;if('+Boolean(c.replace)+'&&window.receipt.clicks===1){const old=e.target;setTimeout(()=>old.replaceWith(old.cloneNode(true)),250)}}if(e.target.textContent==="Allow")window.receipt.approvalClicks++});</script></body></html>';
 res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end(html);
});
let ctx;
const receipt={schema:1,candidate:'AI Auto Continue Lite',version:'1.3.2',sourceBlob:blob,scope:'synthetic-localhost-match-only',results:[],infrastructureError:null};
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 const ext=path.resolve(process.env.VM_EXTENSION_DIR||'.work/violentmonkey');
 ctx=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
 const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:30000});
 const id=new URL(sw.url()).host;
 const control=await ctx.newPage();
 await control.goto('chrome-extension://'+id+'/options/index.html#scripts');
 const installed=await control.evaluate(data=>chrome.runtime.sendMessage({cmd:'ParseScript',data}),{code,isNew:true,message:'',bumpDate:true});
 assert.ok(Number.isInteger(installed?.where?.id)&&installed.where.id>0);
 for(const c of cases){
  active=c;const page=await ctx.newPage();
  await page.goto(origin+'/fixture');await page.bringToFront();
  await page.waitForTimeout(4000);
  const result=await page.evaluate(()=>({clicks:window.receipt.clicks,approvalClicks:window.receipt.approvalClicks,draft:document.querySelector('textarea').value}));
  const pass=result.clicks===c.expected&&result.approvalClicks===0&&result.draft===(c.draft?'Unsent human draft':'');
  receipt.results.push({case:c.id,expected:c.expected,actual:result.clicks,approvalClicks:result.approvalClicks,draftPreserved:result.draft===(c.draft?'Unsent human draft':''),pass});
  await page.close();
 }
 // Harness success and candidate safety are deliberately separate.
 assert.equal(receipt.results.length,cases.length);
 assert.equal(receipt.results.find(r=>r.case==='native-truncated').actual,1,'positive control did not activate');
}catch(e){receipt.infrastructureError=e.name;process.exitCode=1;}
finally{if(ctx)await ctx.close();if(server.listening)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/continuation-bakeoff.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
