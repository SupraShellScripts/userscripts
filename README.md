# SupraShellScripts userscripts deployment

Public install, update, release, and provenance endpoint for independently versioned SupraShellScripts userscripts.

Installable artifacts are served through GitHub Pages at:

```text
https://suprashellscripts.github.io/userscripts/
```

Development source, fixtures, heavy CI, architecture, backlog, and repository-level agent coordination live in the private `SupraShellScripts/userscripts-private` repository. The wider Violentmonkey Workbench program is coordinated from `SupraShellScripts/violentmonkey-workbench-private`, which may inspect promotion evidence but does not own or manually edit generated artifacts.

Local organization path:

```text
~/Projects/SupraShellScripts/userscripts
C:\Users\Mark\Projects\SupraShellScripts\userscripts
```

Do not edit generated script artifacts manually. Each userscript is independently versioned, stable artifacts live under `scripts/<id>/`, and immutable versions live under `scripts/<id>/versions/<version>/`.

Every deployment arrives through a `publish/<id>/v<version>` branch and pull request linked to a private coordination issue and source commit. Heavy validation remains in `userscripts-private`; this repository performs lightweight verification and does not rebuild the library.

See [`docs/COORDINATOR.md`](docs/COORDINATOR.md) and [`coordination/consumer.json`](coordination/consumer.json).
