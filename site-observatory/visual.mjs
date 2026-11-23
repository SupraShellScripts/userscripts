// Anonymous, deterministic screenshot fixture for the already published Total Phase UI.
// No private script, vendor account, real vendor page, cookies, signed URL, or download.
import fs from 'node:fs/promises';
import path from 'node:path';

function luminance(channel) {
  const x = channel / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function rgb(css) {
  const values = css.match(/[\d.]+/g)?.map(Number).slice(0,3);
  return values?.length === 3 ? values : null;
}
function contrast(foreground, background) {
  const a = rgb(foreground), b = rgb(background);
  if (!a || !b) return null;
  const perceived = color => 0.2126 * luminance(color[0]) +
    0.7152 * luminance(color[1]) + 0.0722 * luminance(color[2]);
  const aa = perceived(a), bb = perceived(b);
  return (Math.max(aa,bb) + 0.05) / (Math.min(aa,bb) + 0.05);
}

export async function observeSyntheticPublishedUi(browser, browserName, profile, deviceConfig) {
  const page = await browser.newPage({
    ...deviceConfig,
    locale:'en-US',
    colorScheme:'light',
    acceptDownloads:false,
  });
  const fixtureUrl = 'https://www.totalphase.com/__synthetic_userscript_fixture__/';
  try {
    await page.route('**/*', async route => {
      if (route.request().url() !== fixtureUrl) return route.abort();
      return route.fulfill({
        status:200,contentType:'text/html',
        body:'<!doctype html><html lang="en"><head><title>Synthetic public download fixture</title></head>'+
          '<body><main><h1>Example download resources</h1><p>Public synthetic page only</p>'+
          '<a href="/downloadable/download/sample/sample_id/123/">Example package</a></main></body></html>',
      });
    });
    await page.addInitScript(() => {
      window.GM_addStyle = css => {
        const node=document.createElement('style');
        node.textContent=css;
        (document.head || document.documentElement).append(node);
      };
      window.GM_registerMenuCommand = () => {};
    });
    await page.goto(fixtureUrl, {waitUntil:'domcontentloaded',timeout:15000});
    const bytes = await fs.readFile(path.join('scripts','totalphase-batch-downloader','totalphase-batch-downloader.user.js'),'utf8');
    await page.addScriptTag({content:bytes});
    await page.locator('#tpbd-launcher').waitFor({state:'visible',timeout:5000});
    await page.locator('#tpbd-launcher').click();
    const panel = page.locator('#tpbd-panel');
    await panel.waitFor({state:'visible',timeout:5000});
    const box=await panel.boundingBox();
    const css=await panel.evaluate(node=>{
      const computed=getComputedStyle(node);
      return {foreground:computed.color,background:computed.backgroundColor};
    });
    const ratio=contrast(css.foreground,css.background);
    await fs.mkdir('reports/visual',{recursive:true});
    const imagePath='reports/visual/totalphase-'+browserName+'-'+profile+'.png';
    await panel.screenshot({path:imagePath,timeout:10000,animations:'disabled'});
    const inside=Boolean(box && box.x >= -2 && box.y >= -2 &&
      box.x + box.width <= deviceConfig.viewport.width + 2 &&
      box.y + box.height <= deviceConfig.viewport.height + 2);
    return {fixture:'synthetic-published-totalphase',browser:browserName,profile,
      panelInsideViewport:inside,panelContrastRatio:ratio,
      screenshot:imagePath,uiCheck:inside && ratio !== null && ratio >= 4.5 ? 'pass':'regression'};
  } finally {
    await page.close();
  }
}
