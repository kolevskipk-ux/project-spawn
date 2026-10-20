# Firefox server overlays

## Homepage redirect recovery 0.5.9

Build `scripts/patch-scout-homepage-recovery.mjs <public-0.5.8-package>
<output-folder>` and deploy only `extract.js`, `read-tab.js`, `manifest.json`.
Back up changed files; preserve profiles, credentials, pauses and cooldowns.

A recognized Amazon México homepage (root path, Amazon page title, search field,
no product title/ASIN) permits one navigation to the fixed Amazon `/dp/` URL for
the configured ASIN. Challenge and shopping-gate classification takes precedence.
The twenty-second product deadline includes recovery; persistent redirects remain
unknown and retry at the existing cadence. After navigation, the unchanged
identity, seller and challenge checks govern the result. No page-supplied URL,
search, CAPTCHA solution, cooldown reset or repeated navigation is allowed.

Run `scripts/test-scout-homepage-recovery.mjs <node-dependencies-directory>` plus
the continuation and failure-isolation suites. All browser fixtures are offline.

## Product failure isolation 0.5.8

Build on the commissioned 0.5.7 public package:

```sh
node scripts/patch-scout-failure-isolation.mjs <public-0.5.7-package> <output-folder>
node scripts/test-scout-failure-isolation.mjs
```

Deploy only `product-check.js`, `product-tab.js`, `read-health.js` and
`manifest.json`, backing up public files before restarting the Amazon service.
Keep the continuation reader, background, pacing, profile, heartbeat, credentials
and watchdog intact. Preserve manual pauses and challenge cooldowns. A known
READ_FAILURES pause can be resumed after checking no genuine challenge is active.

Missing product tabs are recreated under the existing twenty-second deadline.
Local product/tab associations retain same-origin gate redirects for the guarded
reader; closed tabs are replaced, other product tabs are not repurposed. Unknown
challenge/sign-in tabs or tracked foreign redirects stop conservatively rather
than opening around them. New failures never certify stock or page freshness.

Ordinary per-product errors remain counted and submitted, then retry at the
existing four/twelve-minute cadence. They no longer disable all targets based on
a batch percentage. Blocked results still stop the sweep and use the unchanged
challenge backoff; fatal run failures still disable the collector. Serial reading,
six-product batch cap, positive jitter and thirty-second minimum pause remain.

## Continuation overlay 0.5.7

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
