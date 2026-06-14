# 🏝️ 島ガチャ — 西日本離島当てゲーム

西日本の離島の写真を見て、どこの島かを地図上で当てるWebゲームです。

## 使用言語・技術

| 言語 | 用途 |
|------|------|
| Python (Flask) | バックエンド API サーバー |
| Java | スコア計算エンジン |
| Ruby | Wikipedia データ収集スクリプト |
| JavaScript | ゲーム進行・地図操作 |
| HTML | 画面構造 |
| CSS | デザイン・アニメーション |

| サービス | 用途 |
|----------|------|
| Supabase | データベース (PostgreSQL) |
| OpenStreetMap + Leaflet | 地図表示 |
| Wikimedia Commons | 島の写真取得 |
| Wikipedia API | 島の情報取得 |

## セットアップ

### 1. Supabase

1. https://supabase.com でプロジェクトを作成
2. SQL Editor で以下のテーブルを作成:

```sql
CREATE TABLE islands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  prefecture TEXT NOT NULL,
  region TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  population INTEGER,
  hints TEXT[],
  wiki_title TEXT,
  difficulty TEXT DEFAULT 'normal',
  image_urls TEXT[],
  has_streetview BOOLEAN DEFAULT false
);

CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'normal',
  total_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE answers (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id),
  island_id INTEGER REFERENCES islands(id),
  round_number INTEGER,
  guessed_lat DOUBLE PRECISION,
  guessed_lng DOUBLE PRECISION,
  distance_km DECIMAL,
  distance_score INTEGER,
  time_seconds DECIMAL,
  time_bonus INTEGER,
  total_score INTEGER,
  answered_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. 島データ収集 (Ruby)

```bash
# Ruby がインストールされていない場合
# macOS: brew install ruby
# Ubuntu: sudo apt install ruby

cd scripts
ruby collect_islands.rb
# → data/islands.json が生成される
```

生成された JSON を Supabase のテーブルにインポート:
- Supabase ダッシュボード → Table Editor → islands → Import data

### 3. Java スコア計算エンジン

```bash
cd scoring/src
javac ScoreCalculator.java

# テスト
java ScoreCalculator 34.0 133.0 34.46 133.99 15.2
```

### 4. Python バックエンド

```bash
cd backend

# .env を編集
cp .env .env.local
# SUPABASE_URL と SUPABASE_KEY を設定

# 依存パッケージインストール
pip install -r requirements.txt

# 起動
python app.py
# → http://localhost:5000 で起動
```

### 5. フロントエンド

```bash
# VS Code の Live Server 拡張機能を使うか、
# Python の簡易サーバーを使う
cd frontend
python -m http.server 3000
# → http://localhost:3000 でアクセス
```

## 遊び方

1. ニックネームを入力して難易度を選択
2. 島の写真とヒントを見て推理
3. 地図上で「ここだ！」と思う場所をクリック
4. 早く正確に当てるほど高スコア
5. 5ラウンドで合計500点を目指そう！
