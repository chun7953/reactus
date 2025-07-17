# Reactus Bot

![Node.js Version](https://img.shields.io/badge/node-20.x-green.svg)
![License](https://img.shields.io/badge/license-ISC-blue.svg)

Reactusは、Discordサーバーの運営を効率化するための多機能ボットです。自動リアクション設定、アナウンス機能、Google Sheetsとの連携によるバックアップなど、サーバー管理をサポートする豊富な機能を提供します。

このプロジェクトは、メンテナンス性と拡張性を考慮して再設計されています。

## ✨ 主な機能

- **自動リアクション**: 特定のキーワードに反応し、あらかじめ設定した絵文字を自動で付与します。
- **アナウンス機能**: 指定したメッセージを常にチャンネルの最新部に表示し続ける、ピン留めのような機能です。
- **バックアップ & 復元**: リアクションやアナウンスの設定を、Google Sheetsに安全にバックアップし、いつでも復元できます。
- **投票作成**: リアクションを利用した投票を、コマンド一つで簡単に作成できます。
- **CSVリアクション集計**: メッセージに付けられたリアクションをユーザーリスト付きのCSVファイルとして出力します。

## 🚀 セットアップ手順

ボットをあなたの環境で動かすための手順です。

### 1. プロジェクトの準備
まず、プロジェクトをダウンロードし、ルートディレクトリで以下のコマンドを実行して必要なライブラリを全てインストールします。
```bash
npm install
```
### 2. 環境変数の設定
プロジェクトのルートに .env という名前のファイルを作成し、以下の内容をあなたの情報に合わせて編集します。
```bash
# Discord Bot Credentials
TOKEN=YOUR_DISCORD_BOT_TOKEN
CLIENT_ID=YOUR_DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_DISCORD_CLIENT_SECRET

# Web Server & OAuth Redirect
PORT=80
REDIRECT_URI=http://localhost/interactions

# Google Sheets API for Backup/Restore
SPREADSHEET_ID=YOUR_SPREADSHEET_ID
```
### 3. Googleサービスアカウントキーの設定
Google Cloud Platformでサービスアカウントを作成し、Google Sheets APIを有効にしてください。その後、キー（JSONファイル）をダウンロードし、プロジェクトのルートに sheetcredentials.json という名前で保存します。

### 4. スラッシュコマンドの登録
ボットを起動する前に、以下のコマンドを実行して、Discordにスラッシュコマンドを登録・更新します。
```bash
npm run register-commands
```
### 5. ボットの起動
全ての準備が整ったら、以下のコマンドでボットを起動します。
```bash
npm start
```
コンソールに Ready! Logged in as (あなたのボット名) と表示されれば成功です。

🤖 コマンド一覧
リアクション管理
/setreaction: チャンネル、トリガーワード、絵文字を指定して自動リアクションを設定します。

/removereaction: 設定済みの自動リアクションを解除します。

/listreactions: 現在サーバーに設定されているリアクションの一覧を表示します。

アナウンス機能
/startannounce: このコマンドを実行したチャンネルに、常時表示させたいメッセージを設定します。

/stopannounce: 設定されているアナウンスを停止します。

ユーティリティ
/poll: 質問と選択肢を指定して、リアクション投票を作成します。

/csvreactions: メッセージIDを指定して、リアクションしたユーザーをCSVで出力します。

/help: このヘルプメッセージを表示します。

/feedback: 開発者へのフィードバック用サーバーの招待リンクを表示します。

管理者向け機能
/backup: 現在のリアクション設定を、指定したGoogle Sheetにバックアップします。

/restore: Google Sheetから設定を復元（上書き）します。