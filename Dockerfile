# Node.js 24 LTS の固定バージョンを使用
FROM node:24.20.0-slim

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# lockfileどおりの依存関係を再現可能な形でインストール
COPY package*.json ./
RUN npm ci --omit=dev

# アプリケーションのソースコードをすべてコピー
COPY . .

# 古いAndroid Chrome / Custom Tab向けに、管理画面だけ互換bundleも生成する。
# 通常ブラウザは従来のES modulesを使い、互換性判定に落ちた端末だけこのbundleを読む。
RUN npx --yes esbuild@0.25.9 public/admin-entry.js \
    --bundle \
    --format=iife \
    --target=chrome61 \
    --outfile=public/admin.bundle.js

# ボットを起動するコマンド
CMD ["node", "src/index.js"]
