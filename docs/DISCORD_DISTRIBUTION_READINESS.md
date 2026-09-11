# Reactus Discord distribution readiness

Last reviewed: 2026-09-12

This document is the repository-side checklist for moving the official hosted Reactus bot from controlled testing to wider Discord distribution. The Discord Developer Portal remains authoritative for account-specific eligibility and current checklist state.

## Current public metadata

Use these values consistently in the Discord Developer Portal and other public listings.

- App name: `Reactus`
- Website: https://reactus.fly.dev/
- Official reference: https://reactus.fly.dev/reference.html
- Privacy Policy: https://reactus.fly.dev/privacy.html
- Terms of Service: https://reactus.fly.dev/terms.html
- Support server: https://discord.gg/m6mFzzEQhr
- Source repository: https://github.com/chun7953/reactus
- Primary language: Japanese

Suggested short description:

> Discordの予約投稿・定期投稿・抽選・自動リアクションを、Google Calendarと日本語Web管理画面からまとめて運用するBotです。

Suggested search tags / concepts:

- scheduling
- calendar
- automation
- giveaway
- utility

Suggested showcase commands:

- `/reactus` — open the Japanese web administration interface
- `/register-main-calendar` — register the main Google Calendar
- `/verify-calendar` — verify Discord-server ownership of a Google Calendar
- `/feedback` — open the Reactus support-server link

## Installation configuration

Reactus is a server-installed bot. Prefer Discord's provided install link instead of maintaining a hand-written OAuth URL.

Required OAuth scopes for full server installation:

- `bot`
- `applications.commands`

Recommended minimum bot permissions for the full feature set are documented in the README:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions

Do not request `Administrator` for the bot role. Mentioning `@everyone`, `@here`, or all roles is optional and should only be granted to servers that intentionally use those features.

## Gateway intents and protected data

Current runtime intents are:

- Guilds
- GuildMessages
- GuildMembers
- MessageContent
- GuildEmojisAndStickers

`GuildMembers` and `MessageContent` are privileged intents and are both used by current product features:

- `GuildMembers`: member search / member-aware administration features.
- `MessageContent`: message-body trigger rules used by automatic reactions and message-create processing.

Do not remove either intent merely to simplify distribution while those features remain supported.

Discord changed the protected-data review threshold on 2026-06-10. Access to message content, server member lists, and presence requires review once an app reaches 10,000 or more total users, and continued access is reviewed annually. This is separate from App Verification / Discovery eligibility.

When Reactus approaches the protected-data threshold, prepare the review around the concrete feature need above and verify that the Privacy Policy still accurately describes the data flow.

## App Verification and Discovery

Discord App Discovery requires the app to be verified first. The Developer Portal's `App Verification` and `Discovery Status` pages are the authoritative checklists.

Repository-side prerequisites already available:

- public Privacy Policy
- public Terms of Service
- public website and product reference
- active slash commands
- support-server invite
- documented minimum bot permissions and Gateway Intents
- production health endpoint and automated CI / desktop-mobile Chromium E2E
- per-guild Google Calendar ownership claims for the shared hosted service account

Portal / account-side items that cannot be completed from this repository:

- ensure the application belongs to the intended Developer Team
- complete team-owner identity verification when requested
- ensure required account email / 2FA requirements are satisfied
- complete the current `App Verification` checklist
- configure a Discord-provided install link for server installation
- enable Community on the support server if required by the current Discovery checklist
- enter the support server, app description, Privacy Policy, Terms of Service, supported language, tags, images, and other product-page metadata
- review `Discovery Status` and only enable Discovery after every current Portal requirement is green

Discord's published verification guidance also states that verification is required to scale an app past 100 servers. Treat the current Developer Portal as authoritative if Discord changes this threshold again.

## Calendar tenant boundary before public rollout

The official hosted environment uses one Google service account, but service-account access alone is not Discord-guild authorization.

The canonical authority is `calendar_claims` keyed by `(guild_id, calendar_id)`.

A new calendar must be verified for each Discord guild through the short-lived Calendar-description challenge before it can be used. Runtime monitor reads, main-calendar reads, restore, and monitor persistence fail closed against that claim authority. Leaving a guild revokes its claims.

Before opening a public install link, complete at least one production smoke test from a fresh Discord server and a fresh Google Calendar:

1. Install Reactus into the test server with the intended public permissions.
2. Share a fresh Google Calendar with the Reactus service account.
3. Run `/verify-calendar` or save it as the main calendar and receive a challenge.
4. Put the challenge in the Calendar description.
5. Repeat verification and confirm the claim succeeds.
6. Create a scheduled post from the web administration interface.
7. Confirm the event is created in the intended Calendar and posts only to the intended Discord server/channel.
8. Remove Reactus from the test server and confirm its Calendar claim no longer authorizes runtime polling after rejoin until reverified.

Do not replace this with a legacy-trust fallback.

## Rollout gates

Recommended order:

1. **Current controlled testing** — support/development server and known testers only.
2. **Fresh-tenant smoke** — complete the Calendar ownership smoke above on a new Discord server and Calendar.
3. **Limited external alpha** — a small number of independent servers; monitor production errors, Google API volume, Discord rate limits, and support requests.
4. **Public install link** — only after support flow, Privacy/Terms links, installation permissions, and rollback path are confirmed.
5. **App Verification** — complete before the current verification limit is reached and before enabling Discovery.
6. **Discovery / App Directory** — opt in only when Developer Portal requirements are fully green and the public profile accurately reflects the shipping feature set.
7. **Protected-data review** — submit before Reactus reaches 10,000 total users if `GuildMembers` / `MessageContent` remain enabled; repeat annually as required.

## Operational stop conditions

Pause wider rollout rather than adding permissive fallbacks if any of the following occurs:

- a Discord guild can access or restore another guild's Calendar without a verified claim
- the bot continues polling a departed guild's Calendar
- Calendar verification can be satisfied by Reactus itself rather than the Calendar owner
- admin authorization is bypassed for ownership verification or protected settings
- the install flow requests materially broader Discord permissions than documented
- Privacy Policy or Terms no longer match actual data handling
- Message Content or Guild Members access is suspended or no longer approved when approval is required
- production `/readyz` is not ready or recurring monitor failures appear after deploy

## Official Discord references used for this review

- App Discovery / enabling discovery: https://docs.discord.com/developers/discovery/enabling-discovery
- Install links: https://docs.discord.com/developers/resources/application#install-links
- Gateway privileged intents: https://docs.discord.com/developers/events/gateway#privileged-intents
- App Directory content requirements: https://support-dev.discord.com/hc/en-us/articles/9489299950487-App-Directory-App-Content-Requirements-Policy
- App profile / Discovery fields: https://support-dev.discord.com/hc/en-us/articles/6378525413143-App-Directory-App-profile-pages
- App verification: https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified
- 2026 protected-data review threshold update: https://discord.com/blog/updated-requirements-to-how-apps-access-data-in-servers
