// Public-only end-to-end experiment. Two REAL upstream VM browser extensions
// using native WebDAV sync, with a disposable synthetic in-memory WebDAV server.
// No manually written VM remote records, manifests, authenticated websites,
// accounts, personal scripts, or secrets. No persistent browser profiles.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import webdavPackage from 'webdav-server';

const webdav = webdavPackage.v2;
const extPath = path.resolve(process.env.VM_EXTENSION_DIR || '.work/violentmonkey');
const report = {
  schema: 1, upstream: 'Violentmonkey v2.50.0 MV3', backend: 'isolated-memory-WebDAV',
  peersBooted: 0, browserAPull: false, browserAInstalledV1: false,
  browserAMergedV1: false, browserBPulledV1: false,
  browserAInstalledV2: false, browserAMergedV2: false,
  browserBPulledV2: false, nativeWrites: 0, nativeReads: 0,
  failedStage: null,
};
const baseName = 'Synthetic VM Peer Roundtrip';
function code(version) {
  return [
    '// ==UserScript==',
    '// @name         ' + baseName,
    '// @namespace    https://example.invalid/vm-peer-rdte',
    '// @version      ' + version,
    '// @match        https://example.invalid/*',
    '// @grant        none',
    '// ==/UserScript==',
    '',
    '// Entirely synthetic and without page-account permissions.',
    "const version = '" + version + "';",
    '',
  ].join('\n');
}
const expected = ['0.0.1','0.0.2'].map(version =>
  createHash('sha256').update(code(version)).digest('hex'));
