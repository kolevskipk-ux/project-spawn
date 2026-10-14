# Scout marketplace server preparation — October 13, 2026

The existing production marketplace receipts are not usable coverage: Mercado Libre
reports TAB_MISSING and Walmart reports unknown. Amazon Scout remains operational
on main@100.86.242.81. Its Firefox service is left untouched.

`scripts/prepare-marketplace-server.mjs` builds a separate Firefox 0.4.1 collector
from the existing marketplace extension. It retains the exact five recovered
Mercado Libre identities, two Walmart identities, seller/identity/53100 delivery
requirements, distinct credentials, and 30-minute quiet-hour-aware schedules.
First commissioning opens the approved product tabs and enables both schedules;
later restarts preserve manual disablement. No new customer marketplace alerts
or seller verification is inferred.

The generated non-secret package passed 21 browser extraction cases with every
network request intercepted, plus scheduling, history, disabled-state and lease
checks. It uses a separate profile and service to avoid disrupting Amazon Scout.
The local build is work/Scout-Marketplace-Server-0.4.1 in the Garfield workspace.

Server preparation uses the existing Mercado Libre extension credential and
Windows-protected Walmart credential; it does not rotate either. Credentials are
sent only to main@100.86.242.81 over the existing encrypted Tailscale SSH connection,
stored in permission-600 configuration files, excluded from Git and tool output.

Automatic approval review rejected this credential transfer because explicit
authorization naming the credentials and server destination is missing. No server
package, credential or service was installed by the rejected action. The prepared
script work/prepare-marketplace-server.ps1 remains unexecuted.

After approval: prepare files, run the existing server web-ext lint against the
build, separately enable/start scout-marketplace.service, inspect real readings
and authenticated receipts, then document actual coverage. Any account verification
or CAPTCHA must be handled by Philip. Unknown readings must never be reported as
stock. Stop the separate service to roll back; Amazon monitoring remains independent.
