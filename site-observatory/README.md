# Public Site Observatory (candidate, issue SupraShellScripts/userscripts-private#119)

**Purpose:** detect public-site *concept*, DOM/selector, layout/CSS and obvious browser changes without loading private userscript source onto public CI. This is a read-only diagnostic **candidate**; acceptance requires review of real GitHub Actions receipts and the relevant userscript owner issue.

## How to run

The `site-observatory.yml` workflow provides a manual trigger, pull-request gate, and weekly public-site sweep **only after this candidate is reviewed and merged**. Six independent combinations run on standard public GitHub-hosted `ubuntu-latest` runners:

| Browser engine | Desktop | Mobile emulation |
| --- | --- | --- |
| Chromium | 1366 × 768 | Pixel 7 device profile |
| Firefox | 1366 × 768 | Pixel-like touch/viewport; **not real mobile Firefox** |
| WebKit | 1366 × 768 | iPhone 13 profile; **not real iOS Safari** |

The Playwright version is pinned. Host runner/browser versions and source SHA must be recorded with receipts. Real iOS Safari, Android Chrome/Firefox, browser-store Violentmonkey extension injection, keyboard/screen reader certification, and authenticated vendor journeys need separate HIL/device-farm acceptance. Playwright's mobile emulation is **not** the real browser/OS/device.

## Privacy / threat model

- Input: hand-reviewed **public HTTPS** landing pages in `sites.json`. Do not add pages requiring authentication, accounts, cookies, entitlements or private site data.
- The runner is never granted any private-repository credentials and never checks out `userscripts-private`; no private source, private screenshots or private fixtures can be transmitted to free public Actions.
- The observer never triggers vendor download, login, form submission, purchase, EULA acceptance or account-changing operations. It blocks known binary payload paths and disables accepted downloads.
- Output: status classes, destination hostname, counts, boolean concept hits, layout/CSS summary, public-only launcher/panel synthetic-injection result where a **published** artifact exists. No DOM dumps, text contents, URL query strings, cookies, security material, HAR, or real screenshots are exported.
- Only a short (three-day) public CI artifact of these redacted JSON receipts is retained. PR logs contain the same category-only outcomes. Do not enable automatic baseline updates on a cron run.
- The public Total Phase smoke injects the **already published** `.user.js` with an API shim. It does **not** assert equivalent behavior to the actual Violentmonkey extension or an authenticated download.

## Durable, reviewer-approved baselines

The committed `site-observatory/baselines.json` starts **unapproved**; every observation is classified `baseline-pending` until reviewers deliberately approve a per-site × engine × device profile reference. `drift.mjs` compares approved minimum semantic/DOM counts, required landmarks, horizontal overflow and the currently published Total Phase UI. It distinguishes `not-comparable` (unavailable/auth/unknown) from actual `drift-candidate` and records the reasons in the three-day artifacts. `drift.test.mjs` guards against automatically promoting unreviewed snapshots. GitHub PR history retains review evidence, while future weekly probes compare to the committed baseline; CI must not automatically edit that baseline. This is not pixel-diff automation or approval of any current live-site state.

## Drift model (observe → classify → plan → apply → verify)

1. **Observe/discover**: pin `sourceCommit`, target URL, time, browser engine, viewport/profile and public-vs-private script state; check reachability, redirects, semantic labels, stable roles/labels, candidate controls, layout geometry and CSS properties.
2. **Classify**: `observed` is preliminary, not functional pass. `drift-candidate` is missing expected semantic concepts; `site-unavailable` includes 401/403/429/5xx; `auth-required` needs a separate approved profile; `inconclusive` covers navigation/error; `script-regression` indicates published launcher/panel failed in the public shim probe. Site denial must **not** be interpreted as selector drift.
3. **Plan**: compare with an approved **per-site × browser × device** baseline; assess change cause and selector risks. Prefer role/accessible-name and data attributes over DOM position or generated classes. Changes to text/language require localized invariants. A raw pixel or structural difference alone is not evidence of failure.
4. **Apply**: in `userscripts-private` per-script issue/branch/draft PR, implement a bounded repair with deterministic fixtures. Do not modify published public artifacts directly, release unqualified scripts, or bypass human action.
5. **Verify**: require unit/fixture/visual/a11y/real-browser evidence, persistence round trip for non-sensitive user preferences, then the private heavy gate and reviewed per-script generated public publication. Previous versions remain immutable.

## Reuse decisions

- Use Playwright's own assertions and `toHaveScreenshot` on **approved synthetic fixtures**, plus role/ARIA assertions as the default. `toMatchAriaSnapshot` is useful for a compact semantic baseline.
- Keep screenshot updates human-approved, pinned to browser/runner environment. For many snapshots or rich human review, evaluate existing **BackstopJS** or **reg-suit** later; do not create a bespoke image-diff server or assume all open-source projects remain maintained.
- The present observer is an **initial probe**, not an accepted historic drift baseline. It must not auto-classify every cosmetic change as functional regression.
- Script settings persistence belongs in the private userscript acceptance suite: use per-script versioned keys and never persist authenticated URLs, cookies, tokens, EULA decisions or unintended unattended actions.

## Stable update channel

The deployment repository already publishes, for each approved release:

```text
https://suprashellscripts.github.io/userscripts/scripts/<script-id>/<script-id>.user.js
https://suprashellscripts.github.io/userscripts/scripts/<script-id>/<script-id>.meta.js
```

Install the **approved `.user.js`** once through upstream Violentmonkey. Its generated `@downloadURL` and `@updateURL` fields allow subsequent automatic update checks; check the extension's update settings and version. This is not a general discoverable registry/subscription feed. The public catalog/index is for finding and installing scripts. Unreleased private scripts are not installable or auto-updateable from public Pages.

## Official Violentmonkey + MCP migration

- **Human**: official Violentmonkey browser extension dashboard/editor, per-script installed status, enabled/disabled control, explicit update check and settings UI; assistive interaction needs keyboard/AT validation.
- **Automation**: Git-native versioned source, reproducible private build and heavy gates, approved public manifests, checksum/version verification, and optional official Violentmonkey MCP client for a consented test browser.
- **Agent**: official Violentmonkey MCP for user-authorized script management; explicit extension connection and consent, no ambient page-content access. Playwright is an independent browser observation/qualification provider, **not** a capability automatically conferred by MCP.
- **No Workbench dependency**. The deprecated private/public Workbench repos stay retained until #141 S1–S6 checks. The separately maintained `SupraShellScripts/violentmonkey` extension fork needs its own consumer/retirement disposition; never archive it by conflating it with upstream Violentmonkey.

Review and implementation authority: [userscripts-private #119](https://github.com/SupraShellScripts/userscripts-private/issues/119). No direct public `main` pushes; this infrastructure PR is a reviewed addition to the public verifier, **not** a new userscript publication.
