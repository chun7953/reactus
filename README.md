# Reactus Bot

![Node.js](https://img.shields.io/badge/node-24.x-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)

Reactusは、Discordサーバー向けの多機能ボットです。
自動リアクション、アナウンス機能、Googleカレンダーと連携したイベント通知機能などを備えています。

このプロジェクトは、Fly.ioでの稼働を想定しています。

## ✨ 主な機能

-   **自動リアクション**: 特定のキーワードを含むメッセージに、設定した絵文字を自動で付与します。
-   **自動アナウンス**: 指定したメッセージを常にチャンネルの最新部に表示し続けます。
-   **抽選機能**:
    -   賞品、当選者数、期間などを設定して抽選イベントを作成・管理できます。
    -   `/giveaway schedule`による単発の予約開催や、`/giveaway edit`で進行中の抽選内容の変更が可能です。
    -   `/calendarpost giveaway`ではGoogleカレンダーを予定の正本として、期間付き抽選をDiscordから登録できます。
    -   日・週・月・年単位、N週ごと、複数曜日、第N曜日、最終曜日、月末、終了日、回数指定などの定期抽選に対応します。
    -   Googleカレンダーに従来どおり`【ラキショ】`を含む予定を手入力する方式も引き続き利用できます。
    -   `/giveaway-permission`コマンドで、管理者以外の特定ロールに抽選の管理権限を付与できます。
-   **Googleカレンダー連携**:
    -   Googleカレンダーの予定を10分おきに監視します。
    -   特定のキーワードを含む予定が対象時間になると、指定したチャンネルへ投稿します。
    -   `/calendarpost post`から通常の予約投稿・定期投稿をDiscordだけで登録できます。
    -   投稿ごとにメンションの有無・ロールを指定でき、画像付きの定期投稿にも対応します。
    -   `/calendarpost list`、`/calendarpost delete`、`/calendaredit`で一覧・削除・編集もDiscord内で行えます。
    -   サーバーのメインカレンダーを登録できます。
-   **投票作成**: リアクションを利用した投票を作成できます。
-   **CSVリアクション集計**: メッセージに付けられたリアクションを、ユーザーリスト付きのCSVファイルとして出力します。集計結果は、**全員に公開**するか、**自分だけに表示**するかを選択できます。
-   **Googleスプレッドシート連携**: 全ての設定を、コマンド一つで、または設定変更時に自動でGoogleスプレッドシートにバックアップ・復元できます。

## 🚀 セットアップとデプロイ手順

### 1. 前提条件
-   Node.js (v24.x)
-   Git
-   Fly.ioアカウントおよび`flyctl`コマンドラインツール
-   Google Cloud Platformアカウント

### 2. Google APIの準備

1.  **Google Cloudプロジェクトの作成**: [Google Cloud Platform](https://console.cloud.google.com/) で新しいプロジェクトを作成します。
2.  **APIの有効化**: 作成したプロジェクトで、以下の2つのAPIを有効にします。
    -   **Google Sheets API**
    -   **Google Calendar API**
3.  **サービスアカウントの作成とキーの取得**:
    - 「APIとサービス」 > 「認証情報」 > 「+ 認証情報を作成」 > 「サービスアカウント」を選択します。
    - サービスアカウント名（例: `reactus-bot-service-account`）を入力し、作成して続行します。
    - ロールは不要なので、何も選択せずに「完了」をクリックします。
    - 作成したサービスアカウントのメールアドレス（`...@...iam.gserviceaccount.com`）をコピーしておきます。
    - 作成したサービスアカウントをクリックし、「キー」タブ > 「鍵を追加」 > 「新しい鍵を作成」を選択します。
    - キーのタイプは「**JSON**」を選んで作成すると、認証情報が記述されたJSONファイルがダウンロードされます。**このファイルは公開しないでください。**
4. **Googleリソースの共有設定**:
    - **Googleスプレッドシート**: バックアップ先のスプレッドシートを開き、右上の「共有」ボタンから、先ほどコピーしたサービスアカウントのメールアドレスを**編集者**として追加します。
    - **Googleカレンダー**: 対象Googleカレンダーの設定を開き、「特定のユーザーとの共有」で、同じサービスアカウントのメールアドレスを**予定の変更**権限で追加します。閲覧だけなら従来のカレンダー通知は動きますが、`/calendarpost`と`/calendaredit`でDiscordから予定を作成・編集するには変更権限が必要です。
5.  **スプレッドシートIDの取得**:
    - 共有したスプレッドシートのURL（`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`）から、`SPREADSHEET_ID`の部分をコピーしておきます。

### 3. Fly.ioへのデプロイと運用

1.  **Fly.ioアプリの作成**:
    -   プロジェクトのルートディレクトリで `fly launch` を実行します。
    -   アプリ名やリージョン（例: nrt - Tokyo）などを設定します。
    -   `fly.toml` ファイルが生成されます。
2.  **Supabase PostgreSQLの接続情報を用意**:
    -   Supabaseの「Connect」から接続文字列を取得します。
    -   Fly.ioのような常駐VMではDirect connection、IPv4接続が必要な場合はShared PoolerのSession modeを使用します。
3.  **環境変数（Secrets）を設定**:
    -   `flyctl secrets set` コマンドを使用して、以下の変数を設定します。
        -   `flyctl secrets set TOKEN="あなたのDiscordボットのトークン"`
        -   `flyctl secrets set DATABASE_URL="SupabaseのPostgreSQL接続文字列"`
        -   `flyctl secrets set CLIENT_ID="あなたのDiscordボットのクライアントID"`
        -   `flyctl secrets set SPREADSHEET_ID="手順2-5で取得したスプレッドシートのID"`
        -   `flyctl secrets set GOOGLE_SHEETS_CREDENTIALS="手順2-3でダウンロードしたJSONファイルの中身をすべてコピー＆ペースト"`
4.  **デプロイ**:
    -   `fly deploy` コマンドを実行して、アプリケーションをデプロイします。
    -   GitHubリポジトリと連携している場合、mainブランチへのプッシュで自動的にデプロイが実行されます（`.github/workflows/fly-deploy.yml`）。

### ヘルスチェック

-   `/healthz`: プロセスの稼働状態を返します。
-   `/readyz`: DB、Discord、監視サービスを含む初期化が完了した場合だけHTTP 200を返します。Fly.ioのデプロイ判定にはこちらを使用します。

### 4. スラッシュコマンドの登録・更新

BotはDiscordへ接続した後、現在のコマンド定義を自動同期します。通常は手動登録は不要です。

自動同期を使えない場合の手動手段として、従来どおり次を利用できます。

```sh
npm run register-commands
```

## 🤖 コマンド一覧

### リアクション管理
-   `/setreaction`: 自動リアクションを設定します。（設定時に自動バックアップ）
-   `/removereaction`: 設定した自動リアクションを解除します。（設定時に自動バックアップ）
-   `/reacttomessage`: 指定したメッセージに、設定済みの自動リアクションを手動で適用します。

### カレンダー連携
-   `/calendarpost post`: 通常の予約投稿・定期投稿をGoogleカレンダーへ登録します。本文、画像、メンション、カスタム繰り返しを指定できます。
-   `/calendarpost giveaway`: 開始・終了時刻を持つ抽選をGoogleカレンダーへ登録します。複数景品、画像、メンション、カスタム繰り返しに対応します。
-   `/calendarpost list`: 今後の自動投稿予定を表示します。表示されたイベントIDは編集・削除に使えます。
-   `/calendarpost delete`: 予定を削除します。定期予定は「この回だけ」「繰り返し全体」を選べます。
-   `/calendaredit post`: 登録済みの通常投稿を編集します。日時、本文、画像、メンション、繰り返しルールを変更できます。
-   `/calendaredit giveaway`: 登録済みの抽選予定を編集します。景品、当選人数、期間、画像、メンション、繰り返しルールを変更できます。
-   `/register-main-calendar`: サーバーのメインカレンダーを登録・更新します。（管理者のみ）
-   `/setcalendar`: チャンネルにカレンダー通知を設定します。IDを省略するとメインカレンダーが使われます。
-   `/removecalendar`: チャンネルのカレンダー通知設定を解除します。

### アナウンス機能
-   `/startannounce`: チャンネルに自動アナウンスを設定します。
-   `/stopannounce`: アナウンスを停止します。

### 抽選機能
-   `/giveaway start`: 抽選を今すぐ開始します。
-   `/giveaway schedule`: 単発の抽選を予約します。定期抽選には`/calendarpost giveaway`を使用します。
-   `/giveaway end`: 進行中の抽選を即時終了します。
-   `/giveaway reroll`: 終了した抽選の再抽選をします。
-   `/giveaway edit`: 進行中の抽選の内容（賞品、当選者数、終了日時）を変更します。
-   `/giveaway fix`: 不具合が起きた抽選を、参加者を引き継いで作り直します。
-   `/giveaway restore`: エラーで止まった抽選を、進行中に復元します。
-   `/giveaway list`: 進行中・予約中の抽選を一覧表示します。
-   `/giveaway delete`: 抽選のメッセージとデータを完全に削除します。
-   `/giveaway-permission`: 抽選コマンドの管理権限をロールに付与します。

### ユーティリティ
-   `/poll`: 簡易投票を作成します。リアクション集計ボタン付きです。
-   `/csvreactions`: 指定メッセージのリアクションをCSVで集計します。公開/非公開を選べます。
-   `/listsettings`: リアクション、カレンダー通知、メインカレンダーの全ての設定を一覧表示します。
-   `/help`: このヘルプメッセージを表示します。
-   `/feedback`: 開発サーバーの招待リンクを表示します。

### 管理者向け機能
-   `/backup`: 全ての設定を、今すぐ強制的にGoogleスプレッドシートにバックアップします。
-   `/restore`: Googleスプレッドシートから全ての設定を復元（上書き）します。

---

## ✨ 謝辞 (Acknowledgements)

このボットの抽選機能は、[Androz2091氏が開発したGiveawayBot](https://github.com/Androz2091/giveaways-bot)を参考にしています。
GiveawayBotは Apache License 2.0 の下で公開されています。

## 📜 ライセンス

このプロジェクトは ISC License の下で公開されています。プロジェクトのルートにある `LICENSE` ファイルで詳細を確認できます。
