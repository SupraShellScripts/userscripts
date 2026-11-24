# Anonymous AI-site compatibility probe

A **public-only** Chromium/Firefox/WebKit × desktop/mobile-emulated test of the
unauthenticated `chatgpt.com`, `chat.openai.com` and `gemini.google.com/app` entrypoints.

This is **not** the private conversation-exporter script running in a public runner.
It does not import unpublished source, inspect logged-in account data, use credentials,
install Violentmonkey, capture page text or screenshots, run any script from private
repositories, accept a consent dialog, click an account control or download a file.

Each run creates an empty browser context, blocks non-read HTTP requests and known
binary downloads, navigates to the three publicly available entrypoints and records
only HTTP status, canonical/auth/other destination class, login/challenge booleans,
generic counts of buttons, headings and textboxes, and generic browser DOM capability
booleans. Explicit report-field allowlisting prevents inclusion of raw page data.
Anti-bot blocking, actual auth redirects, optional visible sign-in controls, offsite redirects, anonymous page availability and
navigation errors are **different results**.

Six independent public GitHub Actions jobs run on `ubuntu-24.04`, pinned Playwright
`1.57.0`; results are retained for three days. Mobile profiles are emulations,
not real phones. A green job means the probe completed—not that the private
userscript works, a login is available, or a complete conversation was exported.

For functional release acceptance, independently test the exact userscript in a
consented real browser session with upstream Violentmonkey on the intended sites.
Do not attempt to turn this public probe into a route for private source or auth data.
