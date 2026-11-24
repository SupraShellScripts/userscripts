import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUpdate,sha256} from './update-preflight.mjs';
function script(version='1.0.0',body='baseline',fields=[]){
 return [
  '// ==UserScript==',
  '// @name         Synthetic Collision',
  '// @namespace    https://example.invalid/collision',
  '// @version      '+version,
  '// @match        https://example.invalid/*',
  '// @updateURL    https://example.invalid/script.meta.js',
  '// @downloadURL  https://example.invalid/script.user.js',
  '// @grant        none',
  ...fields,
  '// ==/UserScript==',
  '',
  'const test='+JSON.stringify(body)+';',
  '',
 ].join('\n');
}
const baseline=script('1.0.0'),release=script('1.1.0','release');
const input=(installedCode=baseline,remoteCode=release,remoteMeta=release)=>({
  approvedBaseline:baseline,installedCode,remoteCode,remoteMeta,
  approvedRemoteSha256:sha256(remoteCode),
});
test('clean version upgrade admitted',()=>assert.equal(assessUpdate(input()).decision,'allow-update'));
test('local dirty even when advertised release newer is blocked',()=>{
 const r=assessUpdate(input(script('1.0.0','unsynced-work')));
 assert.equal(r.decision,'block');assert.equal(r.localDirty,true);
 assert.ok(r.reasons.includes('local-unpublished-edits'));
});
test('remote update at same version with changed code is forbidden',()=>{
 const r=assessUpdate(input(baseline,script('1.0.0','different')));
 assert.equal(r.decision,'block');assert.ok(r.reasons.includes('same-version-different-code'));
});
test('replayed exact same script is noop',()=>assert.equal(
 assessUpdate(input(baseline,baseline)).decision,'noop'));
test('remote rollback blocked',()=>assert.equal(
 assessUpdate(input(script('1.0.0'),script('0.9.0'))).decision,'block'));
test('expanded host scope is blocked even if pinned',()=>{
 const r=assessUpdate(input(baseline,script('1.1.0','r',
  ['// @match https://other.invalid/*'])));
 assert.equal(r.decision,'block');assert.ok(r.reasons.includes('metadata-scope-drift'));
});
test('escalated grant blocked even if pinned',()=>{
 const r=assessUpdate(input(baseline,script('1.1.0','r',['// @grant GM_xmlhttpRequest'])));
 assert.ok(r.reasons.includes('metadata-scope-drift'));
});
test('new updateURL or downloadURL blocked',()=>{
 const r=assessUpdate(input(baseline,script('1.1.0','r',['// @downloadURL https://other.invalid/'])));
 assert.ok(r.reasons.includes('metadata-scope-drift'));
});
test('different release metadata and code versions block',()=>{
 const r=assessUpdate(input(baseline,release,script('1.2.0','release')));
 assert.ok(r.reasons.includes('metadata-body-version-mismatch'));
});
test('altered bytes vs approved digest block',()=>{
 const r=assessUpdate({...input(),approvedRemoteSha256:sha256('unrelated')});
 assert.ok(r.reasons.includes('unapproved-remote-code'));
});
test('unapproved or absent digest fail closed',()=>{
 const r=assessUpdate({...input(),approvedRemoteSha256:null});
 assert.ok(r.reasons.includes('missing-approved-artifact-digest'));
});
test('missing update metadata and malformed scripts fail closed',()=>{
 assert.equal(assessUpdate(input(baseline,release,'')).decision,'block');
 assert.equal(assessUpdate(input('garbage')).decision,'block');
});
test('no privileged metadata leakage and stable numeric versions only',()=>{
 const r=assessUpdate(input(baseline,script('1.1.0-beta')));
 assert.equal(r.decision,'block');assert.ok(r.reasons.includes('unsupported-version-format'));
});
