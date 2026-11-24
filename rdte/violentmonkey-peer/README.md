# Public-only Violentmonkey native-peer qualification

This workcell runs the unmodified upstream Violentmonkey v2.50.0 MV3 distribution,
verified against its GitHub Release SHA-256, in a disposable Chromium extension context
on an ordinary public GitHub-hosted runner.

The first gate checks only that a real extension starts, that its options UI renders,
and that native GitHub Compatible and WebDAV synchronization services and controls
are available. A green smoke run does NOT prove native sync roundtrip or storage.

No private code, user profiles, script contents, credentials, backend repositories,
authenticated pages, raw browser profiles, screenshots, URL logs, or page content
are uploaded. The test never connects to a real sync backend.

Next RDTE batch: two disposable real-extension contexts and an in-process
synthetic-only test backend, exercising native pull -> synthetic edit -> merge ->
independent pull. Do not hand-write native sync records instead.

This workflow is independent of production releases and automatic-update URLs.

## GitHub-compatible native provider experiment

A second, independent synthetic experiment loads two actual VM extension profiles
and points the **unmodified** `github-contents` native provider to a local HTTP
server implementing the GitHub **Contents REST API** only. This fake server
stores opaque response bytes and SHA revisions; it does **not** create, parse,
or manipulate Violentmonkey sync records or manifests. The upstream browser
extension handles all native sync state, conflict resolution and propagation.
It uses invented script names, a dummy local test token and no GitHub account.
No public repo is used as a sync backend and no private-source data is shared.
Only a separately reviewed release workflow may later enroll a real backend.
