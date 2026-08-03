# SupraShellScripts userscripts deployment

Public install, update, release, and provenance endpoint for independently versioned SupraShellScripts userscripts.

Installable artifacts are served through GitHub Pages at:

```text
https://suprashellscripts.github.io/userscripts/
```

Development source, fixtures, heavy CI, architecture, backlog, and agent coordination live in the private `SupraShellScripts/userscripts-private` repository.

Do not edit generated script artifacts manually. Each userscript is independently versioned, stable artifacts live under `scripts/<id>/`, and immutable versions live under `scripts/<id>/versions/<version>/`.

Every deployment arrives through a `publish/<id>/v<version>` branch and pull request linked to a private coordination issue and source commit.
