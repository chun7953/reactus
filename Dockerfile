# Node.js 24 LTS の固定バージョンを使用
FROM node:24.20.0-slim

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# lockfileどおりの依存関係を再現可能な形でインストール
COPY package*.json ./
RUN npm ci --omit=dev

# アプリケーションのソースコードをすべてコピー
COPY . .

# ボットを起動するコマンド
CMD ["npm", "start"]
