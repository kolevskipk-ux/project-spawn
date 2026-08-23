# Project Spawn

GitHub-backed Cloudflare Worker that performs an hourly OpenAI web scan, maintains durable inventory in D1, posts meaningful changes to Discord, and serves a protected read-only inventory board.

## Architecture

`Cloudflare Cron → Worker → OpenAI Responses API + web search → D1 → Discord webhook`

GitHub `main` is the source of truth. Cloudflare Workers Builds deploys commits from the repository. D1 is operational state, not source code.

Discord receives a deliberately minimal subscriber-facing report: check completion and verified purchasable listings only. Full scan diagnostics, rejected candidates, blocked sources, and model output remain private in D1 and Worker logs.

## One-time setup

1. Create an empty private GitHub repository named `project-spawn`.
2. Commit and push this project to its `main` branch.
3. Install dependencies with `pnpm install`, then run `pnpm run check`.
4. Log in to Cloudflare from this folder with `npx wrangler login`.
5. Create D1: `npx wrangler d1 create project-spawn`.
6. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned database ID and commit that change.
7. Add production secrets (each command prompts securely):
   - `npx wrangler secret put OPENAI_API_KEY`
   - `npx wrangler secret put DISCORD_WEBHOOK_URL`
   - `npx wrangler secret put RUN_TOKEN`
   - `npx wrangler secret put BOARD_ACCESS_TOKEN`
8. Apply the schema once: `pnpm run db:migrate:remote`.
9. In Cloudflare: **Workers & Pages → Create application → Import a repository**. Select the GitHub repository and production branch `main`.
10. Confirm the Worker name is `project-spawn`. Use deploy command `pnpm run deploy`. Save and deploy.
11. Open `https://project-spawn.<your-subdomain>.workers.dev/healthz` and `/readyz`.
12. Trigger the first scan with `POST /run` and header `Authorization: Bearer <RUN_TOKEN>`.

The cron is `5 * * * *` (five minutes after every UTC hour). Display timestamps use `America/Mexico_City`.

## Safe release and rollback

- Work on a branch and open a pull request. Merge only after `pnpm run check` passes.
- Database migrations are committed, numbered, and forward-only. Prefer additive schema changes so an older Worker remains compatible.
- Roll back code in **Cloudflare → Worker → Deployments → Version history → Deploy version**, or revert the GitHub commit. Then fix `main` so repository truth matches production.
- Never put API keys or webhook URLs in GitHub. They are Cloudflare Worker secrets.
- A code rollback does not roll back D1 data or schema. Take a D1 backup/export before destructive migrations.

## Health contract

- `GET /healthz`: process is serving traffic; no dependency checks.
- `GET /readyz`: confirms D1 is reachable and returns the last successful scan record.
- `GET /version`: deployed Cloudflare version metadata, config version, and model.
- `GET /inventory?access=...`: protected read-only Inventory Board.
- `GET /inventory.csv?access=...`: protected Excel/CSV export.
- `POST /run`: authenticated manual scan for smoke tests and recovery.

## Updating the watch list

Edit `src/config.ts` in a pull request and increment `SPAWN_CONFIG_VERSION` in `wrangler.jsonc`. This makes scan history auditable.
