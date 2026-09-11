# Drop search diagnostics

The existing amazon_drop_jobs.evidence_json now includes diagnostics schemaVersion 1. Existing rows without diagnostics are historical summaries and cannot reconstruct discarded evidence.

Fields include reason, bounded modelAsin/modelState, outputText (maximum 1,200 characters), outputTruncated, returnedSources, sourceSamples (maximum 20 entries, each URL maximum 500 characters), sourcesTruncated, and toolStatuses (maximum 12). Stored valid URLs omit credentials, query parameters and fragments. Output and URLs remain untrusted data and must be escaped if rendered.

Source samples distinguish wrong domains, missing exact-ASIN paths, incomplete search calls, invalid URLs/protocols, and annotation-only citations. Annotations are retained for diagnosis without qualifying for a positive signal. Accepted evidence remains an exact Amazon México ASIN source from a completed search call plus matching BUYABLE model output. Catch must still independently verify offers.

Model reasons distinguish no output, malformed output, wrong ASIN, invalid state, explicit UNKNOWN, and BUYABLE without an accepted source. Incomplete provider responses retain diagnostics before the job is marked FAILED. Diagnostic fields do not change budget reservations, search cadence, retry behavior, or spending limits. No database migration is required.

Validation: full Spawn suite passed, 283 tests; tests cover wrong-ASIN source versus exact annotation, query removal, empty/malformed/uncertain output, bounded retention, and persistence.
