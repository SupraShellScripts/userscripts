// Public-only, generic anonymous-site probe contract.
// Contains no private userscript source, authenticated fixture, or selectors.
export const targets = Object.freeze([
  {id:'chatgpt',url:'https://chatgpt.com/',hosts:['chatgpt.com','chat.openai.com'],authHosts:['auth.openai.com','auth0.openai.com','login.openai.com']},
  {id:'chatgpt-legacy',url:'https://chat.openai.com/',hosts:['chat.openai.com','chatgpt.com'],authHosts:['auth.openai.com','auth0.openai.com','login.openai.com']},
  {id:'gemini',url:'https://gemini.google.com/app',hosts:['gemini.google.com'],authHosts:['accounts.google.com']},
]);

export function classifyHost(site, finalUrl) {
  try {
    const url=new URL(finalUrl);
    if (url.protocol !== 'https:') return 'other';
    const host=url.hostname.toLowerCase();
    if (site.hosts.includes(host)) return 'target';
    if (site.authHosts.includes(host)) return 'auth-provider';
  } catch {}
  return 'other';
}

export function classifyResult({httpStatus,hostClass,loginAffordance,challenge}) {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429 ||
      httpStatus === 451 || Number(httpStatus) >= 500) return 'access-blocked';
  if (hostClass === 'auth-provider') return 'auth-required';
  if (hostClass === 'other') return 'redirected-offsite';
  if (challenge) return 'challenge';
  if (loginAffordance) return 'auth-required';
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 400) return 'inconclusive';
  // Anonymous page visibility is NOT a guarantee that chat transcripts are accessible.
  return 'anonymous-page';
}

function boundedCount(x) {
  return Number.isFinite(x) ? Math.max(0,Math.min(999,Math.floor(x))) : 0;
}

// Allowlist fields explicitly. Do not echo page URLs, text, titles or exceptions.
export function safeRecord(raw) {
  return {
    targetId:raw.targetId,
    browser:raw.browser,
    profile:raw.profile,
    status:raw.status,
    httpStatus:Number.isInteger(raw.httpStatus) ? raw.httpStatus : null,
    hostClass:raw.hostClass || 'unknown',
    errorClass:raw.errorClass || null,
    loginAffordance:Boolean(raw.loginAffordance),
    challenge:Boolean(raw.challenge),
    mainPresent:Boolean(raw.mainPresent),
    buttonCount:boundedCount(raw.buttonCount),
    textboxCount:boundedCount(raw.textboxCount),
    headingCount:boundedCount(raw.headingCount),
    shadowDomAvailable:Boolean(raw.shadowDomAvailable),
    mutationObserverAvailable:Boolean(raw.mutationObserverAvailable),
    blockedNonGetCount:boundedCount(raw.blockedNonGetCount),
    blockedDownloads:boundedCount(raw.blockedDownloads)
  };
}

export function safeFailure(error) {
  const x=String(error?.message || error);
  if (/timeout/i.test(x)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(x)) return 'dns';
  if (/ERR_CERT|SSL|certificate/i.test(x)) return 'tls';
  if (/ERR_CONNECTION|ECONN|ERR_NETWORK/i.test(x)) return 'connection';
  return 'navigation-error';
}
