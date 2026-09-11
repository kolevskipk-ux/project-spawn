# Amazon drop recovery integration

Catch requests an authenticated POST to `/internal/garfield/drop-recovery` with `asin` and `windowStart` (UTC epoch milliseconds aligned to a half hour). Only the four agreed hot ASINs, published in Spawn, inside an active :00–:02/:30–:32 window are accepted.

Migration 0039 adds durable job and check-lease records. Paid jobs move RESERVING → PENDING → RUNNING → COMPLETED/FAILED. A unique ASIN/window key prevents repeated paid dispatch. Acceptance follows successful separate allocation and shared search-budget reservations. The endpoint schedules execution immediately; the minute cron recovers pending dispatches. Expired RUNNING jobs fail without automatic paid retry because provider consumption is uncertain.

Philip authorized production activation on September 10, 2026: `AMAZON_DROP_SEARCH_ENABLED=true` and `AMAZON_DROP_SEARCH_BUDGET_USD=150`. This allocation shares the existing USD 150 monthly guard with ingestion; it is not an additional USD 150 budget. Unknown response accounting retains the $0.50 reservation. Search-accounting records are linked via existing scan_runs; drop-prefixed IDs distinguish them from ingestion runs.

The model is limited to exact-ASIN Amazon México evidence. Positive output with an attributable source yields POSSIBLY_BUYABLE and a protected callback to Catch's `/internal/drop-search-result`. Catch performs its own fresh offer verification. UNKNOWN, incomplete searches, expired windows, and failed callbacks do not establish stock state. No search result directly sends a Discord alert or changes inventory.

`/internal/garfield/drop-check` provides per-ASIN/window owner leases for Catch's overlapping check protection. Release requires the matching owner. This endpoint remains usable with paid search disabled.

Migration, deployment, and activation were performed as separate operations under explicit authorization. See Catch's `docs/amazon-drop-recovery.md` for acquisition validation, capacity gates, rollback, and remaining manual catalog work.
