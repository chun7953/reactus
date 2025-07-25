# 安定したNode.js 20のスリムバージョンをベースイメージとして使用
FROM node:20-slim

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# 最初にpackage.jsonをコピーして、効率的に依存関係をインストール
COPY package*.json ./
RUN npm install --omit=dev

# アプリケーションのソースコードをすべてコピー
COPY . .

# ボットを起動するコマンド
CMD ["npm", "start"]