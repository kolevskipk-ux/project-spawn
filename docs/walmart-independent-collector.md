# Independent Walmart browser collector

Scope: UPC 00019621415869 and Ditto 00019621415836. Uses a dedicated local Edge profile, not Codex or a personal browser profile. Playwright is loaded from the configured bundled dependency path. Collector invocation takes a private JSON config path with nodeModules, dataDir, endpoint and items. Use --test to read without submitting, --setup to open the dedicated profile for manual identity verification and postcode 53100 setup. API token comes only from WALMART_COLLECTOR_TOKEN.

Spawn intake: POST /internal/walmart-browser/observe and GET /internal/walmart-browser/status. A dedicated bearer secret is limited to these two item IDs. Observations expire for intake after ten minutes, future timestamps are rejected, receipts deduplicate, and older checks cannot overwrite newer inventory. Blocked/unknown checks are retained without erasing verified inventory. Existing matching Walmart inventory receives verified observations; the status endpoint also retains evidence for Ditto even if not cataloged. There is no customer alert publication in this pilot.

The initial independent headless test returned identity challenges for both products. The schedule is not activated until a successful read in this profile. A user must manually verify the dedicated browser, set postcode 53100, then run the read test. Do not copy session cookies from Codex, solve challenges automatically or assume a working manual profile guarantees headless access.

The intended Windows Task Scheduler cadence is 30 minutes during user sign-in, with collector quiet hours 02:05–06:05 Mexico City. A lock prevents overlap; a stale lock after a hard process termination requires checking for running collectors before removal. The machine must be awake. This is not a Codex automation and not yet a ChatGPT connector.

Tests: full 288-test Spawn suite passed before adding the SQLite intake integration regression; targeted intake regression validates persistence, duplicate receipts and last-good-state protection. Changes exclude pre-existing approved-inventory-operations.ts edits.
