// Public-safe, fully synthetic, real VM v2.50.0 update-site collision RDTE.
// A localhost HTTP server offers a newer .meta.js and .user.js while local
// extension peers have divergent unpublished edits. No personal scripts,
// secrets, private repositories, real update endpoints, or cloud storage.
import fs from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {assessUpdate,sha256} from './update-preflight.mjs';

const extPath=path.resolve(process.env.VM_EXTENSION_DIR||'.work/violentmonkey');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'vm-update-conflict-'));
const clients=[];
const counts={meta:0,script:0};
const report={
 schema:1,upstream:'Violentmonkey v2.50.0 MV3',
 updateSite:'synthetic-local-http',peersBooted:0,
 baselineInstalled:false,unprotectedDirtyInstalled:false,
 remoteNewer:true,nativeUpdateInvoked:false,nativeUpdated:false,
 localEditsOverwritten:null,cleanUpdateSucceeded:false,
 protectedDirtyInstalled:false,preflightBlocked:false,
 protectedLocalHashUnchanged:false,siteMetaRequests:0,
 siteScriptRequests:0,failedStage:null,errorCategory:null,
};
let port,stage='start';
const srv=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const headers={
    'content-type':'text/plain; charset=utf-8',
    'cache-control':'no-cache, no-store, must-revalidate',
    'access-control-allow-origin':'*',
  };
  if(req.method!=='GET'){
    res.writeHead(405,headers);res.end();return;
  }
  if(pathname==='/collision.meta.js'){
    counts.meta++;res.writeHead(200,headers);
    res.end(metadata('1.1.0'));return;
  }
  if(pathname==='/collision.user.js'){
    counts.script++;res.writeHead(200,headers);
    res.end(script('1.1.0','upstream-release'));return;
  }
  res.writeHead(404,headers);res.end();
});
function digest(str) {return createHash('sha256').update(str).digest('hex');}
function metadata(version) {
  const base='http://127.0.0.1:'+port;
  return [
    '// ==UserScript==',
    '// @name         Synthetic Update-Collision RDTE',
    '// @namespace    https://example.invalid/vm-update-collision',
    '// @version      '+version,
    '// @match        https://example.invalid/*',
    '// @updateURL    '+base+'/collision.meta.js',
    '// @downloadURL  '+base+'/collision.user.js',
    '// @grant        none',
    '// ==/UserScript==',
    '',
  ].join('\n');
}
function script(version,body) {
  return metadata(version)+"const syntheticRevision = "+JSON.stringify(body)+";\n";
}
async function launch(key){
 const ctx=await chromium.launchPersistentContext(path.join(root,key),{
  channel:'chromium',headless:true,
  args:['--disable-extensions-except='+extPath,'--load-extension='+extPath,
    '--no-first-run','--no-default-browser-check'],
 });
 clients.push(ctx);
 let [sw]=ctx.serviceWorkers();
 if(!sw)sw=await ctx.waitForEvent('serviceworker',{timeout:30000});
 const id=new URL(sw.url()).host;
 if(!/^[a-p]{32}$/.test(id))throw new Error('upstream extension service worker absent');
 const page=await ctx.newPage();
 await page.goto('chrome-extension://'+id+'/options/index.html#scripts',
  {waitUntil:'domcontentloaded',timeout:30000});
 report.peersBooted++;
 return {ctx,page};
}
async function native(peer,cmd,data){
 return peer.page.evaluate(payload=>chrome.runtime.sendMessage(payload),{cmd,data});
}
async function install(peer,code,id){
 const result=await native(peer,'ParseScript',{
  code,...(id?{id}:{isNew:true}),message:'',bumpDate:true,
 });
 const value=result?.where?.id;
 if(!Number.isInteger(value)||value<1)
  throw new Error('native ParseScript did not return script id');
 return value;
}
async function local(peer){
 const scripts=await peer.page.evaluate(async()=>{
  const data=await chrome.storage.local.get(null);
  return Object.entries(data).filter(([k,v])=>k.startsWith('code:')
   && typeof v==='string'
   &&v.includes('Synthetic Update-Collision RDTE')).map(([,v])=>v);
 });
 if(scripts.length!==1)throw new Error('synthetic installed script not unique');
 return scripts[0];
}
async function refreshUntil(peer,expected,attempts=40){
 for(let i=0;i<attempts;i++){
  if(digest(await local(peer))===digest(expected))return true;
  await peer.page.waitForTimeout(120);
 }
 return false;
}
try{
 stage='site-bind';
 await new Promise((resolve,reject)=>{
  srv.once('error',reject);srv.listen(0,'127.0.0.1',resolve);
 });
 port=srv.address().port;
 const baseline=script('1.0.0','approved-git-baseline');
 const dirty=script('1.0.0','unpublished-local-edits');
 const release=script('1.1.0','upstream-release');
 stage='unprotected-boot';
 const unprotected=await launch('unprotected');
 const scriptId=await install(unprotected,baseline);
 report.baselineInstalled=await refreshUntil(unprotected,baseline);
 if(!report.baselineInstalled)throw new Error('baseline failed to install');
 stage='unprotected-dirty';
 await install(unprotected,dirty,scriptId);
 report.unprotectedDirtyInstalled=await refreshUntil(unprotected,dirty);
 if(!report.unprotectedDirtyInstalled)throw new Error('dirty code failed to install');
 stage='unprotected-native-check-update';
 report.nativeUpdateInvoked=true;
 const result=await native(unprotected,'CheckUpdate',{ids:[scriptId]});
 report.nativeUpdated=typeof result==='number'&&result>0;
 report.localEditsOverwritten=await refreshUntil(unprotected,release);
 // This is a deliberately unsafe demo on an ephemeral profile, not production.
 if(!report.localEditsOverwritten)throw new Error('native update did not replace dirty script');
 stage='clean-update';
 const clean=await launch('clean');
 const cleanId=await install(clean,baseline);
 if(!await refreshUntil(clean,baseline))throw new Error('clean baseline missing');
 await native(clean,'CheckUpdate',{ids:[cleanId]});
 report.cleanUpdateSucceeded=await refreshUntil(clean,release);
 if(!report.cleanUpdateSucceeded)throw new Error('native clean update did not install');
 stage='protected-dirty';
 const guarded=await launch('guarded');
 const guardedId=await install(guarded,baseline);
 await install(guarded,dirty,guardedId);
 if(!await refreshUntil(guarded,dirty))throw new Error('guarded dirty install missing');
 report.protectedDirtyInstalled=true;
 const remoteResponse=await fetch('http://127.0.0.1:'+port+'/collision.meta.js');
 if(!remoteResponse.ok)throw new Error('synthetic update metadata unavailable');
 const releaseResponse=await fetch('http://127.0.0.1:'+port+'/collision.user.js');
 if(!releaseResponse.ok)throw new Error('synthetic release code unavailable');
 const resultGuard=assessUpdate({
   approvedBaseline:baseline,installedCode:await local(guarded),
   remoteMeta:await remoteResponse.text(),
   remoteCode:await releaseResponse.text(),
   approvedRemoteSha256:sha256(release),
 });
 if(resultGuard.decision!=='block'||!resultGuard.reasons.includes('local-unpublished-edits'))
   throw new Error('safety policy did not recognize two writers');
 // NO native CheckUpdate or SyncStart may execute when preflight blocks.
 report.preflightBlocked=true;
 report.protectedLocalHashUnchanged=digest(await local(guarded))===digest(dirty);
 if(!report.protectedLocalHashUnchanged)throw new Error('blocked update lost local work');
} catch(error){
 report.failedStage=stage;
 const str=String(error?.message||'');
 report.errorCategory=/network|connect/i.test(str)?'network':
  /timeout/i.test(str)?'timeout':
  /permission|denied|auth/i.test(str)?'permission':
  /version|update|script/i.test(str)?'script-update':
  'other';
 process.exitCode=1;
} finally{
 report.siteMetaRequests=counts.meta;report.siteScriptRequests=counts.script;
 await Promise.allSettled(clients.map(c=>c.close()));
 await new Promise(resolve=>srv.close(resolve));
 await fs.rm(root,{recursive:true,force:true});
}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/violentmonkey-update-collision.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'vm-real-update-site-collision',...report}));
