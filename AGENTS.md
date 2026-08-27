# Project Garfield repository authority

- Codex is the sole routine operator authorized to edit this repository, create or push branches, commit or merge changes, or initiate deployments.
- Treat `main` as production source of truth. Use a `codex/` branch for reviewed changes and do not push directly to `main` without Philip's explicit production approval.
- Keep database migration, Worker deployment, and cron activation as separate operations.
- Never expose secret values, reset monitoring baselines, or mutate production data without explicit approval.
- Other ChatGPT personas should restrict themselves to discussion and analysis. If repository or production changes are required, direct Philip back to Codex.
- The emergency exception applies only when all Garfield production monitoring is confirmed unavailable and delay would materially prolong the outage. Limit emergency work to the smallest reversible recovery action, preserve evidence, and require Codex reconciliation afterward.
- `SPAWN_CONTRACT.md` defines Spawn's approved responsibilities and its boundary with Catch Em All.
