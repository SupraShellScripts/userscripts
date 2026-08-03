// ==UserScript==
// @name         Total Phase Batch Downloader
// @namespace    https://github.com/SupraShellScripts/userscripts
// @version      1.1.1
// @description  Select, sequence, and document authenticated Total Phase software, driver, firmware, and documentation downloads.
// @author       Mark E. DeYoung
// @license      PolyForm-Noncommercial-1.0.0
// @copyright    2026 Mark E. DeYoung.
// @homepageURL  https://suprashellscripts.github.io/userscripts/scripts/totalphase-batch-downloader/
// @supportURL   https://github.com/SupraShellScripts/userscripts/issues
// @updateURL    https://suprashellscripts.github.io/userscripts/scripts/totalphase-batch-downloader/totalphase-batch-downloader.meta.js
// @downloadURL  https://suprashellscripts.github.io/userscripts/scripts/totalphase-batch-downloader/totalphase-batch-downloader.user.js
// @match        https://www.totalphase.com/*
// @match        https://totalphase.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

// Required Notice: Copyright 2026 Mark E. DeYoung.
// License terms: https://polyformproject.org/licenses/noncommercial/1.0.0

(() => {
  'use strict';

  const SENSITIVE_QUERY_RE = /(?:token|auth|authorization|signature|sig|key|secret|session|ticket|code|credential|x-amz-|x-goog-)/i;
  const FILE_EXTENSION_RE = /\.(?:7z|bin|bz2|cab|deb|dmg|docx?|elf|exe|gz|hex|img|iso|json|msi|pdf|pkg|qdz|rar|rpm|sof|tar|tgz|txt|whl|xz|zip)(?:$|[?#])/i;

  function normalizeWhitespace(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeFilename(value) {
    const result = normalizeWhitespace(value)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/[. ]+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 180);
    return result || 'download';
  }

  function redactUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      const keys = [...url.searchParams.keys()];
      for (const key of keys) {
        url.searchParams.set(key, SENSITIVE_QUERY_RE.test(key) ? '<redacted-sensitive>' : '<redacted>');
      }
      url.hash = '';
      url.pathname = url.pathname
        .split('/')
        .map((segment) => /^[A-Za-z0-9_-]{48,}$/.test(segment) ? '<redacted-opaque-segment>' : segment)
        .join('/');
      return url.href;
    } catch {
      return '<unparseable-url>';
    }
  }

  function filenameFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      const candidate = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      return FILE_EXTENSION_RE.test(candidate) ? sanitizeFilename(candidate) : '';
    } catch {
      return '';
    }
  }


  function openRoots() {
    const roots = [document];
    const queue = [document];
    const seen = new Set(queue);
    while (queue.length) {
      const root = queue.shift();
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot && !seen.has(element.shadowRoot)) {
          seen.add(element.shadowRoot);
          roots.push(element.shadowRoot);
          queue.push(element.shadowRoot);
        }
      }
    }
    return roots;
  }

  function deepQuerySelectorAll(selector) {
    const output = [];
    const seen = new Set();
    for (const root of openRoots()) {
      for (const element of root.querySelectorAll(selector)) {
        if (!seen.has(element)) {
          seen.add(element);
          output.push(element);
        }
      }
    }
    return output;
  }

  function deepQuerySelector(selector) {
    for (const root of openRoots()) {
      const element = root.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function closestLabel(element) {
    const container = element.closest('article, li, tr, section, [class*="card"], [class*="tile"], [class*="download"], [class*="document"]');
    const heading = container?.querySelector('h1, h2, h3, h4, h5, [class*="title"], strong');
    return normalizeWhitespace(
      heading?.textContent ||
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.textContent ||
      element.getAttribute('download') ||
      filenameFromUrl(element.href || '') ||
      'Download'
    );
  }

  function elementSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    const parts = [];
    let cursor = element;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = cursor.localName;
      if (!part) {
        break;
      }
      const classes = [...cursor.classList].filter((name) => /^[a-zA-Z0-9_-]+$/.test(name)).slice(0, 2);
      if (classes.length) {
        part += `.${classes.map((name) => CSS.escape(name)).join('.')}`;
      }
      const parent = cursor.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.localName === cursor.localName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(cursor) + 1})`;
        }
      }
      parts.unshift(part);
      cursor = parent;
    }
    return parts.join(' > ');
  }

  function saveJson(filename, value) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function addStyle(css) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
      return;
    }
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function registerMenu(label, handler) {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand(label, handler);
    }
  }

  function createButton(label, handler, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', handler);
    return button;
  }

  function randomHex(bytes) {
    const values = new Uint8Array(bytes);
    globalThis.crypto?.getRandomValues?.(values);
    if (!values.some((value) => value !== 0)) {
      for (let index = 0; index < values.length; index += 1) {values[index] = Math.floor(Math.random() * 256);}
    }
    return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  function boot(adapter) {
    const prefix = adapter.prefix;
    const instanceId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sessionId = globalThis.crypto?.randomUUID?.() || instanceId;
    const correlationId = randomHex(16);
    const acquisitionId = globalThis.crypto?.randomUUID?.() || sessionId;
    const leaseKey = `suprashellscripts-userscripts:${prefix}:queue-lease`;
    const leaseTtlMs = 15000;
    const defaults = {delayMs: 1500, maxRetries: 2, observeMutations: true};
    const config = {...defaults, ...adapter};
    const diagnostics = [];
    function emitDiagnostic(severity, eventName, message, attributes = {}) {
      const timestamp = new Date().toISOString();
      const record = {
        timestamp,
        severity,
        eventName,
        message,
        sessionId,
        correlationId,
        userscript: {name: config.name, version: '1.1.1'},
        attributes,
      };
      diagnostics.push(record);
      if (diagnostics.length > 500) {diagnostics.shift();}
      const output = `${timestamp} ${severity} event=${eventName} session_id="${sessionId}" correlation_id="${correlationId}" message=${JSON.stringify(message)}`;
      const method = severity === 'ERROR' ? 'error' : (severity === 'WARN' ? 'warn' : 'info');
      globalThis.console?.[method]?.(output, attributes);
      return record;
    }
    let items = [];
    let running = false;
    let stopRequested = false;
    let panel;
    let launcher;
    let rows;
    let filter;
    let delay;
    let status;
    let startButton;
    let stopButton;
    let mutationTimer;
    let leaseTimer;

    function normalizeItem(raw, index) {
      const element = raw.element;
      const url = raw.url || element?.href || '';
      const key = raw.key || `${raw.action || 'download'}:${url || elementSelector(element)}`;
      return {
        key,
        label: normalizeWhitespace(raw.label || closestLabel(element)),
        detail: normalizeWhitespace(raw.detail || ''),
        url,
        redactedUrl: url ? redactUrl(url) : '',
        action: raw.action || (url ? 'download' : 'click'),
        element,
        selector: raw.selector || (element ? elementSelector(element) : ''),
        selected: raw.selected ?? true,
        status: raw.status || 'Ready',
        filename: raw.filename || filenameFromUrl(url),
        kind: raw.kind || 'artifact',
        sequence: index + 1,
        requestId: raw.requestId || globalThis.crypto?.randomUUID?.() || `${instanceId}-${index + 1}`,
      };
    }

    function discover() {
      const prior = new Map(items.map((item) => [item.key, item]));
      const found = config.discover({normalizeWhitespace, closestLabel, filenameFromUrl, FILE_EXTENSION_RE, deepQuerySelectorAll}) || [];
      const deduped = new Map();
      found.map(normalizeItem).forEach((item) => {
        if (deduped.has(item.key)) {
          return;
        }
        const old = prior.get(item.key);
        if (old) {
          item.selected = old.selected;
          item.status = old.status;
          item.filename = old.filename || item.filename;
          item.requestId = old.requestId || item.requestId;
        }
        deduped.set(item.key, item);
      });
      items = [...deduped.values()].map((item, index) => ({...item, sequence: index + 1}));
      render();
      setStatus(`${items.length} candidate artifact${items.length === 1 ? '' : 's'} found.`);
      emitDiagnostic('INFO', 'userscripts.discovery.completed', 'Candidate discovery completed.', {candidateCount: items.length});
    }

    function visibleItems() {
      const query = normalizeWhitespace(filter?.value).toLowerCase();
      if (!query) {
        return items;
      }
      return items.filter((item) => `${item.label} ${item.detail} ${item.redactedUrl} ${item.kind}`.toLowerCase().includes(query));
    }

    function setStatus(message) {
      if (status) {
        status.textContent = message;
      }
    }

    function updateButtons() {
      const selected = items.filter((item) => item.selected).length;
      startButton.disabled = running || selected === 0;
      startButton.textContent = `Process selected (${selected})`;
      stopButton.disabled = !running;
    }

    function render() {
      if (!rows) {
        return;
      }
      rows.textContent = '';
      const visible = visibleItems();
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = `${prefix}-empty`;
        empty.textContent = items.length ? 'No artifacts match the filter.' : 'No artifacts were discovered.';
        rows.appendChild(empty);
        updateButtons();
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const item of visible) {
        const row = document.createElement('div');
        row.className = `${prefix}-row`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected;
        checkbox.disabled = running;
        checkbox.addEventListener('change', () => { item.selected = checkbox.checked; updateButtons(); });
        const details = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const sub = document.createElement('div');
        sub.className = `${prefix}-sub`;
        sub.textContent = item.detail || item.redactedUrl || item.selector;
        details.append(title, sub);
        const actionButton = createButton(item.action === 'open' ? 'Open' : (item.action === 'click' ? 'Trigger' : 'Download one'), () => processSingle(item));
        actionButton.className = `${prefix}-single`;
        actionButton.disabled = running;
        const result = document.createElement('span');
        result.className = `${prefix}-result`;
        result.textContent = item.status;
        row.append(checkbox, details, actionButton, result);
        fragment.appendChild(row);
      }
      rows.appendChild(fragment);
      updateButtons();
    }


    function readLease() {
      try {
        const value = localStorage.getItem(leaseKey);
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    function writeLease(expiresAt) {
      try {
        localStorage.setItem(leaseKey, JSON.stringify({owner: instanceId, expiresAt}));
        return readLease()?.owner === instanceId;
      } catch {
        // Storage can be disabled by browser policy. Continue without cross-tab coordination.
        return true;
      }
    }

    function acquireLease() {
      const existing = readLease();
      if (existing?.owner && existing.owner !== instanceId && Number(existing.expiresAt) > Date.now()) {
        return false;
      }
      if (!writeLease(Date.now() + leaseTtlMs)) {
        return false;
      }
      clearInterval(leaseTimer);
      leaseTimer = setInterval(() => writeLease(Date.now() + leaseTtlMs), Math.floor(leaseTtlMs / 3));
      return true;
    }

    function releaseLease() {
      clearInterval(leaseTimer);
      leaseTimer = undefined;
      try {
        if (readLease()?.owner === instanceId) {
          localStorage.removeItem(leaseKey);
        }
      } catch {
        // Ignore storage restrictions during cleanup.
      }
    }

    function openInNewTab(item) {
      if (!item.url) {
        throw new Error('No URL is available for this item.');
      }
      const anchor = document.createElement('a');
      anchor.href = item.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      item.status = 'Opened in a new tab; complete any required human step there';
      return 'browser-tab-opened';
    }

    async function invokeItem(item) {
      if (config.beforeItem) {
        const decision = await config.beforeItem(item);
        if (decision?.pause) {
          item.status = decision.message || 'Human action required';
          render();
          throw new Error(decision.message || 'Human action required');
        }
      }

      if (item.action === 'open') {
        return openInNewTab(item);
      }

      if (item.action === 'click') {
        const element = item.element?.isConnected ? item.element : deepQuerySelector(item.selector);
        if (!element) {
          throw new Error('Page control is no longer available; rescan the page.');
        }
        element.click();
        item.status = 'Triggered in browser; reconcile locally';
        return 'browser-triggered';
      }

      const element = item.element?.isConnected ? item.element : deepQuerySelector(item.selector);
      if (!element) {
        throw new Error('Page control is no longer available; rescan the page.');
      }
      element.click();
      item.status = 'Triggered in browser; reconcile locally';
      return 'browser-triggered';
    }

    async function processSingle(item) {
      if (running) {
        return;
      }
      if (!acquireLease()) {
        setStatus('Another tab is already processing this vendor queue.');
        emitDiagnostic('WARN', 'userscripts.queue.lease_denied', 'Another tab owns the queue lease.');
        return;
      }
      running = true;
      stopRequested = false;
      item.status = 'Processing…';
      emitDiagnostic('INFO', 'userscripts.item.started', 'Processing one selected item.', {requestId: item.requestId, sequence: item.sequence, action: item.action});
      render();
      try {
        await invokeItem(item);
        setStatus(`${item.label}: ${item.status}`);
        emitDiagnostic('INFO', 'userscripts.item.completed', 'Selected item processing completed.', {requestId: item.requestId, sequence: item.sequence, action: item.action, result: 'success'});
      } catch (error) {
        item.status = `Failed: ${error.message || error}`;
        setStatus(`${item.label}: ${item.status}`);
        emitDiagnostic('ERROR', 'userscripts.item.failed', 'Selected item processing failed.', {requestId: item.requestId, sequence: item.sequence, action: item.action, result: 'failure', errorType: error?.name || 'Error', errorMessage: String(error?.message || error)});
      } finally {
        running = false;
        releaseLease();
        render();
        updateButtons();
      }
    }

    async function processQueue() {
      if (running) {
        return;
      }
      const queue = items.filter((item) => item.selected);
      if (!queue.length) {
        return;
      }
      if (!acquireLease()) {
        setStatus('Another tab is already processing this vendor queue.');
        emitDiagnostic('WARN', 'userscripts.queue.lease_denied', 'Another tab owns the queue lease.');
        return;
      }

      running = true;
      stopRequested = false;
      emitDiagnostic('INFO', 'userscripts.queue.started', 'Selected queue processing started.', {selectedCount: queue.length});
      render();
      updateButtons();
      let processed = 0;
      let failed = 0;

      try {
        for (let index = 0; index < queue.length; index += 1) {
          if (stopRequested) {
            break;
          }

          const item = queue[index];
          let attempt = 0;
          let lastError;
          while (attempt <= config.maxRetries && !stopRequested) {
            attempt += 1;
            item.status = attempt === 1 ? 'Processing…' : `Retry ${attempt - 1}…`;
            emitDiagnostic('INFO', 'userscripts.item.attempted', 'Queue item attempt started.', {requestId: item.requestId, sequence: item.sequence, attempt, action: item.action});
            render();
            setStatus(`Processing ${index + 1} of ${queue.length}: ${item.label}`);
            try {
              await invokeItem(item);
              processed += 1;
              emitDiagnostic('INFO', 'userscripts.item.completed', 'Queue item processing completed.', {requestId: item.requestId, sequence: item.sequence, attempt, action: item.action, result: 'success'});
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (/Human action required|login\/session/i.test(String(error?.message))) {
                break;
              }
              if (attempt <= config.maxRetries) {
                const backoff = Math.min(8000, 750 * (2 ** (attempt - 1)));
                await new Promise((resolve) => setTimeout(resolve, backoff));
              }
            }
          }

          if (lastError) {
            failed += 1;
            item.status = `Failed: ${lastError.message || lastError}`;
            emitDiagnostic('ERROR', 'userscripts.item.failed', 'Queue item processing failed.', {requestId: item.requestId, sequence: item.sequence, action: item.action, result: 'failure', errorType: lastError?.name || 'Error', errorMessage: String(lastError?.message || lastError)});
          }
          render();

          if (!stopRequested && index < queue.length - 1) {
            const configuredDelay = Number.parseInt(delay.value, 10);
            const waitMs = Number.isFinite(configuredDelay) ? Math.max(0, configuredDelay) : config.delayMs;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      } finally {
        running = false;
        releaseLease();
        updateButtons();
      }

      const summary = `Processed ${processed}; failed ${failed}.`;
      setStatus(stopRequested ? `Stopped. ${summary}` : `Finished. ${summary} Reconcile browser downloads locally.`);
      emitDiagnostic(stopRequested ? 'WARN' : (failed ? 'WARN' : 'INFO'), stopRequested ? 'userscripts.queue.stopped' : 'userscripts.queue.completed', summary, {processed, failed, selectedCount: queue.length, result: stopRequested ? 'stopped' : (failed ? 'partial' : 'success')});
    }

    function stop() {
      stopRequested = true;
      setStatus('Stopping before the next browser action…');
      emitDiagnostic('WARN', 'userscripts.queue.stop_requested', 'Stop requested; no new browser action will begin.');
    }

    function saveManifest() {
      emitDiagnostic('INFO', 'userscripts.manifest.saved', 'Acquisition manifest export requested.', {selectedCount: items.filter((item) => item.selected).length, manifestId: acquisitionId});
      saveJson(`${sanitizeFilename(config.vendor)}-download-manifest.json`, {
        schema: 'vendor-download-manifest/v1',
        manifestId: acquisitionId,
        sessionId,
        correlationId,
        createdAt: new Date().toISOString(),
        sourcePage: {title: document.title, url: redactUrl(location.href)},
        vendor: config.vendor,
        userscript: {name: config.name, version: '1.1.1'},
        security: {credentialsIncluded: false, allQueryValuesRedacted: true, opaquePathSegmentsRedacted: true},
        diagnostics: [...diagnostics],
        entries: items.filter((item) => item.selected).map((item) => ({
          requestId: item.requestId,
          sequence: item.sequence,
          label: item.label,
          detail: item.detail || null,
          kind: item.kind,
          action: item.action,
          url: item.redactedUrl || null,
          selector: item.selector || null,
          filename: item.filename || null,
          status: item.status,
        })),
      });
    }

    function createUi() {
      addStyle(`
        #${prefix}-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;padding:10px 15px;background:#1f2937;color:#fff;font:600 13px system-ui;box-shadow:0 6px 22px rgba(0,0,0,.28);cursor:pointer}
        #${prefix}-panel{position:fixed;right:18px;bottom:66px;z-index:2147483647;width:min(760px,calc(100vw - 36px));max-height:min(80vh,780px);display:none;grid-template-rows:auto auto minmax(140px,1fr) auto;overflow:hidden;border:1px solid #94a3b8;border-radius:12px;background:#fff;color:#111827;box-shadow:0 12px 40px rgba(0,0,0,.34);font:13px/1.35 system-ui}
        #${prefix}-panel.${prefix}-open{display:grid}#${prefix}-panel *{box-sizing:border-box}.${prefix}-head,.${prefix}-foot{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f1f5f9}.${prefix}-head strong{flex:1}.${prefix}-tools{display:flex;flex-wrap:wrap;gap:7px;padding:10px 12px;border-bottom:1px solid #e2e8f0}.${prefix}-tools input[type=search]{flex:1 1 220px;min-width:150px}.${prefix}-tools input,.${prefix}-tools button,.${prefix}-head button,.${prefix}-foot button,.${prefix}-single{padding:7px 9px;border:1px solid #94a3b8;border-radius:6px;background:#fff;color:#111827}.${prefix}-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto minmax(110px,auto);gap:8px;padding:9px 12px;border-bottom:1px solid #e5e7eb}.${prefix}-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:11px}.${prefix}-result{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:#475569;font-size:11px}.${prefix}-empty{padding:24px;text-align:center}.${prefix}-status{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.${prefix}-primary{background:#1d4ed8!important;color:#fff!important}.${prefix}-danger{background:#b91c1c!important;color:#fff!important}
      `);
      launcher = createButton(config.launcherLabel || `${config.vendor} downloads`, () => {
        const open = panel.classList.toggle(`${prefix}-open`);
        launcher.textContent = open ? 'Hide downloads' : (config.launcherLabel || `${config.vendor} downloads`);
        if (open) {
          discover();
        }
      });
      launcher.id = `${prefix}-launcher`;
      panel = document.createElement('section');
      panel.id = `${prefix}-panel`;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', config.name);
      const head = document.createElement('div');
      head.className = `${prefix}-head`;
      const heading = document.createElement('strong');
      heading.textContent = config.name;
      head.append(heading, createButton('Close', () => launcher.click()));
      const tools = document.createElement('div');
      tools.className = `${prefix}-tools`;
      filter = document.createElement('input');
      filter.type = 'search';
      filter.placeholder = 'Filter artifacts';
      filter.addEventListener('input', render);
      delay = document.createElement('input');
      delay.type = 'number';
      delay.min = '0';
      delay.max = '60000';
      delay.step = '100';
      delay.value = String(config.delayMs);
      delay.title = 'Delay between browser actions in milliseconds';
      tools.append(
        filter,
        createButton('Select visible', () => { visibleItems().forEach((item) => { item.selected = true; }); render(); }),
        createButton('Clear visible', () => { visibleItems().forEach((item) => { item.selected = false; }); render(); }),
        createButton('Rescan', discover),
        createButton('Save manifest', saveManifest),
        delay,
      );
      rows = document.createElement('div');
      rows.id = `${prefix}-rows`;
      rows.style.overflow = 'auto';
      const foot = document.createElement('div');
      foot.className = `${prefix}-foot`;
      status = document.createElement('div');
      status.className = `${prefix}-status`;
      status.textContent = 'Ready.';
      stopButton = createButton('Stop', stop, `${prefix}-danger`);
      startButton = createButton('Process selected (0)', processQueue, `${prefix}-primary`);
      foot.append(status, stopButton, startButton);
      panel.append(head, tools, rows, foot);
      document.body.append(panel, launcher);
      updateButtons();
    }

    emitDiagnostic('INFO', 'userscripts.session.started', 'Userscript session started.', {vendor: config.vendor, pageTitle: document.title});
    createUi();
    window.addEventListener('beforeunload', releaseLease, {once: true});
    registerMenu(`Open ${config.name}`, () => {
      if (!panel.classList.contains(`${prefix}-open`)) {
        launcher.click();
      }
    });
    if (config.observeMutations) {
      const observedRoots = new WeakSet();
      const scheduleDiscover = () => {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
          observeOpenRoots();
          if (panel.classList.contains(`${prefix}-open`) && !running) {
            discover();
          }
        }, 500);
      };
      const observeOpenRoots = () => {
        for (const root of openRoots()) {
          const target = root === document ? document.documentElement : root;
          if (!target || observedRoots.has(target)) {
            continue;
          }
          observedRoots.add(target);
          new MutationObserver(scheduleDiscover).observe(target, {subtree: true, childList: true});
        }
      };
      observeOpenRoots();
    }
  }

  const core = Object.freeze({boot, normalizeWhitespace, redactUrl, filenameFromUrl, deepQuerySelectorAll});
  globalThis.SupraUserscriptCore = core;
  globalThis.MDEVendorDownloadCore = core;
})();


(() => {
  'use strict';

  const DOWNLOAD_ENDPOINT_RE = /\/downloadable\/download\//i;
  const DOWNLOAD_TEXT_RE = /\b(?:download|software|driver|firmware|archive|package|installer)\b/i;
  const DOCUMENT_TEXT_RE = /\b(?:api\s+documentation|documentation|manual|datasheet|data\s+sheet|quick\s+start|user\s+guide|release\s+notes)\b/i;

  function detailText(anchor) {
    const container = anchor.closest('article, li, tr, section, [class*="product"], [class*="download"], [class*="archive"]');
    return [...(container?.querySelectorAll('p, span, small, time, [class*="version"], [class*="platform"]') || [])]
      .map((node) => node.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  function discover({closestLabel, FILE_EXTENSION_RE, deepQuerySelectorAll}) {
    const results = [];
    for (const anchor of deepQuerySelectorAll('a[href]')) {
      if (anchor.closest('header, nav, footer')) {
        continue;
      }
      const url = anchor.href;
      if (!/^https?:/i.test(url)) {
        continue;
      }
      const label = closestLabel(anchor);
      const isPackage = DOWNLOAD_ENDPOINT_RE.test(url);
      const isDirectFile = FILE_EXTENSION_RE.test(url) || anchor.hasAttribute('download');
      const isDocumentation = DOCUMENT_TEXT_RE.test(label);
      const isDownloadLink = DOWNLOAD_TEXT_RE.test(label);
      if (!isPackage && !isDirectFile && !isDocumentation && !isDownloadLink) {
        continue;
      }
      results.push({
        element: anchor,
        url,
        label,
        detail: detailText(anchor),
        kind: isPackage ? 'package' : (isDirectFile ? 'file' : (isDocumentation ? 'documentation' : 'download-link')),
        action: (isPackage || isDirectFile) ? 'download' : 'open',
        selected: isPackage || isDirectFile,
      });
    }
    return results;
  }

  SupraUserscriptCore.boot({
    prefix: 'tpbd',
    name: 'Total Phase batch downloader',
    vendor: 'Total Phase',
    launcherLabel: 'Total Phase downloads',
    delayMs: 1400,
    maxRetries: 1,
    preferNativeClick: true,
    discover,
  });
})();
