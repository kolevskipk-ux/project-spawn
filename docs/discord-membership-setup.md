# Poke Primos customer access setup

Server ID: `1537592665535942709`. Community name: Poke Primos.

## Application and secrets

Create a Poke Primos application in https://discord.com/developers/applications.
Add OAuth redirect `https://customers.aztlan-eng.com/app/discord/callback`.
Provide the application ID and public key as Worker variables. Store the client
secret and bot token as `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` secrets on
`garfield-customers-production`; never paste secret values in chat or commit them.

Install the bot in the server with `bot` and `applications.commands` scopes and
Manage Roles permission. Do not grant Administrator. Create an unmanaged
`Inventory Access` marker role with zero server-wide permissions. Place the bot's
role above it. Channel-specific view permissions can be assigned to the marker.
Create a separate qualifying membership role for future billing. Its ID must never
equal the marker-role ID. No messages, contacts or user email scope is requested.

## Configuration and rollout

Apply customer migration 0004 before deploying the customer Worker. Configure:

- `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID`.
- `DISCORD_REDIRECT_URI` above; `CUSTOMER_PUBLIC_URL=https://customers.aztlan-eng.com`.
- `DISCORD_INVENTORY_ROLE_ID` and separate `DISCORD_REQUIRED_ROLE_ID`.
- `DISCORD_FREE_ACCESS_ENABLED=true` during the free period. Set false later to
  require the qualifying role; billing must manage that role. Existing marker
  roles do not bypass the check. No billing charges are implemented by this switch.
- `CUSTOMER_MEMBERSHIP_MODE=pilot` and comma-separated verified test emails in
  `CUSTOMER_MEMBERSHIP_PILOT_EMAILS`. Use `enforced` only after the pilot passes.
- Complete legal configuration and bilingual approved content through the separate
  Poke Primos legal task before `CUSTOMER_LEGAL_PUBLISHED=true`.
- Set `DISCORD_ROLE_SYNC_ENABLED=true` only after verifying role configuration;
  activate the customer Worker's `*/15 * * * *` cron as a separate operation.

Configure public interactions URL `https://customers.aztlan-eng.com/discord/interactions`.
Cloudflare Access must protect `/app*`, not this signed public callback. The OAuth
callback under `/app` still requires the customer's email session. Register guild
commands `/inventory` and `/access`; they return private links, never shared tokens.

## Pilot verification

Verify linking, duplicate-account rejection, replay rejection, expired OAuth state,
terms version and separate adult checkbox; server departure/rejoin; admin revocation;
Discord outage grace and expiry; free-mode switch; marker-role grant/removal;
signature rejection and private command responses. Account/support pages remain
reachable when inventory access is denied. A departure can take up to 15 minutes
to detect, and Discord outages allow at most one hour from last verification.

OAuth tokens are used only to identify the user, then revoked and discarded. Bot
membership checks use the configured server. Inventory role synchronization reads
at most 20 linked accounts per tick in oldest-attempt order and stops on rate limit.
An API failure is recorded for retry. Increasing customer counts may require a
larger scheduler; do not promise every role is updated within one cron interval.

Primary references: [OAuth](https://docs.discord.com/developers/topics/oauth2),
[guild/member roles](https://docs.discord.com/developers/resources/guild),
[signed interactions](https://docs.discord.com/developers/interactions/receiving-and-responding).
