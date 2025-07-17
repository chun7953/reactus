# Reactus Bot

![Node.js](https://img.shields.io/badge/node-20.x-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)

Reactusは、Discordサーバーの運営を効率化し、コミュニティ活動を豊かにするための多機能ボットです。自動リアクションやアナウンスといった基本的な機能に加え、Googleカレンダーと連携した高度なイベント通知機能を備えています。

このプロジェクトは、メンテナンス性と拡張性を考慮したモダンな設計に基づいており、クラウドプラットフォーム（Railway）での24時間365日安定稼働を実現しています。

## ✨ 主な機能

-   **自動リアクション**: 特定のキーワードを含むメッセージに、あらかじめ設定した絵文字を自動で付与します。
-   **自動アナウンス**: 指定したメッセージを常にチャンネルの最新部に表示し続ける、ピン留めのような機能です。
-   **Googleカレンダー連携**:
    -   Googleカレンダーの予定を5分おきに監視します。
    -   特定のキーワードを含む予定が開始5分前になると、指定したチャンネルに、ロールメンション付きで自動で通知します。
    -   サーバーのメインカレンダーを登録し、普段の設定を簡略化できます。
-   **投票作成**: リアクションを利用した投票を、コマンド一つで簡単に作成できます。
-   **CSVリアクション集計**: メッセージに付けられたリアクションを、ユーザーリスト付きのCSVファイルとして出力します。
-   **Googleスプレッドシート連携**: 全ての設定（リアクション、アナウンス、カレンダー）を、コマンド一つで、または設定変更時に自動でGoogleスプレッドシートにバックアップ・復元できます。

## 🚀 セットアップとデプロイ手順

このボットを新しい環境で動かすための手順です。

### 1. 前提条件
-   Node.js (v20.x)
-   Git
-   Railwayアカウント
-   Google Cloud Platformアカウント

### 2. ローカルでのセットアップ
1.  **リポジトリをクローン**:
    ```bash
    git clone [https://github.com/](https://github.com/)<あなたのユーザー名>/reactus.git
    cd reactus
    ```
2.  **依存関係をインストール**:
    ```bash
    npm install
    ```
3.  **環境変数を設定**:
    プロジェクトのルートに`.env`ファイルを作成し、以下の内容を記述します。
    ```env
    # Discord Bot
    TOKEN=YOUR_DISCORD_BOT_TOKEN
    CLIENT_ID=YOUR_DISCORD_CLIENT_ID

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
    GOOGLE_REFRESH_TOKEN=YOUR_GOOGLE_REFRESH_TOKEN

    # Google Sheets
    SPREADSHEET_ID=YOUR_SPREADSHEET_ID
    
    # Railwayが提供するポート
    PORT=8080 
    ```
4.  **Google APIの準備**:
    -   Google Cloud Platformで、**Google Sheets API**と**Google Calendar API**の両方を有効化します。
    -   「OAuth 2.0 クライアント ID」を作成し、`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`を取得します。
    -   `generateRefreshToken.js`（一時ファイル）を実行し、`GOOGLE_REFRESH_TOKEN`を取得します。
5.  **ローカルで起動**:
    ```bash
    npm start
    ```

### 3. Railwayへのデプロイ
1.  **GitHubにプッシュ**: 全てのコードをGitHubリポジトリにプッシュします。
2.  **Railwayでプロジェクト作成**: Railwayのダッシュボードから`New Project` > `Deploy from GitHub repo`を選択し、このリポジトリを連携させます。
3.  **PostgreSQLを追加**: プロジェクト内で`+ New` > `Database` > `Add PostgreSQL`を選択し、データベースを作成します。
4.  **環境変数を設定**:
    -   作成したボットのサービス（`reactus`など）の「Variables」タブに移動します。
    -   `+ New Variable` > `Add from Database`で`PostgreSQL`を選択し、`DATABASE_URL`を自動で追加します。
    -   `.env`ファイルに記載した他の全ての環境変数（`TOKEN`、`GOOGLE_CLIENT_ID`など）を手動で追加します。
5.  **起動コマンドを設定**:
    -   「Settings」タブの「Start Command」に、以下のコマンドを設定します。
    ```
    npm run railway-deploy
    ```
6.  **コマンドを登録**:
    -   デプロイが完了したら、サービスの「Settings」タブで、Start Commandを一時的に`npm run register-commands`に変更して再デプロイし、コマンドを登録します。（完了後、元の`npm run railway-deploy`に戻します）

## 🤖 コマンド一覧

### リアクション管理
-   `/setreaction`: 自動リアクションを設定します。（設定時に自動バックアップ）
-   `/removereaction`: 設定した自動リアクションを解除します。（設定時に自動バックアップ）

### カレンダー連携
-   `/register-main-calendar`: サーバーのメインカレンダーをiCal非公開URLで登録します。（管理者のみ）
-   `/setcalendar`: チャンネルにカレンダー通知を設定します。URLを省略するとメインカレンダーが使われます。
-   `/removecalendar`: チャンネルのカレンダー通知設定を解除します。

### 設定とユーティリティ
-   `/listsettings`: リアクション、カレンダー通知、メインカレンダーの全ての設定を一覧表示します。
-   `/startannounce`: チャンネルに自動アナウンスを設定します。
-   `/stopannounce`: アナウンスを停止します。
-   `/poll`: 簡易投票を作成します。
-   `/csvreactions`: リアクションをCSVで集計します。
-   `/help`: このヘルプメッセージを表示します。
-   `/feedback`: 開発サーバーの招待リンクを表示します。

### 管理者向け機能
-   `/backup`: 全ての設定を、今すぐ強制的にGoogleスプレッドシートにバックアップします。
-   `/restore`: Googleスプレッドシートから全ての設定を復元（上書き）します。