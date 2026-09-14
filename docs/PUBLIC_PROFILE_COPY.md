# Reactus public profile copy

Last reviewed: 2026-09-14

This file is the canonical copy source for the public-facing Reactus profile, especially fields that must be entered manually in the Discord Developer Portal.

Reactus is primarily an operator tool used by its maintainer and known Discord servers. The goal of this profile is not mass acquisition. It should make the current product understandable to someone who encounters Reactus, and make it easy to hand the hosted bot to a person who already wants to try it.

## Product position

Reactus reduces repetitive Discord server work by connecting scheduled posts and related automation to Google Calendar and a Japanese Web Admin.

The public profile should emphasize the current shipping experience in this order:

1. scheduled and recurring Discord posts
2. Google Calendar-centered scheduling
3. Japanese Web Admin for everyday operation
4. giveaways, automatic reactions, channel guides, images, and mentions
5. PC and smartphone operation

Do not describe Reactus as only an automatic-reaction bot. Do not imply broad public availability, guaranteed uptime, or Discord Discovery status.

## Discord Developer Portal

### Description

Use the following text as the default application description:

> Reactusは、Discordの予約・定期投稿、抽選、自動リアクション、チャンネル案内を、Google Calendarと日本語Web管理画面からまとめて運用するBotです。毎週の告知や画像付き投稿、複数景品の抽選など、繰り返すサーバー作業を減らします。使ってみたい方・要望・不具合報告はReactus開発室へ。

If a shorter field is required, use:

> Discordの予約・定期投稿、抽選、自動リアクションを、Google Calendarと日本語Web管理画面からまとめて運用するBotです。

### Tags

Use these five tags unless the shipping feature set materially changes:

- `calendar`
- `automation`
- `schedule`
- `giveaway`
- `utility`

`reaction` is a valid Reactus feature but should not replace the scheduling / Calendar positioning in the primary five tags.

### Public links

- Website: `https://reactus.fly.dev/`
- Support / feedback: `https://discord.gg/m6mFzzEQhr`
- Terms: `https://reactus.fly.dev/terms.html`
- Privacy: `https://reactus.fly.dev/privacy.html`
- Source: `https://github.com/chun7953/reactus`

## Website alignment

The website should answer three questions quickly:

1. What repetitive Discord work does Reactus remove?
2. How does Google Calendar / Web Admin fit into that workflow?
3. Where should someone go if they want to try it or ask about it?

The preferred first-view wording is intentionally practical rather than promotional:

- describe weekly announcements, scheduled posts, giveaways, and automatic reactions as examples of repetitive work
- make Google Calendar + Japanese Web Admin the differentiating workflow
- route interested users to the Reactus development/support server instead of presenting the site as a mass public-install campaign

## Maintenance rule

When public positioning changes, update this file in the same change as the website copy. If the Developer Portal text differs from this file, treat the Portal as stale until the difference is intentionally reviewed.
