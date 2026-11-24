// Synthetic-only GitHub Contents backend qualification for the REAL upstream
// Violentmonkey MV3 extension. This mocks only the remote GitHub HTTP API,
// never Violentmonkey's own sync records, timestamps, or reconciliation engine.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const extensionDir=path.resolve(process.env.VM_EXTENSION_DIR || '.work/violentmonkey');
const VERSION='v2.50.0';
const prefix='/repos/rdte/synthetic-sync';
const fakeToken='local-synthetic-token';
const files=new Map();
const clients=[];
const report={
  schema:1,upstream:VERSION,provider:'github-contents',
  peersBooted:0,nativeInitialPull:false,nativeMergeV1:false,
  independentPullV1:false,nativeMergeV2:false,independentPullV2:false,
  unrelatedRetained:false,backendWrites:0,backendReads:0,
  backendDeletes:0,shaConflicts:0,errorStage:null,errorCategory:null,
  firstInstallReturnedId:false,firstInstalledCount:null,firstInstalledHash:false,
  installNativeThrew:false,installResultType:null,installResultKeys:[],
  installWhereType:null,installWhereKeys:[],installErrorKind:null,
  installErrorSanitized:null,
};
let stage='start';
function sha(data) {return createHash('sha1').update(data).digest('hex');}
function script(version,name='Synthetic Git Contents Peer') {
  return [
    '// ==UserScript==','// @name         '+name,
    '// @namespace    https://example.invalid/vm-github-rdte',
    '// @version      '+version,
    '// @match        https://example.invalid/*',
    '// @grant        none','// ==UserScript==','','const rev = '+JSON.stringify(version)+';','',
  ].join('\n');
}
function hash(value) {return createHash('sha256').update(value).digest('hex');}
function item(name,full=false){
  const data=files.get(name);
  if(!data)return null;
  return {name,path:name,sha:sha(data),size:data.length,type:'file',
    ...(full?{content:data.toString('base64'),encoding:'base64'}:{})};
}
function serverResponse(res,status,body){
  res.writeHead(status,{'content-type':'application/json',
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,PUT,DELETE,OPTIONS',
    'access-control-allow-headers':'authorization,content-type,accept'});
  res.end(JSON.stringify(body));
}
async function readJSON(req){
  const chunks=[];let total=0;
  for await(const part of req){
    total+=part.length;
    if(total>1024*1024)throw new Error('synthetic body exceeded 1 MiB');
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const backend=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){serverResponse(res,204,{});return;}
    if(req.headers.authorization!=='token '+fakeToken){
      serverResponse(res,401,{message:'synthetic authorization required'});return;
    }
    const url=new URL(req.url,'http://localhost');
    const nameBase=prefix+'/contents';
    const method=req.method.toUpperCase();
    if(method==='DELETE'){report.backendDeletes++;serverResponse(res,403,{message:'deletion prohibited in test'});return;}
    if(method==='GET'){report.backendReads++;}
    if(method==='GET' && url.pathname===prefix){
      serverResponse(res,200,{full_name:'rdte/synthetic-sync'});return;
    }
    if(method==='GET' && url.pathname===nameBase){
      serverResponse(res,200,[...files.keys()].sort().map(x=>item(x)));return;
    }
    if(url.pathname.startsWith(nameBase+'/')){
      const key=decodeURIComponent(url.pathname.slice((nameBase+'/').length));
      if(!key||key.includes('/')||key.includes('..')||key.length>240){
        serverResponse(res,400,{message:'invalid synthetic path'});return;
      }
      if(method==='GET'){
        const data=item(key,true);
        serverResponse(res,data?200:404,data || {message:'Not Found'});return;
      }
      if(method==='PUT'){
        const input=await readJSON(req),previous=files.get(key);
        if(input.branch!=='main'||typeof input.content!=='string'){
          serverResponse(res,400,{message:'invalid synthetic update'});return;
        }
        if((previous&&input.sha!==sha(previous))||(!previous&&input.sha)){
          report.shaConflicts++;
          serverResponse(res,409,{message:'stale synthetic sha'});return;
        }
        const data=Buffer.from(input.content,'base64');
        if(data.length>256*1024){
          serverResponse(res,413,{message:'oversized synthetic file'});return;
        }
        files.set(key,data);
        report.backendWrites++;
        serverResponse(res,previous?200:201,{content:item(key),commit:{sha:'synthetic'}});return;
      }
    }
    serverResponse(res,404,{message:'synthetic route not found'});
  }catch(error){
    serverResponse(res,500,{message:'synthetic backend error'});
  }
});
async function listen(){
  backend.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{
    if(backend.listening)resolve();
    else{backend.once('listening',resolve);backend.once('error',reject);}
  });
  return backend.address().port;
}
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vm-git-contents-'));
async function newPeer(key){
  const ctx=await chromium.launchPersistentContext(path.join(dir,key),{
    channel:'chromium',headless:true,args:[
      '--disable-extensions-except='+extensionDir,
      '--load-extension='+extensionDir,'--no-first-run',
      '--no-default-browser-check']});
  clients.push(ctx);
  let [worker]=ctx.serviceWorkers();
  if(!worker) worker=await ctx.waitForEvent('serviceworker',{timeout:30000});
  const id=new URL(worker.url()).host;
  if(!/^[a-p]{32}$/.test(id))throw new Error('real VM SW did not register');
  const page=await ctx.newPage();
  await page.goto('chrome-extension://'+id+'/options/index.html#settings',
    {waitUntil:'domcontentloaded',timeout:25000});
  report.peersBooted++;
  return {ctx,id,page};
}
async function native(peer,cmd,data){
  return peer.page.evaluate(payload=>chrome.runtime.sendMessage(payload),{cmd,data});
}
async function state(peer){
  const rows=await native(peer,'SyncGetStates');
  if(!Array.isArray(rows))throw new Error('native SyncGetStates unavailable');
  const provider=rows.find(x=>x.name==='github-contents');
  if(!provider)throw new Error('native GithubContents unregistered');
  return provider.state?.status;
}
async function configure(peer,port){
  await native(peer,'SetOptions',{
    syncAutomatically:false,syncScriptStatus:false,'sync.current':'github-contents'});
  await peer.page.waitForTimeout(250);
  await native(peer,'SyncSetConfig',{
    apiBase:'http://127.0.0.1:'+port,owner:'rdte',repo:'synthetic-sync',
    branch:'main',pathPrefix:'',createMethod:'put',password:fakeToken,
  });
  for(let count=0;count<48;count++){
    const status=await state(peer);
    if(status===4)return;
    if([7,8,9,10].includes(status))throw new Error('native GithubContents setup error');
    await peer.page.waitForTimeout(250);
  }
  throw new Error('native GithubContents setup timed out');
}
async function sync(peer,mode){
  if(await state(peer)!==4)throw new Error('native peer not ready for sync');
  await native(peer,'SyncStart',mode);
  for(let attempt=0;attempt<90;attempt++){
    const status=await state(peer);
    if([7,8,9,10].includes(status))throw new Error('native sync error');
    if(attempt>=10&&status===4)return;
    await peer.page.waitForTimeout(150);
  }
  throw new Error('native sync did not finish');
}
async function install(peer,version,existingId=null,name){
  let data;
  try{
    data=await native(peer,'ParseScript',{
      code:script(version,name),
      ...(existingId?{id:existingId}:{isNew:true}),
      message:'',bumpDate:true,
    });
  }catch(e){
    report.installNativeThrew=true;
    report.installErrorKind=typeof e?.name==='string' ? e.name.slice(0,35) : 'unknown';
    // Entire test uses synthetic inputs. Strip links, credentials and opaque IDs
    // before retaining an allowlisted bounded diagnostic substring.
    report.installErrorSanitized=String(e?.message || '')
      .replace(/https?:\/\/\S+/g,'[URL]')
      .replace(/local-synthetic-token/g,'[TEST_TOKEN]')
      .replace(/[A-Za-z0-9_-]{35,}/g,'[OPAQUE]')
      .slice(0,180);
    throw e;
  }
  report.installResultType=Array.isArray(data)?'array':typeof data;
  report.installResultKeys=Object.keys(data||{}).slice(0,8);
  report.installWhereType=typeof data?.where;
  report.installWhereKeys=Object.keys(data?.where||{}).slice(0,8);
  const id=data?.where?.id;
  if(!Number.isInteger(id)||id<1)throw new Error('native ParseScript failed');
  return id;
}
async function inspect(peer,name){
  return peer.page.evaluate(async wanted=>{
    const raw=await chrome.storage.local.get(null);
    return Object.entries(raw).filter(([key,value])=>
      key.startsWith('code:')&&typeof value==='string'&&
      value.includes('// @name         '+wanted+'\n')).map(([,value])=>value);
  },name);
}
async function verify(peer,version,name){
  const code=await inspect(peer,name);
  if(code.length!==1||hash(code[0])!==hash(script(version,name)))
    throw new Error('independent VM script source/hash mismatch');
}
try{
  stage='backend-start';const port=await listen();
  stage='peer-A-start';const a=await newPeer('A');
  stage='peer-A-setup';await configure(a,port);
  stage='peer-A-first-pull';await sync(a,'pull');
  report.nativeInitialPull=true;
  stage='peer-A-install-call';const id=await install(a,'0.0.1');
  report.firstInstallReturnedId=true;
  stage='peer-A-verify-install';
  const firstCodes=await inspect(a,'Synthetic Git Contents Peer');
  report.firstInstalledCount=firstCodes.length;
  report.firstInstalledHash=firstCodes.length===1 &&
    hash(firstCodes[0])===hash(script('0.0.1'));
  if(!report.firstInstalledHash)throw new Error('synthetic install hash mismatch');
  stage='peer-A-merge-v1';await sync(a,'merge');
  report.nativeMergeV1=true;
  stage='peer-B-start';const b=await newPeer('B');
  stage='peer-B-setup';await configure(b,port);
  stage='peer-B-pull-v1';await sync(b,'pull');
  await verify(b,'0.0.1','Synthetic Git Contents Peer');
  report.independentPullV1=true;
  stage='peer-A-update-v2';await install(a,'0.0.2',id);
  await verify(a,'0.0.2','Synthetic Git Contents Peer');
  stage='peer-A-merge-v2';await sync(a,'merge');
  report.nativeMergeV2=true;
  stage='peer-B-pull-v2';await sync(b,'pull');
  await verify(b,'0.0.2','Synthetic Git Contents Peer');
  report.independentPullV2=true;
  stage='peer-B-unrelated';await install(b,'0.0.1',null,'Unrelated Synthetic Companion');
  await verify(b,'0.0.1','Unrelated Synthetic Companion');
  stage='peer-B-merge-unrelated';await sync(b,'merge');
  stage='peer-A-pull-unrelated';await sync(a,'pull');
  await verify(a,'0.0.2','Synthetic Git Contents Peer');
  await verify(a,'0.0.1','Unrelated Synthetic Companion');
  await verify(b,'0.0.2','Synthetic Git Contents Peer');
  report.unrelatedRetained=true;
  stage='idempotent-replay';await sync(a,'merge');
  await sync(b,'pull');
  await verify(a,'0.0.2','Synthetic Git Contents Peer');
  await verify(b,'0.0.2','Synthetic Git Contents Peer');
  if(report.backendDeletes)throw new Error('unexpected remote deletion');
  if(report.backendWrites<3)throw new Error('expected native backend writes absent');
}catch(error){
  report.errorStage=stage;
  const kind=String(error?.message||'');
  report.errorCategory=/not initialized|unavailable|not found/i.test(kind)
    ? 'unavailable' : /timed out|timeout/i.test(kind)
    ? 'timeout' : /syntax|parse/i.test(kind)
    ? 'parse' : /hash|mismatch/i.test(kind)
    ? 'verification' : /permission|denied|unauthoriz/i.test(kind)
    ? 'authorization' : 'other';
  process.exitCode=1;
}finally{
  await Promise.allSettled(clients.map(x=>x.close()));
  await new Promise(resolve=>backend.close(resolve));
  await fs.rm(dir,{force:true,recursive:true});
}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/violentmonkey-github-peer.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'vm-upstream-native-github-contents',...report}));
