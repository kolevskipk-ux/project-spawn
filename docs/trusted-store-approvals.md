# Trusted-store approval release

Prepared locally; not deployed or activated.

Validation: TypeScript passes. The full 208-test suite passed, then all 27
trusted-store tests passed after the final seller-identity hardening (three added
cases). Shared Spawn/Catch catalog contract parity passes. Coverage includes real
SQLite migrations and publication, Spanish Amazon enrollment, optional comments,
seller changes, page-local seller labels, suppressed/rejected listings, revocation,
review locks, retry cooldown, partial-failure flags and admin-only controls.

Individual approvals can remember a store for later verified listings in the same
category. The form defaults this choice on. Marketplace rules also bind to a
stable seller ID. Approval comments are optional; empty comments get a generated
audit note, while operator identity and decision timestamps remain required.

The existing hourly Worker schedule processes at most two candidates per run
outside quiet hours. Failed attempts are not retried within 24 hours. There are
no extra paid API searches and no change to the $150 budget or 100-empty-scan rule.
Each candidate uses one bounded direct page fetch; Amazon uses a second independent
verification fetch. This is an approval queue processor, not a faster stock monitor.

The initial parser requires exact-page JSON-LD Product evidence, matching title
and SKU when present, a single attributable offer and explicit MX shipping origin
and destination. Amazon and the recognized marketplaces additionally need a stable
seller identifier, not just a seller name. Store names, a successful HTTP response
or discovery text alone do not grant automatic approval. Real-world coverage is
unmeasured: stores without these fields remain manual, including Amazon pages
that do not expose stable seller evidence. Unknown-language inventory is allowed;
Amazon automatic enrollment still needs a canonical identity from its verifier.

Approved listings publish through the existing inventory pathway. Eligible Amazon
targets enter the published Catch catalog hourly with initial buyable alerts off.
This confirms catalog publication, not Catch receipt; its existing acknowledgement
must be checked separately. No Catch code, baseline or existing decision is changed.

`/approvals` shows the persistent unseen audit count and links to
`/ops/trusted-stores`, also available in the sidebar. That page shows rule provenance,
the latest 100 attempts (unseen first), acknowledgement and revocation controls.
Flags are in the admin portal; this release adds no Discord message delivery.
Marking seen never approves or reverses a product. Revoked rules stay revoked;
ordinary approvals do not silently re-enable them. No historical approvals or
pending listings are retroactively enrolled. Partial publication remains flagged
for reconciliation rather than rolling back a successful Catch publication.

## Production operations requiring approval

1. Apply only additive migration `0030_trusted_stores.sql` and verify the two tables.
2. Deploy the reviewed Worker with `TRUSTED_STORE_AUTO_APPROVAL_ENABLED=false`.
   Verify optional-comment approval and the protected trust/audit page.
3. Separately enable `TRUSTED_STORE_AUTO_APPROVAL_ENABLED=true` on the existing
   schedule after reviewing a newly created rule and its exact seller evidence.
   Validate an eligible new listing, its audit record, inventory visibility and
   Catch acknowledgement. Until evidence exists, do not report live coverage.

To stop new automatic decisions, disable the feature flag or revoke a rule.
Leave the additive tables and existing product decisions in place. A publication
already in progress may complete; reconcile its retained audit flag.
