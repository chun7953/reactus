# Reactus Bot

![Node.js](https://img.shields.io/badge/node-20.x-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)

Reactusは、Discordサーバーの運営を効率化し、コミュニティ活動を豊かにするための**多機能ボット**です。
自動リアクションやアナウンスといった基本的な機能に加え、**Googleカレンダーと連携した高度なイベント通知機能**を備えています。

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

### 1. 前提条件
-   Node.js (v20.x)
-   Git
-   Railwayアカウント
-   Google Cloud Platformアカウント

### 2. Google APIの準備

1.  **Google Cloudプロジェクトの作成**: [Google Cloud Platform](https://console.cloud.google.com/) で新しいプロジェクトを作成します。
2.  **APIの有効化**: 作成したプロジェクトで、以下の2つのAPIを有効にします。
    -   **Google Sheets API**
    -   **Google Calendar API**
3.  **OAuth同意画面の設定**:
    -   「APIとサービス」 > 「OAuth同意画面」に移動します。
    -   `User Type` は 「**外部**」 を選択します。
    -   アプリ名（例: `Reactus Bot`）やメールアドレスなど、必須項目を入力します。
    -   「スコープ」の画面で、「スコープを追加または削除」をクリックし、以下の2つを追加して保存します。
        -   `.../auth/spreadsheets`
        -   `.../auth/calendar.readonly`
    -   「テストユーザー」の画面で、「+ ADD USERS」をクリックし、**あなた自身のGoogleアカウントのメールアドレス**を追加します。
4.  **OAuth 2.0 クライアント IDの作成**:
    -   「APIとサービス」 > 「認証情報」に移動します。
    -   「+ 認証情報を作成」 > 「OAuth 2.0 クライアント ID」を選択します。
    -   アプリケーションの種類は「**ウェブ アプリケーション**」を選択します。
    -   「承認済みのリダイレクトURI」に `http://localhost:3000/oauth2callback` を追加します。
    -   作成後、**クライアントID**と**クライアントシークレット**をコピーしておきます。これらは後のステップで使います。

### 3. ローカルでのセットアップとトークン取得

1.  **リポジトリをクローン**:
    ```bash
    git clone [https://github.com/](https://github.com/)<あなたのユーザー名>/reactus.git
    cd reactus
    ```
2.  **依存関係をインストール**:
    ```bash
    npm install
    npm install open # 一時的に利用
    ```
3.  **`.env`ファイルを作成**: プロジェクトのルートに`.env`ファイルを作成し、以下の内容を記述します。
    ```env
    # Discord Bot
    TOKEN=YOUR_DISCORD_BOT_TOKEN
    CLIENT_ID=YOUR_DISCORD_CLIENT_ID

    # Google OAuth 2.0 (先ほど取得した値を入力)
    GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
    
    # この時点では空でOK
    GOOGLE_REFRESH_TOKEN=
    ```
4.  **リフレッシュトークンを取得**:
    - ターミナルで以下のコマンドを実行します。
      ```bash
      node generateRefreshToken.js
      ```
    - 自動でブラウザが開き、Googleの同意画面が表示されます。
    - **必ず、カレンダーとスプレッドシートの両方の権限にチェックを入れて**「続行」をクリックしてください。
    - 認証が成功すると、ターミナルに**新しいリフレッシュトークン**が表示されます。
5.  **`.env`ファイルを更新**:
    - ターミナルに表示されたリフレッシュトークンをコピーし、`.env`ファイルの `GOOGLE_REFRESH_TOKEN=` の部分に貼り付けます。
6.  **一時ファイルを削除**: トークンは取得できたので、`generateRefreshToken.js` はもう不要です。削除して構いません。

### 4. Railwayへのデプロイ
1.  **GitHubにプッシュ**: 全てのコードをあなたのGitHubリポジトリにプッシュします。
2.  **Railwayでプロジェクト作成**: Railwayのダッシュボードから`New Project` > `Deploy from GitHub repo`を選択し、このリポジトリを連携させます。
3.  **PostgreSQLを追加**: プロジェクト内で`+ New` > `Database` > `Add PostgreSQL`を選択し、データベースを作成します。
4.  **環境変数を設定**:
    -   作成したボットのサービスの「Variables」タブに移動します。
    -   `+ New Variable` > `Add from Database`で`PostgreSQL`を選択し、`DATABASE_URL`を自動で追加します。
    -   `.env`ファイルに記載した**全て**の環境変数（`TOKEN`, `CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`）を手動で追加します。`SPREADSHEET_ID`もここで追加します。
5.  **起動コマンドを設定**:
    -   「Settings」タブの「Start Command」に、`npm start` を設定します。（`railway-deploy`は不要になりました）
6.  **コマンドを登録**:
    -   デプロイが完了したら、サービスの「Settings」タブで、Start Commandを一時的に`npm run register-commands`に変更して再デプロイし、コマンドを登録します。（完了後、元の`npm start`に戻します）


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

### ユーティリティ
-   `/poll`: 簡易投票を作成します。
-   `/csvreactions`: リアクションをCSVで集計します。
-   `/listsettings`: リアクション、カレンダー通知、メインカレンダーの全ての設定を一覧表示します。
-   `/help`: このヘルプメッセージを表示します。
-   `/feedback`: 開発サーバーの招待リンクを表示します。

### 管理者向け機能
-   `/backup`: 全ての設定を、今すぐ強制的にGoogleスプレッドシートにバックアップします。
-   `/restore`: Googleスプレッドシートから全ての設定を復元（上書き）します。