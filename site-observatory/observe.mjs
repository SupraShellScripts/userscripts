// Public-site-only, unauthenticated, read-only observer.
// This code MUST NEVER import private userscript source, credentials, or browser profiles.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit, devices } from 'playwright';

const browsers = { chromium, firefox, webkit };
const browserName = process.env.OBS_BROWSER || 'chromium';
const profile = process.env.OBS_PROFILE || 'desktop';
const config = JSON.parse(await fs.readFile(new URL('./sites.json', import.meta.url), 'utf8'));
if (!Object.hasOwn(browsers, browserName) || !['desktop', 'mobile'].includes(profile)) {
  throw new Error('Unsupported observer engine/profile');
}
const phone = devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 7'];
const deviceConfig = profile === 'mobile'
  ? { viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor,
      // Firefox does not support Playwright's isMobile setting.
      ...(browserName === 'firefox' ? {} : {isMobile: true}), hasTouch: true }
  : { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };
const browser = await browsers[browserName].launch({ headless: true });
const records = [];

function allowedUrl(start, end) {
  try {
    const source = new URL(start);
    const target = new URL(end);
    const first = source.hostname.replace(/^www\./i, '');
    const last = target.hostname.replace(/^www\./i, '');
    return target.protocol === 'https:' && (first === last || (first === 'altera.com' && last === 'altera.com'));
  } catch {
    return false;
  }
}

