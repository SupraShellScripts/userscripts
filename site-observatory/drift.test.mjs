import test from 'node:test';
import assert from 'node:assert/strict';
import {matchBaseline, assessDrift} from './drift.mjs';

const approved = {
  schemaVersion:1, approved:true, approvedBy:'reviewer', approvedAt:'2026-11-23T20:00:00Z',
  cases:[{siteId:'test',browser:'chromium',profile:'desktop',minimumSemanticHits:2,
    minimumAnchors:5, minimumButtons:1, minimumHeadings:1, mainRequired:true,
    horizontalOverflowForbidden:true, publicLauncherRequired:true, publicPanelRequired:true}],
};
const healthy = {status:'observed',semanticHits:2,anchorCount:10,buttonCount:3,
  headingCount:2,mainPresent:true,horizontalOverflow:false,
  publicScriptSmoke:'launcher-visible',publicScriptPanel:'visible'};
test('an unapproved baseline is never accepted even if it contains candidate cases', () => {
  for (const candidate of [
    {...approved,approved:false},
    {...approved,approvedBy:''},
    {...approved,approvedAt:null},
    {...approved,schemaVersion:0},
  ]) assert.equal(matchBaseline(candidate,'test','chromium','desktop'),null);
});
test('approved baseline is scoped to exact browser/profile/site', () => {
  assert.ok(matchBaseline(approved,'test','chromium','desktop'));
  assert.equal(matchBaseline(approved,'test','firefox','desktop'),null);
  assert.equal(matchBaseline(approved,'test','chromium','mobile'),null);
  assert.equal(matchBaseline(approved,'other','chromium','desktop'),null);
});
test('genuine semantic and responsive regression returns classified reasons', () => {
  const baseline=matchBaseline(approved,'test','chromium','desktop');
  assert.equal(assessDrift(healthy,baseline).driftState,'within-approved-baseline');
  const broken={...healthy,semanticHits:0,anchorCount:2,headingCount:0,
    mainPresent:false,horizontalOverflow:true,publicScriptSmoke:'launcher-missing'};
  const drift=assessDrift(broken,baseline);
  assert.equal(drift.driftState,'drift-candidate');
  assert.deepEqual(drift.reasons.sort(),[
    'anchorCount-below-approved-minimum','headingCount-below-approved-minimum',
    'horizontal-overflow','main-landmark-missing','public-launcher-missing',
    'semanticHits-below-approved-minimum'].sort());
});
test('anti-bot and unavailable sites are not misclassified as DOM drift', () => {
  const baseline=matchBaseline(approved,'test','chromium','desktop');
  for (const status of ['site-unavailable','auth-required','inconclusive','redirected-off-site']) {
    assert.equal(assessDrift({...healthy,status},baseline).driftState,'not-comparable');
  }
});
test('without an approved reference every observation is baseline-pending', () => {
  assert.equal(assessDrift(healthy,null).driftState,'baseline-pending');
});
