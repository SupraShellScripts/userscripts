// Drift baselines are reviewed and version-controlled. Never autoapprove a new site appearance.
export function matchBaseline(baselines, siteId, browser, profile) {
  if (baselines?.schemaVersion !== 1 || baselines.approved !== true ||
      typeof baselines.approvedBy !== 'string' || !baselines.approvedBy.trim() ||
      !Number.isFinite(Date.parse(baselines.approvedAt || ''))) {
    return null;
  }
  const target = (baselines.cases || []).find(item =>
    item.siteId === siteId && item.browser === browser && item.profile === profile);
  return target || null;
}

export function assessDrift(item, baseline) {
  if (!baseline) return {driftState:'baseline-pending',reasons:[]};
  if (item.status !== 'observed') return {driftState:'not-comparable',reasons:[]};
  const reasons = [];
  const checks = [
    ['semanticHits','minimumSemanticHits'],
    ['anchorCount','minimumAnchors'],
    ['buttonCount','minimumButtons'],
    ['headingCount','minimumHeadings'],
  ];
  for (const [actual, minimum] of checks) {
    if (Number.isFinite(baseline[minimum]) && Number(item[actual]) < baseline[minimum]) {
      reasons.push(actual + '-below-approved-minimum');
    }
  }
  if (typeof baseline.mainRequired === 'boolean' &&
      baseline.mainRequired && !item.mainPresent) reasons.push('main-landmark-missing');
  if (baseline.horizontalOverflowForbidden === true && item.horizontalOverflow) {
    reasons.push('horizontal-overflow');
  }
  if (baseline.publicLauncherRequired === true && item.publicScriptSmoke !== 'launcher-visible') {
    reasons.push('public-launcher-missing');
  }
  if (baseline.publicPanelRequired === true && item.publicScriptPanel !== 'visible') {
    reasons.push('public-panel-missing');
  }
  return reasons.length
    ? {driftState:'drift-candidate',reasons}
    : {driftState:'within-approved-baseline',reasons:[]};
}
