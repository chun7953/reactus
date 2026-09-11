# Reactus

![Node.js](https://img.shields.io/badge/node-24.x-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)

Reactusは、Discordサーバーの**予約投稿・定期投稿・抽選・自動リアクション・チャンネル案内**を、Google Calendarと日本語のWeb管理画面からまとめて運用するBotです。

普段の設定は、Discordで `/reactus` を実行して開く管理画面から行うことを想定しています。スラッシュコマンドも残っているため、Discord内だけで直接操作することもできます。

## Reactusでできること

### Web管理画面

`/reactus` から発行されるリンクでログインすると、ブラウザ上で次の操作ができます。

- 通常の予約投稿・定期投稿を作成
- 抽選予定を作成
  - 1つの予定に複数景品を登録すると、開始時刻に上から順に連続投稿
  - 複数抽選のあとに本文を1回だけ投稿する設定にも対応
- 投稿本文、画像、メンション先を設定
- 日・週・月・年単位の繰り返しを設定
  - 複数曜日
  - N日 / N週 / Nか月 / N年ごと
  - 月末、第N曜日、最後の曜日
  - 終了日・回数指定
- 月カレンダーで予定を確認
- 予定を編集・削除・日付移動
- 今後の予定を検索・一覧表示
- Discord投稿のプレビューを確認
- Google CalendarとDiscord投稿先の対応を管理
- 自動リアクションを設定・編集・削除
  - Unicode絵文字とサーバー固有絵文字に対応
- チャンネル下部に残す案内メッセージを管理
- PC / スマートフォンの両方から操作

`/reactus` のログインリンクは10分間有効です。ログイン後の管理画面セッションは30日間有効です。管理画面を開く権限はDiscordの `メッセージの管理` 権限を基準にしています。

### Google Calendar連携

Reactusでは、予約・定期投稿の予定をGoogle Calendarに登録して運用できます。

- 通常投稿と抽選予定をGoogle Calendarへ登録
- Google Calendar上の予定からDiscordへ自動投稿
- 繰り返し予定に対応
- 画像・メンション設定を予定と一緒に保持
- サーバーごとのメインカレンダーを設定
- Discordチャンネルごとに監視するGoogle Calendarを設定
- 管理画面またはDiscordコマンドから予定を編集・削除

Google CalendarをReactusから作成・編集する場合、サービスアカウントに対象カレンダーの**予定を変更できる権限**を付与してください。

### 自動リアクション

指定したDiscordチャンネルで、メッセージ本文に設定したトリガーが含まれたときにリアクションを自動付与します。

管理画面では、利用可能なチャンネル・Unicode絵文字・サーバー固有絵文字から設定できます。既存メッセージに対して手動適用する `/reacttomessage` もあります。

### チャンネル下部の案内

特定の案内メッセージがチャンネル下部に残るよう管理できます。管理画面または `/startannounce` / `/stopannounce` から設定できます。

### 抽選・ユーティリティ

- ボタン参加型の抽選
- 即時開始・予約・終了・再抽選・編集・復旧・削除
- 抽選管理権限をロールへ付与
- リアクション投票
- リアクション参加者のCSV出力
- 設定一覧の確認
- Google Sheetsへの設定バックアップ / 復元

## まず使う

Botを導入済みのDiscordサーバーでは、まず次を実行します。

```text
/reactus
```

表示された **「Reactus 管理画面を開く」** を押すと、現在のDiscordサーバー専用の管理画面が開きます。

コマンド一覧は `/help` でも確認できます。

## 主なDiscordコマンド

普段は管理画面の利用を推奨しています。以下はDiscord内から直接操作したい場合のコマンドです。

| 用途 | コマンド |
| --- | --- |
| 管理画面 | `/reactus` |
| ヘルプ | `/help` |
| 自動リアクション | `/setreaction`, `/removereaction`, `/reacttomessage` |
| 予約・定期投稿 | `/calendarpost post`, `/calendarpost giveaway`, `/calendarpost list`, `/calendarpost delete` |
| 予定編集 | `/calendaredit post`, `/calendaredit giveaway` |
| Calendar設定 | `/register-main-calendar`, `/setcalendar`, `/removecalendar` |
| チャンネル案内 | `/startannounce`, `/stopannounce` |
| 抽選 | `/giveaway start`, `schedule`, `end`, `reroll`, `edit`, `list`, `unschedule`, `delete`, `fix`, `restore` |
| 抽選権限 | `/giveaway-permission` |
| その他 | `/poll`, `/csvreactions`, `/listsettings`, `/feedback` |
| バックアップ | `/backup`, `/restore` |

DiscordアプリケーションコマンドはBot起動時に自動同期されます。通常は手動登録不要です。必要な場合のみ次を実行できます。

```bash
npm run register-commands
```

## 自前で動かす場合

### 必要なもの

- Node.js 24.x
- Discord Bot / Application
- PostgreSQL
- Google Cloudのサービスアカウント（Google Calendarを使う場合）
- Google Sheets（バックアップ / 復元を使う場合）
- HTTPSで公開できる実行環境
  - このリポジトリではFly.io向け設定を同梱しています

### 1. インストール

```bash
git clone https://github.com/chun7953/reactus.git
cd reactus
npm ci
```

### 2. Discordアプリを準備

Discord Developer PortalでBot/Applicationを作成し、少なくとも以下を用意します。

- Bot Token → `TOKEN`
- Application ID → `CLIENT_ID`

Reactusはメッセージ、リアクション、メンバー、メッセージ本文、サーバー絵文字などを利用します。Bot側の権限とGateway Intentも、利用する機能に合わせて有効にしてください。

### 3. PostgreSQLを準備

PostgreSQLの接続文字列を `DATABASE_URL` に設定します。SupabaseなどのマネージドPostgreSQLも利用できます。

### 4. Google APIを準備

Google Calendar連携を使う場合は、Google Cloudでサービスアカウントを作成し、Google Calendar APIを有効にします。Google Sheetsへのバックアップも使う場合はGoogle Sheets APIも有効にします。

1. サービスアカウントのJSONキーを作成
2. JSON内の `client_email` を確認
3. 対象Google Calendarを、そのメールアドレスへ共有
   - 予定をReactusから作成・編集するなら「予定の変更」が可能な権限を付与
4. バックアップを使う場合は、対象Google Sheetsも同じメールアドレスへ編集者として共有
5. JSONファイル全体を**base64エンコード**し、`GOOGLE_SHEETS_CREDENTIALS` に設定

> 環境変数名は歴史的に `GOOGLE_SHEETS_CREDENTIALS` ですが、このサービスアカウント認証はGoogle Calendar機能でも使用します。JSON文字列をそのまま設定するのではなく、現行実装ではbase64文字列が必要です。

macOS / Linuxの例:

```bash
base64 < service-account.json | tr -d '\n'
```

PowerShellの例:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

### 5. 環境変数

主要な環境変数は次のとおりです。

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `TOKEN` | 必須 | Discord Bot Token |
| `CLIENT_ID` | 実運用では必須 | Discord Application ID。コマンド自動同期に使用 |
| `DATABASE_URL` | 必須 | PostgreSQL接続文字列 |
| `PUBLIC_BASE_URL` | 公開環境で推奨 | `/reactus` が発行する管理画面URLのベース。既定値は `https://reactus.fly.dev` |
| `PORT` | 任意 | HTTPポート。既定値は `8080` |
| `GOOGLE_SHEETS_CREDENTIALS` | Calendar利用時 | base64化したGoogleサービスアカウントJSON |
| `SPREADSHEET_ID` | Sheets利用時 | 設定バックアップ / 復元先のGoogle Sheets ID |
| `MIGRATION_TARGET_DATABASE_URL` | 特殊用途 | DB移行時に利用する接続先 |

ローカルでは `.env` に設定できます。

```dotenv
TOKEN=...
CLIENT_ID=...
DATABASE_URL=postgresql://...
PUBLIC_BASE_URL=http://localhost:8080
GOOGLE_SHEETS_CREDENTIALS=...
SPREADSHEET_ID=...
```

`PUBLIC_BASE_URL` はlocalhost以外ではHTTPSが必要です。

### 6. 起動

```bash
npm start
```

起動時には、Webサーバー、Botモジュール、PostgreSQL、Discord接続、監視処理が順に初期化されます。Discord接続後、現在のスラッシュコマンド定義も自動同期されます。

## Fly.ioへデプロイ

このリポジトリには `fly.toml` とGitHub ActionsのFly Deploy workflowが含まれています。現在の設定では東京リージョン、内部ポート8080、`/readyz` health checkを使用します。

Fly Secretsの例:

```bash
fly secrets set TOKEN="..."
fly secrets set CLIENT_ID="..."
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set PUBLIC_BASE_URL="https://your-app.fly.dev"
fly secrets set GOOGLE_SHEETS_CREDENTIALS="<base64>"
fly secrets set SPREADSHEET_ID="..."
```

手動デプロイ:

```bash
fly deploy
```

GitHub Actionsを使う場合は、GitHub repository secretに `FLY_API_TOKEN` を登録します。`main` へのpush時に次が自動実行されます。

1. `npm ci`
2. `npm run check`
3. production dependency audit
4. `flyctl deploy --remote-only`

## ヘルスチェック

- `/healthz` — HTTPプロセスの状態確認
- `/readyz` — Reactus全体の起動状態確認

`/readyz` は設定、HTTP、モジュール、DB、Discord、監視処理がreadyになるまでHTTP 503を返し、準備完了後にHTTP 200になります。Fly.ioのhealth checkもこちらを使用します。

## 開発・テスト

構文チェックとNode.jsテスト:

```bash
npm run check
```

個別に実行する場合:

```bash
npm run check:syntax
npm test
```

GitHub Actionsでは、通常のCIに加えてPC / スマートフォン相当のChromiumによる管理画面E2Eも実行しています。管理画面の主要操作、月カレンダー、予定作成・編集、権限表示、スマホレイアウト、JavaScriptエラー、イベントループ応答などをPR段階で確認します。

## 構成

```text
src/
  commands/       Discordスラッシュコマンド
  events/         Discordイベント
  lib/            Calendar、抽選、リアクション、監視、DB等のドメイン処理
  web/            HTTPサーバーと管理画面API
public/
  admin.html      管理画面
  admin.js        管理画面core
  common/         管理画面の機能別module
  index.html      公開サイト
  privacy.html    プライバシーページ
tests/
  e2e/            Chromium実ブラウザE2E
```

## 運用上の考え方

- 通常の設定はWeb管理画面から行い、Discordコマンドは直接操作・補助操作として併用します。
- Google Calendar関連のデータ取得はサーバー側でキャッシュし、管理画面からの明示的な更新や予定変更で更新します。
- 管理画面はDiscordサーバーごとの権限を基準に、編集可能なチャンネルと閲覧のみの設定を分けて表示します。
- 変更はNode.jsテストだけでなく実ブラウザE2Eを通してから `main` へ反映します。

## 謝辞

抽選機能は [GiveawayBot](https://github.com/Androz2091/giveaways-bot) を参考にしています。GiveawayBotはApache License 2.0の下で公開されています。

## ライセンス

ReactusはISC Licenseの下で公開されています。詳細は [`LICENSE.md`](./LICENSE.md) を参照してください。
