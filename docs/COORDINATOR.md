# Coordinator relationship

This repository is the generated public deployment ledger for userscripts developed in `SupraShellScripts/userscripts-private`.

The wider Workbench program is coordinated from `SupraShellScripts/violentmonkey-workbench-private`, but that coordinator does not own or directly edit generated userscript artifacts.

## Local path

```text
~/Projects/SupraShellScripts/userscripts
C:\Users\Mark\Projects\SupraShellScripts\userscripts
```

## Promotion flow

```text
userscripts-private
  → reviewed publish/<script-id>/v<version> branch and pull request
  → userscripts
  → GitHub Pages install and update URLs
```

Heavy source validation and release preparation occur in the private source repository. This public repository performs only lightweight verification of generated artifacts, catalogs, checksums, provenance references, and deployment metadata.

## Coordinator rules

- The coordinator may inspect repository state and promotion evidence.
- The coordinator may not bypass the source repository publication operation.
- Generated artifacts are never edited manually.
- A public release references exact source commits, private release evidence, artifact hashes, and the promotion pull request.
- Workbench acceptance is informative and does not itself authorize publication.

See `coordination/consumer.json` for the machine-readable contract.
