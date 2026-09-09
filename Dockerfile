# Node.js 24 LTS の固定バージョンを使用
FROM node:24.20.0-slim

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# lockfileどおりの依存関係を再現可能な形でインストール
COPY package*.json ./
RUN npm ci --omit=dev

# アプリケーションのソースコードをすべてコピー
COPY . .

# 管理画面は、初期表示に必要なcoreと、表示後に読み込む補助機能を分離する。
# 低速なスマホでもbootstrap前に多数のObserver/UI補助処理を起動しない。
RUN npx --yes esbuild@0.25.9 public/admin-entry.js \
    --bundle \
    --format=iife \
    --target=chrome55 \
    --outfile=public/admin.bundle.js \
 && npx --yes esbuild@0.25.9 public/admin-enhancements-entry.js \
    --bundle \
    --format=iife \
    --target=chrome55 \
    --outfile=public/admin-enhancements.bundle.js

# ボットを起動するコマンド
CMD ["node", "src/index.js"]
