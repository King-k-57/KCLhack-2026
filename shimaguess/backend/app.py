"""
島ガチャ — メインAPIサーバー (Flask)

エンドポイント:
  POST /api/game/start   ゲーム開始（5島をランダム選出）
  POST /api/game/answer  回答受付（Javaでスコア計算）
  GET  /api/ranking      ランキング取得（上位10件）
  GET  /api/island/<id>/wiki  島のWikipedia情報を取得
"""

import os
import json
import random
import subprocess
import urllib.request
import urllib.parse
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ---------- 初期化 ----------

app = Flask(__name__)
CORS(app)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"]
)

# Java ScoreCalculator のパス
JAVA_CLASS_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "scoring", "src"
)

# 難易度ごとの設定
DIFFICULTY_CONFIG = {
    "easy":   {"photo_count": 5, "hint_count": 3, "filter": "easy"},
    "normal": {"photo_count": 3, "hint_count": 2, "filter": None},
    "hard":   {"photo_count": 1, "hint_count": 0, "filter": "hard"},
}


# ---------- ヘルパー関数 ----------

def calc_score_java(guess_lat, guess_lng, ans_lat, ans_lng, time_seconds):
    """Java の ScoreCalculator を subprocess で呼び出す"""
    try:
        result = subprocess.run(
            [
                "java", "-cp", JAVA_CLASS_PATH, "ScoreCalculator",
                str(guess_lat), str(guess_lng),
                str(ans_lat), str(ans_lng),
                str(time_seconds),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            app.logger.error(f"Java error: {result.stderr}")
            return fallback_score(guess_lat, guess_lng, ans_lat, ans_lng, time_seconds)
        return json.loads(result.stdout)
    except Exception as e:
        app.logger.error(f"Java subprocess failed: {e}")
        return fallback_score(guess_lat, guess_lng, ans_lat, ans_lng, time_seconds)


def fallback_score(guess_lat, guess_lng, ans_lat, ans_lng, time_seconds):
    """Java が使えない場合の Python フォールバック"""
    import math
    R = 6371.0
    dlat = math.radians(ans_lat - guess_lat)
    dlng = math.radians(ans_lng - guess_lng)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(guess_lat))
         * math.cos(math.radians(ans_lat))
         * math.sin(dlng / 2) ** 2)
    distance_km = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    distance_score = max(0, min(70, round(70 * math.exp(-distance_km / 100))))
    time_bonus = max(0, min(30, round(30 - time_seconds / 2)))
    total_score = distance_score + time_bonus

    return {
        "distance_km": round(distance_km, 1),
        "distance_score": distance_score,
        "time_seconds": round(time_seconds, 1),
        "time_bonus": time_bonus,
        "total_score": total_score,
    }


# ---------- API エンドポイント ----------

@app.route("/api/game/start", methods=["POST"])
def start_game():
    """ゲーム開始: 難易度に応じて5島をランダム選出"""
    body = request.json or {}
    user_name = body.get("user_name", "名無し")
    difficulty = body.get("difficulty", "normal")
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["normal"])

    # 島データを取得
    query = supabase.table("islands").select("*")

    # easy → easy の島のみ、hard → hard の島のみ、normal → 全島
    if difficulty == "easy":
        query = query.eq("difficulty", "easy")
    elif difficulty == "hard":
        query = query.in_("difficulty", ["normal", "hard"])

    res = query.execute()
    all_islands = res.data

    if len(all_islands) < 5:
        # 足りない場合は全島から補充
        res_all = supabase.table("islands").select("*").execute()
        all_islands = res_all.data

    # ランダムに5島選出
    selected = random.sample(all_islands, min(5, len(all_islands)))

    # セッション作成
    session = supabase.table("game_sessions").insert({
        "user_name": user_name,
        "difficulty": difficulty,
        "total_score": 0,
    }).execute()

    # 正解座標は隠して返す
    quiz_islands = []
    for island in selected:
        hints = island.get("hints", []) or []
        images = island.get("image_urls", []) or []
        quiz_islands.append({
            "id": island["id"],
            "hints": hints[:config["hint_count"]],
            "difficulty": island.get("difficulty", "normal"),
            "image_urls": images[:config["photo_count"]],
            "has_streetview": island.get("has_streetview", False),
            "region": island.get("region", ""),
            "prefecture": island.get("prefecture", ""),
        })

    return jsonify({
        "session_id": session.data[0]["id"],
        "islands": quiz_islands,
        "config": {
            "photo_count": config["photo_count"],
            "hint_count": config["hint_count"],
            "difficulty": difficulty,
        },
    })