function classifyResponse(response, finalUrl, originalUrl) {
  if (!response) return 'site-unavailable';
  if (!allowedUrl(originalUrl, finalUrl)) return 'redirected-off-site';
  if ([401, 403, 429, 451].includes(response.status())) return 'site-unavailable';
  if (response.status() >= 500) return 'site-unavailable';
  if (/\/(?:auth|login|signin|captcha)(?:[/?#]|$)/i.test(new URL(finalUrl).pathname)) return 'auth-required';
  return response.status() >= 400 ? 'site-unavailable' : 'observed';
}

function safeFailure(error) {
  const message = String(error?.message || error);
  if (/timeout/i.test(message)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(message)) return 'dns';
  if (/ERR_CERT|SSL|certificate/i.test(message)) return 'tls';
  if (/ERR_CONNECTION|ECONN|ERR_NETWORK/i.test(message)) return 'connection';
  return 'navigation-error';
}

function summarize(message) {
  console.log(JSON.stringify({event:'userscripts.site-observer.result', ...message}));
}

for (const site of config.sites) {
  const context = await browser.newContext({ ...deviceConfig, locale:'en-US', colorScheme:'light', acceptDownloads:false,
    bypassCSP:true });
  const page = await context.newPage();
  const item = { siteId:site.id, browser:browserName, profile, status:'inconclusive', artifactOnly:true };
  try {
    // Never click or download: cancel known executable/archive resources.
    await page.route('**/*', async route => {
      const request = route.request();
      const target = new URL(request.url());
      if (/\.(?:zip|exe|msi|dmg|tar|7z|pkg|iso|bin|pdf)(?:[?#]|$)/i.test(target.pathname)) {
        return route.abort();
      }
      return route.continue();
    });
    const response = await page.goto(site.url, {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForTimeout(1000);
    item.httpStatus = response?.status() ?? null;
    item.finalHost = new URL(page.url()).hostname;
    item.status = classifyResponse(response, page.url(), site.url);
    if (item.status === 'observed') {
      const observations = await page.evaluate(keywords => {
        const body = document.body;
        const normalizedText = (body?.innerText || '').toLowerCase();
        const semantic = keywords.map(value => normalizedText.includes(value.toLowerCase()));
        const main = document.querySelector('main,[role="main"]');
        const css = body ? getComputedStyle(body) : null;
        return {
          semantic, anchors:document.querySelectorAll('a[href]').length,
          buttons:document.querySelectorAll('button,[role="button"]').length,
          headings:document.querySelectorAll('h1,h2,h3,h4').length,
          mainPresent:Boolean(main), overflowX:document.documentElement.scrollWidth > innerWidth + 4,
          bodyBackground:css?.backgroundColor || 'unavailable',
          bodyTextColor:css?.color || 'unavailable'
        };
      }, site.expectAny);
      // Counts and booleans only; never record page text, DOM, cookies or tokens.
      item.semanticHits = observations.semantic.filter(Boolean).length;
      item.anchorCount = observations.anchors;
      item.buttonCount = observations.buttons;
      item.headingCount = observations.headings;
      item.mainPresent = observations.mainPresent;
      item.horizontalOverflow = observations.overflowX;
      item.bodyBackground = observations.bodyBackground;
      item.bodyTextColor = observations.bodyTextColor;
      if (!item.semanticHits) item.status = 'drift-candidate';

      // Only currently published userscripts can be observed here.
      // Loading scripts here uses a shim, not the actual Violentmonkey extension.
      if (site.publicScriptId === 'totalphase-batch-downloader' && item.status === 'observed') {
        const localPath = path.join('scripts', site.publicScriptId, site.publicScriptId + '.user.js');
        const bytes = await fs.readFile(localPath,'utf8');
        await page.evaluate(() => {
          window.GM_addStyle = css => {
            const node = document.createElement('style');
            node.textContent = css;
            document.head.append(node);
          };
          window.GM_registerMenuCommand = () => {};
        });
        await page.addScriptTag({content:bytes});
        const launcher = page.locator('#tpbd-launcher');
        await launcher.waitFor({state:'visible', timeout:5000});
        const rect = await launcher.boundingBox();
        item.publicScriptSmoke = rect ? 'launcher-visible' : 'launcher-missing';
        if (rect && (rect.x < 0 || rect.y < 0 || rect.x + rect.width > deviceConfig.viewport.width + 2 ||
            rect.y + rect.height > deviceConfig.viewport.height + 2)) {
          item.publicScriptSmoke = 'launcher-outside-viewport';
          item.status = 'script-regression';
        }
        // Observe controls only; do not click Process, Download, Trigger, or Save.
        await launcher.click();
        const panel = page.locator('#tpbd-panel');
        await panel.waitFor({state:'visible', timeout:5000});
        const box = await panel.boundingBox();
        item.publicScriptPanel = box ? 'visible' : 'missing';
        if (box && (box.x < -2 || box.y < -2 || box.x + box.width > deviceConfig.viewport.width + 2 ||
            box.y + box.height > deviceConfig.viewport.height + 2)) {
          item.publicScriptPanel = 'outside-viewport';
          item.status = 'script-regression';
        }
      }
    }
  } catch (error) {
    item.status = ['observed','drift-candidate','script-regression'].includes(item.status)
      ? 'script-regression' : 'inconclusive';
    item.errorClass = safeFailure(error);
  } finally {
    records.push(item);
    summarize(item);
    await context.close();
  }
}
await browser.close();
await fs.mkdir('reports', {recursive:true});
const report = {
  schemaVersion:1, observedAt:new Date().toISOString(),
  sourceCommit:process.env.GITHUB_SHA || 'local-unpinned',
  browser:browserName, profile, results:records,
  limitations:['No authentication or vendor clicks','Mobile profiles are emulation, not devices',
    'No private script execution','Screenshot baselines are not automatically approved']
};
const filename = 'reports/' + browserName + '-' + profile + '.json';
await fs.writeFile(filename, JSON.stringify(report,null,2) + '\n');
const candidateDrift = records.filter(x => x.status === 'drift-candidate').length;
const blocked = records.filter(x => !['observed','drift-candidate'].includes(x.status)).length;
console.log(JSON.stringify({event:'userscripts.site-observer.summary',browser:browserName,profile,
  driftCandidates:candidateDrift,notObservedOrFailed:blocked,report:filename}));
if (records.some(x => x.status === 'script-regression')) process.exitCode = 1;
