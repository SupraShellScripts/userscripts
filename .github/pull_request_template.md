# Pull request

## Generated deployment

- Private issue: `<link>`
- Source repository and commit: `<repo@sha>`
- Userscript and version: `<id> <version>`
- Artifact SHA-256: `<digest>`
- Session ID: `<uuid>`
- Correlation ID: `<32 lowercase hex>`

## Validation

- [ ] Only the selected userscript plus generated catalog/checksum/event files changed
- [ ] Immutable version path is new or byte-identical
- [ ] `public-artifact-gate` passes
- [ ] License remains `PolyForm-Noncommercial-1.0.0`
- [ ] No private source, fixtures, credentials, signed URLs, or vendor bytes are present

Do not edit generated artifacts manually.
