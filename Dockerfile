# Node.js 24 LTS の固定バージョンを使用
FROM node:24.20.0-slim

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# lockfileどおりの依存関係を再現可能な形でインストール
COPY package*.json ./
RUN npm ci --omit=dev

# アプリケーションのソースコードをすべてコピー
COPY . .

# 管理画面は本番では単一のclassic bundleとして配信する。
# Androidの古いChrome / Custom Tabでも動くようChrome 49相当まで構文を落とす。
RUN npx --yes esbuild@0.25.9 public/admin-entry.js \
    --bundle \
    --format=iife \
    --target=chrome49 \
    --outfile=public/admin.bundle.js

# ボットを起動するコマンド
CMD ["node", "src/index.js"]
