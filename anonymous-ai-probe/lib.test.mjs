import test from 'node:test';
import assert from 'node:assert/strict';
import {targets,classifyHost,classifyResult,safeRecord,safeFailure} from './lib.mjs';

test('only reviewed public, anonymous entrypoints are configured',()=>{
  assert.deepEqual(targets.map(x=>x.id),['chatgpt','chatgpt-legacy','gemini']);
  for(const target of targets) {
    assert.equal(new URL(target.url).protocol,'https:');
    assert.equal(new URL(target.url).username,'');
    assert.equal(new URL(target.url).password,'');
  }
});
test('known login redirect and legacy canonical redirect are distinct',()=>{
  assert.equal(classifyHost(targets[2],'https://accounts.google.com/signin'),'auth-provider');
  assert.equal(classifyHost(targets[1],'https://chatgpt.com/'),'target');
  assert.equal(classifyHost(targets[0],'https://unreviewed.invalid/'),'other');
  assert.equal(classifyHost(targets[2],'http://gemini.google.com/app'),'other');
});
test('anti-bot, auth, offsite and public pages are not conflated',()=>{
  assert.equal(classifyResult({httpStatus:403,hostClass:'target'}),'access-blocked');
  assert.equal(classifyResult({httpStatus:200,hostClass:'auth-provider'}),'auth-required');
  assert.equal(classifyResult({httpStatus:200,hostClass:'other'}),'redirected-offsite');
  assert.equal(classifyResult({httpStatus:200,hostClass:'target',challenge:true}),'challenge');
  assert.equal(classifyResult({httpStatus:200,hostClass:'target',loginAffordance:true}),'login-visible');
  assert.equal(classifyResult({httpStatus:200,hostClass:'target'}),'anonymous-page');
  assert.equal(classifyResult({httpStatus:null,hostClass:'target'}),'inconclusive');
});
test('report schema drops page text, full URLs, accounts and unknown fields',()=>{
  const item=safeRecord({
    targetId:'gemini',browser:'chromium',profile:'desktop',status:'auth-required',
    hostClass:'auth-provider',httpStatus:200,buttonCount:4,textboxCount:1,
    pageText:'SHOULD NEVER LEAK',redirectUrl:'https://example.com/?token=SHOULD_NOT_LEAK',
    cookie:'SHOULD NEVER LEAK',account:'SHOULD NEVER LEAK',error:'private stack trace',
    blockedDownloads:0,blockedNonGetCount:1,
  });
  const serialized=JSON.stringify(item);
  assert.doesNotMatch(serialized,/SHOULD NEVER LEAK|SHOULD_NOT_LEAK|cookie|account|redirectUrl|pageText|stack trace/);
  assert.equal(item.buttonCount,4);
  assert.equal(item.blockedNonGetCount,1);
});
test('bounded counts and errors cannot spill page content',()=>{
  assert.equal(safeRecord({buttonCount:999999}).buttonCount,999);
  assert.equal(safeRecord({buttonCount:-3}).buttonCount,0);
  assert.equal(safeFailure(new Error('Timeout while visiting https://x.invalid/token=a')),'timeout');
  assert.equal(safeFailure(new Error('html content secret')),'navigation-error');
});
