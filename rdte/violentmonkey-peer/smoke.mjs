// Public-only R&D, real upstream Violentmonkey v2.50.0, no personal scripts.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const extensionDir = path.resolve(process.env.VM_EXTENSION_DIR || '.work/violentmonkey');
const report = { schema: 1, profile: 'chromium-mv3', extensionVersion: '2.50.0',
  extensionBoot: false, settingsLoaded: false, nativeProviders: [],
  syncButtons: { merge: false, push: false, pull: false }, errorClass: null,
  dom: {ready:'unknown',bodyChildren:0,vueRoot:false,settingsPanel:false,selects:0,options:0},
  pageErrorNames:[], consoleErrors:0 };
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vm-peer-public-'));
let context;
try {
  context = await chromium.launchPersistentContext(temporary, {
    channel: 'chromium', headless: true,
    args: [
      '--disable-extensions-except=' + extensionDir,
      '--load-extension=' + extensionDir,
      '--no-first-run', '--no-default-browser-check',
    ],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', {timeout: 45000});
  const id = new URL(worker.url()).host;
  if (!/^[a-p]{32}$/.test(id)) throw new Error('Invalid extension service-worker ID');
  report.extensionBoot = true;
  const page = await context.newPage();
  page.on('pageerror',error => {
    if (report.pageErrorNames.length < 5) report.pageErrorNames.push(error?.name || 'Error');
  });
  page.on('console',message => {
    if (message.type() === 'error') report.consoleErrors++;
  });
  await page.goto('chrome-extension://' + id + '/options/index.html#settings',
    {waitUntil: 'domcontentloaded', timeout: 30000});
  try {
    await page.locator('option[value="webdav"]').waitFor({timeout: 10000});
  } finally {
    report.dom = await page.evaluate(() => ({
      ready:document.readyState,
      bodyChildren:document.body?.children.length||0,
      vueRoot:!!document.querySelector('.page-options'),
      settingsPanel:!!document.querySelector('.tab-settings'),
      selects:document.querySelectorAll('select').length,
      options:document.querySelectorAll('select option').length,
    })).catch(() => report.dom);
  }
  report.settingsLoaded = true;
  report.nativeProviders = await page.locator('select:has(option[value="webdav"]) option')
    .evaluateAll(elements => elements.map(el => el.value).filter(Boolean).sort());
  // The sync action buttons render only when a provider is selected.
  // Select WebDAV without entering a server address or making requests.
  await page.locator('select:has(option[value="webdav"])').selectOption('webdav');
  await page.locator('fieldset:has(input[type="url"])').first().waitFor({timeout: 15000});
  const section = page.locator('section:has(option[value="webdav"])');
  const num = await section.locator('button:has(svg)').count();
  report.syncButtons = { merge: num > 0, push: num > 1, pull: num > 2 };
  if (!['webdav','github-contents'].every(p => report.nativeProviders.includes(p)))
    throw new Error('Native provider missing from extension UI');
  if (!report.syncButtons.merge || !report.syncButtons.pull)
    throw new Error('Native sync controls missing');
  await page.close();
} catch (error) {
  report.errorClass = /Timeout/i.test(String(error)) ? 'timeout' : 'extension-ui-error';
  process.exitCode = 1;
} finally {
  await context?.close().catch(()=>{});
  await fs.rm(temporary,{recursive:true,force:true});
}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/violentmonkey-peer-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'vm-real-extension-smoke',...report}));
