# Firefox server continuation overlay

The three continuation runtime files overlay the commissioned Firefox package. They retain
the existing seller-first offer reader, deadlines, panel inspection and tracing.
The unchanged deadline, diagnostic and trace modules are included for portable tests.
The remaining runtime modules come from the existing server package; this folder
is not a standalone extension and must never contain private configuration.

Build the four-file 0.5.7 overlay with:

```sh
node scripts/patch-amazon-continuation.mjs <public-0.5.6-package> <output-folder>
```

Deploy only `extract.js`, `read-tab.js`, `product-check.js`, and `manifest.json`.
Leave background scheduling, pacing, read-health policy, heartbeat, profile,
credentials, and watchdog files intact. Back up changed files before restarting
the Amazon service. Preserve stored pauses and cooldown deadlines.

Continuation requires the expected shopping message and a visible enabled submit
control in a same-origin GET form targeting Amazon's known validation path.
CAPTCHA inputs, robot/character instructions, sign-in paths, external destinations,
and POST overrides are rejected. One click and one bounded reread are allowed per
product check; a persistent gate remains blocked. Product URL, DOM ASIN, title,
seller and purchase checks still govern the resulting reading.

Run `node scripts/test-amazon-continuation.mjs <node-dependencies-directory>`
from the repository root. The suite uses Playwright with networking disabled.
Its integration tests use the included unchanged deadline and tracing modules.
