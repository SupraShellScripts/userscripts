import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUpdate,sha256} from './update-preflight.mjs';
const script=(v, extra=[], body='baseline')=>[
 '// ==UserScript==','// @name Synthetic Strict Metadata','// @namespace https://example.invalid/strict',`// @version ${v}`,
 '// @match https://example.invalid/*','// @grant none',...extra,'// ==/UserScript==',`const syntheticRevision = ${JSON.stringify(body)};`,'',
].join('\n');
const admit=(base,remote,meta=remote)=>assessUpdate({approvedBaseline:base,installedCode:base,remoteCode:remote,remoteMeta:meta,approvedRemoteSha256:sha256(remote)});
const b=script('1.0.0');
for(const [name,baseline,remote] of [
 ['run-at change',b,script('1.1.0',['// @run-at document-start'])],
 ['noframes removal',script('1.0.0',['// @noframes']),script('1.1.0')],
 ['unwrap flag added',b,script('1.1.0',['// @unwrap'])],
 ['unrecognized directive added',b,script('1.1.0',['// @future-directive on'])],
 ['case-variant directive added',b,script('1.1.0',['// @GRANT GM_xmlhttpRequest'])],
 ['ordered dependencies reversed',script('1.0.0',['// @require https://example.invalid/a.js','// @require https://example.invalid/b.js']),script('1.1.0',['// @require https://example.invalid/b.js','// @require https://example.invalid/a.js'])],
 ['duplicate version rejected',b,script('1.1.0',['// @version 1.1.0'])],
 ['noncanonical version line rejected',b,script('1.1.0').replace('// @version','  // @version')],
])test(name,()=>assert.equal(admit(baseline,remote).decision,'block'));
test('metadata and body directive disagreement rejected',()=>assert.equal(admit(b,script('1.1.0'),script('1.1.0',['// @run-at document-start'])).decision,'block'));
test('version and body only change accepted',()=>assert.equal(admit(b,script('1.1.0',[],'release')).decision,'allow-update'));
test('exact replay accepted as noop',()=>assert.equal(admit(b,b).decision,'noop'));