@app.route("/api/game/answer", methods=["POST"])
def answer():
    """回答受付: Java でスコア計算し DB に保存"""
    body = request.json or {}
    session_id = body.get("session_id")
    island_id = body.get("island_id")
    guessed_lat = body.get("guessed_lat")
    guessed_lng = body.get("guessed_lng")
    time_seconds = body.get("time_seconds", 60)
    round_number = body.get("round_number", 1)

    # 正解の島を取得
    island_res = supabase.table("islands") \
        .select("*").eq("id", island_id).execute()

    if not island_res.data:
        return jsonify({"error": "Island not found"}), 404

    island = island_res.data[0]

    # Java でスコア計算
    score_result = calc_score_java(
        guessed_lat, guessed_lng,
        island["lat"], island["lng"],
        time_seconds,
    )

    # answers テーブルに保存
    supabase.table("answers").insert({
        "session_id": session_id,
        "island_id": island_id,
        "round_number": round_number,
        "guessed_lat": guessed_lat,
        "guessed_lng": guessed_lng,
        "distance_km": score_result["distance_km"],
        "distance_score": score_result["distance_score"],
        "time_seconds": score_result["time_seconds"],
        "time_bonus": score_result["time_bonus"],
        "total_score": score_result["total_score"],
    }).execute()

    # セッションの合計スコアを更新
    session_res = supabase.table("game_sessions") \
        .select("total_score").eq("id", session_id).execute()
    current_total = session_res.data[0]["total_score"] if session_res.data else 0
    new_total = current_total + score_result["total_score"]

    supabase.table("game_sessions") \
        .update({"total_score": new_total}) \
        .eq("id", session_id).execute()

    return jsonify({
        "correct": {
            "name": island["name"],
            "prefecture": island["prefecture"],
            "region": island.get("region", ""),
            "lat": island["lat"],
            "lng": island["lng"],
            "wiki_title": island.get("wiki_title", ""),
        },
        "distance_km": score_result["distance_km"],
        "distance_score": score_result["distance_score"],
        "time_seconds": score_result["time_seconds"],
        "time_bonus": score_result["time_bonus"],
        "total_score": score_result["total_score"],
        "session_total": new_total,
    })


@app.route("/api/ranking", methods=["GET"])
def ranking():
    """ランキング: 上位10件を返す"""
    difficulty = request.args.get("difficulty")

    query = supabase.table("game_sessions") \
        .select("user_name, total_score, difficulty, created_at") \
        .order("total_score", desc=True) \
        .limit(10)

    if difficulty:
        query = query.eq("difficulty", difficulty)

    res = query.execute()
    return jsonify(res.data)


@app.route("/api/island/<int:island_id>/wiki", methods=["GET"])
def island_wiki(island_id):
    """島の Wikipedia 情報を取得"""
    island_res = supabase.table("islands") \
        .select("wiki_title, name").eq("id", island_id).execute()

    if not island_res.data:
        return jsonify({"error": "Island not found"}), 404

    wiki_title = island_res.data[0].get("wiki_title", "")
    if not wiki_title:
        return jsonify({"title": island_res.data[0]["name"], "extract": "", "thumbnail": None})

    try:
        encoded = urllib.parse.quote(wiki_title, safe="")
        url = f"https://ja.wikipedia.org/api/rest_v1/page/summary/{encoded}"
        req = urllib.request.Request(url, headers={"User-Agent": "ShimaGacha/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read())

        return jsonify({
            "title": data.get("title", ""),
            "extract": data.get("extract", ""),
            "thumbnail": data.get("thumbnail", {}).get("source"),
        })
    except Exception as e:
        app.logger.error(f"Wikipedia API error: {e}")
        return jsonify({"title": wiki_title, "extract": "", "thumbnail": None})


# ---------- 起動 ----------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
