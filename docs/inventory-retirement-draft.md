# Inventory retirement policy — DRAFT, NOT ACTIVE

Philip approved retaining this proposal for review after the September 27
three-day inventory observation. Do not activate it based on elapsed time alone.

Retire individual vendor listings, preserving URL, evidence and price history;
never retire the product at every retailer because one vendor removed it.

- Timeout, CAPTCHA, 403/429: back off, mark stale, investigate vendor access.
  Do not count these as evidence of removal.
- Unknown availability: after three inconclusive checks, propose suspension and
  review rather than retirement. Parser failures are not product removals.
- Explicit sold out: retain history, reduce checks to daily after seven days,
  weekly after 30 days; propose retirement after 60 continuously sold-out days.
- Repeated 404/410 or redirects to a homepage/category: suspect removal first;
  propose retirement only after three confirmations spanning at least seven days.
- Missing from a crawl alone is insufficient: coverage can be partial.
- Active customer watches require review before retirement.
- Rediscovery reopens verification; only fresh trustworthy evidence restores
  current availability. Avoid false restock events based on stale observations.

Thresholds and implementation are deferred. Evaluate AVAILABLE/SOLD_OUT versus
UNKNOWN/BLOCKED/ERROR observations, coverage, repeat failures and cost before
choosing final rules. Existing lifecycle/review logic is unchanged by this draft.
