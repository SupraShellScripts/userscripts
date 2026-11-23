// Public GitHub-hosted Playwright runner. No private source, credentials,
// browser profile, auth, user-provided HTML, page dumps, screenshots or clicks.
import fs from 'node:fs/promises';
import {chromium,firefox,webkit,devices} from 'playwright';
import {targets,classifyHost,classifyResult,safeRecord,safeFailure} from './lib.mjs';

const engines={chromium,firefox,webkit};
const browserName=process.env.OBS_BROWSER || 'chromium';
const profile=process.env.OBS_PROFILE || 'desktop';
if (!(browserName in engines) || !['desktop','mobile'].includes(profile)) {
  throw new Error('Unsupported public observer browser/profile');
}
const mobileDevice=devices[browserName==='webkit'?'iPhone 13':'Pixel 7'];
const size=profile==='desktop'
  ? {viewport:{width:1366,height:768},deviceScaleFactor:1}
  : {viewport:mobileDevice.viewport,deviceScaleFactor:mobileDevice.deviceScaleFactor,
      hasTouch:true,...(browserName==='firefox'?{}:{isMobile:true})};
const browser=await engines[browserName].launch({headless:true});
const output=[];
try {
  for(const site of targets) {
    const context=await browser.newContext({...size,locale:'en-US',acceptDownloads:false,
      colorScheme:'light',storageState:{cookies:[],origins:[]}});
    const page=await context.newPage();
    let blockedNonGetCount=0,blockedDownloads=0;
    const raw={targetId:site.id,browser:browserName,profile,
      status:'inconclusive',httpStatus:null,hostClass:'unknown',
      blockedNonGetCount:0,blockedDownloads:0};
    try {
      await page.route('**/*',async route=>{
        const req=route.request();
        if(!['GET','HEAD','OPTIONS'].includes(req.method())) {
          blockedNonGetCount++;return route.abort();
        }
        try {
          const url=new URL(req.url());
          if (/\\.(?:zip|exe|msi|dmg|tar|7z|pkg|iso|bin|pdf)$/i.test(url.pathname)){
            blockedDownloads++;return route.abort();
          }
        } catch {return route.abort();}
        return route.continue();
      });
      page.on('download', item=>{blockedDownloads++;void item.cancel().catch(()=>{});});
      const response=await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:20000});
      await page.waitForTimeout(1250);
      raw.httpStatus=response?.status() ?? null;
      raw.hostClass=classifyHost(site,page.url());
      // Never return text, title, URL or any attribute values from page JS.
      const facts=await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll('a,button,[role="button"]')].slice(0,350);
        const label=node=>String(node.getAttribute('aria-label') || node.textContent || '').trim();
        const loginAffordance=nodes.some(node=>
          /^(?:log\s?in|sign\s?in|anmelden|connexion|iniciar sesi[oó]n|ログイン)(?:\b|$)/i.test(label(node)));
        const title=String(document.title||'').slice(0,140);
        const topText=String(document.body?.innerText||'').slice(0,450);
        const challenge=/verify (?:you are )?human|checking your browser|just a moment|captcha|access denied/i.test(title+' '+topText);
        return {
          loginAffordance,challenge,
          mainPresent:!!document.querySelector('main,[role="main"]'),
          buttonCount:document.querySelectorAll('button,[role="button"]').length,
          textboxCount:document.querySelectorAll('textarea,[role="textbox"],[contenteditable="true"]').length,
          headingCount:document.querySelectorAll('h1,h2,h3,h4').length,
          shadowDomAvailable:typeof HTMLElement!=='undefined' && typeof HTMLElement.prototype.attachShadow==='function',
          mutationObserverAvailable:typeof MutationObserver==='function'
        };
      });
      Object.assign(raw,facts);
      raw.status=classifyResult(raw);
    } catch(error) {
      raw.errorClass=safeFailure(error);
      raw.status='inconclusive';
    } finally {
      raw.blockedNonGetCount=blockedNonGetCount;
      raw.blockedDownloads=blockedDownloads;
      const record=safeRecord(raw);
      output.push(record);
      console.log(JSON.stringify({event:'public-anonymous-observation',...record}));
      await context.close();
    }
  }
} finally {await browser.close();}
await fs.mkdir('reports',{recursive:true});
const report={
  schemaVersion:1,observedAt:new Date().toISOString(),
  publicObserverRevision:process.env.GITHUB_SHA || 'local',
  browser:browserName,profile,results:output,
  limitations:[
    'No authentication; anonymous pages may be login-only',
    'No unpublished userscript executed or uploaded',
    'No private conversation, saved-page fixture or account data used',
    'No screenshots, DOM dumps, cookies or text retained',
    'Mobile is emulated, not a physical device',
    'No conclusion about logged-in message exports or Violentmonkey injection'
  ]
};
await fs.writeFile('reports/ai-anonymous-'+browserName+'-'+profile+'.json',
  JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'public-anonymous-summary',browser:browserName,profile,
  classifications:output.map(item=>({target:item.targetId,status:item.status,http:item.httpStatus,
    main:item.mainPresent,editorCount:item.textboxCount}))}));
