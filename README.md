# Reactus Bot

![Node.js](https://img.shields.io/badge/node-20.x-green.svg)
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
    -   `/giveaway schedule`による予約開催や、`/giveaway edit`で進行中の抽選内容の変更が可能です。
    -   Googleカレンダーに特定のキーワード（例: `【ラキショ】`）を含む予定を作成すると、予定の開始・終了時刻に合わせて抽選を自動で作成・実行します。
    -   `/giveaway-permission`コマンドで、管理者以外の特定ロールに抽選の管理権限を付与できます。
-   **Googleカレンダー連携**:
    -   Googleカレンダーの予定を10分おきに監視します。
    -   特定のキーワードを含む予定が開始10分前になると、指定したチャンネルに、ロールメンション付きで通知します。
    -   サーバーのメインカレンダーを登録できます。
-   **投票作成**: リアクションを利用した投票を作成できます。
-   **CSVリアクション集計**: メッセージに付けられたリアクションを、ユーザーリスト付きのCSVファイルとして出力します。集計結果は、**全員に公開**するか、**自分だけに表示**するかを選択できます。
-   **Googleスプレッドシート連携**: 全ての設定を、コマンド一つで、または設定変更時に自動でGoogleスプレッドシートにバックアップ・復元できます。

## 🚀 セットアップとデプロイ手順

### 1. 前提条件
-   Node.js (v20.x)
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
    - **Googleカレンダー**: 通知させたいGoogleカレンダーの設定を開き、「特定のユーザーとの共有」で、同様にサービスアカウントのメールアドレスを**閲覧者（すべての予定の詳細を閲覧）** として追加します。
5.  **スプレッドシートIDの取得**:
    - 共有したスプレッドシートのURL（`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`）から、`SPREADSHEET_ID`の部分をコピーしておきます。

### 3. Fly.ioへのデプロイと運用

1.  **Fly.ioアプリの作成**:
    -   プロジェクトのルートディレクトリで `fly launch` を実行します。
    -   アプリ名やリージョン（例: nrt - Tokyo）などを設定します。
    -   `fly.toml` ファイルが生成されます。
2.  **PostgreSQLデータベースの作成**:
    -   `fly postgres create` を実行して、PostgreSQLデータベースを作成します。
    -   `fly postgres attach <DATABASE_NAME>` を実行して、アプリにデータベースを接続します。これにより `DATABASE_URL` がSecretとして自動的に設定されます。
3.  **環境変数（Secrets）を設定**:
    -   `flyctl secrets set` コマンドを使用して、以下の変数を設定します。
        -   `flyctl secrets set TOKEN="あなたのDiscordボットのトークン"`
        -   `flyctl secrets set CLIENT_ID="あなたのDiscordボットのクライアントID"`
        -   `flyctl secrets set SPREADSHEET_ID="手順2-5で取得したスプレッドシートのID"`
        -   `flyctl secrets set GOOGLE_SHEETS_CREDENTIALS="手順2-3でダウンロードしたJSONファイルの中身をすべてコピー＆ペースト"`
4.  **デプロイ**:
    -   `fly deploy` コマンドを実行して、アプリケーションをデプロイします。
    -   GitHubリポジトリと連携している場合、mainブランチへのプッシュで自動的にデプロイが実行されます（`.github/workflows/fly-deploy.yml`）。

### 4. スラッシュコマンドの登録・更新

新しいコマンドを追加したり、既存コマンドを変更した場合は、手動でコマンド情報を再登録する必要があります。

1.  Fly.ioのコンソールに接続します。
    ```sh
    fly ssh console
    ```
2.  接続したコンソール内で、コマンド登録スクリプトを実行します。
    ```sh
    npm run register-commands
    ```
3.  コマンドが登録されたら、`exit`でコンソールを終了します。ボットのプロセスは自動で再起動します。

## 🤖 コマンド一覧

### リアクション管理
-   `/setreaction`: 自動リアクションを設定します。（設定時に自動バックアップ）
-   `/removereaction`: 設定した自動リアクションを解除します。（設定時に自動バックアップ）
-   `/reacttomessage`: 指定したメッセージに、設定済みの自動リアクションを手動で適用します。

### カレンダー連携
-   `/register-main-calendar`: サーバーのメインカレンダーを登録・更新します。（管理者のみ）
-   `/setcalendar`: チャンネルにカレンダー通知を設定します。IDを省略するとメインカレンダーが使われます。
-   `/removecalendar`: チャンネルのカレンダー通知設定を解除します。

### アナウンス機能
-   `/startannounce`: チャンネルに自動アナウンスを設定します。
-   `/stopannounce`: アナウンスを停止します。

### 抽選機能
-   `/giveaway start`: 抽選を開始します。
-   `/giveaway schedule`: 抽選を予約します。
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