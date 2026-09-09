# Approved inventory and existing-store enrollment

Authorized by Philip on September 9, 2026. Migration 0036 adds revisioned admin
reviews and append-only action records. `/approvals` becomes Approved inventory;
`/approvals?view=queue` retains pending exceptions. Owners and admins can edit
display title/language, mark reviewed, remove and restore. The existing Access,
role and same-origin mutation checks apply. Price and observation history remain.

Removed items are hidden from the customer feed and customer event reads. Pending
store notices expire; pending listing notices are suppressed. Catch treats removed
published Amazon targets as quiet monitoring, without treating them as staged
approvals. Removal/restoration advances the Amazon catalog version. Removal can
take effect in Catch after its next successful catalog refresh; already dispatched
notifications cannot be recalled. Customer-source must deploy the new projection.

`STORE_ADMIN_ITEM_APPROVAL_ENABLED` enables automatic enrollment of pending retail
origins with at least one accepted, published item reviewed by a human admin.
Automatic-only decisions do not bootstrap store approval. Marketplace domains,
suppressed aliases, rejected and paused stores are excluded. Decisions retain
source candidate IDs. Up to ten qualify per catalog tick; existing bounded catalog
processing picks up the queue, preserving quiet initial baselines and 5/30/60
minute Catch priorities. Catalog refresh remains six hours after completion.

Production preflight found 26 qualifying retail origins. Validation: TypeScript,
251 Spawn tests and seven Catch regression suites passed before release.

Amazon buying-options proposal: distinguish absent featured offer from no offers;
seek eligible offers when unavailable and Amazon fulfillment when a third-party
offer is available. This release does not change its existing browser audit cadence
or authorize additional marketplace sellers. The status-dependent lane scheduler
remains a separate implementation step with the ten-hour browser budget retained.
