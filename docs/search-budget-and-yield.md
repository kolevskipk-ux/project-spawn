# Search budget and discovery yield

Prepared 2026-09-08. Local implementation; production activation pending.

Philip's policy is a USD 150 monthly Spawn search budget and a strategy review
after 100 consecutive completed scans with no newly discovered listing URLs.
The search scope, existing three-hour schedule, quiet hours, model, retailer
restrictions, and approval policy remain in place. This change does not activate
inventory revalidation or repair the separately identified early-ASIN schema bug.

## Counting

- A scan is one structured market scan, potentially containing several API web
  tool calls. The admin view shows those calls separately. Model-reported
  `sources_scanned` is not used as a search count.
- New listings come from `updateInventory().discoveries`, after canonical URL
  deduplication and vendor suppression. They count even when unavailable or with
  unknown language. An already-known URL changing from unknown to available is
  not a discovery. Discovery is not approval or Catch enrollment.
- Only successful scans with measured yield count toward the consecutive streak.
  Failures, incomplete responses, missing completed web-search evidence, budget
  skips and initial inventory baseline runs neither increment nor reset it.
- A successful scan with at least one new listing resets the streak. Month
  rollover and manual review do not reset it. Restocks/preorder openings and
  unchanged observations have separate counters.
- At 100, a durable pending review is committed atomically with scan completion
  and yield. It stays visible if later discoveries reset the live counter.
  An owner can record the decision without deleting history. Another 100 empty
  completions in that same streak creates another review after acknowledgement.
  Search continues under the budget guard; there is no automatic strategy change.
- Streak tracking starts at activation; older records remain explicitly
  unmeasured. Manual seeds and Catch observations do not advance this counter.

## Cost accounting

The guard covers Spawn's Responses API model tokens and hosted web-search calls,
including unsuccessful scans that incurred usage. Catch, hosting, tax, foreign
exchange and other API clients are outside this application's budget.

Each request atomically reserves USD 10 against the current Mexico City calendar
month before any paid API call. Dispatch is denied if opening spend plus settled
estimates plus unresolved reservations plus this reservation exceeds USD 150.
An unconfigured model is denied rather than priced using the wrong rate.

Requests use the existing `gpt-5.6-terra` model with standard service tier, at most
12 built-in tool calls and 16,000 output tokens (including reasoning). At least
one completed web-search tool call is required before inventory processing.
There are no automatic paid retries. The request timeout is eight minutes,
inside the existing ten-minute scan lease.

The response ID, raw token usage, observed tool count and pricing version are
stored before parsing the structured output. Valid usage replaces the reserve
with a cost estimate. Missing usage, transport errors and unrecognized billing
metadata retain the reservation. A response priced above its reservation blocks
all future paid scans until an operator reconciles it, including across months.
Settlement is idempotent. Database errors retain the pre-call reservation.

USD 10 is an operating reserve, **not a provider-enforced per-request dollar
limit**. This application guard cannot guarantee the account's final invoice:
price changes, incomplete provider metering and unusually costly requests can
differ from its estimates. Reconcile with provider billing; do not present
estimated costs as billed spend. The admin page states this limitation.

Rates checked on 2026-09-08: Terra input USD 2/million, cached input USD 0.20,
output USD 12; cache writes use 1.25 times input. Aggregate input over 272k is
conservatively priced at twice input and 1.5 times output. Web calls add USD
0.01 each; search content tokens are already part of model input usage.

Primary references:

- [Terra model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Tool pricing](https://developers.openai.com/api/docs/pricing)
- [Responses request limits and usage](https://developers.openai.com/api/reference/python/resources/responses/methods/create)
- [Hosted web search](https://developers.openai.com/api/docs/guides/tools-web-search)

## Activation and reconciliation

1. Obtain approval for migration `0027_search_accounting.sql` and the reviewed
   Worker release separately. Do not run a combined migrate-and-deploy command.
2. Record the active Worker version and take the normal D1 backup. Apply only
   pending approved migrations; this migration adds three tables and an index.
   It does not change existing inventory, approvals or scan records.
3. Upload and activate the reviewed Worker version with existing effective vars.
   Verify the final active revision after any automatic deployment finishes.
   Do not change the scheduler.
4. Before entering the opening balance, allow the previous version's in-flight
   scans to finish and reconcile Spawn's API charges from month start through
   that cutoff. New paid scans are blocked while the opening balance is absent.
   Provider reporting delay must be accounted for. Record a conservative opening
   amount if final charges are not yet available; never silently assume zero.
5. At `/ops/search`, the owner enters the verified opening USD spend and its
   billing evidence/cutoff. That action enables the budgeted search path. Future
   tracked months open automatically at zero on the first scheduled attempt.
6. Verify a normal scheduled run's request record, usage settlement, yield and
   admin display against billing. No extra paid validation scan is required.

Opening balances cannot be overwritten through the form. An unresolved charge
or correction needs a reviewed D1 reconciliation: identify the response/request,
inspect provider billing, preserve its original usage, record an audit event with
the reason and evidence, then apply the exact correction in one transaction.
Never discard an unresolved reservation just because its HTTP request timed out.
The cost guard is application-local; use a dedicated API project/key if other
clients currently share the account budget.

Rollback to a Worker without accounting also removes the spending guard. Pause
paid scan dispatch before such a rollback and reconcile that interval before
reactivation. Leave the additive tables and inventory baselines intact.

## Local validation

The full-migration SQLite tests cover concurrent budget reservations, missing
opening balance/no external request, usage pricing, idempotent settlement,
network failure, malformed/incomplete output, first-seen unavailable listings,
restocks, the 99/100 threshold, failed-scan exclusion, discovery reset, persistent
reviews, month rollover, over-reservation blocking, and owner-only reconciliation.
All external requests are mocked; no paid search is used for local validation.
