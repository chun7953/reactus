# Reactus limited external alpha runbook

Last reviewed: 2026-09-13

This runbook is the operator checklist for the **limited external alpha** of the official hosted Reactus bot. It starts only after fresh-tenant production smoke and the limited-alpha Discord Developer Portal settings have passed.

This is not a public-rollout guide. Keep the alpha intentionally small and invite only independent server operators who understand that the service is still being validated.

## Entry criteria

Before inviting an external server, confirm all of the following remain true:

- production `/readyz` reports `ready=true`
- fresh-tenant Calendar ownership verification has passed in production
- guild leave -> claim revocation -> rejoin -> reverify has passed in production
- Web Admin -> intended Google Calendar -> intended Discord channel routing has passed in production
- Discord installation uses Guild Install only, Discord-provided install link, and scopes `bot` + `applications.commands`
- default bot permissions are View Channels, Send Messages, Embed Links, Attach Files, Read Message History, and Add Reactions
- Presence Intent is off; Server Members Intent and Message Content Intent are on
- Terms of Service and Privacy Policy URLs are configured in the Developer Portal

If any entry criterion regresses, stop onboarding new alpha servers until the cause is understood.

## Initial alpha size

Start with one independent external server. Expand gradually to a small group after the first server completes the acceptance flow without a service-wide regression. A practical target is 3-5 independent servers before considering a wider public install link.

Do not optimize for server count during this phase. The purpose is to expose tenant-boundary, onboarding, permissions, scheduling, API-volume, and support problems under real independent use.

## Tester onboarding flow

For each new external server:

1. Install Reactus using the Discord-provided install link from the Developer Portal.
2. Confirm the bot appears in the intended server and has only the expected default permissions unless the server intentionally grants more.
3. Run `/reactus` and confirm the Japanese Web Admin can be opened by a member with the required management permission.
4. Choose a Google Calendar owned or controlled by that server operator.
5. If Reactus reports that it cannot access the Calendar, share that Calendar with the Reactus service-account email shown by Reactus and grant permission to make changes to events.
6. Run `/verify-calendar calendar_id:<calendar ID>` or use the main-calendar setup flow.
7. Copy the short-lived `REACTUS-VERIFY-...` challenge into the **Calendar description**, save it, then run verification again.
8. In Web Admin, create one ordinary one-time scheduled post with a unique title and select the intended Discord channel.
9. Confirm the event is created in the intended Google Calendar.
10. Confirm the post arrives exactly once in the intended Discord server/channel.
11. Run `/feedback` once and confirm the support-server link is reachable.

Do not ask testers to send bot tokens, service-account keys, Web Admin login tokens, or other credentials in bug reports.

## Per-server acceptance record

Record only the minimum evidence needed for the alpha. Prefer an operator label such as `alpha-01` instead of publishing raw Discord guild IDs.

For each server record:

- install completed
- Web Admin opened
- Calendar access established
- Calendar ownership verification completed
- scheduled event created in the intended Calendar
- Discord delivery arrived once in the intended channel
- `/feedback` support path opened
- unexpected behavior / workaround required
- date/time and app version or main commit used for the test

Keep screenshots only when they help reproduce a failure. Redact tokens, private calendar contents, user lists, and unrelated server content.

## Production observations during alpha

Before the first onboarding and after each new server completes the flow:

- check `/readyz` and confirm the service remains ready
- review production logs for recurring monitor failures, Calendar access failures, duplicate-delivery errors, or unhandled exceptions
- watch for repeated Google API `403`, `429`, quota, or retry-related errors
- watch for Discord REST/API rate-limit or failed-delivery errors
- watch support requests for repeated setup confusion, especially Calendar sharing, ownership verification, channel selection, and Web Admin authorization

A single transient provider error is not automatically a rollout failure. Repeated errors, failed user actions, or errors that require permissive fallback are a stop signal.

## Acceptance criteria

The limited external alpha can be considered successful when:

- at least one truly independent external server completes the full onboarding and post-delivery flow without operator intervention that bypasses normal product behavior
- multiple independent servers complete the same flow before widening beyond the alpha; target 3-5 where practical
- no server can access another server's unverified Calendar or routing state
- no scheduled post is delivered to the wrong guild/channel or delivered more than once because of a Reactus defect
- production `/readyz` remains healthy and recurring monitor failures do not appear
- Google API usage and Discord rate limiting remain operationally normal for the observed load
- the `/feedback` path gives testers a usable support route
- any P0/P1 finding is fixed at the root cause and revalidated before onboarding continues

Do not convert alpha success directly into Discovery. Public install, App Verification, Discovery profile, support-server readiness, and protected-data review remain separate rollout gates.

## Stop conditions

Pause new alpha onboarding immediately if any of the following occurs:

- cross-guild Calendar access, restore, or routing is possible without a verified claim
- a departed guild continues authorizing Calendar polling after claim revocation
- Calendar verification can be satisfied without the Calendar owner changing the Calendar description
- Web Admin authorization is bypassed
- a post is routed to the wrong guild or channel
- duplicate or missed posts recur because of Reactus state handling
- production `/readyz` becomes not ready or monitor failures recur
- repeated Google API or Discord rate-limit errors cause user-visible failures
- Privacy Policy, Terms, or requested Discord permissions no longer match shipping behavior

Do not add legacy-trust or permissive fallback to keep the alpha moving. Reproduce the failure, fix the canonical owner, and re-run the affected acceptance path.

## Failure report template

Use this compact template in the support server or a linked engineering issue:

```text
Alpha server: alpha-XX
Time (JST): YYYY-MM-DD HH:MM
Stage: install / Web Admin / Calendar access / verify / event creation / Discord delivery / other
Expected:
Actual:
Reproducible: yes / no / unknown
User-visible error text:
Relevant screenshot/log excerpt:
Workaround used: none / describe
```

Never include passwords, bot tokens, service-account private keys, Web Admin login tokens, or full private Calendar contents.

## Exit from limited alpha

After the alpha acceptance criteria are satisfied, review `docs/DISCORD_DISTRIBUTION_READINESS.md` again before widening distribution. The next gate is not automatic: confirm support flow, public profile metadata, Privacy/Terms, installation permissions, rollback path, and current Developer Portal requirements before publishing a wider install link.