const dir = await fs.mkdtemp(path.join(os.tmpdir(),'vm-two-peers-'));
const server = new webdav.WebDAVServer({port:0});
const clients = [];
let stage='start';
const traffic={reads:0,writes:0};
server.afterRequest((arg,next)=>{
  if (['GET','PROPFIND','HEAD'].includes(arg.request.method)) traffic.reads++;
  if (['PUT','MKCOL','DELETE','MOVE','COPY'].includes(arg.request.method)) traffic.writes++;
  next();
});
async function startWebDav() {
  // This is a test WebDAV backend, NOT an implementation of VM sync records.
  server.rootFileSystem().addSubTree(server.createExternalContext(),
    {'Violentmonkey': {}});
  const instance = await new Promise((resolve,reject)=>{
    try {server.start(resolve);} catch(e) {reject(e);}
  });
  const port=instance.address().port;
  if (!(port>0)) throw new Error('webdav-server listener did not start');
  const probe=await fetch('http://127.0.0.1:'+port+'/Violentmonkey/',{
    method:'PROPFIND',headers:{Depth:'1'}});
  if (![200,207].includes(probe.status)) throw new Error('WebDAV PROPFIND unavailable');
  return port;
}
async function newPeer(id) {
  const profile=path.join(dir,'peer-'+id);
  const context=await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,
    args:['--disable-extensions-except='+extPath,'--load-extension='+extPath,
      '--no-first-run','--no-default-browser-check'],
  });
  clients.push(context);
  let [sw]=context.serviceWorkers();
  if (!sw) sw=await context.waitForEvent('serviceworker',{timeout:30000});
  const extensionId = new URL(sw.url()).host;
  if (!/^[a-p]{32}$/.test(extensionId))throw new Error('extension worker ID invalid');
  const page=await context.newPage();
  report.peersBooted++;
  return {context,page,id:extensionId};
}
async function setup(peer,port) {
  await peer.page.goto('chrome-extension://'+peer.id+'/options/index.html#settings',
    {waitUntil:'domcontentloaded',timeout:25000});
  const section=peer.page.locator('section:has(option[value="webdav"])');
  await section.locator('option[value="webdav"]').waitFor({timeout:20000});
  // Disable auto sync BEFORE activating remote; no merge from an empty peer.
  const checkboxes=section.locator('input[type="checkbox"]');
  await checkboxes.first().uncheck();
  await section.locator('select:has(option[value="webdav"])').selectOption('webdav');
  const fieldset=section.locator('fieldset').filter({has:peer.page.locator('input[type="url"]')}).first();
  await fieldset.locator('input[type="url"]').fill('http://127.0.0.1:'+port+'/');
  // Test service is anonymous localhost only; no credentials.
  await fieldset.locator('input[type="checkbox"]').check();
  await fieldset.getByRole('button',{name:/save/i}).click();
  await section.locator('button:has(svg)').nth(2).waitFor({state:'visible',timeout:15000});
}
async function sync(peer,action) {
  const section=peer.page.locator('section:has(option[value="webdav"])');
  const index=action==='pull'?2:action==='merge'?0:1;
  const button=section.locator('button:has(svg)').nth(index);
  await peer.page.waitForFunction(() => {
    const host=document.querySelector('section:has(option[value="webdav"])');
    const buttons=host?.querySelectorAll('button:has(svg)');
    return !!buttons?.[0] && !buttons[0].disabled;
  },{timeout:20000});
  await button.click();
  // The action is async; wait for VM to release its disabled sync controls.
  await peer.page.waitForFunction(() => {
    const section=document.querySelector('section:has(option[value="webdav"])');
    const first=section?.querySelector('button:has(svg)');
    return first && !first.disabled;
  },{timeout:30000});
}
async function editSynthetic(peer,version,existingId=null) {
  await peer.page.goto('chrome-extension://'+peer.id+
    '/options/index.html#scripts/'+(existingId || '_new'),{waitUntil:'domcontentloaded'});
  const editor=peer.page.locator('.CodeMirror').first();
  await editor.waitFor({state:'visible',timeout:20000});
  await editor.evaluate((el,value)=>{
    if (!el.CodeMirror)throw new Error('Native CodeMirror not initialized');
    el.CodeMirror.setValue(value);
  },code(version));
  const save=peer.page.locator('.edit-header button').filter({hasText:/^save$/i}).first();
  await peer.page.waitForFunction(() => {
    const btn=[...document.querySelectorAll('.edit-header button')]
      .find(e=>e.textContent.trim().toLowerCase()==='save');
    return !!btn && !btn.disabled;
  },{timeout:12000});
  await save.click();
  await peer.page.waitForTimeout(400);
  const id=Number(peer.page.url().split('#scripts/')[1]);
  if (!Number.isInteger(id) || id<1)throw new Error('Native editor did not save script');
  return id;
}
async function localCode(peer) {
  // Read-only evidence from the actual extension's local storage; not a
  // second implementation of synchronization or a remote-manifest writer.
  return peer.page.evaluate(async name=>{
    const data=await chrome.storage.local.get(null);
    return Object.entries(data).filter(([key,val])=>
      key.startsWith('code:') && typeof val==='string' && val.includes(name))
      .map(([,val])=>val);
  },baseName);
}
async function verify(peer,index) {
  let latest=null;
  for(let tryCount=0;tryCount<25;tryCount++){
    const codes=await localCode(peer);
    if(codes.length===1 && createHash('sha256').update(codes[0]).digest('hex')===expected[index])
      return true;
    latest=codes.length;
    await peer.page.waitForTimeout(200);
  }
  if(latest!==1)throw new Error('Expected one synthetic installed script');
  throw new Error('Installed synthetic script hash mismatch');
}
try {
  stage='webdav-start';
  const port=await startWebDav();
  stage='peer-A-boot';
  const a=await newPeer('A');
  stage='peer-A-config';
  await setup(a,port);
  stage='peer-A-first-pull';
  await sync(a,'pull');
  report.browserAPull=true;
  stage='peer-A-install-v1';
  const scriptId=await editSynthetic(a,'0.0.1');
  await verify(a,0);
  report.browserAInstalledV1=true;
  stage='peer-A-merge-v1';
  await a.page.goto('chrome-extension://'+a.id+'/options/index.html#settings');
  await sync(a,'merge');
  report.browserAMergedV1=true;
  stage='peer-B-boot';
  const b=await newPeer('B');
  stage='peer-B-config';
  await setup(b,port);
  stage='peer-B-pull-v1';
  await sync(b,'pull');
  await verify(b,0);
  report.browserBPulledV1=true;
  stage='peer-A-install-v2';
  await editSynthetic(a,'0.0.2',scriptId);
  await verify(a,1);
  report.browserAInstalledV2=true;
  stage='peer-A-merge-v2';
  await a.page.goto('chrome-extension://'+a.id+'/options/index.html#settings');
  await sync(a,'merge');
  report.browserAMergedV2=true;
  stage='peer-B-pull-v2';
  await sync(b,'pull');
  await verify(b,1);
  report.browserBPulledV2=true;
} catch(error) {
  report.failedStage=stage;
  process.exitCode=1;
} finally {
  report.nativeReads=traffic.reads;
  report.nativeWrites=traffic.writes;
  await Promise.allSettled(clients.map(c=>c.close()));
  await new Promise(resolve => server.stop(resolve));
  await fs.rm(dir,{force:true,recursive:true});
}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/violentmonkey-two-peer.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'vm-upstream-native-two-peer',...report}));
